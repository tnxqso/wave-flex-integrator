'use strict';

const net = require('net');
const EventEmitter = require('events');
const FlexRadioMessageParser = require('./flexradio_message_parser');
const Spot = require('./spot');
const Slice = require('./slice');
const { exec } = require('child_process');
const os = require('os');
const fetch = require('node-fetch');
const utils = require('./utils');
const WavelogClient = require('./wavelog_client');

module.exports = class FlexRadioClient extends EventEmitter {
  /**
   * Creates an instance of FlexRadioClient.
   * @param {object} config - Configuration object.
   * @param {object} logger - Logger instance.
   * @param {string} stationCallsign - The callsign of the station.
   */
  constructor(config, logger, stationCallsign) {
    super();
    this.config = config;
    this.logger = logger;
    this.stationCallsign = stationCallsign;

    this.flexClient = null;
    this.flexBuffer = '';
    this.flexPendingCommands = {};
    this.flexSequenceNumber = 1;
    this.flexSpotsByID = new Map();
    this.flexSpotsBySpotID = new Map();
    this.flexSlicesByID = new Map();
    this.handleStationMap = new Map();
    this.isReconnecting = false;
    this.connected = false;

    this.commandQueue = [];
    this.sendingCommands = false;

    this.shouldReconnect = true;
    this.isDisconnecting = false;
    this.activeTXSlices = null;
    this.lastConnectionWarningTime = 0;
    
    // State filtering and Timer
    this.pendingQsy = null; 
    this.qsyTimer = null; 

    this.messageParser = new FlexRadioMessageParser();
    this.wavelogClient = new WavelogClient(this.config, this.logger);

    this.messageParser.on('error', (error) => {
      this.logger.error(`Parser error: ${error.message}`);
    });

    this.messageParser.on('reply', this.handleReply.bind(this));
    this.messageParser.on('spotTriggered', this.handleSpotTriggered.bind(this));
    this.messageParser.on('spotRemoved', this.handleSpotRemoved.bind(this));
    this.messageParser.on('spotStatus', this.handleSpotStatus.bind(this));
    this.messageParser.on('sliceStatus', this.handleSliceStatus.bind(this));
    this.messageParser.on('clientStatus', this.handleClientStatus.bind(this));
    this.messageParser.on('globalProfileList', (profiles) => {
        this.logger.info(`Received ${profiles.length} global profiles from radio.`);
        this.emit('globalProfilesList', profiles);
    });    
    this.messageParser.on('handle', (data) => {
      this.logger.info(`Received handle: ${data.handle}`);
    });
    this.messageParser.on('protocolVersion', (data) => {
      this.logger.info(`Protocol Version: ${data.version}`);
    });
    this.messageParser.on('serverMessage', (data) => {
      this.logger.info(`Server Message [${data.messageId}]: ${data.messageContent}`);
    });
    this.messageParser.on('unknownMessageType', (data) => {
      this.logger.warn(`Unknown message type: ${data.messageType}`);
    });

    const cleanupInterval =
      this.config.flexRadio.spotManagement.cleanupIntervalSeconds || 60;
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSpots();
    }, cleanupInterval * 1000);
  }

  /**
   * Initiates connection to the FlexRadio server.
   */
  connect() {
    const { host, port } = this.config.flexRadio;

    if (!this.config.flexRadio.enabled) {
      this.logger.info('FlexRadio integration is disabled in config.');
      return;
    }

    if (this.flexClient && !this.flexClient.destroyed) {
      this.logger.warn('A FlexRadio connection or reconnection attempt is already in progress.');
      return;
    }

    this.initiateConnection();
  }

  /**
   * Starts the connection process to the FlexRadio server.
   * Handles the connection events and initial commands.
   */
  initiateConnection() {
    const { host, port } = this.config.flexRadio;

    this.flexClient = new net.Socket();

    this.flexClient.connect(port, host, () => {
      this.logger.info('Connected to FlexRadio server.');
      this.connected = true;
      this.isReconnecting = false;

      setTimeout(() => {
        this.queueCommand('sub slice all', (response) => {
          this.logger.debug(`Response to sub slice all: ${response}`);
          this.queueCommand('sub client all', (response) => {
            this.logger.debug(`Response to sub client all: ${response}`);
            this.queueCommand('spot clear', (response) => {
              this.logger.debug(`Response to spot clear: ${response}`);
              this.queueCommand('sub spot all', (response) => {
                this.logger.debug(`Response to sub spot all: ${response}`);
              });
            });
          });
        });
        this.emit('connected');
      }, 2000);
    });

    this.flexClient.on('data', (data) => {
      this.processData(data);
    });

    this.flexClient.on('error', (err) => {
      if (['ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH'].includes(err.code)) {
        this.logger.warn(`FlexRadio is not available (${err.code}). Retrying in 5 seconds...`);
      } else {
        this.logger.error(`Unexpected FlexRadio socket error: ${err.message}`);
      }
      this.connected = false;
      this.flexClient.destroy();

      this.emit('error', err);

      this.scheduleReconnect();
    });

    this.flexClient.on('close', (hadError) => {
      if (this.isDisconnecting) {
        this.logger.info('FlexRadio connection closed after intentional disconnect.');
        return;
      }

      if (hadError) {
        this.logger.warn('FlexRadio connection attempt failed. Retrying in 5 seconds...');
      } else {
        this.logger.warn('FlexRadio connection closed. Retrying in 5 seconds...');
      }
      this.connected = false;
      this.flexClient.destroy();

      this.emit('disconnected');

      this.scheduleReconnect();
    });
  }

/**
   * Processes incoming data from the FlexRadio server.
   * @param {Buffer|string} data - Data received from the server.
   */
  processData(data) {
    this.flexBuffer += data.toString();
    let lines = this.flexBuffer.split('\n');
    this.flexBuffer = lines.pop();
    lines.forEach((line) => {
      try {
        this.messageParser.parseMessage(line.trim());
      } catch (error) {
        this.logger.error(`Error processing line: ${error.message}, Line: ${line}`);
      }
    });
  }

  /**
   * Handles replies from the server.
   * @param {object} data - The reply data.
   */
  handleReply(data) {
    const { seqNum, response } = data;
    const pendingCommand = this.flexPendingCommands[seqNum];
    if (pendingCommand) {
      this.logger.debug(`Received response for command C${seqNum}: ${response}`);
      pendingCommand.callback(response);
      clearTimeout(pendingCommand.timeout);
      delete this.flexPendingCommands[seqNum];
    } else {
      this.logger.warn(`Received response for unknown command C${seqNum}: ${response}`);
    }
  }

  /**
   * Handles a slice status update.
   * @param {object} eventData - Data associated with the event.
   */
  handleSliceStatus(eventData) {
    const { handle, index, statusMessage } = eventData;
    let slice = this.flexSlicesByID.get(index);
    let sliceAdded = false;

    if (!slice) {
      slice = new Slice(index);
      sliceAdded = true;
    }

    slice.statusUpdate(handle, statusMessage);
    slice.updateStationName(this.handleStationMap); 

    if (sliceAdded) {
      this.flexSlicesByID.set(index, slice);
      this.logger.info(`Added new slice with label ${slice.index_letter}`);
    }

    // --- PENDING QSY FILTER LOGIC ---
    // Prevent sending updates to Wavelog if frequency has changed 
    // but mode hasn't updated yet (intermediate state).
    if (this.pendingQsy) {
        const currentFreqHz = Math.round(slice.frequency * 1e6);
        const targetFreqHz = this.pendingQsy.frequency;
        
        // Compare frequency (allow small epsilon for rounding errors)
        const freqMatch = Math.abs(currentFreqHz - targetFreqHz) < 50; 
        
        // Compare mode (only if a target mode was set)
        let modeMatch = true;
        if (this.pendingQsy.mode) {
            modeMatch = (slice.mode === this.pendingQsy.mode);
        }

        if (freqMatch && !modeMatch) {
            this.logger.debug(`QSY Filter: Suppressing intermediate state (${slice.frequency.toFixed(6)} MHz, ${slice.mode}) while waiting for mode: ${this.pendingQsy.mode}`);
            return; // Suppress update
        }

        if (freqMatch && modeMatch) {
            this.logger.info(`QSY Filter: Target reached (${slice.frequency.toFixed(6)} MHz, ${slice.mode}). Sending update.`);
            
            // SUCCESS: Clear the safety timer and the filter
            if (this.qsyTimer) {
                clearTimeout(this.qsyTimer);
                this.qsyTimer = null;
            }
            this.pendingQsy = null; 
        }
    }
    // ------------------------------------

    const activeTXSlices = Array.from(this.flexSlicesByID.values()).filter((s) => s.tx);

    const updatedActiveTXSlices = activeTXSlices.map((slice) => {
      const xitAdjustment = slice.xit_on ? slice.xit_freq : 0;
      const adjustedFrequencyHz = Math.round(slice.frequency * 1e6 + xitAdjustment);

      const existingSlice = this.activeTXSlices?.find((activeSlice) => activeSlice.index === slice.index);
      if (!existingSlice) {
        this.logger.info(
          `New Active TX Slice: Slice ${slice.index_letter}, Frequency: ${slice.frequency.toFixed(6)} MHz, Mode: ${slice.mode}, XIT: ${xitAdjustment} Hz`
        );
      } else if (
        existingSlice.frequency !== slice.frequency ||
        existingSlice.mode !== slice.mode ||
        existingSlice.xit_on !== slice.xit_on ||
        existingSlice.xit_freq !== slice.xit_freq
      ) {
        this.logger.info(
          `Updated Active TX Slice: Slice ${slice.index_letter}, Frequency: ${slice.frequency.toFixed(6)} MHz, Mode: ${slice.mode}, XIT: ${xitAdjustment} Hz`
        );
        existingSlice.frequency = slice.frequency;
        existingSlice.mode = slice.mode;
        existingSlice.xit_on = slice.xit_on;
        existingSlice.xit_freq = slice.xit_freq;
      }
      return Object.assign({}, slice);
    });

    // Remove any slices that are no longer active
    if (this.activeTXSlices) {
      const removedSlices = this.activeTXSlices.filter(
        (activeSlice) => !activeTXSlices.some((slice) => slice.index === activeSlice.index)
      );

      removedSlices.forEach((slice) => {
        this.logger.info(`TX Slice ${slice.index_letter} is no longer active.`);
      });
    }

    // Update the active TX slices array
    this.activeTXSlices = updatedActiveTXSlices;
  
    // Forward the event so that main.js can intercept it
    this.emit('sliceStatus', slice);
  }

/**
   * Handles the QSY Timeout.
   * Forces an update if the radio has been silent or slow to report the new frequency.
   */
  _handleQsyTimeout() {
    if (!this.pendingQsy) return;

    this.logger.warn(`QSY Filter: Timeout (3s) waiting for radio report. Forcing API update with target values.`);

    // 1. Create a "Synthetic" slice object based on what we REQUESTED
    const targetFreqMHz = this.pendingQsy.frequency / 1e6;
    const targetMode = this.pendingQsy.mode || 'UNKNOWN';

    // Find the active slice to get the Index ID, or default to 0
    let sliceIndex = 0;
    let sliceLetter = 'A';
    if (this.activeTXSlices && this.activeTXSlices.length > 0) {
        sliceIndex = this.activeTXSlices[0].index;
        sliceLetter = this.activeTXSlices[0].index_letter;
    }

    // Construct the forced slice data
    const forcedSlice = {
        index: sliceIndex,
        index_letter: sliceLetter,
        frequency: targetFreqMHz,
        mode: targetMode,
        tx: 1
    };

    // 2. Clear filter
    this.pendingQsy = null;
    this.qsyTimer = null;

    // 3. Force the update to Wavelog API
    this.logger.info(`Forced Update: Slice ${sliceLetter}, Frequency: ${targetFreqMHz.toFixed(6)} MHz, Mode: ${targetMode}`);
    this.sendActiveSliceToWavelog(forcedSlice);
    
    // 4. Also emit to main.js so the WebSocket gets the "Official" status
    this.emit('sliceStatus', forcedSlice);
  }

  async sendActiveSliceToWavelog(activeTXSlice) {
    try {
      await this.wavelogClient.sendActiveSliceToWavelog(activeTXSlice);
    } catch (error) {
      this.logger.error(`Error handling active TX slice: ${error.message}`);
    }
  }

  /**
   * Handles a spot being triggered.
   * @param {object} eventData - Data associated with the event.
   */
  handleSpotTriggered(eventData) {
    const { handle, index } = eventData;
    const spotData = this.flexSpotsByID.get(index);
    if (spotData) {
      this.logger.info(`Spot triggered: callsign=${spotData.callsign}, index=${index}`);
      utils.openLogQSO(spotData.callsign, this.config);
      this.emit('externalSpotTriggered', spotData.callsign);
    } else {
      this.logger.warn(`No spot data found for FlexRadio Spot ID ${index}`);
    }
  }

  /**
   * Handles a spot being removed.
   * @param {object} eventData - Data associated with the event.
   */
  handleSpotRemoved(eventData) {
    const { index } = eventData;
    const spot = this.flexSpotsByID.get(index);
    if (spot) {
      this.flexSpotsByID.delete(index);
      if (spot.spotID) {
        this.flexSpotsBySpotID.delete(spot.spotID);
      }
      this.logger.debug(`Removed spot with ID ${index}`);
    }
  }

  /**
   * Handles a spot status update.
   * @param {object} eventData - Data associated with the event.
   */
  handleSpotStatus(eventData) {
    const { handle, index, statusMessage } = eventData;
    let spot = this.flexSpotsByID.get(index);
    let spotAdded = false;

    if (!spot) {
      spot = new Spot(index);
      spotAdded = true;
    }

    spot.statusUpdate(statusMessage);

    if (spotAdded) {
      this.flexSpotsByID.set(index, spot);
      if (spot.spotID) {
        this.flexSpotsBySpotID.set(spot.spotID, spot);
      }
      this.logger.debug(`Added new spot with ID ${index}`);
    }
  }

  /**
   * Handles a client status update.
   * @param {object} eventData - Data associated with the event.
   */
  handleClientStatus(eventData) {
    const { handle, statusMessage } = eventData;
    // Parse the statusMessage to extract the stationName
    const statusParts = statusMessage.split(' ');
    if (statusParts[0] == 'connected') {
      let stationName = null;
      for (const part of statusParts) {
        if (part.startsWith('station=')) {
          stationName = part.split('=')[1];
          break;
        }
      }
      // Store the handle and stationName in the Map
      if (stationName) {
        this.handleStationMap.set(handle, stationName);
        this.logger.info(`Connected GUI client ${handle} with name ${stationName}`);
      } else {
        this.logger.warn(`Station name not found in statusMessage: ${statusMessage}`); 
      }
    } else if (statusParts[0] == 'disconnected') {  
      // Remove the handle from the Map
      this.logger.info(`Station ${this.handleStationMap.get(handle)} disconnected.`);
      this.handleStationMap.delete(handle);      
    } else {
      this.logger.error(`Unhandled client status: ${statusMessage}`);
    }  
  }

  /**
   * Schedules a reconnection attempt after a delay.
   */
  scheduleReconnect() {
    if (!this.shouldReconnect) {
      this.logger.info('Reconnection not scheduled due to manual disconnect.');
      return;
    }

    if (this.isReconnecting) {
      this.logger.warn('Reconnection attempt already in progress.');
      return;
    }

    this.isReconnecting = true;
    this.logger.info('Retrying connection to FlexRadio in 5 seconds...');
    setTimeout(() => {
      if (!this.connected && this.shouldReconnect) {
        this.initiateConnection();
      }
      this.isReconnecting = false;
    }, 5000);
  }

  /**
   * Checks if the FlexRadio client is connected.
   * @returns {boolean} - True if connected, false otherwise.
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Queues a command to be sent to the FlexRadio server.
   * @param {string} command - The command string to send.
   * @param {function} callback - Callback function to handle the response.
   */
  queueCommand(command, callback) {
    this.commandQueue.push({ command, callback });
    if (!this.sendingCommands) {
      this.processCommandQueue();
    }
  }

  /**
   * Processes the command queue with a delay between each command.
   */
  processCommandQueue() {
    if (this.commandQueue.length === 0) {
      this.sendingCommands = false;
      return;
    }

    this.sendingCommands = true;

    const { command, callback } = this.commandQueue.shift();
    this.sendCommand(command, (response) => {
      if (callback) {
        callback(response);
      }
      setTimeout(() => this.processCommandQueue(), 200);
    });
  }

  /**
   * Sends a command to the FlexRadio server.
   * @param {string} command - The command string to send.
   * @param {function} callback - Callback function to handle the response.
   */
  sendCommand(command, callback) {
    if (!this.isConnected()) {
      if (!this.isDisconnecting) {
        this.logger.warn('Cannot send command. FlexRadio client is not connected.');
      }
      if (typeof callback === 'function') {
        callback('Client not connected');
      }
      return;
    }

    if (this.flexSequenceNumber > 99999) {
      this.flexSequenceNumber = 1;
    }

    const seqNum = this.flexSequenceNumber++;
    const fullCommand = `C${seqNum}|${command}`;

    this.flexPendingCommands[seqNum] = {
      command: command,
      callback: callback,
      timeout: setTimeout(() => {
        this.logger.error(`Timeout waiting for response to command C${seqNum}`);
        if (typeof callback === 'function') {
          callback('Timeout');
        }
        delete this.flexPendingCommands[seqNum];
      }, this.config.flexRadio.commandTimeout || 15000),
    };

    this.logger.debug(`Sending command: ${fullCommand}`);
    this.flexClient.write(fullCommand + '\n', (err) => {
      if (err) {
        this.logger.error(`Error sending command "${fullCommand}": ${err.message}`);
        delete this.flexPendingCommands[seqNum];
        if (typeof callback === 'function') {
          callback(`Error sending command: ${err.message}`);
        }
      }
    });
  }

  /**
   * Prepares and sends a spot to FlexRadio.
   * @param {object} processedSpot - The processed spot object.
   */
  sendSpot(processedSpot) {
    if (!this.connected) {
      const now = Date.now();
      // Only log the warning if 120 seconds (120,000 ms) have passed since the last time
      if (now - this.lastConnectionWarningTime > 120000) {
        this.logger.warn('FlexRadio is not connected. Cannot send spot. (Warning suppressed for 120s)');
        this.lastConnectionWarningTime = now;
      }
      return;
    }

    try {
      const rxFreq = (processedSpot.frequency / 1000).toFixed(6);
      const txFreq = rxFreq;
      this.logger.debug('ProcessedSpot:', processedSpot);

      let timestamp;

      if (typeof processedSpot.timestamp === 'number') {
        timestamp = processedSpot.timestamp;
      } else if (
        typeof processedSpot.timestamp === 'string' ||
        processedSpot.timestamp instanceof Date
      ) {
        timestamp = Math.floor(new Date(processedSpot.timestamp).getTime() / 1000);
      } else {
        timestamp = Math.floor(Date.now() / 1000);
      }

      const mode = processedSpot.mode || 'CW';
      const source = 'wave-flex-integrator';
      const lifetimeSeconds =
        this.config.flexRadio.spotManagement.lifetimeSeconds || 3600;
      const priority = 4;
      const triggerAction = 'tune';

      let textColor = this.config.flexRadio.spotManagement.colors.default.textColor;
      let backgroundColor = this.config.flexRadio.spotManagement.colors.default.backgroundColor;
      let backgroundOpacity = 80;
      let textOpacity = 100;

      const augmentedData = processedSpot.wavelog_augmented_data || {};
      const {
        call_confirmed,
        call_confirmed_band,
        call_confirmed_band_mode,
        call_worked,
        call_worked_band,
        call_worked_band_mode,
        dxcc_confirmed,
        dxcc_confirmed_on_band,
        dxcc_confirmed_on_band_mode,
        lotw_member,
      } = augmentedData;

      const spottedCallsign = processedSpot.spotted.toUpperCase();

      this.logger.debug(`Processing spot for callsign: ${spottedCallsign}`);

      let commentParts = [];

      if (spottedCallsign === this.stationCallsign) {
        this.logger.debug("Callsign matches my own callsign.");
        textColor = this.config.flexRadio.spotManagement.colors.myCallsign.textColor;
        backgroundColor = this.config.flexRadio.spotManagement.colors.myCallsign.backgroundColor;
        backgroundOpacity = 80;

        commentParts.push('You.');
      } else {
        if (dxcc_confirmed === false) {
          this.logger.debug("DXCC needed.");
          textColor = this.config.flexRadio.spotManagement.colors.dxccNeeded.textColor;
          backgroundColor = this.config.flexRadio.spotManagement.colors.dxccNeeded.backgroundColor;
          commentParts.push('New DXCC.');
        } else if (dxcc_confirmed_on_band === false) {
          this.logger.debug("DXCC is needed for band.");
          textColor = this.config.flexRadio.spotManagement.colors.dxccNeededBand.textColor;
          backgroundColor = this.config.flexRadio.spotManagement.colors.dxccNeededBand.backgroundColor;
          commentParts.push('DXCC needed for band.');
        } else if (dxcc_confirmed_on_band_mode === false) {
          this.logger.debug("DXCC is needed for the band and mode.");
          textColor = this.config.flexRadio.spotManagement.colors.dxccNeededBandMode.textColor;
          backgroundColor = this.config.flexRadio.spotManagement.colors.dxccNeededBandMode.backgroundColor;
          commentParts.push('DXCC needed for band and mode.');
        } else {
          this.logger.debug("DXCC is confirmed for band and mode. Using default colors.");
        }

        if (lotw_member === false) {
          this.logger.debug("Callsign is not an active member of LoTW.");
          textColor = this.config.flexRadio.spotManagement.colors.notLotw.textColor;
          commentParts.push('LoTW inactive.');
        }

        if (call_confirmed_band_mode === true) {
          backgroundOpacity = this.config.flexRadio.spotManagement.colors.callConfirmedBandMode.opacity;
          this.logger.debug(`Call confirmed on actual band and mode. Set opacity to ${backgroundOpacity}%.`);
          commentParts.push('Call confirmed on band and mode.');
        } else if (call_worked_band_mode === true) {
          backgroundOpacity = this.config.flexRadio.spotManagement.colors.callWorkedBandMode.opacity;
          this.logger.debug(`Worked before on actual band and mode. Set opacity to ${backgroundOpacity}%.`);
          commentParts.push('Worked before on band and mode.');
        } else if (call_confirmed_band === true) {
          backgroundOpacity = this.config.flexRadio.spotManagement.colors.callConfirmedBand.opacity;
          this.logger.debug(`Call confirmed on actual band. Set opacity to ${backgroundOpacity}%.`);
          commentParts.push('Call confirmed on band.');
        } else if (call_worked_band === true) {
          backgroundOpacity = this.config.flexRadio.spotManagement.colors.callWorkedBand.opacity;
          this.logger.debug(`Worked before on actual band. Set opacity to ${backgroundOpacity}%.`);
          commentParts.push('Worked before on band.');
        } else if (call_confirmed === true) {
          backgroundOpacity = this.config.flexRadio.spotManagement.colors.callConfirmed.opacity;
          this.logger.debug(`Call confirmed. Set opacity to ${backgroundOpacity}%.`);
          commentParts.push('Call confirmed.');
        } else if (call_worked === true) {
          backgroundOpacity = this.config.flexRadio.spotManagement.colors.callWorked.opacity;
          this.logger.debug(`Worked before on any band and mode. Set opacity to ${backgroundOpacity}%.`);
          commentParts.push('Worked before');
        } else {
          backgroundOpacity = 80;
          this.logger.debug(`Call not confirmed. Using default background opacity of ${backgroundOpacity}%.`);
          commentParts.push('New callsign.');
        }
      }

      textOpacity = 100;

      const backgroundOpacityHex = Math.round((backgroundOpacity / 100) * 255)
        .toString(16)
        .padStart(2, '0')
        .toUpperCase();

      const textOpacityHex = Math.round((textOpacity / 100) * 255)
        .toString(16)
        .padStart(2, '0')
        .toUpperCase();

      const finalBackgroundColor = `#${backgroundOpacityHex}${backgroundColor.slice(1)}`;
      const finalTextColor = `#${textOpacityHex}${textColor.slice(1)}`;

      this.logger.debug(`Final text color: ${finalTextColor}`);
      this.logger.debug(`Final background color: ${finalBackgroundColor}`);

      let comment = commentParts.join(' ');

      if (comment.length > 120) {
        comment = comment.substring(0, 117) + '...';
      }

      comment = comment.replace(/ /g, String.fromCharCode(127));

      const spotCommand = `spot add rx_freq=${rxFreq} tx_freq=${txFreq} callsign=${
        processedSpot.spotted
      } mode=${mode} color=${finalTextColor} background_color=${finalBackgroundColor} source=${source} spotter_callsign=${
        processedSpot.spotter
      } timestamp=${timestamp} lifetime_seconds=${lifetimeSeconds} priority=${priority} comment=${comment} trigger_action=${triggerAction}`;

      const sendSpotAddCommand = () => {
        this.queueCommand(spotCommand, (addResponse) => {
          this.logger.debug(`Response from FlexRadio for spot add: ${addResponse}`);
          const responseMatch = addResponse.match(/^0\|(\d+)$/);
          if (responseMatch) {
            const flexRadioSpotID = parseInt(responseMatch[1], 10);

            const spot = new Spot(flexRadioSpotID);
            spot.spotID = processedSpot.id;
            spot.callsign = processedSpot.spotted;
            spot.expirationTime = Date.now() + lifetimeSeconds * 1000;

            this.flexSpotsByID.set(flexRadioSpotID, spot);
            if (spot.spotID) {
              this.flexSpotsBySpotID.set(spot.spotID, spot);
            }

            this.logger.debug(`Stored FlexRadio Spot ID ${flexRadioSpotID} with Spot ID ${spot.spotID}`);
          } else {
            this.logger.warn(`Unexpected response format for spot add: ${addResponse}`);
          }
        });
      };

      if (this.flexSpotsBySpotID.has(processedSpot.id)) {
        this.logger.debug(
          `Existing spot found, need to remove it before adding a new spot: ${processedSpot.id}`
        );
        const existingSpotData = this.flexSpotsBySpotID.get(processedSpot.id);
        const existingFlexRadioSpotID = existingSpotData.index;

        this.queueCommand(`spot remove ${existingFlexRadioSpotID}`, (removeResponse) => {
          this.logger.debug(`Response from FlexRadio for spot remove: ${removeResponse}`);
          this.flexSpotsByID.delete(existingFlexRadioSpotID);
          this.flexSpotsBySpotID.delete(processedSpot.id);

          sendSpotAddCommand();
        });
      } else {
        sendSpotAddCommand();
      }
    } catch (error) {
      this.logger.error(`Error sending spot: ${error.message}`);
    }
  }

  /**
   * Cleans up expired spots from the lookup tables.
   */
  cleanupExpiredSpots() {
    const now = Date.now();
    let removedCount = 0;

    for (const [flexRadioSpotID, spotData] of this.flexSpotsByID.entries()) {
      if (spotData.expirationTime <= now) {
        this.flexSpotsByID.delete(flexRadioSpotID);
        if (spotData.spotID) {
          this.flexSpotsBySpotID.delete(spotData.spotID);
        }
        this.logger.debug(`Removed spot with FlexRadio Spot ID ${flexRadioSpotID} and Spot ID ${spotData.spotID} from lookup tables.`);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.logger.debug(`Cleanup complete. Removed ${removedCount} expired spot(s).`);
    } else {
      this.logger.debug('Cleanup complete. No expired spots found.');
    }

    this.logger.debug(`Current lookup table size: ${this.flexSpotsByID.size} spot(s).`);
  }

  /**
   * Sets the frequency and mode of the currently active Transmit Slice.
   * Starts a background timer to ensure state synchronization even if the radio is silent.
   * @param {number} freqHz - Frequency in Hertz.
   * @param {string} mode - Mode string (e.g., 'cw', 'ssb').
   * @returns {object} - { success: boolean, error: string|null }
   */
  setSliceFrequency(freqHz, mode) {
    if (!this.isConnected()) {
      const msg = 'FlexRadio is NOT connected.';
      this.logger.warn(`Ignored QSY request because ${msg}`);
      return { success: false, error: msg };
    }

    // 1. Find Active TX Slice
    let targetSlice = null;
    if (this.activeTXSlices && this.activeTXSlices.length > 0) {
      targetSlice = this.activeTXSlices[0];
    } else if (this.flexSlicesByID.size > 0) {
      targetSlice = this.flexSlicesByID.values().next().value;
    }

    if (!targetSlice) {
      const msg = 'No active slice found. Ensure SmartSDR or Maestro is running.';
      this.logger.error(`Cannot QSY: ${msg}`);
      return { success: false, error: msg };
    }

    // 2. Prepare target values
    const targetFreqMHzVal = freqHz / 1e6;
    const freqMHzString = targetFreqMHzVal.toFixed(6);
    
    // Normalize requested mode to Flex format
    let flexMode = null;
    if (mode) {
      const inputMode = mode.toUpperCase();
      if (['CW', 'CWL', 'CWU', 'AM', 'FM', 'DIGU', 'DIGL', 'LSB', 'USB'].includes(inputMode)) {
          flexMode = inputMode;
      } else if (['FT8', 'RTTY', 'DATA', 'DIG'].includes(inputMode)) {
          flexMode = 'DIGU';
      } else if (inputMode === 'SSB') {
          flexMode = (freqHz < 10000000) ? 'LSB' : 'USB';
      }
    }

    // 3. Check what actually needs changing
    const currentFreqMHzString = targetSlice.frequency.toFixed(6);
    const needTune = currentFreqMHzString !== freqMHzString;
    const needMode = flexMode && (targetSlice.mode !== flexMode);

    if (!needTune && !needMode) {
        this.logger.info(`QSY Ignored: Radio already at ${freqMHzString} MHz / ${targetSlice.mode}`);
        return { success: true, error: null }; // Return success as we are already there
    }

    // --- NEW: Set Target State AND Start Timer ---
    // Cancel existing timer if one is running
    if (this.qsyTimer) clearTimeout(this.qsyTimer);

    this.pendingQsy = {
        frequency: freqHz,
        mode: flexMode, // Can be null if only frequency changes
        timestamp: Date.now()
    };

    // Start strict 3-second timer
    this.qsyTimer = setTimeout(() => {
        this._handleQsyTimeout();
    }, 3000);
    
    this.logger.info(
      `QSY Request: Slice ${targetSlice.index_letter} -> ${needTune ? freqMHzString + ' MHz' : '(No Freq Change)'}, ${needMode ? flexMode : '(No Mode Change)'}`
    );

    // 4. Send Commands (Sequential / Fire-and-Forget)
    if (needTune) {
        const tuneCmd = `slice tune ${targetSlice.index} ${freqMHzString}`;
        this.queueCommand(tuneCmd, (resp) => {
            this.logger.debug(`QSY Tune Response: ${resp}`);
        });
    }

    if (needMode) {
        const modeCmd = `slice set ${targetSlice.index} mode=${flexMode}`;
        // Small delay (50ms) to ensure TCP packet separation if needed
        setTimeout(() => {
             this.queueCommand(modeCmd, (resp) => {
                 this.logger.debug(`QSY Mode Response: ${resp}`);
             });
        }, 50);
    }

    // --- THE KICKER: Active Polling ---
    // We send 'sub slice all' to force the radio to re-send the full status 
    // of all slices (including RF_frequency), in case it suppressed the update.
    setTimeout(() => {
        this.queueCommand('sub slice all', (resp) => {
             this.logger.debug(`QSY Verification Poll Sent: ${resp}`);
        });
    }, 250); 

    return { success: true, error: null };
  }
  
  /**
   * Gracefully disconnects from the FlexRadio server.
   * Closes the socket, cleans up resources, and prevents further reconnection attempts.
   * @returns {Promise<void>} - Resolves when the disconnection is complete.
   */
  disconnect() {
    return new Promise((resolve) => {
      if (this.flexClient && !this.flexClient.destroyed && this.isConnected()) {
        this.logger.info('Disconnecting from FlexRadio server.');
        this.shouldReconnect = false;
        this.connected = false;
        this.isDisconnecting = true;

        this.queueCommand('spot clear', (response) => {
          this.logger.info(`Response to spot clear on disconnect: ${response}`);

          this.flexClient.destroy();
          this.flexClient = null;

          for (let seqNum in this.flexPendingCommands) {
            clearTimeout(this.flexPendingCommands[seqNum].timeout);
            if (typeof this.flexPendingCommands[seqNum].callback === 'function') {
              this.flexPendingCommands[seqNum].callback('Disconnected');
            }
            delete this.flexPendingCommands[seqNum];
          }

          this.commandQueue = [];
          this.sendingCommands = false;

          this.logger.info('Successfully disconnected from FlexRadio server.');
          resolve();
        });

        setTimeout(() => {
          if (this.flexClient && !this.flexClient.destroyed) {
            this.logger.warn('Forcefully destroying FlexRadio connection after timeout.');
            this.flexClient.destroy();
            this.flexClient = null;
            resolve();
          }
        }, (this.config.flexRadio.commandTimeout || 15000) + 1000);
      } else {
        this.logger.warn('FlexRadio client is not connected.');
        resolve();
      }

      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
      }
    });
  }

  /**
   * Sends a request to get the list of global profiles.
   * The actual data comes back via the 'globalProfileList' status event.
   */
  getGlobalProfiles() {
    if (!this.isConnected()) return;

    this.logger.info('Requesting global profile list...');
    this.queueCommand('profile global info', (response) => {
      // We don't need to parse 'response' here because it only contains "0" (success).
      // The data is handled by the messageParser 'globalProfileList' event.
      this.logger.debug(`Profile info command sent. Response: ${response}`);
    });
  }

  /**
   * Loads a specific global profile.
   * @param {string} profileName 
   */
  loadGlobalProfile(profileName) {
    if (!this.isConnected()) return;
    
    this.logger.info(`Loading Global Profile: ${profileName}`);
    // Quotes are important if the name contains spaces
    this.queueCommand(`profile global load "${profileName}"`, (response) => {
      this.logger.debug(`Profile load response: ${response}`);
    });
  } 

};
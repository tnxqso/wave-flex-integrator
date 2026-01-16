'use strict';
const { EventEmitter } = require('events');
const { dialog } = require('electron');
const fetch = require('node-fetch');

class WavelogClient extends EventEmitter {
  /**
   * Constructor for the WavelogClient class.
   * @param {object} config - The configuration object containing Wavelog server info.
   * @param {object} logger - The logger instance to use for logging.
   * @param {BrowserWindow} mainWindow - The main Electron BrowserWindow instance.
   */
  constructor(config, logger, mainWindow) {
    super();
    this.config = config;
    this.logger = logger || console; // Default to console if no logger is provided
    this.activeStationData = null; // Cache the active station data
    this.mainWindow = mainWindow; // Store reference to main window
    this.fetchPromise = null; // Promise for ongoing fetch
  }

  /**
   * Handles errors by logging and showing a modal error dialog attached to the main window.
   * Updated to support suppressing the dialog.
   * @param {string} errorMessage - The error message.
   * @param {boolean} throwError - Whether to throw the error or not.
   * @param {boolean} suppressDialog - Whether to suppress the UI dialog.
   */
  handleError(errorMessage, throwError = true, suppressDialog = false) {
    this.logger.error(errorMessage);
    
    // Only show dialog if not suppressed and mainWindow exists
    if (!suppressDialog && this.mainWindow) {
        dialog.showMessageBoxSync(this.mainWindow, {
            type: 'error',
            title: 'Wavelog Client Error',
            message: errorMessage,
        });
    }
    
    if (throwError) {
      throw new Error(errorMessage);
    }
  }

  /**
   * Sends the active TX slice information to the Wavelog server.
   * @param {Slice} activeTXSlice - The active TX slice object.
   * @returns {Promise<void>} - Resolves when the data is sent.
   */
  async sendActiveSliceToWavelog(activeTXSlice) {
    try {
      const xitAdjustment = activeTXSlice.xit_on ? activeTXSlice.xit_freq : 0;
      const adjustedFrequencyHz = Math.round(
        activeTXSlice.frequency * 1e6 + xitAdjustment
      );

      const payload = {
        key: this.config.wavelogAPI.apiKey,
        radio: this.config.wavelogAPI.multiFlexEnabled && activeTXSlice.stationName !== ''
          ? `${this.config.wavelogAPI.radioName} (${activeTXSlice.stationName})`
          : `${this.config.wavelogAPI.radioName}`,
        frequency: adjustedFrequencyHz,
        mode: activeTXSlice.mode,
      };

      const baseURL = this.config.wavelogAPI.URL.replace(/\/$/, '');
      const fullURL = `${baseURL}/api/radio`;

      const response = await fetch(fullURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorMessage = `Failed to send active TX slice to Wavelog: ${response.statusText}`;
        this.handleError(errorMessage);
      } else {
        this.logger.info(
          `Successfully sent active TX slice to Wavelog: Frequency ${adjustedFrequencyHz} Hz, Mode ${activeTXSlice.mode}`
        );
      }
    } catch (error) {
      const errorMessage = `Error in sendActiveSliceToWavelog: ${error.message}`;
      this.handleError(errorMessage);
    }
  }

  /**
   * Fetches and caches the active station data from Wavelog API.
   * Implements promise caching to prevent multiple simultaneous fetches.
   * @param {boolean} suppressErrors - Whether to suppress showing error dialogs.
   * @returns {Promise<object>} - The active station data object.
   */
  async getActiveStation(suppressErrors = false) {
    // Return cached data if available
    if (this.activeStationData !== null) {
      return this.activeStationData;
    }

    // If a fetch is already in progress, return the existing promise
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    // Start a new fetch and store the promise
    this.fetchPromise = new Promise(async (resolve, reject) => {
      const timeoutSeconds = 10; // Hardcoded timeout of 10 seconds

      try {
        const apiKey = this.config.wavelogAPI.apiKey;
        const baseURL = this.config.wavelogAPI.URL.replace(/\/$/, '');
        const fullURL = `${baseURL}/api/station_info/${apiKey}`;

        const response = await Promise.race([
          fetch(fullURL, {
            method: 'GET',
            headers: {
              Accept: 'application/json',
            },
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timed out')), timeoutSeconds * 1000)
          ),
        ]);

        if (!response.ok) {
          const errorMessage = `Failed to fetch station profile info: ${response.statusText}`;
          this.handleError(errorMessage, false, suppressErrors);
          this.fetchFailed = true;
          this.fetchPromise = null; // Reset the fetchPromise
          reject(errorMessage);
          this.emit('stationFetchError', new Error(response.statusText));
          return;
        }

        const data = await response.json();
        if (Array.isArray(data)) {
          const activeStation = data.find((station) => station.station_active == '1');
          if (activeStation) {
            this.activeStationData = activeStation;
            this.emit('stationFetched');
            this.logger.info(`Active Station ID: ${activeStation.station_id}`);
            this.logger.info(`Station Callsign: ${activeStation.station_callsign}`);
            this.logger.info(`Station Profile Name: ${activeStation.station_profile_name}`);
            this.logger.info(`Station Grid Square: ${activeStation.station_gridsquare}`);
            this.fetchPromise = null; // Reset the fetchPromise
            resolve(this.activeStationData);
          } else {
            const errorMessage = 'No active station profile found.';
            this.handleError(errorMessage, false, suppressErrors);
            this.fetchFailed = true;
            this.fetchPromise = null; // Reset the fetchPromise
            resolve(null);
          }
        } else {
          const errorMessage = 'Invalid response format.';
          this.handleError(errorMessage, false, suppressErrors);
          this.fetchFailed = true;
          this.fetchPromise = null; // Reset the fetchPromise
          resolve(null);
        }
      } catch (error) {
        const errorMessage = `Error in getActiveStation: ${error.message}`;
        this.handleError(errorMessage, false, suppressErrors);
        this.fetchFailed = true;
        this.fetchPromise = null; // Reset the fetchPromise
        this.emit('stationFetchError', error);
        reject(error);
      }
    });

    return this.fetchPromise;
  }

  /**
   * Gets the active station ID.
   * @returns {Promise<string>} - The station ID.
   */
  async getStationId() {
    if (this.activeStationData === null) {
      await this.getActiveStation();
    }
    return this.activeStationData.station_id;
  }

  /**
   * Gets the active station profile name.
   * @returns {Promise<string>} - The station profile name.
   */
  async getStationProfileName() {
    if (this.activeStationData === null) {
      await this.getActiveStation();
    }
    return this.activeStationData.station_profile_name;
  }

  /**
   * Gets the active station gridsquare.
   * @returns {Promise<string>} - The station gridsquare.
   */
  async getStationGridsquare() {
    if (this.activeStationData === null) {
      await this.getActiveStation();
    }
    return this.activeStationData.station_gridsquare;
  }

  /**
   * Gets the active station callsign.
   * @returns {Promise<string>} - The station callsign.
   */
  async getStationCallsign() {
    if (this.activeStationData === null) {
      await this.getActiveStation();
    }
    return this.activeStationData.station_callsign;
  }

  /**
   * Fetches the active station profile ID from Wavelog API.
   * Caches the result to avoid redundant calls.
   * @returns {Promise<number>} - The active station profile ID.
   */
  async getActiveStationProfileId() {
    return await this.getStationId();
  }

  /**
   * Sends an ADIF record to Wavelog server for logging.
   * @param {string} adifString - The ADIF record as a string.
   * @returns {Promise<void>} - Resolves when the data is sent.
   */
  async sendAdifToWavelog(adifString) {
    try {
      // Parse the ADIF string
      const parsedAdif = this.parseAdif(adifString);
      this.logger.debug('Parsed ADIF:', parsedAdif);

      // Get the station_callsign from the ADIF record, if present
      const adifStationCallsign = parsedAdif['station_callsign']
        ? parsedAdif['station_callsign'].trim()
        : null;

      // Get the gridsquare from the ADIF record, if present
      const adifMyGridsquare = parsedAdif['my_gridsquare']
        ? parsedAdif['my_gridsquare'].trim()
        : null;

      // Get the active station callsign and gridsquare from Wavelog
      const activeStationCallsign = (await this.getStationCallsign()).trim();
      const activeStationGridsquare = (await this.getStationGridsquare()).trim();

      // Compare the station callsigns, if present, ignoring case
      if (
        adifStationCallsign !== null &&
        adifStationCallsign.toLowerCase() !== activeStationCallsign.toLowerCase()
      ) {
        const errorMessage = `Cannot send ADIF record to Wavelog: The station callsign in the ADIF record (${adifStationCallsign}) does not match the active station callsign in Wavelog (${activeStationCallsign}).`;
        this.handleError(errorMessage, false); // Don't throw the error again
        return; // Stop execution to prevent double error
      } else {
        this.logger.debug('Station callsigns match or not present.');
      }

      // Compare the gridsquares, if present, ignoring case
      if (
        adifMyGridsquare !== null &&
        adifMyGridsquare.toLowerCase() !== activeStationGridsquare.toLowerCase()
      ) {
        const errorMessage = `Cannot send ADIF record to Wavelog: The gridsquare in the ADIF record (${adifMyGridsquare}) does not match the active station gridsquare in Wavelog (${activeStationGridsquare}).`;
        this.handleError(errorMessage, false); // Don't throw the error again
        return; // Stop execution to prevent double error
      } else {
        this.logger.debug('Gridsquares match or not present.');
      }

      // Clean up the ADIF string by trimming whitespace or excess newlines
      const cleanAdifString = adifString.replace(/\n/g, ' ').trim();
      this.logger.debug(`Cleaned ADIF String: ${cleanAdifString}`);

      // Validate the ADIF string before proceeding
      const validatedAdif = this.validateAdif(cleanAdifString);
      this.logger.debug('Validated ADIF:', validatedAdif);

      // Get the active station profile ID
      const stationProfileId = await this.getStationId();

      const payload = {
        key: this.config.wavelogAPI.apiKey,
        station_profile_id: stationProfileId,
        type: 'adif',
        string: cleanAdifString,
      };

      // Log the payload before sending it
      this.logger.debug(
        `Sending ADIF payload to Wavelog: ${JSON.stringify(payload)}`
      );

      const baseURL = this.config.wavelogAPI.URL.replace(/\/$/, '');
      const fullURL = `${baseURL}/api/qso`;

      const response = await fetch(fullURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage = `Failed to send ADIF record to Wavelog: ${response.statusText} - ${errorText}`;
        this.handleError(errorMessage, false); // Don't throw, just handle the error
        return; // Stop execution
      } else {
        const responseData = await response.json();
        this.logger.debug(`Wavelog response: ${JSON.stringify(responseData)}`); // Log full response data

        // Check if the response contains the adif_errors field
        if (responseData.hasOwnProperty('adif_errors')) {
          if (responseData.adif_errors === 0) {
            // ADIF was successfully processed
            this.logger.debug(
              `Successfully sent ADIF record to Wavelog with no errors.`
            );
          } else {
            // There were errors in ADIF processing
            const errorMessage = `Wavelog returned adif_errors: ${responseData.adif_errors}. The ADIF record was not processed successfully.`;
            this.handleError(errorMessage, false); // Handle the error, don't throw
            return; // Stop execution
          }
        } else if (
          responseData.status === 'OK' ||
          responseData.status === 'created'
        ) {
          // Fallback if adif_errors is not present, but status is OK/created
          this.logger.debug(`Successfully sent ADIF record to Wavelog.`);
        } else {
          const errorMessage = `Wavelog returned an error: ${JSON.stringify(
            responseData
          )}`;
          this.handleError(errorMessage, false); // Handle the error, don't throw
          return; // Stop execution
        }
      }
    } catch (error) {
      const errorMessage = `Error in sendAdifToWavelog: ${error.message}`;
      this.handleError(errorMessage);
    }
  }

  parseAdif(adifString) {
    const adifPattern = /<([^:>]+)(?::(\d+))?>([^<]*)/gi;
    const result = {};

    let match;
    while ((match = adifPattern.exec(adifString)) !== null) {
      const field = match[1].toLowerCase();
      const length = match[2] ? parseInt(match[2], 10) : null;
      let value = match[3];
      if (length !== null) {
        value = value.substring(0, length);
      }
      result[field] = value.trim();
    }
    return result;
  }

  validateAdif(adifString) {
    const requiredFields = ['call', 'qso_date', 'time_on', 'eor'];
    const parsedAdif = this.parseAdif(adifString);

    for (const field of requiredFields) {
      if (!Object.prototype.hasOwnProperty.call(parsedAdif, field)) {
        const errorMessage = `Missing required ADIF field: ${field}`;
        this.handleError(errorMessage);
      }
    }

    return parsedAdif;
  }

  // --- NEW METHODS FOR QSO ASSISTANT ---

  /**
   * Look up callsign via Wavelog Private Lookup API.
   * @param {string} callsign - The callsign to lookup
   * @param {string} band - The band (e.g. '20m')
   * @param {string} mode - The mode (e.g. 'SSB')
   */
  async lookupCallsign(callsign, band = '20m', mode = 'SSB') {
    try {
      const baseURL = this.config.wavelogAPI.URL.replace(/\/$/, '');
      const fullURL = `${baseURL}/api/private_lookup`;

      const payload = {
        key: this.config.wavelogAPI.apiKey,
        callsign: callsign,
        band: band, 
        mode: mode
      };

      this.logger.debug(`Looking up callsign: ${callsign}`);

      const response = await fetch(fullURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        this.logger.warn(`Lookup failed: ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      return data;

    } catch (error) {
      this.logger.error(`Error in lookupCallsign: ${error.message}`);
      return null;
    }
  }
/**
   * Converts a Maidenhead Gridsquare to Latitude and Longitude.
   * @param {string} grid - The gridsquare (e.g., "JO67LC").
   * @returns {object|null} - { lat: number, lon: number } or null if invalid.
   */
  gridToLatLon(grid) {
    if (!grid || grid.length < 4) return null;
    
    grid = grid.toUpperCase();
    
    const latChar1 = grid.charCodeAt(1) - 65;
    const lonChar1 = grid.charCodeAt(0) - 65;
    const latChar2 = parseInt(grid.charAt(3));
    const lonChar2 = parseInt(grid.charAt(2));
    
    // Basic calculation for 4-char grid (Center of the square)
    let lat = -90 + (latChar1 * 10) + latChar2 + 0.5;
    let lon = -180 + (lonChar1 * 20) + (lonChar2 * 2) + 1;

    // Refine if 6 chars provided
    if (grid.length >= 6) {
      const latChar3 = grid.charCodeAt(5) - 65;
      const lonChar3 = grid.charCodeAt(4) - 65;
      lat += (latChar3 / 24) - 0.5 + (1.0/48); // Adjust center
      lon += (lonChar3 / 12) - 1 + (1.0/24);   // Adjust center
    }

    return { lat, lon };
  }

  /**
   * Calculates bearing and distance between two points.
   * @param {number} lat1 - Start Latitude
   * @param {number} lon1 - Start Longitude
   * @param {number} lat2 - End Latitude
   * @param {number} lon2 - End Longitude
   */
  calculateBearingDistance(lat1, lon1, lat2, lon2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const toDeg = (rad) => (rad * 180) / Math.PI;
    const R = 6371; // Earth radius in km

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const rLat1 = toRad(lat1);
    const rLat2 = toRad(lat2);

    // Haversine Distance
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(rLat1) * Math.cos(rLat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = Math.round(R * c);

    // Bearing
    const y = Math.sin(dLon) * Math.cos(rLat2);
    const x = Math.cos(rLat1) * Math.sin(rLat2) -
              Math.sin(rLat1) * Math.cos(rLat2) * Math.cos(dLon);
    let bearing = toDeg(Math.atan2(y, x));
    bearing = (bearing + 360) % 360;

    return { bearing: Math.round(bearing), distance: distance };
  }
}

module.exports = WavelogClient;
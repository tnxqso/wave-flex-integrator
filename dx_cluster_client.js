'use strict';

const net = require('net');
const events = require('events');
const util = require('util');
const sleep = util.promisify(setTimeout);

/**
 * DXClusterClient class responsible for connecting to a DX Cluster server,
 * handling login, parsing incoming data, and emitting events for spots and messages.
 */
class DXClusterClient extends events.EventEmitter {
  constructor(config = {}, logger) {
    super();

    this.config = config;
    this.logger = logger;

    this.socket = null;
    this.call = config.dxCluster.callsign || null;
    this.status = {
      connected: false,
      awaiting_login: false,
      logged_in: false,
    };
    this.buffer = ''; 
    this.regex = {
      deline: /^(DX de) +([A-Z0-9/\\\-#]{3,}):? *(\d*\.\d{1,3}) *([A-Z0-9/\\\-#]{3,}) +(.*\S)? +(\d{4})Z *(\w{2}\d{2})?/g,
    };
    
    this.ct = '\r\n'; 
    this.dxId = config.dxCluster.dxId || 'DX de';

    this.loginPrompt = config.dxCluster.loginPrompt || 'login:';
    this.loginSuccessMessages = config.dxCluster.loginSuccessMessages || ['Welcome', 'de '];
    this.loginTimeout = config.dxCluster.loginTimeout || 10000;

    // Server Configs
    this.primaryHost = config.dxCluster.host || '127.0.0.1';
    this.primaryPort = config.dxCluster.port || 23;
    this.backupHost = config.dxCluster.backupHost || null;
    this.backupPort = config.dxCluster.backupPort || null;

    // State Tracking
    this.currentHost = this.primaryHost;
    this.currentPort = this.primaryPort;
    this.usingBackup = false;

    this.loginTimer = null;
    this.shouldReconnect = true; 
    this.isReconnecting = false;
    this.reconnectDelay = config.dxCluster.reconnect.maxDelay || 5000;
    this.commandsSent = false;
  }

  /**
   * Connects to the DXCluster server.
   */
  connect() {
    if (!this.call) {
      return Promise.reject(new Error('You must specify a callsign'));
    }

    if (this.status.connected || this.isReconnecting) {
      this.logger.warn('A DX Cluster connection or reconnection attempt is already in progress.');
      return Promise.resolve();
    }

    // Note: We do NOT use removeAllListeners('loggedin') here anymore to avoid breaking the UI.
    this.removeAllListeners('logintimeout');

    return new Promise((resolve, reject) => {
      // Determine which server label to use for logging
      const serverType = this.usingBackup ? 'BACKUP' : 'PRIMARY';
      const serverInfo = `${this.currentHost}:${this.currentPort}`;
      
      // Define listeners as named functions so we can remove them specifically on failure
      const onLoggedIn = () => {
        this._stopLoginTimer();
        this.logger.info(`Login successful on ${serverType} DX Cluster server [${serverInfo}]`);
        this.commandsSent = false; 
        
        // Clean up the timeout listener
        this.removeListener('logintimeout', onLoginTimeout);
        resolve(); 
      };

      const onLoginTimeout = (err) => {
        this.logger.error(`Login timeout on ${serverType} DX Cluster server [${serverInfo}].`);
        this.destroy(); 
        
        // IMPORTANT: Clean up the success listener so it doesn't fire later for the wrong server
        this.removeListener('loggedin', onLoggedIn);
        reject(err);
      };

      // Attach specific listeners for this connection attempt
      this.once('loggedin', onLoggedIn);
      this.once('logintimeout', onLoginTimeout);

      this.socket = net.createConnection({ host: this.currentHost, port: this.currentPort }, () => {
        this.status.connected = true;
        this.status.awaiting_login = true;
        this.logger.info(`Connected to ${serverType} DX Cluster server at ${serverInfo}`);
        this._startLoginTimer();
      });

      this.socket.on('data', (data) => {
        try {
          this._handleData(data);
        } catch (error) {
          this.logger.error(`Error handling DX Cluster data from ${serverType}: ${error.message}`);
        }
      });

      this.socket.on('close', () => {
        // If socket closes before login, ensure we clean up the pending listeners
        this.removeListener('loggedin', onLoggedIn);
        this.removeListener('logintimeout', onLoginTimeout);

        this._handleSocketClose(serverType);
        if (this.shouldReconnect) {
            this.handleFailoverOrReconnect();
        }
      });

      this.socket.on('error', (err) => {
        this.logger.error(`DX Cluster socket error on ${serverType} (${serverInfo}): ${err.message}`);
        this._handleSocketError(err);
      });
    });
  }

  _startLoginTimer() {
    this._stopLoginTimer(); 
    this.loginTimer = setTimeout(() => {
      this.emit('logintimeout', new Error('Login timeout'));
    }, this.loginTimeout);
  }

  _stopLoginTimer() {
    if (this.loginTimer) {
      clearTimeout(this.loginTimer);
      this.loginTimer = null;
    }
  }

  _handleData(data) {
    this.buffer += data.toString('utf8');

    if (this.status.awaiting_login && this.buffer.includes(this.loginPrompt)) {
      this.logger.info('DX Cluster login prompt detected. Sending callsign.');
      this.write(this.call);
      this.status.awaiting_login = false;
      this.buffer = ''; 
    }

    if (
      !this.status.logged_in &&
      this.loginSuccessMessages.some((msg) => this.buffer.includes(msg))
    ) {
      this.status.logged_in = true;
      this.emit('loggedin');
      this.buffer = ''; 
    } else if (this.status.logged_in) {
      this._parseBuffer();
    }
  }

  _handleSocketClose(serverType = 'Unknown') {
    this.logger.info(`Connection to ${serverType} DX Cluster server closed.`);
    this.status.connected = false;
    this.status.awaiting_login = false;
    this.status.logged_in = false;
    this._stopLoginTimer();
    this.emit('close');
  }

  _handleSocketError(err) {
    this._stopLoginTimer();
  }

  write(data) {
    if (this.socket && !this.socket.destroyed && this.socket.writable) {
      this.socket.write(data + this.ct);
    } else {
      this.logger.warn('Cannot write to DX Cluster socket; not connected.');
    }
  }

  close() {
    this.shouldReconnect = false;
    if (this.socket) {
      this.socket.end();
    }
    this._resetState();
  }

  destroy() {
    this.shouldReconnect = true; 
    if (this.socket) {
      this.socket.destroy();
    }
    this._resetState();
  }

  _resetState() {
      this.status.connected = false;
      this.status.awaiting_login = false;
      this.status.logged_in = false;
      this._stopLoginTimer();
  }

  _parseBuffer() {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop(); 

    lines.forEach((line) => {
      line = line.trim();
      if (line.length > 0) {
        this._parseDX(line);
      }
    });
  }

  _parseDX(dxString) {
    if (dxString.startsWith(this.dxId)) {
      const match = this.regex.deline.exec(dxString);
      this.regex.deline.lastIndex = 0; 

      if (match) {
        const dxSpot = {
          spotter: match[2],
          spotted: match[4],
          frequency: parseFloat(match[3]),
          message: match[5],
          timestamp: new Date(),
        };
        this.emit('spot', dxSpot);
      }
    } else {
      this.emit('message', dxString);
    }
  }

  /**
   * Smart logic to handle failover or standard reconnect.
   */
  handleFailoverOrReconnect() {
      // If we are currently on Primary, and we have a Backup configured...
      if (!this.usingBackup && this.backupHost && this.backupPort) {
          this.logger.warn(`Primary DX Cluster connection (${this.primaryHost}) failed. Switching to BACKUP DX Cluster server...`);
          this.usingBackup = true;
          this.currentHost = this.backupHost;
          this.currentPort = this.backupPort;
          
          setTimeout(() => {
              this.connect().catch(err => this.logger.error(`Backup DX Cluster connection failed: ${err.message}`));
          }, 1000);
          
      } else {
          if (this.usingBackup) {
              this.logger.warn('Backup DX Cluster connection failed. Reverting to PRIMARY DX Cluster server for next attempt.');
          }
          
          this.usingBackup = false;
          this.currentHost = this.primaryHost;
          this.currentPort = this.primaryPort;
          
          this.scheduleReconnect();
      }
  }

  scheduleReconnect() {
    if (!this.shouldReconnect) return;
    if (this.isReconnecting) return;

    this.isReconnecting = true;
    this.logger.info(`Retrying connection to PRIMARY DX Cluster server (${this.primaryHost}) in ${this.reconnectDelay / 1000} seconds...`);
    
    setTimeout(() => {
      this.isReconnecting = false;
      if (!this.status.connected && this.shouldReconnect) {
        this.connect().catch((err) => {
          this.logger.error(`DX Cluster reconnection attempt failed: ${err.message}`);
        });
      }
    }, this.reconnectDelay);
  }

  async sendCommandsAfterLogin() {
    if (this.commandsSent) return;
    this.commandsSent = true;

    const commands = this.config.dxCluster.commandsAfterLogin;
    if (!commands || commands.length === 0) {
      return;
    }

    for (const command of commands) {
      try {
        this.logger.info(`Sending DX Cluster command: ${command}`);
        this.write(command);
        await sleep(500); 
      } catch (err) {
        this.logger.error(`Error sending DX Cluster command "${command}": ${err.message}`);
      }
    }
  }

  sendDxSpot(freq, callsign, comment) {
    if (!this.socket || this.socket.destroyed || !this.socket.writable) {
      this.logger.warn('Cannot send DX spot: DX Cluster client not connected.');
      return;
    }

    const command = `DX ${freq} ${callsign} ${comment || ''}`;
    this.logger.info(`Sending DX Spot: "${command}"`);

    try {
        this.socket.write(command + '\r\n');
    } catch (e) {
        this.logger.error(`Exception during write to DX Cluster: ${e.message}`);
    }
  }
}

module.exports = DXClusterClient;
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
  /**
   * Constructs a new DXClusterClient instance.
   * @param {object} config - The configuration object.
   * @param {object} logger - The logger instance.
   */
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
    this.buffer = ''; // Buffer to accumulate data
    this.regex = {
      deline: /^(DX de) +([A-Z0-9/\\\-#]{3,}):? *(\d*\.\d{1,3}) *([A-Z0-9/\\\-#]{3,}) +(.*\S)? +(\d{4})Z *(\w{2}\d{2})?/g,
    };
    this.ct = config.dxCluster.ct || '\n';
    this.dxId = config.dxCluster.dxId || 'DX de';

    // Login-related properties
    this.loginPrompt = config.dxCluster.loginPrompt || 'login:';
    this.loginSuccessMessages = config.dxCluster.loginSuccessMessages || ['Welcome', 'de '];
    this.loginTimeout = config.dxCluster.loginTimeout || 10000; // Default 10s timeout for login

    // Connection options
    this.host = config.dxCluster.host || '127.0.0.1';
    this.port = config.dxCluster.port || 23;

    this.loginTimer = null;
    this.shouldReconnect = true; // Control reconnection attempts
    this.isReconnecting = false;
    this.reconnectDelay = config.dxCluster.reconnect.maxDelay || 5000; // Default 5 seconds
  }

  /**
   * Connects to the DXCluster server.
   * @returns {Promise<void>}
   */
  connect() {
    if (!this.call) {
      return Promise.reject(new Error('You must specify a callsign'));
    }

    if (this.status.connected || this.isReconnecting) {
      this.logger.warn('A connection or reconnection attempt is already in progress.');
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.socket = net.createConnection({ host: this.host, port: this.port }, () => {
        this.status.connected = this.status.awaiting_login = true;
        this.logger.info(`Connected to DXCluster at ${this.host}:${this.port}`);
        this._startLoginTimer();
      });

      // Handle socket data
      this.socket.on('data', (data) => {
        try {
          this._handleData(data);
        } catch (error) {
          this.logger.error(`Error handling data: ${error.message}`);
        }
      });

      // Handle socket closure
      this.socket.on('close', () => {
        this._handleSocketClose();
        this.scheduleReconnect();
      });

      // Handle socket errors
      this.socket.on('error', (err) => {
        this.logger.error(`Socket error: ${err.message}`);
        this._handleSocketError(err);
        this.scheduleReconnect();
      });

      // Handle successful login
      this.once('loggedin', () => {
        this._stopLoginTimer();
        this.logger.info('Login successful.');
        resolve(); // Resolve the promise
      });

      // Handle login timeout
      this.once('logintimeout', (err) => {
        this.logger.error('Login timeout.');
        this.close();
        reject(err);
      });

      // Handle unexpected errors
      this.on('error', (err) => {
        this.logger.error(`Unexpected error: ${err.message}`);
        reject(err);
      });
    });
  }

  /**
   * Starts the login timer to prevent hanging on login.
   */
  _startLoginTimer() {
    this.loginTimer = setTimeout(() => {
      this.emit('logintimeout', new Error('Login timeout'));
    }, this.loginTimeout);
  }

  /**
   * Stops the login timer.
   */
  _stopLoginTimer() {
    if (this.loginTimer) {
      clearTimeout(this.loginTimer);
      this.loginTimer = null;
    }
  }

  /**
   * Handles incoming data from the socket.
   * @param {Buffer|string} data - The incoming data.
   */
  _handleData(data) {
    this.buffer += data.toString('utf8');

    if (this.status.awaiting_login && this.buffer.includes(this.loginPrompt)) {
      this.logger.info('Login prompt detected. Sending callsign.');
      this.write(this.call);
      this.status.awaiting_login = false;
      this.buffer = ''; // Clear buffer after sending callsign
    }

    if (
      !this.status.logged_in &&
      this.loginSuccessMessages.some((msg) => this.buffer.includes(msg))
    ) {
      this.status.logged_in = true;
      this.emit('loggedin');
      this.buffer = ''; // Clear buffer after login
    } else if (this.status.logged_in) {
      this._parseBuffer();
    }
  }

  /**
   * Handles socket closure.
   */
  _handleSocketClose() {
    this.logger.info('Connection to DXCluster closed.');
    this.status.connected = this.status.awaiting_login = this.status.logged_in = false;
    this.emit('close');
  }

  /**
   * Handles socket errors.
   * @param {Error} err - The error object.
   */
  _handleSocketError(err) {
    this._stopLoginTimer();
    this.logger.error(`Socket error: ${err.message}`);
  }

  /**
   * Writes data to the socket.
   * @param {string} data - The data to write.
   */
  write(data) {
    if (this.socket && this.status.connected) {
      return this.socket.write(data + this.ct);
    } else {
      this.logger.warn('Cannot write to socket; not connected.');
    }
  }

  /**
   * Closes the socket connection gracefully.
   */
  close() {
    this.shouldReconnect = false;
    this.status.connected = this.status.awaiting_login = this.status.logged_in = false;
    if (this.socket) {
      this.socket.end();
      this.emit('closed');
    }
  }

  /**
   * Destroys the socket connection.
   */
  destroy() {
    this.shouldReconnect = false;
    this.status.connected = this.status.awaiting_login = this.status.logged_in = false;
    if (this.socket) {
      this.socket.destroy();
      this.emit('destroyed');
    }
  }

  /**
   * Parses the buffer to extract lines and processes them.
   */
  _parseBuffer() {
    const lines = this.buffer.split('\n');
    this.buffer = ''; // Clear buffer after parsing

    lines.forEach((line) => {
      line = line.trim();
      if (line.length > 0) {
        this._parseDX(line);
      }
    });
  }

  /**
   * Parses a DX string and emits a 'spot' event.
   * @param {string} dxString - The DX string to parse.
   */
  _parseDX(dxString) {
    if (dxString.startsWith(this.dxId)) {
      const match = this.regex.deline.exec(dxString);
      this.regex.deline.lastIndex = 0; // Reset regex lastIndex

      if (match) {
        const dxSpot = {
          spotter: match[2],
          spotted: match[4],
          frequency: parseFloat(match[3]),
          message: match[5],
          timestamp: new Date(),
        };
        this.emit('spot', dxSpot);
      } else {
        this.emit('parseerror', dxString);
        this.logger.warn(`Failed to parse DX spot: ${dxString}`);
      }
    } else {
      this.emit('message', dxString);
      this.logger.debug(`Received message: ${dxString}`);
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
    this.logger.info(
      `Retrying connection to DXCluster in ${this.reconnectDelay / 1000} seconds...`
    );
    setTimeout(() => {
      if (!this.status.connected && this.shouldReconnect) {
        this.connect().catch((err) => {
          this.logger.error(`Reconnection attempt failed: ${err.message}`);
        });
      }
      this.isReconnecting = false;
    }, this.reconnectDelay);
  }

  async sendCommandsAfterLogin() {
    if (this.commandsSent) return;
    this.commandsSent = true;

    const commands = this.config.dxCluster.commandsAfterLogin;
    if (!commands || commands.length === 0) {
      this.logger.info('No commands to send after login.');
      return;
    }

    for (const command of commands) {
      try {
        this.logger.info(`Sending command: ${command}`);
        this.write(`${command}\n`);
        await new Promise((resolve) => {
          this.once('message', (data) => {
            this.logger.info(`Received response: ${data.trim()}`);
            resolve();
          });
        });
        await sleep(500);
      } catch (err) {
        this.logger.error(`Error sending command "${command}": ${err.message}`);
      }
    }
  }

}

module.exports = DXClusterClient;

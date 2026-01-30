// wavelog_ws_server.js
'use strict';

const { WebSocketServer } = require('ws');
const EventEmitter = require('events');

/**
 * WebSocket Server that listens for callsign lookup broadcasts from WaveLog.
 */
class WavelogWsServer extends EventEmitter {
  constructor(config, logger) {
    super();
    this.config = config;
    this.logger = logger;
    this.wss = null;
  }

  /**
   * Starts the WebSocket server using the port defined in configuration.
   */
  start() {
    // Default to 54322 if not defined in config
    const port = this.config.wavelogLive?.port || 54322;
    const isEnabled = this.config.wavelogLive?.enabled ?? true;

    if (!isEnabled) {
      this.logger.info('Wavelog Live WebSocket listener is disabled in config.');
      return;
    }

    try {
      this.wss = new WebSocketServer({ port: port });

      this.wss.on('connection', (ws) => {
        this.logger.info('Wavelog browser client connected via WebSocket.');

        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data);
            
            // Handle the custom "lookup_result" broadcast from our WaveLog PR
            if (message.type === 'lookup_result') {
              this.logger.debug(`Received callsign lookup from Wavelog: ${message.payload.callsign}`);
              // Emit event so main.js can handle it
              this.emit('lookup', message.payload);
            }
          } catch (e) {
            // Silently ignore non-JSON or malformed messages
          }
        });

        ws.on('error', (err) => {
          this.logger.error(`Wavelog WebSocket Client Error: ${err.message}`);
        });

        // Send a fake radio status back to keep Wavelog happy 
        // This ensures the connection icon in WaveLog stays active/green
        const status = JSON.stringify({
          type: 'radio_status',
          radio: 'Wave-Flex Integrator',
          frequency: 0, 
          mode: 'N/A',
          timestamp: Date.now()
        });
        ws.send(status);
      });

      this.wss.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          this.logger.error(`Could not start Wavelog WS Server: Port ${port} is already in use.`);
        } else {
          this.logger.error(`Wavelog WS Server Error: ${err.message}`);
        }
      });

      this.logger.info(`Wavelog Live WebSocket Server listening on ws://127.0.0.1:${port}`);

    } catch (e) {
      this.logger.error(`Failed to initialize Wavelog WS Server: ${e.message}`);
    }
  }

  /**
   * Stops the server.
   */
  stop() {
    if (this.wss) {
      this.wss.close(() => {
        this.logger.info('Wavelog WebSocket Server stopped.');
      });
    }
  }
}

module.exports = WavelogWsServer;
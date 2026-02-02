'use strict';

const { WebSocketServer } = require('ws');
const https = require('https');
const EventEmitter = require('events');

/**
 * WebSocket Server that facilitates real-time communication with the Wavelog browser client.
 * Supports both standard WS (54322) and secure WSS (54323) for HTTPS compatibility.
 */
class WavelogWsServer extends EventEmitter {
  constructor(config, logger) {
    super();
    this.config = config;
    this.logger = logger;
    this.wss = null;       // Standard WebSocket
    this.wssSecure = null; // Secure WebSocket
    this.clients = new Set();
  }

  /**
   * Starts the WebSocket servers.
   * @param {object} certs - { key, cert } SSL credentials from CertificateManager
   */
  start(certs = null) {
    const port = this.config.wavelogLive?.port || 54322;
    const securePort = 54323; // Standard Wavelog port for Secure WebSockets

    // 1. Start standard WebSocket (WS)
    try {
      this.wss = new WebSocketServer({ port: port });
      this._setupServerLogic(this.wss, `WS (${port})`);
    } catch (e) {
      this.logger.error(`Failed to start standard WS Server: ${e.message}`);
    }

    // 2. Start Secure WebSocket (WSS) if certificates are available
    if (certs && certs.key && certs.cert) {
      try {
        // Create HTTPS server with a simple request handler for browser verification
        const httpsServer = https.createServer({
          key: certs.key,
          cert: certs.cert
        }, (req, res) => {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <html>
              <body style="font-family: sans-serif; text-align: center; padding-top: 50px; background-color: #121212; color: #fff;">
                <h1 style="color: #0dcaf0;">✓ WSS Port Verified</h1>
                <p>Firefox now trusts the Secure WebSocket connection on this port.</p>
                <p style="color: #aaa;">You can close this tab now.</p>
              </body>
            </html>
          `);
        });

        this.wssSecure = new WebSocketServer({ server: httpsServer });
        this._setupServerLogic(this.wssSecure, `WSS (${securePort})`);

        httpsServer.listen(securePort, () => {
          this.logger.info(`Wavelog Secure WebSocket (WSS) listening on port ${securePort}`);
        });
      } catch (e) {
        this.logger.error(`Failed to start Secure WSS Server: ${e.message}`);
      }
    } else {
      this.logger.warn('SSL certificates not provided. WSS (Secure) will not be available.');
    }
  }

  /**
   * Internal helper to attach event listeners to a WebSocket server instance.
   */
  _setupServerLogic(serverInstance, label) {
    serverInstance.on('connection', (ws) => {
      this.clients.add(ws);
      this.logger.info(`Wavelog client connected via ${label}.`);

      // Trigger status refresh so the UI turns green immediately
      this.emit('client-connected');

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          // Handle metadata broadcast from our Wavelog PR
          if (message.type === 'lookup_result') {
            this.logger.debug(`Received callsign lookup from Wavelog: ${message.payload.callsign}`);
            this.emit('lookup', message.payload);
          }
        } catch (e) {
          // Silently ignore non-JSON messages
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        this.logger.info(`Wavelog client disconnected from ${label}.`);
        
        if (this.clients.size === 0) {
            this.emit('all-clients-disconnected');
        }
      });

      ws.on('error', (err) => {
        this.logger.error(`WebSocket Client Error (${label}): ${err.message}`);
      });

      // Send initial welcome message
      ws.send(JSON.stringify({
        type: 'welcome',
        message: `Connected to Wave-Flex Integrator ${label}`
      }));
    });
  }

  /**
   * Broadcasts radio status (Frequency/Mode) to all connected clients (WS and WSS).
   * @param {object} radioData - { frequency, mode, radio, power }
   */
  broadcastStatus(radioData) {
    if (this.clients.size === 0) return;

    // Get the name carefully
    let configuredRadioName = 'wave-flex-integrator'; // Default
    
    if (this.config.wavelogAPI && this.config.wavelogAPI.radioName) {
        configuredRadioName = this.config.wavelogAPI.radioName;
    } 
  
    // Ensure safe default for frequency
    const freqHz = radioData.frequency ? Math.round(radioData.frequency * 1000000) : 0;
    
    // Construct the message expected by Wavelog
    const message = JSON.stringify({
      type: 'radio_status',
      radio: configuredRadioName, 
      frequency: freqHz,          // Wavelog expects Hz (integer)
      mode: radioData.mode || 'N/A',
      power: radioData.power || null, 
      timestamp: Date.now()
    });

    this.clients.forEach(client => {
      if (client.readyState === 1) { // 1 = OPEN
        client.send(message);
      }
    });
  }

  /**
   * Stops both servers and cleans up connections.
   */
  stop() {
    if (this.wss) this.wss.close();
    if (this.wssSecure) this.wssSecure.close();
  }
}

module.exports = WavelogWsServer;
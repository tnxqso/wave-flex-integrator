// http_cat_listener.js
'use strict';

const http = require('http');

class HttpCatListener {
  /**
   * Creates an instance of HttpCatListener.
   * @param {object} config - Configuration object.
   * @param {object} logger - Logger instance.
   */
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.server = null;
    this.onQsyCallback = null; // Function to call when valid data is received
  }

  /**
   * Sets the callback function to execute when a QSY request is received.
   * @param {function} callback - Expected signature: (frequencyHz, mode)
   */
  onQsy(callback) {
    this.onQsyCallback = callback;
  }

  /**
   * Starts the HTTP Server.
   */
  start() {
    // Safety check: ensure config exists
    if (!this.config.catListener || !this.config.catListener.enabled) {
      this.logger.info('HTTP CAT Listener is disabled in config.');
      return;
    }

    const { host, port } = this.config.catListener;

    this.server = http.createServer((req, res) => {
      // 1. Handle CORS (Cross-Origin Resource Sharing)
      // Required because Wavelog running in the browser needs permission to talk to localhost
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      // Handle Pre-flight requests
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Ignore favicon requests to keep logs clean
      if (req.url === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }

      // 2. Parse URL: Expected format /<freq_hz>/<mode>
      // Example: /14020000/cw
      // Split by '/' and remove empty strings
      const urlParts = req.url.split('/').filter(p => p.length > 0);

      if (urlParts.length < 1) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Bad Request: Missing frequency');
        return;
      }

      const freqHz = parseInt(urlParts[0], 10);
      const mode = urlParts.length > 1 ? urlParts[1].toUpperCase() : null;

      // 3. Validation
      if (isNaN(freqHz)) {
        this.logger.warn(`CAT Listener received invalid data: ${req.url}`);
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Invalid Frequency');
        return;
      }

      // Basic Range Sanity Check (0.1 MHz to 70 MHz)
      // Allows for Generic Coverage (MW/SW) and 6m band.
      if (freqHz < 100000 || freqHz > 70000000) {
        this.logger.warn(`CAT Listener: Frequency ${freqHz} out of allowed safety range (100kHz-70MHz). Ignoring.`);
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Frequency out of range');
        return;
      }

      // 4. Log reception (Crucial: Logs even if radio is disconnected)
      this.logger.info(`CAT Listener received QSY request: ${freqHz} Hz ${mode ? '(' + mode + ')' : ''}`);

      // 5. Trigger Action
      if (this.onQsyCallback) {
        try {
            // Send 200 OK immediately to acknowledge receipt to Wavelog
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('OK');

            // Execute the tuning logic asynchronously
            this.onQsyCallback(freqHz, mode);
        } catch (err) {
            this.logger.error(`Error executing QSY callback: ${err.message}`);
        }
      } else {
        // Callback not defined yet (Main process not ready?)
        res.writeHead(503, { 'Content-Type': 'text/plain' });
        res.end('Service Not Ready');
      }
    });

    this.server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            this.logger.error(`HTTP CAT Listener Error: Port ${port} is already in use.`);
        } else {
            this.logger.error(`HTTP CAT Listener Error: ${err.message}`);
        }
    });

    try {
        this.server.listen(port, host, () => {
            this.logger.info(`HTTP CAT Listener running at http://${host}:${port}/`);
        });
    } catch (e) {
        this.logger.error(`Failed to start HTTP CAT Listener: ${e.message}`);
    }
  }

  /**
   * Stops the HTTP Server.
   */
  stop() {
    if (this.server) {
      this.server.close(() => {
        this.logger.info('HTTP CAT Listener stopped.');
      });
      this.server = null;
    }
  }
}

module.exports = HttpCatListener;
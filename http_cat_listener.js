// http_cat_listener.js
'use strict';

const http = require('http');
const httpolyglot = require('httpolyglot');

/**
 * Listener for incoming QSY (Tuning) commands from Wavelog.
 * Uses httpolyglot to support both HTTP and HTTPS on port 54321.
 */
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
   * Starts the Server.
   * @param {object} certs - Optional { key, cert } from CertificateManager
   */
  start(certs = null) {
    // Safety check: ensure config exists
    if (!this.config.catListener || !this.config.catListener.enabled) {
      this.logger.info('HTTP CAT Listener is disabled in config.');
      return;
    }

    const { host, port } = this.config.catListener;

    // Define the request handler to avoid duplication
    const requestHandler = (req, res) => {
      // 1. Handle CORS (Cross-Origin Resource Sharing)
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      
      // Cache the pre-flight response for 24 hours
      res.setHeader('Access-Control-Max-Age', '86400');

      // Private Network Access fix
      res.setHeader('Access-Control-Allow-Private-Network', 'true');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.url === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }

      const urlParts = req.url.split('/').filter(p => p.length > 0);

      // Friendly Connection Verification Page
      if (urlParts.length === 0 || urlParts[0] === 'verify') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <html>
            <body style="font-family: sans-serif; text-align: center; padding-top: 50px; background-color: #121212; color: #fff;">
              <h1 style="color: #198754;">✓ Connection Verified</h1>
              <p style="font-size: 1.2rem;">Wave-Flex Integrator is successfully communicating with your browser.</p>
              <p style="color: #aaa;">You can now close this tab and return to Wave-Flex Integrator.</p>
              <div style="margin-top: 30px; font-size: 0.8rem; color: #555;">Port: ${port} | SSL: ${certs ? 'Enabled' : 'Disabled'}</div>
            </body>
          </html>
        `);
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

      if (this.onQsyCallback) {
        try {
            // Trigger the QSY logic and capture the result from the FlexRadio client
            const result = this.onQsyCallback(freqHz, mode);

            if (result && result.success) {
                // Success: Wavelog will show a green confirmation popup
                res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('OK');
            } else {
                // Failure (e.g. no slice): Wavelog will show a red error popup
                const errorMsg = result ? result.error : 'Unknown error';
                this.logger.error(`CAT Listener: Rejecting request because: ${errorMsg}`);
                res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end(`Error: ${errorMsg}`);
            }
        } catch (err) {
            this.logger.error(`Error executing QSY callback: ${err.message}`);
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Internal Server Error');
        }
      } else {
        res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Service Not Ready');
      }
    };

    try {
      if (certs && certs.key && certs.cert) {
        // Create a dual-mode server that detects if the incoming request is HTTP or HTTPS
        this.server = httpolyglot.createServer({
          key: certs.key,
          cert: certs.cert
        }, requestHandler);
        this.logger.info('Dual-mode HTTP/HTTPS CAT Listener initialized with SSL support.');
      } else {
        // Fallback to standard HTTP server
        this.server = http.createServer(requestHandler);
      }

      this.server.on('error', (err) => {
          if (err.code === 'EADDRINUSE') {
              this.logger.error(`HTTP CAT Listener Error: Port ${port} is already in use.`);
          } else {
              this.logger.error(`HTTP CAT Listener Error: ${err.message}`);
          }
      });

      this.server.listen(port, host, () => {
        const protocol = certs ? 'http/https' : 'http';
        this.logger.info(`CAT Listener running at ${protocol}://${host}:${port}/`);
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
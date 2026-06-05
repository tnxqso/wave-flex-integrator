// status_server.js
'use strict';

const http = require('http');
const EventEmitter = require('events');

/**
 * Read-only localhost HTTP server that exposes the radio's current VFO
 * frequency and mode as JSON. Always binds to 127.0.0.1 only.
 */
class StatusServer extends EventEmitter {
  constructor(config, logger) {
    super();
    this.config = config;
    this.logger = logger;
    this.server = null;

    // Disconnected state is the safe default until the radio sends data.
    this.lastKnownState = {
      connected: false,
      frequency_mhz: null,
      frequency_hz: null,
      mode: null,
      slice_index: null,
      slice_letter: null,
    };
  }

  /**
   * Updates the cached state from an active TX slice object.
   * Pass null to mark as disconnected (radio offline or no TX slice).
   * @param {object|null} slice
   */
  updateState(slice) {
    if (!slice) {
      this.lastKnownState = {
        connected: false,
        frequency_mhz: null,
        frequency_hz: null,
        mode: null,
        slice_index: null,
        slice_letter: null,
      };
      return;
    }

    this.lastKnownState = {
      connected: true,
      frequency_mhz: slice.frequency,
      frequency_hz: Math.round(slice.frequency * 1_000_000),
      mode: slice.mode,
      slice_index: slice.index,
      slice_letter: slice.index_letter || null,
    };
  }

  /**
   * Starts the HTTP server. Binds to 127.0.0.1 only; never 0.0.0.0.
   */
  start() {
    if (!this.config.statusServer || !this.config.statusServer.enabled) {
      this.logger.info('Status Server is disabled in config.');
      return;
    }

    const port = this.config.statusServer.port;
    const host = '127.0.0.1';

    this.server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        res.end('Method Not Allowed');
        return;
      }

      // Strip query string before matching paths.
      const urlPath = req.url.split('?')[0];

      if (urlPath !== '/' && urlPath !== '/status') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }

      const body = JSON.stringify({
        ...this.lastKnownState,
        timestamp: Date.now(),
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
    });

    this.server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        this.logger.error(`Status Server: Port ${port} is already in use.`);
      } else {
        this.logger.error(`Status Server error: ${err.message}`);
      }
      this.emit('error', err);
    });

    this.server.listen(port, host, () => {
      this.logger.info(`Status Server running at http://${host}:${port}/status`);
    });
  }

  /**
   * Stops the HTTP server and releases the port.
   */
  stop() {
    if (this.server) {
      this.server.close(() => {
        this.logger.info('Status Server stopped.');
      });
      this.server = null;
    }
  }
}

module.exports = StatusServer;

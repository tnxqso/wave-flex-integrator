'use strict';

const os = require('os');
const { exec } = require('child_process');

let logger = console; // Fallback to console if no logger is set

// Function to set a custom logger
function setUtilLogger(customLogger) {
  logger = customLogger;
}

/**
 * Converts frequency in Hz to the standard amateur radio band string.
 * @param {number} freqHz - Frequency in Hertz.
 * @returns {string|null} - The band string (e.g., '20m') or null if outside defined bands.
 */
function freqToBand(freqHz) {
  const mhz = freqHz / 1e6;
  if (mhz >= 1.8 && mhz <= 2.0) return '160m';
  if (mhz >= 3.5 && mhz <= 4.0) return '80m';
  if (mhz >= 5.33 && mhz <= 5.41) return '60m';
  if (mhz >= 7.0 && mhz <= 7.3) return '40m';
  if (mhz >= 10.1 && mhz <= 10.15) return '30m';
  if (mhz >= 14.0 && mhz <= 14.35) return '20m';
  if (mhz >= 18.068 && mhz <= 18.168) return '17m';
  if (mhz >= 21.0 && mhz <= 21.45) return '15m';
  if (mhz >= 24.89 && mhz <= 24.99) return '12m';
  if (mhz >= 28.0 && mhz <= 29.7) return '10m';
  if (mhz >= 50.0 && mhz <= 54.0) return '6m';
  return null;
}

/**
 * Cleans the callsign by removing any trailing "-#" part.
 * @param {string} call - The callsign to clean.
 * @returns {string} - The cleaned callsign.
 */
function cleanCallsign(call) {
  return call.replace(/-\#$/, '');  // Remove trailing "-#" part
}

/**
 * Opens the log QSO URL in the default browser for the given callsign.
 * @param {string} callsign - The callsign to log.
 * @param {object} config - The configuration object containing wavelogAPI URL.
 */
function openLogQSO(callsign, config) {
  const baseURL = config.wavelogAPI.URL.replace(/\/$/, '');
  const callsignEncoded = encodeURIComponent(callsign);
  const fullURL = `${baseURL}/qso/log_qso?callsign=${callsignEncoded}`;

  let command;
  const platform = os.platform();
  if (platform === 'win32') {
    command = `start "" "${fullURL}"`;
  } else if (platform === 'darwin') {
    command = `open "${fullURL}"`;
  } else {
    command = `xdg-open "${fullURL}"`;
  }

  exec(command, (err) => {
    if (err) {
      logger.error(`Failed to open URL: ${err.message}`);
    } else {
      logger.info(`Opened URL: ${fullURL}`);
    }
  });
}

// Export the functions
module.exports = {
  setUtilLogger,
  freqToBand,
  cleanCallsign,
  openLogQSO
};

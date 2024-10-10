'use strict';

const os = require('os');
const { exec } = require('child_process');

let logger = console; // Fallback to console if no logger is set

// Function to set a custom logger
function setUtilLogger(customLogger) {
  logger = customLogger;
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
  cleanCallsign,
  openLogQSO
};

'use strict';

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

// Export the functions
module.exports = {
  setUtilLogger,
  cleanCallsign 
};

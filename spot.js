// spot.js

'use strict';

class Spot {
  /**
   * Creates an instance of Spot.
   * @param {number} index - The index (ID) of the spot.
   */
  constructor(index) {
    this.index = index;
    this.callsign = '';
    this.frequency = 0;
    this.mode = '';
    // ... other properties as needed
  }

  /**
   * Updates the spot's status based on the provided status message.
   * @param {string} statusMessage - The status message content.
   */
  statusUpdate(statusMessage) {
    // Parse key-value pairs from the status message
    const keyValuePairs = statusMessage.match(/(\w+)=("[^"]*"|\S*)/g);
    if (keyValuePairs) {
      keyValuePairs.forEach((pair) => {
        const [key, value] = pair.split('=');
        const cleanValue = value.replace(/"/g, '');
        switch (key) {
          case 'callsign':
            this.callsign = cleanValue;
            break;
          case 'freq': // Ensure the key is 'freq'
            this.frequency = parseFloat(cleanValue);
            break;
          case 'mode':
            this.mode = cleanValue;
            break;
          // Handle other properties as needed
          default:
            // Optionally log unknown properties
            // console.debug(`Unknown spot property: ${key}=${cleanValue}`);
            break;
        }
      });
    } else {
      // Optionally log parsing errors
      // console.warn(`Failed to parse status message for spot ${this.index}: ${statusMessage}`);
    }
  }
}

module.exports = Spot;

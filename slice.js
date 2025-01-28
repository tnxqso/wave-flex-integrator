// slice.js

'use strict';

/**
 * Class representing a Slice in FlexRadio.
 */
class Slice {
  /**
   * Creates an instance of Slice.
   * @param {number} index - The index (ID) of the slice.
   */
  constructor(index) {
    this.index = index;
    this.frequency = 0;
    this.mode = '';
    this.tx = false;
    this.active = false;
    this.index_letter = '';
    this.xit_on = false;
    this.xit_freq = 0;
    this.handle = ''; // GUI Client Handle of the slice
    this.stationName = ''; // Station name of the slice
    // Add other properties as needed
  }


  /**
   * Updates the station name of the slice based on the provided handleStationMap.
   * @param {Map<string, string>} handleStationMap - A map of GUI Client Handles to station names.
   */
  updateStationName(handleStationMap) { 
    this.stationName = handleStationMap.get(this.handle) || '';
  }
  /**
   * Updates the slice's status based on the provided status message.
   * @param {string} handle - The GUI Client Handle for the slice
   * @param {string} statusMessage - The status message content.
   */
  statusUpdate(handle, statusMessage) {
    // Split the status message into key-value pairs
    const keyValuePairs = statusMessage.match(/(?:[^\s"]+|"[^"]*")+/g);

    if (!keyValuePairs) {
      console.error(`Failed to parse status message: ${statusMessage}`);
      return;
    }

    // Skip 'slice' and index if present
    let startIndex = 0;
    if (keyValuePairs[0] === 'slice') {
      startIndex = 2; // Skip 'slice' and the index
    }
    this.handle = handle; 
    for (let i = startIndex; i < keyValuePairs.length; i++) {
      const pair = keyValuePairs[i];
      const equalIndex = pair.indexOf('=');
      if (equalIndex > -1) {
        const key = pair.substring(0, equalIndex);
        const value = pair.substring(equalIndex + 1);
        const cleanValue = value.replace(/"/g, '');
        switch (key) {
          case 'RF_frequency':
            this.frequency = parseFloat(cleanValue);
            break;
          case 'mode':
            this.mode = cleanValue;
            break;
          case 'tx':
            this.tx = cleanValue === '1';
            break;
          case 'active':
            this.active = cleanValue === '1';
            break;
          case 'index_letter':
            this.index_letter = cleanValue;
            break;
          case 'xit_on':
            this.xit_on = cleanValue === '1';
            break;
          case 'xit_freq':
            this.xit_freq = parseInt(cleanValue, 10);
            break;
          // Add other properties as needed
          default:
            // Optionally log unknown properties
            // console.debug(`Unknown slice property: ${key}=${cleanValue}`);
            break;
        }
      }
    }
  }
}

module.exports = Slice;

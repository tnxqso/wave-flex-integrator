'use strict';

const fetch = require('node-fetch');

class WavelogClient {
  /**
   * Constructor for the WavelogClient class.
   * @param {object} config - The configuration object containing Wavelog server info.
   * @param {object} logger - The logger instance to use for logging.
   */
  constructor(config, logger) {
    this.config = config;
    this.logger = logger || console; // Default to console if no logger is provided
    this.stationProfileId = null; // Cache the station profile ID
  }

  /**
   * Sends the active TX slice information to the Wavelog server.
   * @param {Slice} activeTXSlice - The active TX slice object.
   * @returns {Promise<void>} - Resolves when the data is sent.
   */
  async sendActiveSliceToWavelog(activeTXSlice) {
    try {
      const xitAdjustment = activeTXSlice.xit_on ? activeTXSlice.xit_freq : 0;
      const adjustedFrequencyHz = Math.round(
        activeTXSlice.frequency * 1e6 + xitAdjustment
      );

      const payload = {
        key: this.config.wavelogAPI.apiKey,
        radio: 'wave-flex-integrator',
        frequency: adjustedFrequencyHz,
        mode: activeTXSlice.mode,
      };

      const baseURL = this.config.wavelogAPI.URL.replace(/\/$/, '');
      const fullURL = `${baseURL}/api/radio`;

      const response = await fetch(fullURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        this.logger.error(
          `Failed to send active TX slice to Wavelog: ${response.statusText}`
        );
      } else {
        this.logger.info(
          `Successfully sent active TX slice to Wavelog: Frequency ${adjustedFrequencyHz} Hz, Mode ${activeTXSlice.mode}`
        );
      }
    } catch (error) {
      this.logger.error(`Error in sendActiveSliceToWavelog: ${error.message}`);
    }
  }

  /**
   * Fetches the active station profile ID from Wavelog API.
   * Caches the result to avoid redundant calls.
   * @returns {Promise<number>} - The active station profile ID.
   */
  async getActiveStationProfileId() {
    if (this.stationProfileId !== null) {
      return this.stationProfileId;
    }

    try {
      const apiKey = this.config.wavelogAPI.apiKey;
      const baseURL = this.config.wavelogAPI.URL.replace(/\/$/, '');
      const fullURL = `${baseURL}/api/station_info/${apiKey}`;

      const response = await fetch(fullURL, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        this.logger.error(
          `Failed to fetch station profile info from Wavelog: ${response.statusText}`
        );
        throw new Error(`Failed to fetch station profile info: ${response.statusText}`);
      }

      const data = await response.json();
      if (Array.isArray(data)) {
        const activeStation = data.find((station) => station.station_active == "1");
        if (activeStation) {
          this.stationProfileId = activeStation.station_id;
          this.logger.info(`Active station profile ID is ${this.stationProfileId}`);
          return this.stationProfileId;
        } else {
          this.logger.error('No active station profile found in Wavelog.');
          throw new Error('No active station profile found.');
        }
      } else {
        this.logger.error('Invalid response format when fetching station profile info.');
        throw new Error('Invalid response format.');
      }
    } catch (error) {
      this.logger.error(`Error in getActiveStationProfileId: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sends an ADIF record to Wavelog server for logging.
   * @param {string} adifString - The ADIF record as a string.
   * @returns {Promise<void>} - Resolves when the data is sent.
   */
  async sendAdifToWavelog(adifString) {
    try {
      // Remove the station_callsign field from the adifString
      // If that field is present, logging will not occur. Probably a bug in Wavelog.
      adifString = adifString.replace(/<station_callsign:[^>]*>[^<]*/i, '');
  
      // Validate the ADIF string before proceeding
      const parsedAdif = this.validateAdif(adifString);
      this.logger.debug("Validated ADIF:", parsedAdif);
  
      // Get the active station profile ID
      const stationProfileId = await this.getActiveStationProfileId();
  
      // Clean up the ADIF string by trimming whitespace or excess newlines
      const cleanAdifString = adifString.replace(/\n/g, ' ').trim();
      this.logger.debug(`Cleaned ADIF String: ${cleanAdifString}`);
  
      const payload = {
        key: this.config.wavelogAPI.apiKey,
        station_profile_id: stationProfileId,
        type: 'adif',
        string: cleanAdifString,
      };
  
      // Log the payload before sending it
      this.logger.debug(`Sending ADIF payload to Wavelog: ${JSON.stringify(payload)}`);
  
      const baseURL = this.config.wavelogAPI.URL.replace(/\/$/, '');
      const fullURL = `${baseURL}/api/qso`;
  
      const response = await fetch(fullURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });
  
      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Failed to send ADIF record to Wavelog: ${response.statusText} - ${errorText}`
        );
      } else {
        const responseData = await response.json();
        this.logger.debug(`Wavelog response: ${JSON.stringify(responseData)}`); // Log full response data
  
        if (responseData.status === 'OK' || responseData.status === 'created') {
          this.logger.debug(`Successfully sent ADIF record to Wavelog.`);
        } else {
          this.logger.error(`Wavelog returned an error: ${JSON.stringify(responseData)}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error in sendAdifToWavelog: ${error.message}`);
    }
  }

  parseAdif(adifString) {
    const adifPattern = /<([^:>]+)(?::(\d+))?>([^<]*)/gi;
    const result = {};
    let match;

    while ((match = adifPattern.exec(adifString)) !== null) {
      const field = match[1].toLowerCase();
      const length = match[2] ? parseInt(match[2], 10) : null;
      let value = match[3];
      if (length !== null) {
        value = value.substring(0, length);
      }
      result[field] = value.trim();
    }

    return result;
  }

  validateAdif(adifString) {
    const requiredFields = ['call', 'qso_date', 'time_on', 'eor'];
    const parsedAdif = this.parseAdif(adifString);
  
    for (const field of requiredFields) {
      if (!Object.prototype.hasOwnProperty.call(parsedAdif, field)) {
        throw new Error(`Missing required ADIF field: ${field}`);
      }
    }
  
    return parsedAdif;
  }  

}

module.exports = WavelogClient;

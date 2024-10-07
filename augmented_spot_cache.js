'use strict';

const { cleanCallsign } = require('./utils'); // Import cleanCallsign from utils.js
const fetch = require('node-fetch'); // Ensure node-fetch is installed and imported

/**
 * AugmentedSpotCache class responsible for managing augmented spots.
 * It handles band determination, Wavelog enrichment, and cache size management.
 */
class AugmentedSpotCache {
  /**
   * Creates an instance of AugmentedSpotCache.
   * @param {number} maxSize - The maximum number of enriched data entries to retain in the cache.
   * @param {object} logger - The logger instance for logging purposes.
   * @param {object} config - The configuration object containing Wavelog API details.
   */
  constructor(maxSize, logger, config) {
    this.cache = new Map(); // Renamed cache for enriched data only
    this.maxSize = maxSize;
    this.logger = logger;
    this.config = config;

    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.totalSpotsProcessed = 0;

    // Log cache initialization
    this.logger.info(`AugmentedSpotCache initialized with maxSize: ${this.maxSize}`);
  }

  /**
   * Generates a unique identifier for a spot based on callsign, band, and mode.
   * @param {object} spot - The spot object.
   * @returns {string} - The unique identifier.
   */
  generateSpotId(spot) {
    const spotId = `${spot.spotted}-${spot.band}-${spot.mode}`;
    // Log the generated Spot ID
    this.logger.debug(`Generated Spot ID: ${spotId}`);
    return spotId;
  }

  /**
   * Determines the radio band based on frequency in Hertz.
   * @param {number} frequencyHz - The frequency in Hertz.
   * @returns {string} - The determined band.
   */
  qrgToBand(frequencyHz) {
    if (typeof frequencyHz !== 'number' || isNaN(frequencyHz)) {
      this.logger.error(`Invalid frequency: ${frequencyHz}`);
      return 'Unknown';
    }
    if (frequencyHz >= 1800000 && frequencyHz < 2000000) return '160m';
    if (frequencyHz >= 3500000 && frequencyHz < 4000000) return '80m';
    if (frequencyHz >= 7000000 && frequencyHz < 7300000) return '40m';
    if (frequencyHz >= 10100000 && frequencyHz < 10150000) return '30m';
    if (frequencyHz >= 14000000 && frequencyHz < 14350000) return '20m';
    if (frequencyHz >= 18068000 && frequencyHz < 18168000) return '17m';
    if (frequencyHz >= 21000000 && frequencyHz < 21450000) return '15m';
    if (frequencyHz >= 24890000 && frequencyHz < 24990000) return '12m';
    if (frequencyHz >= 28000000 && frequencyHz < 29700000) return '10m';
    if (frequencyHz >= 50000000 && frequencyHz < 54000000) return '6m';
    // Add more bands as needed
    return 'Unknown'; // Corrected return value
  }

  /**
   * Predicts or guesses the mode of operation based on the message content and frequency.
   * CW is the default mode. Other modes are USB, LSB, AM, FM, and DIGU.
   * If "CW" is in the message, it's CW.
   * If the frequency is in the CW-only part of the band, it's CW.
   * If the frequency is in the digital mode part of the band, it's DIGU.
   * LSB is for frequencies below 10 MHz, and USB is for frequencies from 10 MHz and above.
   * @param {string} message - The message content to check for mode.
   * @param {number} frequencyHz - The frequency in Hertz to determine the band.
   * @returns {string} - The predicted mode.
   */
  guessMode(message, frequencyHz) {
    // Check if the message contains "CW"
    // Ensure message is a string before using .includes
    if (typeof message === 'string' && message.includes("CW")) {
      return "CW";
    }

    if (typeof frequencyHz !== 'number' || isNaN(frequencyHz)) {
      this.logger.error(`Invalid frequency: ${frequencyHz}`);
      return 'Unknown';
    }

    // CW-only segments from the Swedish band plan (in Hz)
    const cwSegments = [
      { band: '160m', start: 1810000, end: 1838000 },  // Example: 160m CW section
      { band: '80m', start: 3500000, end: 3570000 },   // 80m CW
      { band: '40m', start: 7000000, end: 7040000 },   // 40m CW
      { band: '30m', start: 10100000, end: 10130000 }, // 30m CW
      { band: '20m', start: 14000000, end: 14070000 }, // 20m CW
      { band: '17m', start: 18068000, end: 18095000 }, // 17m CW
      { band: '15m', start: 21000000, end: 21070000 }, // 15m CW
      { band: '12m', start: 24890000, end: 24915000 }, // 12m CW
      { band: '10m', start: 28000000, end: 28070000 }  // 10m CW
    ];

    // Check if the frequency falls in a CW-only segment
    for (const segment of cwSegments) {
      if (frequencyHz >= segment.start && frequencyHz <= segment.end) {
        return "CW";
      }
    }

    // Digital mode segments from the Swedish band plan (in Hz)
    const digiSegments = [
      { band: '80m', start: 3580000, end: 3600000 },    // 80m Digital
      { band: '40m', start: 7040000, end: 7050000 },    // 40m Digital
      { band: '30m', start: 10130000, end: 10150000 },  // 30m Digital
      { band: '20m', start: 14070000, end: 14099000 },  // 20m Digital
      { band: '17m', start: 18095000, end: 18110000 },  // 17m Digital
      { band: '15m', start: 21070000, end: 21090000 },  // 15m Digital
      { band: '12m', start: 24915000, end: 24929000 },  // 12m Digital
      { band: '10m', start: 28070000, end: 28120000 }   // 10m Digital
    ];

    // Check if the frequency falls in a digital mode segment
    for (const segment of digiSegments) {
      if (frequencyHz >= segment.start && frequencyHz <= segment.end) {
        return "DIGU";
      }
    }

    // If frequency is below 10 MHz, it's LSB; otherwise, it's USB
    if (frequencyHz < 10000000) {
      return "LSB";
    } else {
      return "USB";
    }
  }

  /**
   * Capitalizes the first letter of a string.
   * @param {string} str - The string to capitalize.
   * @returns {string} - The capitalized string.
   */
  toUcWord(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  /**
   * Enriches the spotted callsign with additional data from Wavelog.
   * @param {string} spotId - The unique Spot ID to use as the cache key.
   * @param {string} call - The callsign to enrich.
   * @returns {Promise<object|null>} - The enriched spot data or null if the lookup fails.
   */
  async wavelogEnrichSpot(spotId, call, band, mode) {
    try {
      // Clean the callsign before doing the lookup
      const cleanedCallsign = cleanCallsign(call);

      // Indicate enrichment process start
      this.logger.debug(`Enriching callsign: ${cleanedCallsign} for Spot ID: ${spotId}`);

      // Check if enriched data is already in the cache using Spot ID
      if (this.cache.has(spotId)) {
        this.logger.debug(`Augmented Spot Data Cache HIT for Spot ID: ${spotId}`);
        this.cacheHits++;
        return this.cache.get(spotId);
      } else {
        this.logger.debug(`Cache MISS for Spot ID: ${spotId}`);
        this.cacheMisses++;
      }

      const payload = {
        key: this.config.wavelogAPI.apiKey,
        callsign: cleanedCallsign,
        band: band,
        mode: mode,
        station_ids: this.config.wavelogAPI.station_location_ids,
      };

      // Ensure the URL ends without a trailing slash
      const baseURL = this.config.wavelogAPI.URL.replace(/\/$/, '');
      const fullURL = `${baseURL}/api/private_lookup`;

      const response = await fetch(fullURL, {
        method: 'POST', // POST method
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        this.logger.error(`Wavelog enrichment failed for Spot ID: ${spotId} (${cleanedCallsign}): ${response.statusText}`);
        this.logger.error(`URL : ${fullURL} Payload: ${JSON.stringify(payload)}`);
        return null;
      }

      const result = await response.json();
      if (!result || typeof result !== 'object') {
        this.logger.error(`Invalid response from Wavelog for Spot ID: ${spotId} (${cleanedCallsign})`);
        return null;
      }

      // Get maxDaysConsideredTrue from configuration
      const maxDaysConsideredTrue = this.config.loTW.max_days_lotw_considered_true;

      // Initialize lotwMember
      let lotwMember;

      // Determine if the lotwMember should be true or false
      if (result.lotw_member === false) {
        // When lotw_member is explicitly false
        lotwMember = false;
      } else {
        // Convert lotw_member to a number
        const lotwMemberValue = Number(result.lotw_member);

        // Check if the value is a valid number
        if (!isNaN(lotwMemberValue)) {
          // Set lotwMember based on the value
          if (lotwMemberValue === 0) {
            lotwMember = true;
          } else if (lotwMemberValue > 0 && lotwMemberValue < maxDaysConsideredTrue) {
            lotwMember = true;
          } else {
            lotwMember = false;
          }
        } else {
          // If not a valid number, set to false
          lotwMember = false;
        }
      }

      let returner = {
        bearing: result.bearing || '',                                            // Compass bearing (optional)
        callsign: result.callsign || cleanedCallsign,                             // Callsign
        call_confirmed: result.call_confirmed || false,                           // Whether the callsign has been worked before on any band, any mode (boolean)
        call_confirmed_band: result.call_confirmed_band || false,                 // Whether the callsign has been worked before on actual band, any mode (boolean)
        call_confirmed_band_mode: result.call_confirmed_band_mode || false,       // Whether the callsign has been worked before on actual band and actual mode (boolean)
        call_worked: result.call_worked || false,                                 // Worked before status
        call_worked_band: result.call_worked_band || false,                       // Worked before on band status
        call_worked_band_mode: result.call_worked_band_mode || false,             // Worked before on band and mode status
        cont: result.cont || '',                                                  // The continent (optional)
        dxcc_confirmed: result.dxcc_confirmed || false,                           // DXCC confirmed status (boolean)
        dxcc_confirmed_on_band: result.dxcc_confirmed_on_band || false,           // DXCC confirmed on band (boolean)
        dxcc_confirmed_on_band_mode: result.dxcc_confirmed_on_band_mode || false, // DXCC confirmed on band and mode (boolean)
        dxcc_cqz: result.dxcc_cqz || '',                                          // CQ zone for the DXCC entity
        dxcc_id: result.dxcc_id || '',                                            // DXCC ID (empty string if not provided)
        entity: result.dxcc ? this.toUcWord(result.dxcc) : '',                    // DXCC entity (uppercase first letter)
        flag: result.dxcc_flag || '',                                             // Flag emoji or image
        gridsquare: result.gridsquare || '',                                      // Add the gridsquare
        iota_ref: result.iota_ref || '',                                          // IOTA reference (optional)
        lat: result.dxcc_lat || '',                                               // Latitude (empty string if not provided)
        latlng: result.latlng || [],                                              // Latitude and Longitude as array or empty array
        lng: result.dxcc_long || '',                                              // Longitude (empty string if not provided)
        location: result.location || '',                                          // Location (optional)
        lotw_member: lotwMember,                                                  // If active LoTW uploader. Boolean.
        name: result.name || '',                                                  // Add the name (default to empty string if not available)
        qsl_manager: result.qsl_manager || '',                                    // QSL manager (optional)
        state: result.state || '',                                                // State (if available, optional)
        suffix_slash: result.suffix_slash || '',                                  // Suffix after slash e.g. Portable etc
        us_county: result.us_county || '',                                        // US county (if available, optional)
      };
  
      // Log the enriched data
      //console.log(`Enriched data for Spot ID: ${spotId} (${cleanedCallsign}):`, returner);

      // Cache the enriched data using Spot ID as the key
      this.cache.set(spotId, returner);
      this.logger.debug(`Cached enriched spot for Spot ID: ${spotId}. Current cache size: ${this.cache.size}/${this.maxSize}`);

      // Ensure cache size is within limits
      this.ensureSizeLimit();

      return returner;
    } catch (e) {
      this.logger.error(`Failed to enrich spot data for Spot ID: ${spotId} (${call}) with Wavelog information: ${e.message}`);
      return null;
    }
  }

  /**
   * Processes a new spot by determining its band, enriching it,
   * and managing cache entries.
   * @param {object} spot - The incoming spot object.
   * @returns {Promise<object>} - An object containing the processed spot and its worked-before status.
   */
  async processSpot(spot) {
    try {
      //this.logger.debug(`Processing new spot: ${JSON.stringify(spot)}`);

      this.totalSpotsProcessed++;

      // Assign a default message if it's missing
      spot.message = spot.message || "";

      // Determine the band based on the frequency
      spot.band = this.qrgToBand(spot.frequency * 1000);
      spot.mode = this.guessMode(spot.message, spot.frequency * 1000);

      // Generate a unique spot ID
      const spotId = this.generateSpotId(spot);
      spot.id = spotId;

      // Enrich the spotted callsign using the Spot ID
      spot.wavelog_augmented_data = await this.wavelogEnrichSpot(spotId, spot.spotted, spot.band, spot.mode);

      // Clean the spotter's callsign without enrichment
      spot.dxcc_spotter = cleanCallsign(spot.spotter);

      // Log whether enriched data was retrieved from cache or fetched anew
      if (spot.wavelog_augmented_data) {
        this.logger.debug(`Enriched data applied to spot with Spot ID: ${spotId}`);
      } else {
        this.logger.debug(`No enriched data available for spot with Spot ID: ${spotId}`);
      }

      // Return the processed spot
      return spot;
    } catch (error) {
      this.logger.error(`Error in processing spot: ${error.message}`);
      throw error;
    }
  }

  /**
   * Ensures the cache does not exceed the maximum size.
   * Removes the oldest entry if necessary.
   */
  ensureSizeLimit() {
    while (this.cache.size > this.maxSize) {
      // Remove the oldest entry
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      this.logger.debug(`Cache size exceeded. Removed oldest enriched data with Spot ID: ${firstKey}. Current cache size: ${this.cache.size}/${this.maxSize}`);
    }
  }

  /**
   * Retrieves all enriched data from the cache.
   * @returns {Array} - An array of enriched spot data objects.
   */
  getAllEnrichedData() {
    return Array.from(this.cache.values());
  }

  /**
   * Clears the cache.
   */
  clear() {
    this.cache.clear();
    this.logger.info('AugmentedSpotCache has been cleared.');
  }

  /**
   * Returns the health status of the AugmentedSpotCache.
   * @returns {object} - An object containing cache statistics.
   */
  getHealthStatus() {
    const totalCacheAccesses = this.cacheHits + this.cacheMisses;
    const hitRate = totalCacheAccesses > 0 ? (this.cacheHits / totalCacheAccesses) * 100 : 0;
    const cacheSize = this.cache.size;
    const threshold = Math.min(this.maxSize / 2, 250);  // Threshold for "Building" status

    // Determine cache health status
    let isHealthy = 'Building';
    if (cacheSize >= threshold) {
      isHealthy = hitRate > 10 ? 'Healthy' : 'Unhealthy';
    }

    // Return the cache health statistics
    return {
      cacheSize,
      maxSize: this.maxSize,
      totalSpotsProcessed: this.totalSpotsProcessed,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      cacheHitRate: `${hitRate.toFixed(2)}%`,
      isHealthy
    };
  }


}

module.exports = AugmentedSpotCache;

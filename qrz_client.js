'use strict';
const fetch = require('node-fetch');
const { XMLParser } = require('fast-xml-parser'); // Vi behöver denna!

// OBS: Du måste installera fast-xml-parser:
// Kör i terminalen: npm install fast-xml-parser

class QRZClient {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger || console;
    this.sessionKey = null;
    this.parser = new XMLParser();
  }

  /**
   * Log in to QRZ XML API to get a Session Key.
   */
  async login() {
    const { username, password } = this.config.qrz;
    if (!username || !password) return false;

    try {
      const url = `https://xmldata.qrz.com/xml/current/?username=${username}&password=${password}`;
      const response = await fetch(url);
      const text = await response.text();
      const jsonObj = this.parser.parse(text);

      if (jsonObj?.QRZDatabase?.Session?.Key) {
        this.sessionKey = jsonObj.QRZDatabase.Session.Key;
        // this.logger.info("Logged in to QRZ.com successfully.");
        return true;
      } else {
        this.logger.warn(`QRZ Login Failed: ${jsonObj?.QRZDatabase?.Session?.Error}`);
        return false;
      }
    } catch (err) {
      this.logger.error(`QRZ Login Error: ${err.message}`);
      return false;
    }
  }

  /**
   * Lookup callsign info. Auto-relogs if session expired.
   * @param {string} callsign 
   */
  async lookup(callsign) {
    if (!this.config.qrz.enabled) return null;
    if (!this.sessionKey) await this.login();
    if (!this.sessionKey) return null; // Login failed

    try {
      const url = `https://xmldata.qrz.com/xml/current/?s=${this.sessionKey}&callsign=${callsign}`;
      const response = await fetch(url);
      const text = await response.text();
      const jsonObj = this.parser.parse(text);

      const session = jsonObj?.QRZDatabase?.Session;
      if (session?.Error) {
        // Session might have expired
        if (session.Error.includes("Session")) {
            this.logger.info("QRZ Session expired, retrying...");
            this.sessionKey = null;
            await this.login();
            return this.lookup(callsign); // Retry once
        }
        return null;
      }

      const callData = jsonObj?.QRZDatabase?.Callsign;
      if (callData) {
        return {
          callsign: callData.call,
          name: callData.fname ? `${callData.fname} ${callData.name}` : callData.name,
          // Map 'addr2' (City) or 'addr1' (Street) to location if available
          location: callData.addr2 || callData.addr1 || '', 
          grid: callData.grid,
          lat: callData.lat,
          lon: callData.lon,
          country: callData.country,
          image: callData.image
        };
      }
      return null;

    } catch (err) {
      this.logger.error(`QRZ Lookup Error: ${err.message}`);
      return null;
    }
  }
}

module.exports = QRZClient;
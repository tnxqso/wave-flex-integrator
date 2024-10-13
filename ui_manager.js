// ui_manager.js
'use strict';

const { ipcMain } = require('electron');

class UIManager {
  constructor(mainWindow, logger) {
    this.mainWindow = mainWindow;
    this.logger = logger;
  }

  /**
   * Sends status updates to the renderer process.
   * @param {object} status - The status object to send.
   */
  sendStatusUpdate(status) {
    if (this.mainWindow && this.mainWindow.webContents) {
      this.logger.debug(`Sending status-update to renderer: ${JSON.stringify(status)}`);
      this.mainWindow.webContents.send('status-update', status);
    } else {
      this.logger.warn('Cannot send status-update. Main window or webContents is undefined.');
    }
  }

  /**
   * Updates FlexRadio connection status.
   * @param {string} event - The event name.
   * @param {Error} [error] - Optional error object.
   */
  updateFlexRadioStatus(event, error = null) {
    this.logger.debug(`FlexRadio status update triggered with event: ${event}`);
    this.sendStatusUpdate({
      event: event,
      error: error ? error.message : null,
    });
  }

  /**
   * Updates DXCluster connection status.
   * @param {string} event - The event name.
   * @param {Error} [error] - Optional error object.
   */
  updateDXClusterStatus(event, error = null) {
    this.logger.debug(`DXCluster status update triggered with event: ${event}`);
    this.sendStatusUpdate({
      event: event,
      error: error ? error.message : null,
    });
  }
  /**
   * Updates Wavelog API connection status.
   * @param {string} event - The event name.
   * @param {Error} [error] - Optional error object.
   */
  updateWavelogStatus(event, message = null, error = null) {
    this.logger.debug(`Wavelog status update triggered with event: ${event}`);
    this.sendStatusUpdate({
      event: event,
      message: message ? message : null,
      error: error ? error.message : null,
    });
  }

  /**
   * Updates WSJT-X listener status.
   * @param {string} event - The event name.
   * @param {Error} [error] - Optional error object.
   */
  updateWSJTStatus(event, error = null) {
    this.logger.debug(`WSJT-X status update triggered with event: ${event}`);
    this.sendStatusUpdate({
      event: event,
      error: error ? error.message : null,
    });
  }

  /**
   * Sends a new spot to the UI.
   * @param {object} spot - The spot data.
   */
  sendSpotUpdate(spot) {
    this.sendStatusUpdate({
      event: 'newSpot',
      spot: spot,
    });
  }

  /**
   * Sends cache health status updates.
   * @param {object} healthStatus - The health status object.
   */
  sendCacheHealthUpdate(healthStatus) {
    this.sendStatusUpdate({
      event: 'cacheHealth',
      healthStatus: healthStatus,
    });
  }
}

module.exports = UIManager;

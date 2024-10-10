'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const storage = require('electron-json-storage');
const DXClusterClient = require('./dx_cluster_client');
const FlexRadioClient = require('./flexradio_client');
const WSJTClient = require('./wsjt');
const WavelogClient = require('./wavelog_client');
const AugmentedSpotCache = require('./augmented_spot_cache');
const winston = require('winston');
const util = require('util');
const utils = require('./utils');
const sleep = util.promisify(setTimeout);
const { setUtilLogger } = require('./utils');
const UIManager = require('./ui_manager');
const mergeWith = require('lodash.mergewith');
const argv = require('yargs').argv;

let logger;
let mainWindow;
let splashWindow;
let isLoggedIn = false;
let commandsSent = false;
let dxClusterClient, flexRadioClient, augmentedSpotCache;
let wsjtClient;
let wavelogClient;
let uiManager;
let isShuttingDown = false;

const isDebug = process.argv.includes('--debug');
if (isDebug) {
  console.log('Debug mode is enabled, debug messages can be found in file: debug.log');
} else {
  console.log('Running in normal mode');
}

function redactSensitiveInfo(config) {
  const sensitiveKeys = ['apiKey', 'password', 'token']; // Add other sensitive keys as needed

  function redact(obj) {
    for (let key in obj) {
      if (sensitiveKeys.includes(key)) {
        obj[key] = '[REDACTED]'; // Redact the sensitive value
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        redact(obj[key]); // Recursively check nested objects
      }
    }
  }

  // Create a deep copy of the config object
  let safeConfig = JSON.parse(JSON.stringify(config));
  redact(safeConfig);
  return safeConfig;
}

function customizer(objValue, srcValue, key) {
  // Check for the specific key 'commandsAfterLogin' and handle empty array case
  if (key === 'commandsAfterLogin' && Array.isArray(srcValue)) {
    if (srcValue.length === 0) {
      console.log(`Custom merge: Keeping the empty array for ${key}`);
      return srcValue; // Keep the empty array if it exists in the stored config
    }
  }

  if (Array.isArray(objValue) && Array.isArray(srcValue)) {
    console.log(`Custom merge: Replacing array for ${key}`);
    return srcValue; // Replace default array with stored array
  }
}


/**
 * Loads the default configuration and merges it with local configuration if available.
 */
let defaultConfig = require('./defaultConfig.js');

// Attempt to load localConfig.js if it exists
const localConfigPath = path.join(__dirname, 'localConfig.js');
if (fs.existsSync(localConfigPath)) {
  const localConfig = require('./localConfig.js');
  defaultConfig = mergeWith({}, defaultConfig, localConfig, customizer);
  console.log('Loaded local configuration.');
} else {
  console.log('Loaded default configuration.');
}

/**
 * Creates the main application window.
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false, // Start hidden if using a splash screen
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    autoHideMenuBar: true, // This hides the menu bar
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Remove the menu completely
  mainWindow.removeMenu();

  mainWindow.on('closed', function () {
    mainWindow = null;
  });

  uiManager = new UIManager(mainWindow, logger);

  // Show the main window after the splash screen
  mainWindow.once('ready-to-show', () => {
    setTimeout(() => {
      if (splashWindow) {
        splashWindow.close();
      }
      mainWindow.show();
    }, 3500); // Adjust the delay as needed
  });

  // Auto-updater check for updates
  autoUpdater.checkForUpdatesAndNotify();

  // Handle auto-update events
  autoUpdater.on('update-available', () => {
    mainWindow.webContents.send('update_available');
    logger.info('A new update is available.');
  });

  autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('update_downloaded');
    logger.info('Update downloaded. The application will now restart to install it.');
    autoUpdater.quitAndInstall(); // Automatically quit and install the update
  });
}

function createSplashWindow() {
  const appVersion = app.getVersion();

  splashWindow = new BrowserWindow({
    width: 400, // Adjust the size as needed
    height: 300,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false, // For security
      contextIsolation: true, // For security
    },
  });

  // Load the splash.html with the version as a query parameter
  splashWindow.loadFile(path.join(__dirname, 'splash.html'), { query: { version: appVersion } });
  splashWindow.center();
}

/**
 * Loads the configuration from storage or uses the default configuration.
 * @returns {Promise<object>} - Resolves with the loaded configuration object.
 */
function loadConfig() {
  return new Promise((resolve, reject) => {
    storage.get('config', (error, storedConfig) => {
      if (error) {
        reject(error);
        return;
      }

      // If no stored configuration, use defaultConfig
      if (Object.keys(storedConfig).length === 0) {
        console.log('No stored configuration found, using default configuration.');
        storedConfig = {};
      } else {
        console.log('Loaded configuration from storage.');
      }

      // Merge storedConfig with defaultConfig using mergeWith and customizer
      let config = mergeWith({}, defaultConfig, storedConfig, customizer);

      // Check for missing keys in storedConfig and update if necessary
      let configUpdated = false;

      function checkAndUpdateConfig(defaultObj, storedObj) {
        for (const key in defaultObj) {
          if (!(key in storedObj)) {
            console.log(`Missing key in stored configuration: ${key}. Adding default value.`);
            storedObj[key] = defaultObj[key];
            configUpdated = true;
          } else if (Array.isArray(defaultObj[key]) && Array.isArray(storedObj[key])) {
            // Do nothing; accept stored array as is
            // If the stored array is intentionally shorter, we respect that
          } else if (typeof defaultObj[key] === 'object' && defaultObj[key] !== null) {
            if (typeof storedObj[key] !== 'object' || storedObj[key] === null) {
              console.log(`Mismatched type for key ${key}. Overwriting with default value.`);
              storedObj[key] = defaultObj[key];
              configUpdated = true;
            } else {
              checkAndUpdateConfig(defaultObj[key], storedObj[key]);
            }
          }
        }
      }

      checkAndUpdateConfig(defaultConfig, storedConfig);

      if (configUpdated) {
        storage.set('config', storedConfig, (err) => {
          if (err) {
            console.error(`Error saving updated configuration: ${err.message}`);
          } else {
            console.log('Configuration successfully updated and saved.');
          }
        });
      }

      // Merge again to include any updates made during checkAndUpdateConfig
      config = mergeWith({}, defaultConfig, storedConfig, customizer);

      resolve(config);
    });
  });
}

/**
 * Customizer function for lodash.mergeWith to handle array merging
 * Ensure stored arrays are preserved (including empty arrays) and completely replace default arrays
 */
function customizer(objValue, srcValue, key) {
  // Special handling for 'commandsAfterLogin' key to retain empty arrays
  if (key === 'commandsAfterLogin' && Array.isArray(srcValue)) {
    if (srcValue.length === 0) {
      //console.log(`Custom merge: Keeping the empty array for ${key}`);
      return srcValue; // Keep the empty array if it exists in the stored config
    }
  }

  // Replace default arrays with stored arrays (including empty arrays)
  if (Array.isArray(objValue) && Array.isArray(srcValue)) {
    //console.log(`Custom merge: Replacing array for ${key}`);
    return srcValue;
  }
}

/**
 * Initializes the application once Electron is ready.
 */
app.on('ready', () => {
  createSplashWindow();
  loadConfig()
    .then((config) => {
      if (isConfigValid(config)) {
        logger = winston.createLogger({
          level: isDebug ? 'debug' : 'info', // This sets the base level for the logger
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.printf(({ timestamp, level, message }) => {
              return `[${timestamp}] - ${level.toUpperCase()}: ${message}`;
            })
          ),
          transports: [
            new winston.transports.Console({
              level: 'info', // Only log 'info' and above to the console
            }),
            ...(isDebug ? [new winston.transports.File({ 
              filename: 'debug.log', 
              level: 'debug', 
              options: { flags: 'w' } // This ensures the file is overwritten on each start
            })] : [])
          ]
        });
        
        let safeConfig = redactSensitiveInfo(config);
        logger.debug(`Final Merged Configuration: ${JSON.stringify(safeConfig, null, 2)}`);

        setUtilLogger(logger);

        dxClusterClient = new DXClusterClient(config, logger);
        augmentedSpotCache = new AugmentedSpotCache(config.augmentedSpotCache.maxSize, logger, config);
        flexRadioClient = new FlexRadioClient(config, logger);
        // Assuming you have created mainWindow already
        wavelogClient = new WavelogClient(config, logger, mainWindow);

        // Initialize WSJT-X client if enabled in the config
        if (config.wsjt.enabled) {
          logger.info('WSJT-X integration is enabled.');
          wsjtClient = new WSJTClient(config, logger);
          wsjtClient.start();
          attachWSJTEventListeners(config);
        } else {
          logger.info('WSJT-X integration is disabled.');
        }

        createWindow();
        attachEventListeners();

        main(config); // Pass config to main function
      } else {
        console.error('Essential configuration is missing. Please configure the application.');

        dialog.showErrorBox('Configuration Error', 'Essential configuration is missing. Please configure the application.');
        app.quit();
      }
    })
    .catch((err) => {
      console.error(`Failed to load config: ${err.message}`);
      app.quit();
    });
});

/**
 * Checks if the essential configuration is valid.
 */
function isConfigValid(config) {
  if (!config.dxCluster || !config.dxCluster.callsign || !config.dxCluster.host || config.dxCluster.callsign.trim() === '') {
    return false;
  }
  if (!config.flexRadio || !config.flexRadio.host || !config.flexRadio.port || config.flexRadio.host.trim() === '') {
    return false;
  }
  if (!config.wavelogAPI || !config.wavelogAPI.URL || !config.wavelogAPI.apiKey || config.wavelogAPI.URL.trim() === '' || config.wavelogAPI.apiKey.trim() === '') {
    return false;
  }
  return true;
}

/**
 * Attaches event listeners for DXClusterClient and FlexRadioClient.
 */
function attachEventListeners() {
  dxClusterClient.on('close', () => {
    uiManager.updateDXClusterStatus('dxClusterDisconnected');
    isLoggedIn = false;
    commandsSent = false;
    reconnectToDXCluster();
  });

  dxClusterClient.on('timeout', () => {
    uiManager.updateDXClusterStatus('dxClusterDisconnected');
    reconnectToDXCluster();
  });

  dxClusterClient.on('error', (err) => {
    uiManager.updateDXClusterStatus('dxClusterError', err);
    reconnectToDXCluster();
  });

  dxClusterClient.on('loggedin', () => {
    logger.info('Logged in to DXCluster');
    isLoggedIn = true;
    sendCommandsAfterLogin();
    setTimeout(() => {
      uiManager.updateDXClusterStatus('dxClusterConnected');
    }, 2000);
  });

  dxClusterClient.on('spot', async function processSpot(spot) {
    try {
      logger.debug('Raw Spot Data:', spot);
      await augmentedSpotCache.processSpot(spot);
      logger.debug('Enriched Spot Data:', spot);
      await flexRadioClient.sendSpot(spot);
      uiManager.sendSpotUpdate(spot);
    } catch (e) {
      logger.error(`Error processing spot: ${e.message}`);
    }
  });

  flexRadioClient.on('connected', () => {
    logger.info('Connected to FlexRadio server');
    uiManager.updateFlexRadioStatus('flexRadioConnected');
  });

  flexRadioClient.on('disconnected', () => {
    logger.info('Disconnected from FlexRadio server');
    uiManager.updateFlexRadioStatus('flexRadioDisconnected');
  });

  flexRadioClient.on('error', (error) => {
    logger.error(`FlexRadio error: ${error.message}`);
    uiManager.updateFlexRadioStatus('flexRadioError', error);
  });
}

function bigIntReplacer(key, value) {
  return typeof value === 'bigint' ? value.toString() : value;
}

/**
 * Attaches event listeners for WSJTClient.
 */
let activeQSO = false;

function attachWSJTEventListeners(config) {
  wsjtClient.on('heartbeat', (message) => {
    logger.debug(`WSJT-X Heartbeat received: ${JSON.stringify(message, bigIntReplacer)}`);
  });

  wsjtClient.on('status', (message) => {
    const { dxCall, deCall, txEnabled } = message;
    logger.debug(`WSJT-X Status received: ${JSON.stringify(message, bigIntReplacer)}`);

    if (config.wsjt.showQSO) {
      if (dxCall && deCall && txEnabled && !activeQSO) {
        activeQSO = true;
        logger.info(`WSJT-X QSO started with ${dxCall}`);
        utils.openLogQSO(dxCall, config);
      } else if (!txEnabled && activeQSO) {
        activeQSO = false;
        logger.info(`QSO ended with ${dxCall}`);
      }
    }
  });

  wsjtClient.on('decode', (message) => {
    logger.debug(`WSJT-X Decode received: ${JSON.stringify(message, bigIntReplacer)}`);
  });

  wsjtClient.on('clear', (message) => {
    logger.debug('WSJT-X Clear message received');
  });

  wsjtClient.on('qso_logged', (message) => {
    if (config.wsjt.logQSO) {
      // Handle QSO logged message here if needed
      logger.debug(`QSO Logged with ${message.dxCall}`);
      // Do not attempt to access message.adifText here
    }
  });

  wsjtClient.on('logged_adif', (message) => {
    if (config.wsjt.logQSO) {
      const adifText = message.adifText;
  
      function extractField(adifText, field) {
        const regex = new RegExp(`<${field}:[^>]*>([^<]*)`, 'i');
        const match = adifText.match(regex);
        return match ? match[1].trim() : null;
      }
  
      const dxCallsign = extractField(adifText, 'call');
      const mode = extractField(adifText, 'mode');
      const reportSent = extractField(adifText, 'rst_sent');
      const reportReceived = extractField(adifText, 'rst_rcvd');
  
      // Log the QSO details
      logger.info(`Request from WSJT-X to log QSO with ${dxCallsign} using mode ${mode}. Sent: ${reportSent}, Received: ${reportReceived}`);
      logger.debug(adifText);
  
      wavelogClient.sendAdifToWavelog(adifText)
        .then(() => {
          logger.debug(`Successfully processed QSO with ${dxCallsign}. Sent: ${reportSent}, Received: ${reportReceived}`);
        })
        .catch((error) => {
          logger.error(`Error sending ADIF record: ${error.message}`);
        });
    }
  });
  

  wsjtClient.on('wspr_decode', (message) => {
    logger.debug('WSJT-X WSPR Decode message received');
  });
}

/**
 * Sends a series of commands after logging into the DXCluster.
 */
async function sendCommandsAfterLogin() {
  if (commandsSent) return;
  commandsSent = true;

  const commands = dxClusterClient.config.dxCluster.commandsAfterLogin;
  if (!commands || commands.length === 0) {
    logger.info('No commands to send after login.');
    return;
  }

  for (const command of commands) {
    try {
      logger.info(`Sending command: ${command}`);
      dxClusterClient.write(`${command}\n`);
      await new Promise((resolve) => {
        dxClusterClient.once('message', (data) => {
          logger.info(`Received response: ${data.trim()}`);
          resolve();
        });
      });
      await sleep(500);
    } catch (err) {
      logger.error(`Error sending command "${command}": ${err.message}`);
    }
  }
}

/**
 * Fire the first cache health update after 5 seconds, then every 5 minutes thereafter.
 */
setTimeout(() => {
  const healthStatus = augmentedSpotCache.getHealthStatus();
  uiManager.sendCacheHealthUpdate(healthStatus);

  // Set the interval to fire every 5 minutes after the first 5-second delay
  setInterval(() => {
    const healthStatus = augmentedSpotCache.getHealthStatus();
    uiManager.sendCacheHealthUpdate(healthStatus);
  }, 300000); // 5 minutes in milliseconds
}, 5000);

/**
 * Attempts to reconnect to the DXCluster after a delay.
 */
function reconnectToDXCluster() {
  logger.info('Attempting to reconnect to DXCluster...');
  logConnectionState('attempting', dxClusterClient.config.dxCluster);

  dxClusterClient
    .connect()
    .then(() => {
      logger.info('Successfully connected to DXCluster.');
      logConnectionState('connected', dxClusterClient.config.dxCluster);
    })
    .catch((err) => {
      logger.error('Failed to connect to DXCluster.');
      logConnectionState('failed', dxClusterClient.config.dxCluster, err);
      setTimeout(reconnectToDXCluster, 5000);
    });
}

/**
 * Logs the connection state to the logger and updates the UI.
 * @param {string} state - The current state of the connection.
 * @param {object} server - Server configuration details.
 * @param {Error} [error=null] - Optional error object if an error occurred.
 */
function logConnectionState(state, server = {}, error = null) {
  const serverInfo = `${server.host || 'unknown'}:${server.port || 'unknown'}`;

  if (error && error instanceof Error) {
    logger.error(`Error while connecting to ${serverInfo}: ${error.message}`);
  } else {
    logger.info(`Connection state: ${state} to ${serverInfo}`);
  }

  uiManager.sendStatusUpdate({
    event: 'connectionState',
    state,
    server: serverInfo,
    error: error ? error.message : null,
  });
}

/**
 * Gracefully shuts down the application by closing connections.
 */
async function shutdown() {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  try {
    if (logger) {
      logger.info('Received shutdown signal, closing connections...');
    } else {
      console.log('Received shutdown signal, closing connections...');
    }

    if (dxClusterClient) {
      dxClusterClient.close();
    }

    if (flexRadioClient) {
      await flexRadioClient.disconnect();
    }

    if (wsjtClient) {
      wsjtClient.stop();
    }

    if (mainWindow) {
      mainWindow.close();
    }

    if (splashWindow) {
      splashWindow.close();
    }

    if (logger) {
      logger.info('Shutdown complete.');
    } else {
      console.log('Shutdown complete.');
    }
  } catch (error) {
    if (logger) {
      logger.error(`Error during shutdown: ${error.message}`);
    } else {
      console.error(`Error during shutdown: ${error.message}`);
    }
  } finally {
    app.quit();
  }
}

app.on('before-quit', shutdown);

/**
 * Main function to start services.
 * @param {object} config - The configuration object.
 */
function main(config) {
  if (config.dxCluster.callsign === 'YOUR-CALLSIGN-HERE') {
    logger.warn('DXCluster connection attempt skipped due to default callsign "YOUR-CALLSIGN-HERE". Please configure a valid callsign.');
    dialog.showErrorBox('Configuration Error', 'Essential configuration is missing. Please configure the application.');
  } else {
    flexRadioClient.connect();
    dxClusterClient.connect();
    logger.info('All services started.');
  }
}

/**
 * Handles IPC request to get the current configuration.
 */
ipcMain.handle('get-config', async (event) => {
  return new Promise((resolve, reject) => {
    storage.get('config', (error, storedConfig) => {
      if (error) {
        if (logger) {
          logger.error(`Error retrieving configuration: ${error.message}`);
        } else {
          console.error(`Error retrieving configuration: ${error.message}`);
        }
        reject(error);
      } else {
        const mergedConfig = mergeWith({}, defaultConfig, storedConfig, customizer); 
        resolve(mergedConfig);
      }
    });
  });
});

/**
 * Handles IPC request to reset configuration to defaults.
 */
ipcMain.handle('reset-config-to-defaults', async (event) => {
  return new Promise((resolve, reject) => {
    storage.remove('config', (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
});

/**
 * Handles IPC request to update the configuration.
 * @param {object} event - The IPC event.
 * @param {object} newConfig - The new configuration object.
 * @returns {Promise<void>} - Resolves when the configuration is updated.
 */
ipcMain.handle('update-config', async (event, newConfig) => {
  const updatedConfig = mergeWith({}, defaultConfig, newConfig, customizer); 

  return new Promise((resolve, reject) => {
    storage.set('config', updatedConfig, (error) => {
      if (error) {
        if (logger) {
          logger.error(`Error saving configuration: ${error.message}`);
        } else {
          console.error(`Error saving configuration: ${error.message}`);
        }
        reject(error);
      } else {
        if (logger) {
          logger.info('Configuration updated successfully.');
        } else {
          console.log('Configuration updated successfully.');
        }
        resolve();
      }
    });
  });
});

/**
 * Handles IPC request to get the application version.
 */
ipcMain.handle('get-app-version', async (event) => {
  return app.getVersion();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  if (logger) {
    logger.error(`Uncaught Exception: ${error.message}`);
  } else {
    console.error(`Uncaught Exception: ${error.message}`);
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  if (logger) {
    logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
  } else {
    console.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
  }
});

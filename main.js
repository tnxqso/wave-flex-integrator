'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage, Notification } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const os = require('os');
const storage = require('electron-json-storage');
const DXClusterClient = require('./dx_cluster_client');
const FlexRadioClient = require('./flexradio_client');
const WSJTClient = require('./wsjt');
const WavelogClient = require('./wavelog_client');
const AugmentedSpotCache = require('./augmented_spot_cache');
const winston = require('winston');
const utils = require('./utils');
const { setUtilLogger } = require('./utils');
const UIManager = require('./ui_manager');
const mergeWith = require('lodash.mergewith');
const QRZClient = require('./qrz_client');
const MqttRotatorClient = require('./mqtt_client');
const HttpCatListener = require('./http_cat_listener');

let httpCatListener;
let mqttRotatorClient;
let qsoWindow = null; // Reference to the QSO Assistant window

let logger;
let mainWindow;
let splashWindow;
let dxClusterClient, flexRadioClient, augmentedSpotCache;
let wsjtClient;
let wavelogClient;
let uiManager;
let isShuttingDown = false;
let tray = null;
let isQuitting = false;
let appConfigured = false;
let stationId = null;
let stationProfileName = null;
let stationGridSquare = null;
let stationCallsign = null;
let config = null;
let qrzClient;

const isDebug = process.argv.includes('--debug');

function getDebugLogPath() {
  const localAppData =
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');

  return path.join(localAppData, 'wave-flex-integrator', 'logs', 'debug.log');
}

const debugLogPath = getDebugLogPath();

if (isDebug) {
  // Ensure the directory exists
  fs.mkdirSync(path.dirname(debugLogPath), { recursive: true });

  console.log(`Debug mode is enabled.`);
  console.log(`Debug log file (absolute): ${debugLogPath}`);
  console.log(`Process CWD: ${process.cwd()}`);
  console.log(`Executable: ${process.execPath}`);
} else {
  console.log('Running in normal mode');
}

// Initialize logger at the very beginning
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
    ...(isDebug
      ? [
          new winston.transports.File({
            filename: 'debug.log',
            level: 'debug',
            options: { flags: 'w' }, // This ensures the file is overwritten on each start
          }),
        ]
      : []),
  ],
});

function redactSensitiveInfo() {
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

/**
 * Customizer function for lodash.mergeWith to handle array merging
 * Ensure stored arrays are preserved (including empty arrays) and completely replace default arrays
 */
function customizer(objValue, srcValue, key) {
  // Check for the specific key 'commandsAfterLogin' and handle empty array case
  if (key === 'commandsAfterLogin' && Array.isArray(srcValue)) {
    if (srcValue.length === 0) {
      logger.debug(`Custom merge: Keeping the empty array for ${key}`);
      return srcValue; // Keep the empty array if it exists in the stored config
    }
  }

  if (Array.isArray(objValue) && Array.isArray(srcValue)) {
    logger.debug(`Custom merge: Replacing array for ${key}`);
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

function createTray() {
  const iconPath = path.join(__dirname, 'assets/icons/icon.png');
  const trayIcon = nativeImage.createFromPath(iconPath);
  
  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));
  tray.setToolTip('Wave-Flex Integrator');

  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Show Wave-Flex Integrator', 
      click: () => {
        if (mainWindow) mainWindow.show();
      } 
    },
    { type: 'separator' },
    { 
        label: 'Restart', 
        click: () => {
            app.relaunch();
            app.exit(0);
        } 
    },
    { 
      label: 'Quit', 
      click: () => {
        isQuitting = true;
        app.quit();
      } 
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
        if (mainWindow.isVisible()) {
            if (!config.application.minimizeToTray) {
                 mainWindow.focus();
            } else {
                 mainWindow.hide();
            }
        } else {
            mainWindow.show();
        }
    }
  });
}

/**
 * Configures the application to launch at login based on settings.
 * Handles both Development (npm start) and Production (installed .exe) paths.
 */
function updateLoginSettings() {
  const isEnabled = config.application?.startAtLogin || false;
  
  if (!app.isPackaged) {
    // DEVELOPMENT MODE
    // In dev, process.execPath is the electron binary.
    // We must pass the project path as an argument so it knows what to run.
    app.setLoginItemSettings({
      openAtLogin: isEnabled,
      path: process.execPath, 
      args: [path.resolve(__dirname)] // Points electron.exe to the current folder
    });
  } else {
    // PRODUCTION MODE
    // In prod, process.execPath is the actual WaveFlexIntegrator.exe.
    // No arguments needed.
    app.setLoginItemSettings({
      openAtLogin: isEnabled,
      path: process.execPath,
      args: [] 
    });
  }
  
  logger.info(`Updated Login Item Settings: openAtLogin=${isEnabled}, isPackaged=${app.isPackaged}`);
}

/**
 * Creates the main application window.
 */
function createWindow() {
  // Safely retrieve window configuration
  const appConfig = config.application || {};
  const winConfig = appConfig.window || {};

  logger.info(`Restoring window at: x=${winConfig.x}, y=${winConfig.y}, w=${winConfig.width}, h=${winConfig.height}`);

  const shouldShow = !appConfig.startMinimized;

  mainWindow = new BrowserWindow({
    width: winConfig.width || 900,
    height: winConfig.height || 800,
    x: Number.isInteger(winConfig.x) ? winConfig.x : undefined,
    y: Number.isInteger(winConfig.y) ? winConfig.y : undefined,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets/icons/icon.png') 
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.removeMenu();

  // --- ROBUST WINDOW STATE SAVING ---
  let saveTimeout;

  const saveWindowState = () => {
    if (!mainWindow) return;
    
    // Get current position and size
    const bounds = mainWindow.getBounds();

    // Update config object in memory
    if (!config.application) config.application = {};
    config.application.window = bounds;

    // Save to disk (debounced - wait 1 second after last movement)
    // This prevents writing to disk continuously while dragging the window
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      storage.set('config', config, (error) => {
        if (error) {
          logger.error(`Failed to save window state: ${error.message}`);
        } else {
          // logger.debug('Window state saved to disk.'); 
        }
      });
    }, 1000);
  };

  // Listen for both move and resize events
  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);

  // Handle the "X"-click
  mainWindow.on('close', (event) => {
    if (!isQuitting && config.application.minimizeToTray) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  // Auto-close QSO Assistant ---
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (qsoWindow && !qsoWindow.isDestroyed()) {
      qsoWindow.close();
    }
  });

  // Create tray if it does not exist
  if (!tray) {
      createTray();
  }

  // Handle Splash and Show
  mainWindow.once('ready-to-show', () => {
    if (shouldShow) {
        setTimeout(() => {
          if (splashWindow) splashWindow.close();
          mainWindow.show();
        }, 3500);
    } else {
        // If we start minimized, just close splash immediately
        if (splashWindow) splashWindow.close();
    }
  });

  uiManager = new UIManager(mainWindow, logger);

  // --- Updater Logic ---

  // Check for updates immediately on startup
  autoUpdater.checkForUpdatesAndNotify();

  // Poll for updates every 4 hours (4 * 60 * 60 * 1000 ms)
  setInterval(() => {
    logger.info('Performing periodic update check...');
    autoUpdater.checkForUpdatesAndNotify();
  }, 14400000);

  // Handle auto-update events
  autoUpdater.on('update-available', () => {
    if (mainWindow) {
      mainWindow.webContents.send('update_available');
    }
    logger.info('A new update is available.');
  });

  autoUpdater.on('update-downloaded', () => {
    logger.info('Update downloaded. Ready to install.');

    if (mainWindow && mainWindow.isVisible()) {
      // If the window is visible, show the in-app toast notification
      mainWindow.webContents.send('update_downloaded');
    } else {
      // If the window is hidden (in tray), show a system notification
      const notification = new Notification({
        title: 'Wave-Flex Integrator Update',
        body: 'A new version has been downloaded. Click to restart and install.',
        icon: path.join(__dirname, 'assets/icons/icon.png')
      });

      notification.show();

      // If user clicks the system notification, install immediately
      notification.on('click', () => {
        autoUpdater.quitAndInstall();
      });
    }
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
  splashWindow.loadFile(path.join(__dirname, 'splash.html'), {
    query: { version: appVersion },
  });
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
        console.log(
          'No stored configuration found, using default configuration.'
        );
        storedConfig = {};
      } else {
        console.log('Loaded configuration from storage.');
      }

      // Merge storedConfig with defaultConfig using mergeWith and customizer
      config = mergeWith({}, defaultConfig, storedConfig, customizer);

      // Check for missing keys in storedConfig and update if necessary
      let configUpdated = false;

      function checkAndUpdateConfig(defaultObj, storedObj) {
        for (const key in defaultObj) {
          if (!(key in storedObj)) {
            console.log(
              `Missing key in stored configuration: ${key}. Adding default value.`
            );
            storedObj[key] = defaultObj[key];
            configUpdated = true;
          } else if (
            Array.isArray(defaultObj[key]) &&
            Array.isArray(storedObj[key])
          ) {
            // Do nothing; accept stored array as is
            // If the stored array is intentionally shorter, we respect that
          } else if (
            typeof defaultObj[key] === 'object' &&
            defaultObj[key] !== null
          ) {
            if (typeof storedObj[key] !== 'object' || storedObj[key] === null) {
              console.log(
                `Mismatched type for key ${key}. Overwriting with default value.`
              );
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
 * Fetches station information from Wavelog.
 * @param {boolean} suppressErrors - Whether to suppress error dialogs.
 */
async function fetchStationDetails(suppressErrors = false) {
  try {
    if (!stationId || !stationProfileName || !stationGridSquare || !stationCallsign) {
      // Fetch all station details in one call
      const activeStation = await wavelogClient.getActiveStation(suppressErrors);

      if (activeStation) {
        stationId = activeStation.station_id;
        stationProfileName = activeStation.station_profile_name;
        stationGridSquare = activeStation.station_gridsquare;
        stationCallsign = activeStation.station_callsign;
      } else {
        logger.warn('Could not retrieve station information from Wavelog.');
      }
    }
  } catch (error) {
    logger.error(`Error fetching station information from Wavelog: ${error.message}`);
    wavelogClient.emit('stationFetchError', error); // Trigger error event
    if (!suppressErrors) {
      dialog.showErrorBox('Error', 'Error fetching station details. Please check the configuration.');
    }
  }
}

/**
 * Initializes the application once Electron is ready.
 */
app.on('ready', () => {
  createSplashWindow();

  loadConfig()
    .then(async (config) => {
      if (isConfigValid()) {
        let safeConfig = redactSensitiveInfo();
        logger.debug(
          `Final Merged Configuration: ${JSON.stringify(safeConfig, null, 2)}`
        );

        if (config.dxCluster.callsign === 'YOUR-CALLSIGN-HERE') {
          logger.warn(
            'First start of application, configuration has not been done yet.'
          );
          appConfigured = false;
        } else {
          appConfigured = true;
        }

        setUtilLogger(logger);

        // Apply startup settings (Start with Windows/Mac)
        updateLoginSettings();

        createWindow(); // Create the main window, but don't show it yet

        // Create clients (except flexRadioClient)
        wavelogClient = new WavelogClient(config, logger, mainWindow);
        dxClusterClient = new DXClusterClient(config, logger);
        qrzClient = new QRZClient(config, logger);
        // Init Rotator Client
        mqttRotatorClient = new MqttRotatorClient(config, logger);
        if (config.rotator && config.rotator.enabled) {
            mqttRotatorClient.connect();
        }
        augmentedSpotCache = new AugmentedSpotCache(config.augmentedSpotCache.maxSize, logger, config);

        setTimeout(() => {
          if (augmentedSpotCache) {
             const healthStatus = augmentedSpotCache.getHealthStatus();
             uiManager.sendCacheHealthUpdate(healthStatus);

             setInterval(() => {
               const healthStatus = augmentedSpotCache.getHealthStatus();
               uiManager.sendCacheHealthUpdate(healthStatus);
             }, 300000);
          }
        }, 5000);

        // Initialize WSJT-X client if enabled
        if (config.wsjt.enabled) {
          logger.info('WSJT-X integration is enabled.');
          wsjtClient = new WSJTClient(config, logger);
          wsjtClient.start();
        } else {
          logger.info('WSJT-X integration is disabled.');
        }

        // Attach event listeners for all clients, except flexRadioClient
        attachEventListeners();

        // Fetch station information from Wavelog (stationFetched will be emitted)
        if (appConfigured) {
          await fetchStationDetails(true); // Suppress errors during startup
        }

        // Now that we have stationCallsign, create the flexRadioClient
        if (stationCallsign) {
          flexRadioClient = new FlexRadioClient(config, logger, stationCallsign);

          // Attach flexRadioClient-specific event listeners here
          attachFlexRadioEventListeners();

          // Initialize HTTP CAT Listener
          httpCatListener = new HttpCatListener(config, logger);
          
          // Define what happens when a request comes in
          httpCatListener.onQsy((freq, mode) => {
            if (flexRadioClient) {
                flexRadioClient.setSliceFrequency(freq, mode);
            }
          });

          // Start the listener
          httpCatListener.start();

        } else {
          logger.warn('No station callsign found; FlexRadio client will not be initialized.');
        }

        main(); // Now start the main logic

        // Schedule the WSJT status update and Wavelog status update after n seconds
        setTimeout(async () => {
          // We can not do this since the main window shows
          // earlier attempts may have failed
          if (config.wsjt.enabled) {
            uiManager.updateWSJTStatus('WSJTEnabled');
          } else {
            uiManager.updateWSJTStatus('WSJTDisabled');
          }

          if (stationCallsign) {
            uiManager.updateWavelogStatus('WavelogResponsive', await (wavelogClient.getStationProfileName()));
          }
        }, 2000);


      }
    })
    .catch((err) => {
      console.error(`Failed to load config: ${err.message}`);
    });
});

/**
 * Checks if the essential configuration is valid.
 */
function isConfigValid() {
  if (
    !config.dxCluster ||
    !config.dxCluster.callsign ||
    !config.dxCluster.host ||
    config.dxCluster.callsign.trim() === ''
  ) {
    return false;
  }
  if (
    !config.flexRadio ||
    !config.flexRadio.host ||
    !config.flexRadio.port ||
    config.flexRadio.host.trim() === ''
  ) {
    return false;
  }
  if (
    !config.wavelogAPI ||
    !config.wavelogAPI.URL ||
    !config.wavelogAPI.apiKey ||
    !config.wavelogAPI.radioName ||
    config.wavelogAPI.URL.trim() === '' ||
    config.wavelogAPI.apiKey.trim() === '' ||
    config.wavelogAPI.radioName.trim() === ''
  ) {
    return false;
  }
  return true;
}

function bigIntReplacer(key, value) {
  return typeof value === 'bigint' ? value.toString() : value;
}

/**
 * Attaches event listeners for WSJTClient.
 */
let activeQSO = false;

/**
 * Attaches event listeners for DXClusterClient and FlexRadioClient.
 */
function attachEventListeners() {
  dxClusterClient.on('close', () => {
    uiManager.updateDXClusterStatus('dxClusterDisconnected');
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


  dxClusterClient.on('loggedin', async () => {
    logger.info('Logged in to DXCluster');

    try {
      await dxClusterClient.sendCommandsAfterLogin();
    } catch (err) {
      logger.error(`Error sending commands after login: ${err.message}`);
    }

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

  // Wavelog API listener
  wavelogClient.on('stationFetched', async () => {
    try {
      uiManager.updateWavelogStatus('WavelogResponsive', await (wavelogClient.getStationProfileName()));
    } catch (err) {
      logger.error(`Error updating Wavelog status: ${err.message}`);
      uiManager.updateWavelogStatus('WavelogUnresponsive');
    }
  });

  wavelogClient.on('stationFetchError', (error) => {
    uiManager.updateWavelogStatus('WavelogUnresponsive', error);
  });

  if (config.wsjt.enabled) {
    // WSJT-X listener
    wsjtClient.on('status', (message) => {
      const { enabled } = message;
      if (enabled) {
        logger.info('WSJT-X is enabled');
        uiManager.updateWSJTStatus('WSJTEnabled');
      }
    });

    wsjtClient.on('error', (error) => {
      logger.error(`WSJT-X error: ${error.message}`);
      uiManager.updateWSJTStatus('WSJTError', error);
    });

    wsjtClient.on('heartbeat', (message) => {
      logger.debug(
        `WSJT-X Heartbeat received: ${JSON.stringify(message, bigIntReplacer)}`
      );
    });

    wsjtClient.on('status', (message) => {
      const { dxCall, deCall, txEnabled } = message;
      logger.debug(
        `WSJT-X Status received: ${JSON.stringify(message, bigIntReplacer)}`
      );

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
      logger.debug(
        `WSJT-X Decode received: ${JSON.stringify(message, bigIntReplacer)}`
      );
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
        logger.info(
          `Request from WSJT-X to log QSO with ${dxCallsign} using mode ${mode}. Sent: ${reportSent}, Received: ${reportReceived}`
        );
        logger.debug(adifText);

        wavelogClient
          .sendAdifToWavelog(adifText)
          .then(() => {
            logger.debug(
              `Successfully processed QSO with ${dxCallsign}. Sent: ${reportSent}, Received: ${reportReceived}`
            );
          })
          .catch((error) => {
            logger.error(`Error sending ADIF record: ${error.message}`);
          });
      }
    });

    wsjtClient.on('wspr_decode', (message) => {
      logger.debug('WSJT-X WSPR Decode message received');
    });
  } else {
    uiManager.updateWSJTStatus('WSJTDisabled');
  }
}

// Attach event listeners specific to flexRadioClient
function attachFlexRadioEventListeners() {
  if (flexRadioClient) {
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

    flexRadioClient.on('globalProfilesList', (profiles) => {
      if (mainWindow) {
        mainWindow.webContents.send('flex-global-profiles', profiles);
      }
    });
    flexRadioClient.on('externalSpotTriggered', (callsign) => {
        if (qsoWindow && !qsoWindow.isDestroyed()) {
             qsoWindow.webContents.send('external-lookup', callsign);
             qsoWindow.show(); // Bring window to front if hidden
        }
    });    
  }
}

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

    if (httpCatListener) {
        httpCatListener.stop();
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

app.on('before-quit', () => {
  isQuitting = true;
  shutdown();
});

/**
 * Main function to start services.
 */
function main() {
  if (appConfigured) {
    // Now check for missing station values
    const missingValues = [];
    if (!stationId) missingValues.push('Station ID');
    if (!stationProfileName) missingValues.push('Station Profile Name');
    if (!stationGridSquare) missingValues.push('Station Grid Square');
    if (!stationCallsign) missingValues.push('Station Callsign');

    if (missingValues.length > 0) {
      const message = `Some station configuration values normally retrieved from Wavelog are missing: ${missingValues.join(', ')}. Please verify the Station Setup in Wavelog.`;
      logger.warn(message);
      dialog.showErrorBox('Station Configuration Error', message);
    } else {
      // If everything is configured, start the services
      flexRadioClient.connect();
      dxClusterClient.connect();

      // Auto-open QSO Assistant?
      if (config.application?.autoOpenQSO) {
          createQSOWindow();
      }      

      logger.info('All services started successfully.');
    }
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
        const mergedConfig = mergeWith(
          {},
          defaultConfig,
          storedConfig,
          customizer
        );
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

        // --- Update global config in memory immediately ---
        config = updatedConfig;
        
        // Apply auto-start setting immediately
        updateLoginSettings(); 

        // --- Propagate config to clients that need live updates ---
        if (qrzClient) {
            qrzClient.config = config;
        }
        if (mqttRotatorClient) {
            mqttRotatorClient.setConfig(config);
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

/**
 * Handles IPC request to get Station Location details.
 */
ipcMain.handle('get-station-details', async (event) => {
  if (appConfigured) {
    try {
      // Check if the station variables are already fetched

      await fetchStationDetails(true); // Suppress errors

      // If we have the station details, format and return them
      if (stationId && stationProfileName && stationGridSquare && stationCallsign) {
        const stationDetails = `
          Station ID: ${stationId}, 
          Station Name: ${stationProfileName}, 
          Station Grid Square: ${stationGridSquare}, 
          Station Callsign: ${stationCallsign}
        `;
        return stationDetails.trim(); // Return the formatted string
      } else {
        // Identify which values are missing
        const missingValues = [];
        if (!stationId) missingValues.push('Station ID');
        if (!stationProfileName) missingValues.push('Station Name');
        if (!stationGridSquare) missingValues.push('Station Grid Square');
        if (!stationCallsign) missingValues.push('Station Callsign');

        const errorMessage = `Missing data: ${missingValues.join(', ')}`;
        logger.warn(errorMessage);
        return errorMessage; // Return a message indicating missing values
      }
    } catch (error) {
      logger.error(`Error in get-station-details handler: ${error.message}`);
      return 'Error fetching station details. Please check the configuration.';
    }
  }
});

ipcMain.handle('fetch-global-profiles', async () => {
  if (flexRadioClient && flexRadioClient.isConnected()) {
    flexRadioClient.getGlobalProfiles();
    return { success: true };
  }
  return { success: false, error: 'Not connected' };
});

ipcMain.handle('load-global-profile', async (event, profileName) => {
  if (flexRadioClient && flexRadioClient.isConnected()) {
    flexRadioClient.loadGlobalProfile(profileName);
    return { success: true };
  }
  return { success: false, error: 'Not connected' };
});

/**
 * Handles IPC request to quit and install the update.
 */
ipcMain.handle('install-update', async () => {
  logger.info('User requested install. Quitting and installing...');
  autoUpdater.quitAndInstall();
});

// --- QSO Assistant IPC Handlers ---

ipcMain.handle('open-qso-assistant', () => {
  createQSOWindow();
});

ipcMain.handle('lookup-callsign', async (event, callsign) => {
  logger.info(`Performing lookup for: ${callsign}`);
  
  // Check radio status
  const isRadioConnected = flexRadioClient && flexRadioClient.isConnected();

  // 1. Start requests in parallel
  // Use '20m'/'SSB' as fallback, but ideally grab from Flex if connected
  const wavelogPromise = wavelogClient.lookupCallsign(callsign, '20m', 'SSB');
  
  let qrzPromise = Promise.resolve(null);
  if (config.qrz && config.qrz.enabled) {
      qrzPromise = qrzClient.lookup(callsign);
  }

  // 2. Wait for results
  const [wlData, qrzData] = await Promise.all([wavelogPromise, qrzPromise]);

  // 3. Merge Data
  let finalData = wlData || (qrzData ? { callsign: qrzData.callsign } : null);

  if (!finalData) {
      logger.warn(`Lookup failed for ${callsign} in both Wavelog and QRZ.`);
      return null;
  }

  // Inject Radio Status into response
  finalData.radio_connected = isRadioConnected;

  let dxLat = null;
  let dxLon = null;
  let precision = 'none';

  // --- Hybrid Strategy: QRZ overrides Geography ---
  // --- Hybrid Strategy: QRZ overrides Geography ---
  if (qrzData) {
      logger.info(`QRZ Data found: ${qrzData.name}, Grid: ${qrzData.grid}`);
      
      if (qrzData.name) finalData.name = qrzData.name;
      if (qrzData.grid) finalData.gridsquare = qrzData.grid;
      if (qrzData.image) finalData.image = qrzData.image;
      
      // Only overwrite if QRZ provides a valid string, otherwise keep Wavelog's value
      if (qrzData.country && qrzData.country.trim() !== '') {
          finalData.dxcc = qrzData.country; 
      } 
      
      if (qrzData.lat && qrzData.lon) {
          dxLat = parseFloat(qrzData.lat);
          dxLon = parseFloat(qrzData.lon);
          precision = 'exact (QRZ)';
      }
  }

  // Fallback to Wavelog coords
  if (dxLat === null) {
      if (finalData.latlng && Array.isArray(finalData.latlng) && finalData.latlng.length === 2) {
          dxLat = parseFloat(finalData.latlng[0]);
          dxLon = parseFloat(finalData.latlng[1]);
          precision = 'exact (Wavelog)';
      } else if (finalData.dxcc_lat) {
          dxLat = parseFloat(finalData.dxcc_lat);
          dxLon = parseFloat(finalData.dxcc_long);
          precision = 'country';
      }
  }

  // 4. Calculate Bearing
  if (dxLat !== null && dxLon !== null && !isNaN(dxLat) && !isNaN(dxLon)) {
      try {
          const myGrid = await wavelogClient.getStationGridsquare();
          if (myGrid) {
              const myCoords = wavelogClient.gridToLatLon(myGrid);
              if (myCoords) {
                  const result = wavelogClient.calculateBearingDistance(
                      myCoords.lat, myCoords.lon, dxLat, dxLon
                  );
                  
                  finalData.bearing = result.bearing;
                  finalData.distance = result.distance;

                  finalData.bearing_lp = (result.bearing + 180) % 360;
                  finalData.distance_lp = Math.round(40075 - result.distance); // Earth circumference - SP
                  
                  finalData.calc_precision = precision;
                  logger.info(`Calculated: ${result.bearing} deg, ${result.distance} km (${precision})`);
              }
          }
      } catch (err) {
          logger.error(`Error calculating bearing: ${err.message}`);
      }
  }
  
  return finalData;
});

// --- Media IPC Handlers for QSO Assistant ---

/**
 * Opens an external URL in the default system browser.
 */
ipcMain.handle('open-external-link', async (event, url) => {
  if (url) {
    await shell.openExternal(url);
  }
});

/**
 * Opens a modal window to display the profile image in full size.
 */
ipcMain.handle('open-image-window', (event, imageUrl) => {
  if (!imageUrl) return;

  const imgWin = new BrowserWindow({
    width: 800,
    height: 800,
    title: 'Profile Image',
    icon: path.join(__dirname, 'assets/icon.png'), // Optional, if you have an icon
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  imgWin.setMenu(null); // Remove menu bar completely
  imgWin.loadURL(imageUrl);
});

ipcMain.handle('rotate-rotor', (event, bearing) => {
  logger.info(`ROTATOR CONTROL: Request to rotate to ${bearing} deg`);
  
  if (mqttRotatorClient) {
      mqttRotatorClient.rotate(bearing);
  } else {
      logger.warn("Rotator client not initialized or disabled.");
  }
});

ipcMain.handle('log-qso', (event, callsign) => {
  utils.openLogQSO(callsign, config);
});

ipcMain.handle('send-dx-spot', async (event, { callsign, comment }) => {
    if (!flexRadioClient || !flexRadioClient.isConnected()) return { success: false, error: "Radio not connected" };
    if (!flexRadioClient.activeTXSlices || flexRadioClient.activeTXSlices.length === 0) return { success: false, error: "No Active TX Slice" };

    try {
        // Get freq in Hz, convert to kHz (e.g. 14020.5)
        const freqHz = flexRadioClient.activeTXSlices[0].frequency * 1e6; 
        const freqKHz = (freqHz / 1000).toFixed(1);

        dxClusterClient.sendDxSpot(freqKHz, callsign, comment);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
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

/**
 * Creates or Focuses the QSO Assistant Window.
 */
function createQSOWindow() {
  if (qsoWindow) {
    qsoWindow.focus();
    return;
  }

  const qsoConfig = config.application?.qsoWindow || {};

  qsoWindow = new BrowserWindow({
    width: qsoConfig.width || 400,
    height: qsoConfig.height || 500,
    x: qsoConfig.x,
    y: qsoConfig.y,
    show: false,
    frame: true, // Keep frame for moving
    autoHideMenuBar: true,
    alwaysOnTop: false, // User choice later
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  qsoWindow.loadFile(path.join(__dirname, 'qso_assistant.html'));
  qsoWindow.removeMenu();

  qsoWindow.once('ready-to-show', () => {
    qsoWindow.show();
  });

  // Save state on close
  let saveTimeout;
  const saveState = () => {
    if (!qsoWindow) return;
    const bounds = qsoWindow.getBounds();
    if (!config.application) config.application = {};
    config.application.qsoWindow = bounds;
    
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        storage.set('config', config, (err) => {
            if(err) logger.error("Failed to save QSO window state");
        });
    }, 1000);
  };

  qsoWindow.on('resize', saveState);
  qsoWindow.on('move', saveState);

  qsoWindow.on('closed', () => {
    qsoWindow = null;
  });
}
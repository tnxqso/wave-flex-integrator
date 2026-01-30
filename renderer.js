// renderer.js
'use strict';

const { ipcRenderer } = require('electron');
const { shell } = require('electron');

/**
 * Scrolls the window to the top of the page.
 */
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Applies the selected theme to the application using Bootstrap's data-bs-theme attribute.
 * @param {string} theme - 'light', 'dark', or 'system'
 */
function applyTheme(theme) {
  if (theme === 'system') {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.setAttribute('data-bs-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-bs-theme', 'light');
    }
  } else {
    document.documentElement.setAttribute('data-bs-theme', theme);
  }
}

/**
 * Converts a flag emoji to its 2-letter uppercase country code.
 * @param {string} emoji - The flag emoji (e.g., "🇺🇸").
 * @returns {string} - The 2-letter country code (e.g., "US") or an empty string if invalid.
 */
function getCountryCodeFromEmoji(emoji) {
  if (!emoji || emoji.length !== 4) return ''; // Flag emojis are 4 bytes (2 surrogate pairs).

  // Get the two regional indicator symbols.
  const codePoints = Array.from(emoji).map(char => char.codePointAt(0));

  // Regional indicator symbols start from 0x1F1E6, which corresponds to 'A'
  const A = 0x1F1E6;

  // Convert the regional indicator symbols to letters (e.g., 🇺🇸 -> US)
  const countryCode =
    String.fromCharCode(codePoints[0] - A + 65) +
    String.fromCharCode(codePoints[1] - A + 65);

  // Ensure the country code is a valid uppercase two-letter code
  return /^[A-Z]{2}$/.test(countryCode) ? countryCode : '';
}

/**
 * Displays an alert message to the user.
 * @param {string} message - The message to display.
 * @param {string} type - The type of alert ('success', 'danger', 'warning', 'info').
 */
function showAlert(message, type = 'success') {
  const alertContainer = document.getElementById('alertContainer');
  if (alertContainer) {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show`;
    alert.role = 'alert';
    alert.innerHTML = `
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    alertContainer.appendChild(alert);

    // Scroll to top to see the alert
    scrollToTop();
  }
}

/**
 * Helper function to set status text and apply Bootstrap classes.
 * @param {HTMLElement} element - The DOM element to update.
 * @param {string} message - The status message to display.
 */
function setStatusElement(element, message) {
  if (!element) return;

  // Reset classes
  element.classList.remove('text-success', 'text-danger', 'text-warning');

  if (message === 'Connected' || message === 'Healthy' || message === 'Responsive' || message === 'Enabled') {
    element.textContent = message;
    element.classList.add('text-success'); // Green
  } else if (message === 'Disconnected' || message === 'Unhealthy' || message === 'Inresponsive') {
    element.textContent = message;
    element.classList.add('text-danger'); // Red
  } else if (message === 'Disabled' || message === 'Unitialized') {
    element.textContent = message;
    element.style.color = '#d3d3d3'; // Light gray color using inline styles
  } else if (message === 'Building') {
    element.textContent = message;
    element.classList.add('text-warning'); // Orange
  } else if (message.startsWith('Error')) {
    element.textContent = message;
    element.classList.add('text-danger'); // Red
  } else {
    // Default styling for other messages
    element.textContent = message;
  }
}

/**
 * Function to populate form with config values
 */
function populateForm(config) {
  // Early validation for the config object
  if (!config) {
    showAlert('Configuration data is missing.', 'danger');
    return;
  }

  // --- Populate Application General Settings ---
  // IMPORTANT: Must be defined before using it for Tray settings
  const appConfig = config.application || {};

// Tray & Startup Settings
  const startLoginCheck = document.getElementById('appStartAtLogin'); // <-- NY
  if (startLoginCheck) startLoginCheck.checked = appConfig.startAtLogin || false;

  const minTrayCheck = document.getElementById('appMinimizeToTray');
  if (minTrayCheck) minTrayCheck.checked = appConfig.minimizeToTray || false;

  const startMinCheck = document.getElementById('appStartMinimized');
  if (startMinCheck) startMinCheck.checked = appConfig.startMinimized || false;

  // Populate CAT Listener Settings
  const catConfig = config.catListener || { enabled: false, host: '127.0.0.1', port: 54321 };
  
  const catEnabled = document.getElementById('catListenerEnabled');
  if(catEnabled) catEnabled.checked = catConfig.enabled;

  const catHost = document.getElementById('catListenerHost');
  if(catHost) catHost.value = catConfig.host;

  const catPort = document.getElementById('catListenerPort');
  if(catPort) catPort.value = catConfig.port;

  // Populate Wavelog Live Listener Settings
  const wlLiveConfig = config.wavelogLive || { enabled: true, port: 54322 };
  
  const wlLiveEnabled = document.getElementById('wavelogLiveEnabled');
  if(wlLiveEnabled) wlLiveEnabled.checked = wlLiveConfig.enabled;

  const wlLivePort = document.getElementById('wavelogLivePort');
  if(wlLivePort) wlLivePort.value = wlLiveConfig.port;

  // Theme
  const theme = appConfig.theme || 'system';
  const themeSelect = document.getElementById('appTheme');
  if (themeSelect) {
    themeSelect.value = theme;
    applyTheme(theme); // Apply immediately on load
  }

  // Startup Tab
  const startupTab = appConfig.startupTab || 'status';
  const startupTabSelect = document.getElementById('appStartupTab');
  if (startupTabSelect) {
    startupTabSelect.value = startupTab;
  }

  // Apply Startup Tab Logic (Switch to the configured tab)
  if (startupTab && startupTab !== 'status') {
      const tabElement = document.querySelector(`#${startupTab}-tab`);
      if (tabElement && typeof bootstrap !== 'undefined') {
          const tabInstance = new bootstrap.Tab(tabElement);
          tabInstance.show();
      }
  }

  // QSO Settings
  const showMediaCheckbox = document.getElementById('appShowQsoMedia');
  if (showMediaCheckbox) showMediaCheckbox.checked = appConfig.showQsoMedia || false;
  
  const autoLogCheckbox = document.getElementById('appAutoLogQso');
  if (autoLogCheckbox) autoLogCheckbox.checked = appConfig.autoLogQso || false;
    
  // Compact Mode
  const compactModeCheckbox = document.getElementById('appCompactMode');
  if (compactModeCheckbox) {
    compactModeCheckbox.checked = appConfig.compactMode || false;
    applyCompactMode(appConfig.compactMode);
  }

  // Auto Open QSO Assistant
  const autoOpenQSOCheckbox = document.getElementById('appAutoOpenQSO');
  if (autoOpenQSOCheckbox) {
    autoOpenQSOCheckbox.checked = appConfig.autoOpenQSO || false;
  }

  // Imperial Units
  const useImperialCheckbox = document.getElementById('appUseImperial');
  if (useImperialCheckbox) {
    useImperialCheckbox.checked = appConfig.useImperial || false;
  }

 // Main Window Size
  const winWidth = document.getElementById('appWindowWidth');
  if (winWidth) winWidth.value = appConfig.window?.width || 900;
  const winHeight = document.getElementById('appWindowHeight');
  if (winHeight) winHeight.value = appConfig.window?.height || 800;

  // QSO Assistant Size
  const qsoConfig = appConfig.qsoWindow || {};
  const qsoWidth = document.getElementById('qsoWindowWidth');
  if (qsoWidth) qsoWidth.value = qsoConfig.width || 600;
  const qsoHeight = document.getElementById('qsoWindowHeight');
  if (qsoHeight) qsoHeight.value = qsoConfig.height || 500;

  // --- Populate Rotator Settings ---
  const rotConfig = config.rotator || { enabled: false, mqtt: {} };
  const mqttConfig = rotConfig.mqtt || {};

  const rotatorEnabledCheckbox = document.getElementById('rotatorEnabled');
  if (rotatorEnabledCheckbox) rotatorEnabledCheckbox.checked = rotConfig.enabled;

  document.getElementById('rotMqttHost').value = mqttConfig.host || '';
  document.getElementById('rotMqttPort').value = mqttConfig.port || 1883;
  document.getElementById('rotMqttUser').value = mqttConfig.username || '';
  document.getElementById('rotMqttPass').value = mqttConfig.password || '';
  document.getElementById('rotMqttTopic').value = mqttConfig.topicPrefix || '';

  // --- Populate QRZ Settings ---
  const qrzConfig = config.qrz || { enabled: false, username: '', password: '' };
  
  const qrzEnabledCheckbox = document.getElementById('qrzEnabled');
  if (qrzEnabledCheckbox) qrzEnabledCheckbox.checked = qrzConfig.enabled;

  const qrzUsernameInput = document.getElementById('qrzUsername');
  if (qrzUsernameInput) qrzUsernameInput.value = qrzConfig.username;

  const qrzPasswordInput = document.getElementById('qrzPassword');
  if (qrzPasswordInput) qrzPasswordInput.value = qrzConfig.password;
  
  // --- Populate Augmented Spot Cache ---
  const augmentedSpotCacheMaxSizeInput = document.getElementById('augmentedSpotCacheMaxSize');
  if (augmentedSpotCacheMaxSizeInput) {
    augmentedSpotCacheMaxSizeInput.value = config.augmentedSpotCache.maxSize;
  }

  // Populate DX Cluster Configuration
  const dxClusterHostInput = document.getElementById('dxClusterHost');
  if (dxClusterHostInput) {
    dxClusterHostInput.value = config.dxCluster.host;
  }

  const dxClusterPortInput = document.getElementById('dxClusterPort');
  if (dxClusterPortInput) {
    dxClusterPortInput.value = config.dxCluster.port;
  }

  const dxClusterCallsignInput = document.getElementById('dxClusterCallsign');
  if (dxClusterCallsignInput) {
    dxClusterCallsignInput.value = config.dxCluster.callsign;
  }

  const dxClusterLoginPromptInput = document.getElementById('dxClusterLoginPrompt');
  if (dxClusterLoginPromptInput) {
    dxClusterLoginPromptInput.value = config.dxCluster.loginPrompt;
  }

  // Populate Commands After Login
  const dxClusterCommandsAfterLoginInput = document.getElementById('dxClusterCommandsAfterLogin');
  if (dxClusterCommandsAfterLoginInput) {
    dxClusterCommandsAfterLoginInput.value = config.dxCluster.commandsAfterLogin.join(', ');
  }

  // Populate Reconnect Settings
  const dxClusterInitialDelayInput = document.getElementById('dxClusterReconnectInitialDelay');
  if (dxClusterInitialDelayInput) {
    dxClusterInitialDelayInput.value = config.dxCluster.reconnect.initialDelay;
  }

  const dxClusterMaxDelayInput = document.getElementById('dxClusterReconnectMaxDelay');
  if (dxClusterMaxDelayInput) {
    dxClusterMaxDelayInput.value = config.dxCluster.reconnect.maxDelay;
  }

  const dxClusterBackoffFactorInput = document.getElementById('dxClusterReconnectBackoffFactor');
  if (dxClusterBackoffFactorInput) {
    dxClusterBackoffFactorInput.value = config.dxCluster.reconnect.backoffFactor;
  }

  // Populate FlexRadio Configuration
  const flexRadioEnabledSelect = document.getElementById('flexRadioEnabled');
  if (flexRadioEnabledSelect) {
    flexRadioEnabledSelect.value = config.flexRadio.enabled.toString();
  }

  const flexRadioHostInput = document.getElementById('flexRadioHost');
  if (flexRadioHostInput) {
    flexRadioHostInput.value = config.flexRadio.host;
  }

  const flexRadioPortInput = document.getElementById('flexRadioPort');
  if (flexRadioPortInput) {
    flexRadioPortInput.value = config.flexRadio.port;
  }

  // Populate FlexRadio Command Timeout
  const flexRadioCommandTimeoutInput = document.getElementById('flexRadioCommandTimeout');
  if (flexRadioCommandTimeoutInput) {
    flexRadioCommandTimeoutInput.value = config.flexRadio.commandTimeout;
  }

  // Populate Spot Management Configuration
  const spotLifetimeSecondsInput = document.getElementById('spotManagementLifetimeSeconds');
  if (spotLifetimeSecondsInput) {
    spotLifetimeSecondsInput.value = config.flexRadio.spotManagement.lifetimeSeconds;
  }

  const spotCleanupIntervalInput = document.getElementById('spotManagementCleanupIntervalSeconds');
  if (spotCleanupIntervalInput) {
    spotCleanupIntervalInput.value = config.flexRadio.spotManagement.cleanupIntervalSeconds;
  }

  // Populate WSJT-X Configuration
  const wsjtEnabledSelect = document.getElementById('wsjtEnabled');
  if (wsjtEnabledSelect) {
    wsjtEnabledSelect.value = config.wsjt.enabled.toString();
  }

  const wsjtPortInput = document.getElementById('wsjtPort');
  if (wsjtPortInput) {
    wsjtPortInput.value = config.wsjt.port;
  }

  const wsjtShowQSOSelect = document.getElementById('wsjtShowQSO');
  if (wsjtShowQSOSelect) {
    wsjtShowQSOSelect.value = config.wsjt.showQSO.toString();
  }

  const wsjtLogQSOSelect = document.getElementById('wsjtLogQSO');
  if (wsjtLogQSOSelect) {
    wsjtLogQSOSelect.value = config.wsjt.logQSO.toString();
  }

  // Helper Function to set color inputs
  function setColorInput(elementId, colorValue) {
    const input = document.getElementById(elementId);
    if (input && colorValue) {
      // Ensure the color code is uppercase
      input.value = colorValue.toUpperCase();
    }
  }

  // Helper Function to set opacity inputs
  function setOpacityInput(elementId, opacityValue) {
    const input = document.getElementById(elementId);
    const displaySpan = document.getElementById(`${elementId}Value`);
    if (input && opacityValue !== undefined) {
      input.value = opacityValue;
      if (displaySpan) {
        displaySpan.textContent = `${opacityValue}%`;
      }
    }
  }

  // Populate Spot Colors and Opacity
  if (config.flexRadio?.spotManagement?.colors) {
    const colors = config.flexRadio.spotManagement.colors;

    setColorInput('colorDefaultTextColor', colors.default.textColor);
    setColorInput('colorDefaultBackgroundColor', colors.default.backgroundColor);

    setColorInput('colorMyCallsignTextColor', colors.myCallsign.textColor);
    setColorInput('colorMyCallsignBackgroundColor', colors.myCallsign.backgroundColor);

    setColorInput('colorDxccNeededTextColor', colors.dxccNeeded.textColor);
    setColorInput('colorDxccNeededBackgroundColor', colors.dxccNeeded.backgroundColor);

    setColorInput('colorDxccNeededBandTextColor', colors.dxccNeededBand.textColor);
    setColorInput('colorDxccNeededBandBackgroundColor', colors.dxccNeededBand.backgroundColor);

    setColorInput('colorDxccNeededBandModeTextColor', colors.dxccNeededBandMode.textColor);
    setColorInput('colorDxccNeededBandModeBackgroundColor', colors.dxccNeededBandMode.backgroundColor);

    setOpacityInput('callConfirmedOpacity', colors.callConfirmed.opacity);
    setOpacityInput('callConfirmedBandOpacity', colors.callConfirmedBand.opacity);
    setOpacityInput('callConfirmedBandModeOpacity', colors.callConfirmedBandMode.opacity);
    setOpacityInput('callWorkedOpacity', colors.callWorked.opacity);
    setOpacityInput('callWorkedBandOpacity', colors.callWorkedBand.opacity);
    setOpacityInput('callWorkedBandModeOpacity', colors.callWorkedBandMode.opacity);

    setColorInput('colorNotLotwTextColor', colors.notLotw.textColor);
  }

  // Populate Wavelog API Configuration
  const wavelogApiUrlInput = document.getElementById('wavelogApiUrl');
  if (wavelogApiUrlInput) {
    wavelogApiUrlInput.value = config.wavelogAPI.URL;
  }

  const wavelogApiKeyInput = document.getElementById('wavelogApiKey');
  if (wavelogApiKeyInput) {
    wavelogApiKeyInput.value = config.wavelogAPI.apiKey;
  }

  const stationLocationIdsInput = document.getElementById('stationLocationIds');
  if (stationLocationIdsInput) {
    stationLocationIdsInput.value = config.wavelogAPI.station_location_ids.join(', ');
  }
  
  const wavelogRadioNameInput = document.getElementById('wavelogRadioName');
  if (wavelogRadioNameInput) {
    wavelogRadioNameInput.value = config.wavelogAPI.radioName;
  }

  const multiFlexEnabledCheckbox = document.getElementById('multiFlexEnabled');
  if (multiFlexEnabledCheckbox) {
    multiFlexEnabledCheckbox.checked = config.wavelogAPI.multiFlexEnabled;
  }  

  // Populate LoTW Configuration
  const maxDaysConsideredTrueInput = document.getElementById('maxDaysConsideredTrue');
  if (maxDaysConsideredTrueInput) {
    maxDaysConsideredTrueInput.value = config.loTW.max_days_lotw_considered_true;
  }
}

/**
 * Handles opacity slider changes to update the displayed percentage.
 */
function setupOpacitySliders() {
  const opacityFields = [
    'callConfirmedOpacity',
    'callConfirmedBandOpacity',
    'callConfirmedBandModeOpacity',
    'callWorkedOpacity',
    'callWorkedBandOpacity',
    'callWorkedBandModeOpacity',
  ];

  opacityFields.forEach((fieldId) => {
    const slider = document.getElementById(fieldId);
    const displaySpan = document.getElementById(`${fieldId}Value`);

    if (slider && displaySpan) {
      slider.addEventListener('input', () => {
        displaySpan.textContent = `${slider.value}%`;
      });
    }
  });
}

/**
 * Handles configuration form submission
 */
const configForm = document.getElementById('configForm');
if (configForm) {
  configForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    // Collect all color fields
    const colorFields = [
      'colorDefaultTextColor',
      'colorDefaultBackgroundColor',
      'colorMyCallsignTextColor',
      'colorMyCallsignBackgroundColor',
      'colorDxccNeededTextColor',
      'colorDxccNeededBackgroundColor',
      'colorDxccNeededBandTextColor',
      'colorDxccNeededBandBackgroundColor',
      'colorDxccNeededBandModeTextColor',
      'colorDxccNeededBandModeBackgroundColor',
      'colorNotLotwTextColor',
    ];

    // Validate and process all color fields
    for (let field of colorFields) {
      let colorValue = document.getElementById(field).value.trim().toUpperCase();
      // Ensure the color code is in the format #RRGGBB
      if (!/^#[0-9A-F]{6}$/i.test(colorValue)) {
        showAlert(`Invalid color code in ${field}. Please select a valid color.`, 'danger');
        document.getElementById(field).focus();
        return; // Prevent form submission
      }
      // Update the input value to the corrected uppercase color code
      document.getElementById(field).value = colorValue;
    }

    // Collect opacity fields
    const opacityFields = [
      'callConfirmedOpacity',
      'callConfirmedBandOpacity',
      'callConfirmedBandModeOpacity',
      'callWorkedOpacity',
      'callWorkedBandOpacity',
      'callWorkedBandModeOpacity',
    ];

    // Validate opacity fields
    for (let field of opacityFields) {
      const value = document.getElementById(field).value.trim();
      if (!value || isNaN(value) || value < 0 || value > 100) {
        showAlert(`Invalid opacity value in ${field}. Please enter a value between 0 and 100.`, 'danger');
        document.getElementById(field).focus();
        return;
      }
    }

    // Early validation for number fields
    const numberFields = [
      'augmentedSpotCacheMaxSize',
      'dxClusterPort',
      'dxClusterReconnectInitialDelay',
      'dxClusterReconnectMaxDelay',
      'dxClusterReconnectBackoffFactor',
      'flexRadioPort',
      'flexRadioCommandTimeout',
      'spotManagementLifetimeSeconds',
      'spotManagementCleanupIntervalSeconds',
      'maxDaysConsideredTrue',
    ];

    for (let field of numberFields) {
      const value = document.getElementById(field).value.trim();
      if (!value || isNaN(value)) {
        showAlert(`Invalid value in ${field}. Please enter a valid number.`, 'danger');
        document.getElementById(field).focus();
        return;
      }
    }

  // Build the new configuration object from the form values
    const newConfig = {
      // --- Application Settings ---
      application: {
        theme: document.getElementById('appTheme').value,
        startAtLogin: document.getElementById('appStartAtLogin').checked,
        minimizeToTray: document.getElementById('appMinimizeToTray').checked,
        startMinimized: document.getElementById('appStartMinimized').checked,        
        startupTab: document.getElementById('appStartupTab').value,
        compactMode: document.getElementById('appCompactMode').checked,
        autoOpenQSO: document.getElementById('appAutoOpenQSO').checked,
        useImperial: document.getElementById('appUseImperial').checked,
        showQsoMedia: document.getElementById('appShowQsoMedia').checked,
        autoLogQso: document.getElementById('appAutoLogQso').checked, 
        window: {
            width: parseInt(document.getElementById('appWindowWidth').value) || 900,
            height: parseInt(document.getElementById('appWindowHeight').value) || 800
        },
        qsoWindow: {
            width: parseInt(document.getElementById('qsoWindowWidth').value) || 600,
            height: parseInt(document.getElementById('qsoWindowHeight').value) || 500,
            x: config.application?.qsoWindow?.x,
            y: config.application?.qsoWindow?.y
        }
      },
      catListener: {
        enabled: document.getElementById('catListenerEnabled').checked,
        host: document.getElementById('catListenerHost').value.trim() || '127.0.0.1',
        port: parseInt(document.getElementById('catListenerPort').value) || 54321
      },
      wavelogLive: {
        enabled: document.getElementById('wavelogLiveEnabled').checked,
        port: parseInt(document.getElementById('wavelogLivePort').value) || 54322
      },      
      // --- Rotator Settings ---
      rotator: {
        enabled: document.getElementById('rotatorEnabled').checked,
        type: 'MQTT',
        mqtt: {
            host: document.getElementById('rotMqttHost').value.trim(),
            port: parseInt(document.getElementById('rotMqttPort').value) || 1883,
            username: document.getElementById('rotMqttUser').value.trim(),
            password: document.getElementById('rotMqttPass').value.trim(),
            topicPrefix: document.getElementById('rotMqttTopic').value.trim().replace(/\/$/, '') // Remove trailing slash
        }
      },
      // --- QRZ Settings ---
      qrz: {
        enabled: document.getElementById('qrzEnabled').checked,
        username: document.getElementById('qrzUsername').value.trim(),
        password: document.getElementById('qrzPassword').value.trim()
      },      
      augmentedSpotCache: {
        maxSize: parseInt(document.getElementById('augmentedSpotCacheMaxSize').value, 10),
      },
      dxCluster: {
        host: document.getElementById('dxClusterHost').value.trim(),
        port: parseInt(document.getElementById('dxClusterPort').value, 10),
        callsign: document.getElementById('dxClusterCallsign').value.trim(),
        loginPrompt: document.getElementById('dxClusterLoginPrompt').value.trim(),
        commandsAfterLogin: document
          .getElementById('dxClusterCommandsAfterLogin')
          .value.split(',')
          .map((cmd) => cmd.trim())
          .filter((cmd) => cmd),
        reconnect: {
          initialDelay: parseInt(document.getElementById('dxClusterReconnectInitialDelay').value, 10),
          maxDelay: parseInt(document.getElementById('dxClusterReconnectMaxDelay').value, 10),
          backoffFactor: parseFloat(document.getElementById('dxClusterReconnectBackoffFactor').value),
        },
      },
      flexRadio: {
        enabled: document.getElementById('flexRadioEnabled').value === 'true',
        host: document.getElementById('flexRadioHost').value.trim(),
        port: parseInt(document.getElementById('flexRadioPort').value, 10),
        commandTimeout: parseInt(document.getElementById('flexRadioCommandTimeout').value, 10),
        spotManagement: {
          lifetimeSeconds: parseInt(document.getElementById('spotManagementLifetimeSeconds').value, 10),
          cleanupIntervalSeconds: parseInt(
            document.getElementById('spotManagementCleanupIntervalSeconds').value,
            10
          ),
          colors: {
            default: {
              textColor: document.getElementById('colorDefaultTextColor').value.trim().toUpperCase(),
              backgroundColor: document
                .getElementById('colorDefaultBackgroundColor')
                .value.trim()
                .toUpperCase(),
            },
            myCallsign: {
              textColor: document.getElementById('colorMyCallsignTextColor').value.trim().toUpperCase(),
              backgroundColor: document
                .getElementById('colorMyCallsignBackgroundColor')
                .value.trim()
                .toUpperCase(),
            },
            dxccNeeded: {
              textColor: document.getElementById('colorDxccNeededTextColor').value.trim().toUpperCase(),
              backgroundColor: document
                .getElementById('colorDxccNeededBackgroundColor')
                .value.trim()
                .toUpperCase(),
            },
            dxccNeededBand: {
              textColor: document.getElementById('colorDxccNeededBandTextColor').value.trim().toUpperCase(),
              backgroundColor: document
                .getElementById('colorDxccNeededBandBackgroundColor')
                .value.trim()
                .toUpperCase(),
            },
            dxccNeededBandMode: {
              textColor: document
                .getElementById('colorDxccNeededBandModeTextColor')
                .value.trim()
                .toUpperCase(),
              backgroundColor: document
                .getElementById('colorDxccNeededBandModeBackgroundColor')
                .value.trim()
                .toUpperCase(),
            },
            callConfirmed: {
              opacity: parseInt(document.getElementById('callConfirmedOpacity').value, 10),
            },
            callConfirmedBand: {
              opacity: parseInt(document.getElementById('callConfirmedBandOpacity').value, 10),
            },
            callConfirmedBandMode: {
              opacity: parseInt(document.getElementById('callConfirmedBandModeOpacity').value, 10),
            },
            callWorked: {
              opacity: parseInt(document.getElementById('callWorkedOpacity').value, 10),
            },
            callWorkedBand: {
              opacity: parseInt(document.getElementById('callWorkedBandOpacity').value, 10),
            },
            callWorkedBandMode: {
              opacity: parseInt(document.getElementById('callWorkedBandModeOpacity').value, 10),
            },
            notLotw: {
              textColor: document.getElementById('colorNotLotwTextColor').value.trim().toUpperCase(),
            },
          },
        },
      },
      wavelogAPI: {
        URL: document.getElementById('wavelogApiUrl').value.trim(),
        apiKey: document.getElementById('wavelogApiKey').value.trim(),
        station_location_ids: document
          .getElementById('stationLocationIds')
          .value.split(',')
          .map((id) => parseInt(id.trim(), 10))
          .filter((id) => !isNaN(id)),
        radioName: document.getElementById('wavelogRadioName').value.trim(),
        multiFlexEnabled: document.getElementById('multiFlexEnabled').checked,
      },
      loTW: {
        max_days_lotw_considered_true: parseInt(
          document.getElementById('maxDaysConsideredTrue').value,
          10
        ),
      },
      wsjt: {
        enabled: document.getElementById('wsjtEnabled').value === 'true',
        port: parseInt(document.getElementById('wsjtPort').value, 10),
        showQSO: document.getElementById('wsjtShowQSO').value === 'true',
        logQSO: document.getElementById('wsjtLogQSO').value === 'true',
      },
    };

    // Apply theme immediately so user sees the change without restart
    applyTheme(newConfig.application.theme);

    // Send the updated config back to the main process
    try {
      await ipcRenderer.invoke('update-config', newConfig);
      showAlert('Configuration updated successfully! You should now restart the application!', 'success');
    } catch (error) {
      showAlert('Failed to update configuration.', 'danger');
    }
  });
}

/**
 * Reset to defaults functionality
 */
const resetDefaultsButton = document.getElementById('resetDefaults');
if (resetDefaultsButton) {
  resetDefaultsButton.addEventListener('click', async () => {
    try {
      await ipcRenderer.invoke('reset-config-to-defaults');
      showAlert('Configuration reset to defaults!', 'warning');
      setTimeout(() => {
        window.location.reload(); // Reload the page to reflect defaults
      }, 1000);
    } catch (error) {
      showAlert('Failed to reset configuration.', 'danger');
    }
  });
}

/**
 * Handles various status update events.
 * @param {object} status - The status object containing event type and related data.
 */
function handleStatusUpdate(status) {
  switch (status.event) {
    case 'flexRadioConnected':
      updateFlexRadioStatus('Connected');
      isFlexRadioConnected = true;
      // If we are currently on the Profiles tab, load data automatically now
      const activeTab = document.querySelector('.nav-link.active');
      if (activeTab && activeTab.id === 'profiles-tab') {
          loadProfiles();
      }
      break;

    case 'flexRadioDisconnected':
      updateFlexRadioStatus('Disconnected');
      isFlexRadioConnected = false; // Mark as disconnected
      break;
    case 'flexRadioError':
      updateFlexRadioStatus(`Error: ${status.error}`);
      break;
    case 'dxClusterConnected':
      updateDXClusterStatus('Connected');
      break;
    case 'dxClusterDisconnected':
      updateDXClusterStatus('Disconnected');
      break;
    case 'dxClusterError':
      updateDXClusterStatus(`Error: ${status.error}`);
      break;
    case 'WavelogResponsive':
      updateWavelogStatus(status.message);
      break;
    case 'WavelogUnresponsive':
      updateWavelogStatus('Unresponsive');
      break;
    case 'WSJTEnabled':
      updateWSJTStatus('Enabled');
      break;
    case 'WSJTDisabled':
      updateWSJTStatus('Disabled');
      break;
    case 'WSJTError':
      updateWSJTStatus(`Error: ${status.error}`);
      break;
    case 'newSpot':
      displayNewSpot(status.spot);
      break;
    case 'cacheHealth':
      displayCacheHealth(status.healthStatus);
      break;
    case 'configUpdated':
      showAlert(status.message, 'info');
      break;
    default:
      // Unknown event; no action required
      break;
  }
}

// Listen for 'status-update' events from the main process
ipcRenderer.on('status-update', (event, status) => {
  handleStatusUpdate(status);
});

/**
 * Updates FlexRadio connection status in the "Connected Services" tab.
 * @param {string} message - The status message.
 */
function updateFlexRadioStatus(message) {
  const flexStatus = document.getElementById('flexRadioStatus');
  if (flexStatus) {
    setStatusElement(flexStatus, message);
  }
}

/**
 * Updates DXCluster connection status in the "Connected Services" tab.
 * @param {string} message - The status message.
 */
function updateDXClusterStatus(message) {
  const dxStatus = document.getElementById('dxClusterStatus');
  if (dxStatus) {
    setStatusElement(dxStatus, message);
  }
}

/**
 * Updates Wavelog API connection status in the "Connected Services" tab.
 * @param {string} message - The status message.
 */
function updateWavelogStatus(message) {
  const wavelogStatus = document.getElementById('wavelogApiStatus');
  if (wavelogStatus) {
    setStatusElement(wavelogStatus, message);
  }
}

/**
 * Updates WSJT-X Listener status in the "Connected Services" tab.
 * @param {string} message - The status message.
 */
function updateWSJTStatus(message) {
  const wsjtStatus = document.getElementById('wsjtxListenerStatus');
  if (wsjtStatus) {
    setStatusElement(wsjtStatus, message);
  }
}

/**
 * Displays a new spot in the "Most Recent Spot" section.
 * @param {object} spot - The spot data.
 */
function displayNewSpot(spot) {
  const spotsList = document.getElementById('spotsList');
  if (spotsList) {
    // Clear the previous spot, so only one is displayed at a time
    spotsList.innerHTML = '';

    // Destructure necessary properties with optional chaining
    const {
      spotted,
      frequency,
      band,
      wavelog_augmented_data: {
        call_confirmed = undefined,
        call_confirmed_band = undefined,
        call_confirmed_band_mode = undefined,
        call_worked = undefined,
        call_worked_band = undefined,
        call_worked_band_mode = undefined,
        lotw_member = undefined,
        flag = undefined,
      } = {},
    } = spot;

    // Convert emoji to country code
    const countryCode = getCountryCodeFromEmoji(flag) || 'default'; // Default flag if invalid

    // Determine the color class for the callsign
    let callsignClass = '';
    if (call_confirmed_band_mode === true) {
      callsignClass = 'text-success'; // Green for call confirmed (worked before) on actual band and mode
    } else if (call_confirmed === false && lotw_member === false) {
      callsignClass = 'text-danger'; // Red for not worked and not LoTW member
    }

    // Create a new list item for the latest spot
    const listItem = document.createElement('li');
    listItem.className = 'list-group-item d-flex align-items-center'; // Flex classes for alignment

    // Create a span for the flag icon
    const flagSpan = document.createElement('span');
    if (countryCode && countryCode !== 'default') {
      flagSpan.className = `me-3 fi fi-${countryCode.toLowerCase()}`; // Ensure 'fi' class for flag icons
      flagSpan.setAttribute('aria-label', `Flag of ${countryCode.toUpperCase()}`);
      flagSpan.setAttribute('title', `Flag of ${countryCode.toUpperCase()}`);
    }

    // Create a container for the rest of the spot information
    const spotInfoDiv = document.createElement('div');

    // Create text nodes and span for callsign
    const callsignLabel = document.createTextNode('Callsign: ');
    const callsignSpan = document.createElement('span');
    callsignSpan.textContent = spotted;
    if (callsignClass) {
      callsignSpan.classList.add(callsignClass);
    }

    const frequencyText = document.createTextNode(`, Frequency: ${frequency} kHz, Band: ${band}`);

    // Append callsign and frequency to the spot info container
    spotInfoDiv.appendChild(callsignLabel);
    spotInfoDiv.appendChild(callsignSpan);
    spotInfoDiv.appendChild(frequencyText);

    // Append flag icon and spot info to the list item
    if (countryCode && countryCode !== 'default') {
      listItem.appendChild(flagSpan); // Only append flag if it's valid
    }
    listItem.appendChild(spotInfoDiv);

    // Append the new list item (only one spot will be shown at a time)
    spotsList.appendChild(listItem);
  }
}

/**
 * Updates Cache Health status in the UI.
 * @param {object} healthStatus - The health status object containing cache metrics.
 */
function displayCacheHealth(healthStatus) {
  const cacheHealthDiv = document.getElementById('cacheHealth');

  if (cacheHealthDiv) {
    const {
      isHealthy,
      cacheSize,
      maxSize,
      totalSpotsProcessed,
      cacheHits,
      cacheMisses,
      cacheHitRate,
    } = healthStatus;

    // Determine the health status word and its corresponding color
    let healthWord = '';
    let healthClass = '';

    switch (isHealthy) {
      case 'Building':
        healthWord = 'Building';
        healthClass = 'text-warning'; // Orange
        break;
      case 'Healthy':
        healthWord = 'Healthy';
        healthClass = 'text-success'; // Green
        break;
      case 'Unhealthy':
        healthWord = 'Unhealthy';
        healthClass = 'text-danger'; // Red
        break;
      default:
        healthWord = isHealthy;
        healthClass = '';
    }

    // Create the health status span with appropriate class
    const healthSpan = document.createElement('span');
    healthSpan.textContent = healthWord;
    if (healthClass) {
      healthSpan.classList.add(healthClass);
    }

    // Construct the complete cache health text
    const cacheHealthText = ` | Size: ${cacheSize}/${maxSize} | Processed: ${totalSpotsProcessed} | Hits: ${cacheHits} | Misses: ${cacheMisses} | Hit Rate: ${cacheHitRate}`;

    // Clear existing content
    cacheHealthDiv.innerHTML = '';

    // Append the health status span and the rest of the text
    cacheHealthDiv.appendChild(healthSpan);
    cacheHealthDiv.appendChild(document.createTextNode(cacheHealthText));
  }
}

/**
 * Populates the About tab with version information.
 */
function populateAboutTab() {
  ipcRenderer.invoke('get-app-version').then((version) => {
    const versionElement = document.getElementById('appVersion');
    if (versionElement) {
      versionElement.textContent = version;
    }
  }).catch((error) => {
    console.error('Failed to get app version:', error);
  });

  ipcRenderer.invoke('get-station-details').then((stationDetails) => {
    const wavelogStationLocationElement = document.getElementById('wavelogStationLocationDetails');
    if (wavelogStationLocationElement) {
      wavelogStationLocationElement.textContent = stationDetails;
    }
  }).catch((error) => {
    console.error('Failed to get station details:', error);
  });
}

// Initialize the form once the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  // Load configuration and populate form
  ipcRenderer
    .invoke('get-config')
    .then((config) => {
      populateForm(config); // Call to populate form fields
      setupOpacitySliders(); // Set up event listeners for opacity sliders
    })
    .catch(() => {
      showAlert('Error fetching configuration.', 'danger');
    });

  // Populate About tab
  populateAboutTab();
});

document.addEventListener('DOMContentLoaded', () => {
  // Attach a click event to all external links
  document.querySelectorAll('a[target="_new"]').forEach(link => {
    link.addEventListener('click', (event) => {
      event.preventDefault(); // Prevent the default anchor behavior
      const url = link.href;
      shell.openExternal(url); // Open in the default system browser
    });
  });
});

// --- Update Handling Logic ---

// Listen for update available
ipcRenderer.on('update_available', () => {
  // Show a standard alert or a small toast just to say "Downloading..."
  // For now, we can log it or show a non-intrusive alert.
  console.log('Update available, downloading...');
  // Optional: You could show a small toast here too "Downloading update..."
});

// Listen for update downloaded
ipcRenderer.on('update_downloaded', () => {
  const toastElement = document.getElementById('updateToast');
  const restartBtn = document.getElementById('restartAndInstallBtn');

  if (toastElement) {
    // Initialize Bootstrap Toast
    // We assume bootstrap is loaded via CDN in index.html
    const toast = new bootstrap.Toast(toastElement, {
      autohide: false // Keep it visible until user clicks
    });

    // Attach click handler to the Restart button
    if (restartBtn) {
      restartBtn.onclick = () => {
        // Change text to indicate action
        restartBtn.textContent = 'Restarting...';
        restartBtn.disabled = true;
        // Tell main process to install
        ipcRenderer.invoke('install-update');
      };
    }

    toast.show();
  }
});

// --- Profile Handling Logic ---

let isFlexRadioConnected = false;

// Listen for when the Profiles tab is clicked/shown
const profilesTabElement = document.getElementById('profiles-tab');
if (profilesTabElement) {
  profilesTabElement.addEventListener('shown.bs.tab', function (event) {
    loadProfiles();
  });
}

/**
 * Invokes the main process to fetch profiles.
 * Checks connection status before attempting fetch.
 */
function loadProfiles() {
    const grid = document.getElementById('profilesGrid');
    
    // 1. If radio is not connected, show waiting message
    if (!isFlexRadioConnected) {
        grid.innerHTML = `
            <div class="d-flex flex-column align-items-center mt-5 text-muted">
                <div class="spinner-border text-secondary mb-2" role="status"></div>
                <div>Waiting for FlexRadio connection...</div>
            </div>`;
        return;
    }

    // 2. Only show loading spinner if empty or showing waiting message
    if(grid.children.length === 0 || grid.innerText.includes('Waiting')) {
        grid.innerHTML = '<div class="d-flex justify-content-center mt-4"><div class="spinner-border text-primary" role="status"></div></div>';
    }

    // 3. Fetch data
    ipcRenderer.invoke('fetch-global-profiles').then(result => {
        if(!result.success) {
            grid.innerHTML = `<div class="alert alert-danger m-3">${result.error}</div>`;
        }
    });
}

// Listen for profile data coming from the Main process
ipcRenderer.on('flex-global-profiles', (event, profiles) => {
  renderProfiles(profiles);
});

/**
 * Renders a Dynamic Grid.
 * 1. Scans all profiles to see which Modes exist globally.
 * 2. Creates rows ONLY for those modes.
 * 3. Fills gaps with empty slots to maintain alignment.
 * @param {string[]} profiles - List of profile names.
 */
function renderProfiles(profiles) {
  const grid = document.getElementById('profilesGrid');
  grid.innerHTML = '';

  if (!profiles || profiles.length === 0) {
    grid.innerHTML = '<div class="alert alert-warning m-3">No profiles found.</div>';
    return;
  }

  // 1. Setup Bands and Sorting
  const displayOrder = ['6M', '10M', '12M', '15M', '17M', '20M', '30M', '40M', '60M', '80M', '160M'];
  const searchOrder = [...displayOrder].sort((a, b) => b.length - a.length);

  // 2. Define all POSSIBLE modes and their detection logic
  const allModeDefinitions = [
      { id: 'CW',   label: 'CW',   matcher: (n) => n.includes('CW') },
      { id: 'DIGI', label: 'DIGU', matcher: (n) => n.includes('DIG') || n.includes('FT8') || n.includes('RTTY') || n.includes('DATA') },
      { id: 'SSB',  label: 'SSB',  matcher: (n) => n.includes('SSB') || n.includes('LSB') || n.includes('USB') || n.includes('PH') },
      { id: 'FM',   label: 'FM',   matcher: (n) => n.includes('FM') }
  ];

  // 3. Bucket profiles into bands AND detect active modes
  const bandBuckets = {};
  displayOrder.forEach(b => bandBuckets[b] = []);
  
  // Track which modes are actually used across ALL bands
  const activeModesSet = new Set();

  profiles.forEach(name => {
    if (name === 'Default') return;
    const upperName = name.toUpperCase();
    const lowerName = name.toLowerCase();

    // Check which mode this profile belongs to
    allModeDefinitions.forEach(mode => {
        if (mode.matcher(upperName)) {
            activeModesSet.add(mode.id);
        }
    });
    
    // Assign to band bucket
    for (const bandLabel of searchOrder) {
      if (lowerName.includes(bandLabel.toLowerCase())) {
          bandBuckets[bandLabel].push(name);
          return;
      }
    }
  });

  // 4. Filter the Mode Rows: Only keep modes that exist in at least one profile
  const rowsToRender = allModeDefinitions.filter(mode => activeModesSet.has(mode.id));

  // 5. Render the Grid
  displayOrder.forEach(bandKey => {
    // Optional: Skip empty bands if you want to save horizontal space
    if (bandBuckets[bandKey].length === 0) return;

    const col = document.createElement('div');
    col.className = 'band-column';

    // Header
    const header = document.createElement('div');
    header.className = 'band-header';
    header.innerText = bandKey;
    col.appendChild(header);

    // Render Rows based on GLOBALLY active modes
    rowsToRender.forEach(modeDef => {
        // Does THIS band have a profile for THIS mode?
        const matchingProfile = bandBuckets[bandKey].find(pName => modeDef.matcher(pName.toUpperCase()));

        if (matchingProfile) {
            // Yes -> Render Button
            const btn = document.createElement('button');
            btn.className = 'btn profile-btn grid-slot'; 
            btn.innerText = modeDef.label; 
            btn.title = matchingProfile;

            if (modeDef.id === 'CW') btn.classList.add('mode-cw');
            else if (modeDef.id === 'SSB') btn.classList.add('mode-ssb');
            else if (modeDef.id === 'DIGI') btn.classList.add('mode-digi');
            else if (modeDef.id === 'FM') btn.classList.add('mode-fm');
            else btn.classList.add('mode-default');

            btn.onclick = () => {
                const originalText = btn.innerText;
                btn.innerText = '...';
                btn.disabled = true;
                ipcRenderer.invoke('load-global-profile', matchingProfile).then(() => {
                    setTimeout(() => {
                        btn.innerText = originalText;
                        btn.disabled = false;
                    }, 500);
                });
            };
            col.appendChild(btn);
        } else {
            // No -> Render Empty Slot (To keep grid aligned with neighbors)
            const placeholder = document.createElement('div');
            placeholder.className = 'empty-slot grid-slot';
            col.appendChild(placeholder);
        }
    });

    grid.appendChild(col);
  });
}

/**
 * Toggles the visibility of the banner based on compact mode setting.
 * @param {boolean} isCompact - True to hide banner, false to show.
 */
function applyCompactMode(isCompact) {
  const banner = document.querySelector('.banner-image');
  if (banner) {
    if (isCompact) {
      banner.classList.add('banner-hidden');
    } else {
      banner.classList.remove('banner-hidden');
    }
  }
}

// --- QSO Assistant Logic ---

const openQSOBtn = document.getElementById('openQSOAssistantBtn');
if (openQSOBtn) {
  openQSOBtn.addEventListener('click', () => {
    // This IPC channel will be implemented in Step 3
    ipcRenderer.invoke('open-qso-assistant'); 
    console.log('Requesting to open QSO Assistant...');
  });
}
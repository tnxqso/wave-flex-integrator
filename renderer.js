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

  // Populate Augmented Spot Cache Max Size
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
      break;
    case 'flexRadioDisconnected':
      updateFlexRadioStatus('Disconnected');
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

// Listen for update events
ipcRenderer.on('update_available', () => {
  alert('A new update is available. It will be downloaded automatically.');
});

ipcRenderer.on('update_downloaded', () => {
  alert('Update downloaded. The application will now restart to install it.');
});

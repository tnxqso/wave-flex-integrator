// Old default configuration

'use strict';

const defaultConfig = {

  // ===========================================================
  // The augmented Spot Cache
  // where we store data from Wavelog API for enriching spots
  // ===========================================================
  augmentedSpotCache: {
    maxSize: 500,  // Maximum entries in the cache
  },

  // ==============================
  // DX Cluster Configuration
  // ==============================
  dxCluster: {
    host: 'dxc.mx0nca.uk',     // Hostname or IP of the DXCluster server
    port: 7373,                // Port for the DXCluster server
    callsign: 'SE6S', // User callsign for login
    loginPrompt: 'login:',     // Expected login prompt from the DXCluster server
    commandsAfterLogin: [      // Commands to execute after successful login
      'SET/NAME Mikel',          // e.g., 'SET/NAME John'
      'SET/QTH Atran, Falkenberg', // e.g., 'SET/QTH London IO91WM'
      'SET/LOCATION 57 7 N 12 57 E',  // e.g., 'SET/LOCATION 51 30 N 0 7 W'
      'SET/QRA JO67LC',
      'CLEAR/SPOTS ALL',
      'ACCEPT/SPOT 0 ON HF',
      'ACCEPT/SPOT 1 BY_ZONE 14',
      'SET/SKIMMER CW',
      'SET/SEEME',
    ],
    reconnect: {
      initialDelay: 10000,      // Initial delay before reconnection attempt in milliseconds
      maxDelay: 60000,          // Maximum delay for reconnection attempts in milliseconds
      backoffFactor: 2,         // Factor by which the reconnection delay increases
    },
  },

  // ==============================
  // FlexRadio Configuration
  // ==============================
  flexRadio: {
    enabled: true,                  // Toggle FlexRadio integration
    host: 'remoteqth.narva2.net',   // Hostname or IP where FlexRadio is running
    port: 4992,                     // Port for FlexRadio Telnet connection
    commandTimeout: 15000,          // Time to wait for a response after a command was sent
  
    spotManagement: {
      lifetimeSeconds: 500,          // Lifetime of each spot in seconds
      cleanupIntervalSeconds: 60,    // Interval for cleaning up expired spots in seconds
  
      colors: {
        default: {
          textColor: '#FF2F2F2F',          // Very dark grey text (full opacity)
          backgroundColor: '#FFF8F8F8',    // Almost white background (full opacity)
        },
        myCallsign: {
          textColor: '#FF0000',            // Red text (full opacity)
          backgroundColor: '#FFC0CB',      // Pink background (full opacity)
        },
        dxccNeeded: {
          textColor: '#FF2F2F2F',          // Custom dark grey text (full opacity)
          backgroundColor: '#FF0000',      // Red background (full opacity)
        },
        dxccNeededBand: {
          textColor: '#FF2F2F2F',          // Custom dark grey text (full opacity)
          backgroundColor: '#FFA500',      // Orange background (full opacity)
        },
        dxccNeededBandMode: {
          textColor: '#FF2F2F2F',          // Custom dark grey text (full opacity)
          backgroundColor: '#FFFF00',      // Yellow background (full opacity)
        },
        callConfirmed: {
          backgroundColor: '#66F8F8F8',    // (~40% opacity)
        },
        notLotw: {
          textColor: '#FFD94F4F',          // Red text for no LoTW (full opacity)
        },
      },
    },
  },

  // ==============================
  // Wavelog API Configuration
  // ==============================
  wavelogAPI: {
    URL: 'https://wavelog.narva2.net/index.php',
    apiKey: 'wl66e6a4af18d21',
    max_days_lotw_considered_true: 200,
  },

  // ==============================
  // Logging Configuration
  // ==============================
  logging: {
    debug: true,            // Enable or disable debug logging
    level: 'info',         // Logging level: 'debug', 'info', 'warn', 'error'
  },
};

module.exports = defaultConfig;

'use strict';

const defaultConfig = {

  // ==============================
  // Application Settings
  // ==============================
  application: {
    theme: 'system',         // 'light', 'dark', 'system'
    startupTab: 'status',    // 'status', 'config', 'profiles', 'about'
    window: {
      width: 900,
      height: 800
    }
  },
    
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
    host: 'dxc.ve7cc.net',     // Hostname or IP of the DXCluster server
    port: 23,                  // Port for the DXCluster server
    callsign: 'YOUR-CALLSIGN-HERE',              // User callsign for login
    loginPrompt: 'login:',     // Expected login prompt from the DXCluster server
    commandsAfterLogin: [      // Commands to execute after successful login
      'SET/NAME JOHN',         // e.g., 'SET/NAME John'
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
    host: 'my-flexradio.example.com',   // Hostname or IP where FlexRadio is running
    port: 4992,                     // Port for FlexRadio Telnet connection
    commandTimeout: 15000,          // Time to wait for a response after a command was sent
  
    spotManagement: {
      lifetimeSeconds: 500,          // Lifetime of each spot in seconds
      cleanupIntervalSeconds: 60,    // Interval for cleaning up expired spots in seconds
  
      colors: {
        default: {
          textColor: '#2F2F2F',        // Very dark grey text
          backgroundColor: '#F8F8F8',  // Almost white background
        },
        myCallsign: {
          textColor: '#000000',        // Black text
          backgroundColor: '#00FF00',  // Green background
        },
        dxccNeeded: {
          textColor: '#FFFFFF',        // White text
          backgroundColor: '#030F6D',  // Dark blue background
        },
        dxccNeededBand: {
          textColor: '#FFFFFF',        // White text
          backgroundColor: '#0000FE',  // Blue background
        },
        dxccNeededBandMode: {
          textColor: '#FFFFFF',        // White text
          backgroundColor: '#8BB7FE',  // Light blue background
        },
        callWorked: {
          opacity: 30,                 // Opacity percentage (0-100)
        },
        callWorkedBand: {
          opacity: 30,                 // Opacity percentage (0-100)
        },
        callWorkedBandMode: {
          opacity: 30,                 // Opacity percentage (0-100)
        },
        callConfirmed: {
          opacity: 30,                 // Opacity percentage (0-100)
        },
        callConfirmedBand: {
          opacity: 30,                 // Opacity percentage (0-100)
        },
        callConfirmedBandMode: {
          opacity: 30,                 // Opacity percentage (0-100)
        },
        notLotw: {
          textColor: '#D94F4F',        // Red text for no LoTW
        },
      },
    },
  },

  // ==============================
  // Wavelog API Configuration
  // ==============================
  wavelogAPI: {
    URL: 'https://wavelog.example.com/index.php',
    apiKey: 'YOUR-WAVELOG-API-KEY-HERE',
    station_location_ids: [], // Wavelog station location (QTH) IDs from where to search for DXCC confirmation data
    radioName: 'wavelog-flex-integrator',
    multiFlexEnabled: false,
  },

  // ==============================
  //  Logbook of The World (LoTW)
  // ==============================
  loTW: {
    max_days_lotw_considered_true: 200,
  },

  // ==============================
  // WSJT-X Configuration
  // ==============================
  wsjt: {
    enabled: false,
    port: 2237,
    showQSO: true,
    logQSO: true,
  },

};

module.exports = defaultConfig;

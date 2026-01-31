'use strict';

const defaultConfig = {

  // ==============================
  // Application Settings
  // ==============================
  application: {
    theme: 'system',
    startupTab: 'status',
    compactMode: false,
    autoOpenQSO: false,
    useImperial: false,
    showQsoMedia: false,
    autoLogQso: false,
    startMinimized: false,
    minimizeToTray: true,
    startAtLogin: false,
    window: {
      width: 900,
      height: 800
    },
    qsoWindow: {
        width: 600,
        height: 500
    }
  },

  // ==============================
  // Rotator Configuration
  // ==============================
  rotator: {
    enabled: false,          // Master switch
    type: 'MQTT',            // Future proofing (could be 'Rotctl' later)
    mqtt: {
        host: '192.168.x.x', // MQTT Server hostname or IP
        port: 1883,
        username: 'home',
        password: '',
        topicPrefix: 'YOURCALLSIGN/0/ROT' // The root of your topics
    }
  },

  // ==============================
  // External Services (QRZ.com)
  // ==============================
  qrz: {
    enabled: false,          // Enable lookup against QRZ XML API
    username: '',            // Your QRZ.com login username
    password: ''             // Your QRZ.com login password
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
    radioName: 'wave-flex-integrator',
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

  // ==============================
  // Local HTTP CAT Listener
  // ==============================
  catListener: {
    enabled: true,
    host: '0.0.0.0',
    port: 54321,       // Default Wavelog port
  },  

};

module.exports = defaultConfig;
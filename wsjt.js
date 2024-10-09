'use strict';

/**
 * WSJT Class
 *
 * This class listens for UDP broadcasts from the WSJT-X server,
 * parses incoming messages using the wsjt_message_parser,
 * and emits events for other parts of the application to handle.
 */

const dgram = require('dgram');
const EventEmitter = require('events');
const { WSJTMessage } = require('./wsjt_message_parser');

class WSJTClient extends EventEmitter {
    /**
     * Creates an instance of WSJTClient.
     * @param {object} config - Configuration object.
     * @param {number} [config.port=2237] - The UDP port to listen on.
     * @param {object} logger - A logger instance (e.g., winston logger).
     */
    constructor(config, logger) {
        super();
        this.port = config.wsjt && config.wsjt.port ? config.wsjt.port : 2237;
        this.address = config.wsjt && config.wsjt.address ? config.wsjt.address : '0.0.0.0';
        this.logger = logger;
        this.socket = null;
    }

    /**
     * Starts listening for UDP messages from WSJT-X.
     */
    start() {
        this.socket = dgram.createSocket('udp4');

        this.socket.on('error', (err) => {
            if (this.logger) {
                this.logger.error(`WSJT-X UDP Socket Error:\n${err.stack}`);
            } else {
                console.error(`WSJT-X UDP Socket Error:\n${err.stack}`);
            }
            this.socket.close();
        });

        this.socket.on('message', (msg, rinfo) => {
            try {
                const message = WSJTMessage.parse(msg);
                if (this.logger) {
                    this.logger.debug(`Received WSJT-X message from ${rinfo.address}:${rinfo.port}`);
                    this.logger.debug(`Message Type: ${message.type}, ID: ${message.id}`);
                }

                // Emit an event based on message type
                switch (message.type) {
                    case WSJTMessage.MESSAGE_TYPES.HEARTBEAT:
                        this.emit('heartbeat', message);
                        break;
                    case WSJTMessage.MESSAGE_TYPES.STATUS:
                        this.emit('status', message);
                        break;
                    case WSJTMessage.MESSAGE_TYPES.DECODE:
                        this.emit('decode', message);
                        break;
                    case WSJTMessage.MESSAGE_TYPES.CLEAR:
                        this.emit('clear', message);
                        break;
                    case WSJTMessage.MESSAGE_TYPES.QSO_LOGGED:
                        this.emit('qso_logged', message);
                        break;
                    case WSJTMessage.MESSAGE_TYPES.WSPR_DECODE:
                        this.emit('wspr_decode', message);
                        break;
                    case WSJTMessage.MESSAGE_TYPES.LOGGED_ADIF:
                        this.emit('logged_adif', message);
                        break;
                    default:
                        // Unknown or unhandled message type
                        if (this.logger) {
                            this.logger.warn(`Unhandled WSJT-X message type: ${message.type}`);
                        }
                        break;
                }
            } catch (error) {
                if (this.logger) {
                    this.logger.error(`Failed to parse WSJT-X message: ${error.message}`);
                } else {
                    console.error(`Failed to parse WSJT-X message: ${error.message}`);
                }
            }
        });

        this.socket.on('listening', () => {
            const address = this.socket.address();
            if (this.logger) {
                this.logger.info(`WSJT-X UDP socket listening on ${address.address}:${address.port}`);
            } else {
                console.log(`WSJT-X UDP socket listening on ${address.address}:${address.port}`);
            }
        });

        this.socket.bind(this.port, this.address);
    }

    /**
     * Stops listening for UDP messages and closes the socket.
     */
    stop() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }
}

module.exports = WSJTClient;

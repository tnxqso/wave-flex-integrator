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

/**
 * Returns true when the address is a valid IPv4 multicast address, that is
 * within 224.0.0.0/4.
 * @param {string} address
 * @returns {boolean}
 */
function isMulticastAddress(address) {
    if (typeof address !== 'string') {
        return false;
    }
    const parts = address.trim().split('.');
    if (parts.length !== 4) {
        return false;
    }
    const octets = parts.map((part) => Number(part));
    if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
        return false;
    }
    return octets[0] >= 224 && octets[0] <= 239;
}

class WSJTClient extends EventEmitter {
    /**
     * Creates an instance of WSJTClient.
     * @param {object} config - Configuration object.
     * @param {number} [config.port=2237] - The UDP port to listen on.
     * @param {object} logger - A logger instance (e.g., winston logger).
     */
    constructor(config, logger) {
        super();
        const wsjt = config.wsjt || {};

        this.port = wsjt.port ? wsjt.port : 2237;
        this.address = wsjt.address ? wsjt.address : '0.0.0.0';
        this.logger = logger;
        this.socket = null;

        // Multicast configuration. In unicast mode the socket behaves exactly
        // as before: an exclusive bind, no group membership.
        this.multicast = wsjt.listenMode === 'multicast';
        this.multicastGroup = wsjt.multicastGroup ? String(wsjt.multicastGroup).trim() : '224.0.0.1';
        // An empty interface means the operating system picks one.
        this.multicastInterface = wsjt.multicastInterface
            ? String(wsjt.multicastInterface).trim()
            : '';

        // The socket binds asynchronously, so callers cannot assume the listener
        // is running just because start() returned. These two fields hold the
        // outcome of the bind so the UI can report the real state.
        this.listening = false;
        this.lastError = null;
    }

    /**
     * Reports whether the UDP socket is currently bound and receiving.
     * @returns {boolean}
     */
    isListening() {
        return this.listening;
    }

    /**
     * Closes the socket, tolerating a socket that was never bound or that
     * has already been closed. In both of those cases close() throws
     * ERR_SOCKET_DGRAM_NOT_RUNNING, which must not propagate.
     * @private
     */
    closeSocketSafely() {
        if (!this.socket) {
            return;
        }
        try {
            this.socket.close();
        } catch (closeErr) {
            if (this.logger) {
                this.logger.debug(`WSJT-X UDP socket close ignored: ${closeErr.message}`);
            }
        }
    }

    /**
     * Records a failure, tears the socket down and notifies listeners.
     * @param {Error} err
     * @private
     */
    failWith(err) {
        this.listening = false;
        this.lastError = err;

        this.closeSocketSafely();
        this.socket = null;

        // EventEmitter rethrows an 'error' event that has no listener, which
        // would crash the main process, so only emit when one is attached.
        if (this.listenerCount('error') > 0) {
            this.emit('error', err);
        }
    }

    /**
     * Starts listening for UDP messages from WSJT-X.
     */
    start() {
        // Reject an unusable multicast configuration before binding, otherwise
        // the socket would bind successfully and then silently receive nothing.
        if (this.multicast && !isMulticastAddress(this.multicastGroup)) {
            const err = new Error(
                `Invalid WSJT-X multicast group '${this.multicastGroup}'. Use an address in 224.0.0.0 to 239.255.255.255.`
            );
            if (this.logger) {
                this.logger.error(err.message);
            }
            this.listening = false;
            this.lastError = err;
            if (this.listenerCount('error') > 0) {
                this.emit('error', err);
            }
            return;
        }

        // SO_REUSEADDR is only enabled for multicast. In unicast mode it would
        // allow a second application to bind the same port while only one of
        // them actually receives the datagrams, which is worse than the
        // EADDRINUSE the user gets today.
        this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: this.multicast });

        this.socket.on('error', (err) => {
            // Bind failures such as EADDRINUSE are delivered here too, so this
            // handler is the only place where a failed listener start can be
            // detected.
            if (this.logger) {
                this.logger.error(`WSJT-X UDP Socket Error:\n${err.stack}`);
            } else {
                console.error(`WSJT-X UDP Socket Error:\n${err.stack}`);
            }

            this.failWith(err);
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

            if (this.multicast) {
                // The group must be joined after the bind succeeded. If this
                // fails the socket stays bound but receives nothing, so treat
                // it as a start failure rather than letting it pass silently.
                try {
                    this.socket.addMembership(
                        this.multicastGroup,
                        this.multicastInterface || undefined
                    );
                } catch (err) {
                    const ifaceLabel = this.multicastInterface || 'default';
                    if (this.logger) {
                        this.logger.error(
                            `Failed to join WSJT-X multicast group ${this.multicastGroup} on interface ${ifaceLabel}: ${err.message}`
                        );
                    }
                    this.failWith(err);
                    return;
                }
            }

            this.listening = true;
            this.lastError = null;

            const mode = this.multicast
                ? `multicast group ${this.multicastGroup} on interface ${this.multicastInterface || 'default'}`
                : 'unicast';
            const startupMessage = `WSJT-X UDP socket listening on ${address.address}:${address.port} (${mode})`;

            if (this.logger) {
                this.logger.info(startupMessage);
            } else {
                console.log(startupMessage);
            }
        });

        this.socket.bind(this.port, this.address);
    }

    /**
     * Stops listening for UDP messages and closes the socket.
     */
    stop() {
        this.listening = false;
        if (this.socket) {
            // Closing the socket leaves any multicast group, so no explicit
            // dropMembership is needed here.
            this.closeSocketSafely();
            this.socket = null;
        }
    }
}

module.exports = WSJTClient;
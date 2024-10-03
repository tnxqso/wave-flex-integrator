// flexradio_message_parser.js

'use strict';

const EventEmitter = require('events');

/**
 * Class responsible for parsing messages from the FlexRadio server.
 */
class FlexRadioMessageParser extends EventEmitter {
  /**
   * Creates an instance of FlexRadioMessageParser.
   */
  constructor() {
    super();
  }

  /**
   * Main function to parse the incoming message from the FlexRadio server.
   * @param {string} message - The message string received from the server.
   */
  parseMessage(message) {
    message = message.trim();
    if (!message) return;

    // Determine message type by the first character
    const messageType = message.charAt(0);

    switch (messageType) {
      case 'R': // Reply
        this.parseReply(message);
        break;
      case 'S': // Status
        this.parseStatus(message);
        break;
      case 'H': // Handle
        this.parseHandle(message);
        break;
      case 'V': // Version
        this.parseProtocolVersion(message);
        break;
      case 'M': // Message
        this.parseServerMessage(message);
        break;
      default:
        this.emit('unknownMessageType', { messageType, message });
        break;
    }
  }

  /**
   * Parses a reply message from the server and emits a 'reply' event.
   * @param {string} message - The reply message string.
   */
  parseReply(message) {
    const match = message.match(/^R(\d+)\|(.*)/);
    if (match) {
      const seqNum = parseInt(match[1], 10);
      const response = match[2];
      this.emit('reply', { seqNum, response });
    } else {
      this.emit('error', new Error(`Unrecognized reply message format: ${message}`));
    }
  }

  /**
   * Parses a status message from the server.
   * @param {string} message - The status message string.
   */
  parseStatus(message) {
    const match = message.match(/^S([0-9A-F]+)\|(.*)/);
    if (match) {
      const handle = match[1];
      const statusContent = match[2];
      this.parseStatusContent(handle, statusContent);
    } else {
      this.emit('error', new Error(`Unrecognized status message format: ${message}`));
    }
  }

  /**
   * Parses the content of a status message and emits appropriate events.
   * @param {string} handle - The handle associated with the message.
   * @param {string} statusContent - The content of the status message.
   */
  parseStatusContent(handle, statusContent) {
    const words = statusContent.trim().split(/\s+/);

    const statusType = words[0];

    switch (statusType) {
      case 'spot':
        this.parseSpotStatus(handle, statusContent);
        break;
      case 'slice':
        this.parseSliceStatus(handle, statusContent);
        break;
      // Add more cases as needed for different status types
      default:
        // Emit a generic status event for unhandled types
        this.emit('status', { handle, statusType, statusContent });
        break;
    }
  }

  /**
   * Parses spot status messages and emits events accordingly.
   * @param {string} handle - The handle associated with the message.
   * @param {string} statusContent - The content of the status message.
   */
  parseSpotStatus(handle, statusContent) {
    const words = statusContent.trim().split(/\s+/);

    if (words.length < 2) {
      this.emit('error', new Error(`parseSpotStatus: Error parsing spot status -- too few words (${statusContent})`));
      return;
    }

    // Parse the index (ID) of the spot
    const index = parseInt(words[1], 10);
    if (isNaN(index)) {
      this.emit('error', new Error(`parseSpotStatus: Invalid index (${words[1]})`));
      return;
    }

    const action = words[2];

    // Emit events based on action
    if (action === 'removed') {
      this.emit('spotRemoved', { index });
    } else if (action === 'triggered') {
      this.emit('spotTriggered', { handle, index });
    } else {
      // For other actions or status updates
      const statusMessage = words.slice(2).join(' ');
      this.emit('spotStatus', { handle, index, statusMessage });
    }
  }

  /**
   * Parses slice status messages and emits events accordingly.
   * @param {string} handle - The handle associated with the message.
   * @param {string} statusContent - The content of the status message.
   */
  parseSliceStatus(handle, statusContent) {
    // We need to correctly extract the index and the rest of the status message
    const match = statusContent.match(/^slice\s+(\d+)\s+(.*)/);
    if (match) {
      const index = parseInt(match[1], 10);
      if (isNaN(index)) {
        this.emit('error', new Error(`parseSliceStatus: Invalid index (${match[1]})`));
        return;
      }
      const statusMessage = match[2];
      this.emit('sliceStatus', { handle, index, statusMessage });
    } else {
      this.emit('error', new Error(`parseSliceStatus: Failed to parse slice status message: ${statusContent}`));
    }
  }

  /**
   * Parses a handle message from the server and emits a 'handle' event.
   * @param {string} message - The handle message string.
   */
  parseHandle(message) {
    // Example: "H12345678"
    const match = message.match(/^H([0-9A-F]{8})$/);
    if (match) {
      const handle = match[1];
      this.emit('handle', { handle });
    } else {
      this.emit('error', new Error(`Unrecognized handle message format: ${message}`));
    }
  }

  /**
   * Parses the protocol version message from the server and emits a 'protocolVersion' event.
   * @param {string} message - The protocol version message string.
   */
  parseProtocolVersion(message) {
    // Example: "V1.4.16.123"
    const version = message.substring(1); // Remove the leading 'V'
    this.emit('protocolVersion', { version });
  }

  /**
   * Parses a general server message and emits a 'serverMessage' event.
   * @param {string} message - The server message string.
   */
  parseServerMessage(message) {
    const match = message.match(/^M(\d+)\|(.*)/);
    if (match) {
      const messageId = parseInt(match[1], 10);
      const messageContent = match[2];
      this.emit('serverMessage', { messageId, messageContent });
    } else {
      this.emit('error', new Error(`Unrecognized server message format: ${message}`));
    }
  }
}

module.exports = FlexRadioMessageParser;

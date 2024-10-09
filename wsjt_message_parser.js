'use strict';

const MAGIC_NUMBER = 0xadbccbda;
const SCHEMA_VERSION = 3; // Adjust according to your needs

const MESSAGE_TYPES = {
    HEARTBEAT: 0,
    STATUS: 1,
    DECODE: 2,
    CLEAR: 3,
    QSO_LOGGED: 5,
    WSPR_DECODE: 10,
    LOGGED_ADIF: 12,
    // Other message types can be added here if necessary
};

class WSJTMessage {
    static MESSAGE_TYPES = MESSAGE_TYPES;
    constructor() {
        this.magic = MAGIC_NUMBER;
        this.schema = SCHEMA_VERSION;
        this.type = null;
        this.id = null;
        // Other fields depending on message type
    }

    /**
     * Parses a WSJT-X message from a Buffer.
     * @param {Buffer} buffer - The buffer containing the WSJT-X message.
     * @returns {WSJTMessage} - The parsed WSJTMessage instance.
     */
    static parse(buffer) {
        let offset = 0;

        // Read magic number
        const magic = buffer.readUInt32BE(offset);
        offset += 4;
        if (magic !== MAGIC_NUMBER) {
            throw new Error(`Invalid magic number: ${magic}`);
        }

        // Read schema number
        const schema = buffer.readUInt32BE(offset);
        offset += 4;

        // Read message type
        const type = buffer.readUInt32BE(offset);
        offset += 4;

        // Read Id (unique key) (utf8)
        const idResult = readQByteArray(buffer, offset);
        const id = idResult.value;
        offset = idResult.offset;

        // Create a WSJTMessage instance
        const message = new WSJTMessage();
        message.magic = magic;
        message.schema = schema;
        message.type = type;
        message.id = id;

        // Now, depending on the message type, read the rest of the message
        switch (type) {
            case MESSAGE_TYPES.HEARTBEAT: {
                // Parse Heartbeat message
                const maxSchemaNumber = buffer.readUInt32BE(offset);
                offset += 4;

                const versionResult = readQByteArray(buffer, offset);
                const version = versionResult.value;
                offset = versionResult.offset;

                const revisionResult = readQByteArray(buffer, offset);
                const revision = revisionResult.value;
                offset = revisionResult.offset;

                message.maxSchemaNumber = maxSchemaNumber;
                message.version = version;
                message.revision = revision;

                break;
            }

            case MESSAGE_TYPES.STATUS: {
                // Parse Status message
                message.dialFrequency = buffer.readBigUInt64BE(offset);
                offset += 8;

                const modeResult = readQByteArray(buffer, offset);
                message.mode = modeResult.value;
                offset = modeResult.offset;

                const dxCallResult = readQByteArray(buffer, offset);
                message.dxCall = dxCallResult.value;
                offset = dxCallResult.offset;

                const reportResult = readQByteArray(buffer, offset);
                message.report = reportResult.value;
                offset = reportResult.offset;

                const txModeResult = readQByteArray(buffer, offset);
                message.txMode = txModeResult.value;
                offset = txModeResult.offset;

                message.txEnabled = readBoolean(buffer, offset);
                offset += 1;

                message.transmitting = readBoolean(buffer, offset);
                offset += 1;

                message.decoding = readBoolean(buffer, offset);
                offset += 1;

                message.rxDF = buffer.readUInt32BE(offset);
                offset += 4;

                message.txDF = buffer.readUInt32BE(offset);
                offset += 4;

                const deCallResult = readQByteArray(buffer, offset);
                message.deCall = deCallResult.value;
                offset = deCallResult.offset;

                const deGridResult = readQByteArray(buffer, offset);
                message.deGrid = deGridResult.value;
                offset = deGridResult.offset;

                const dxGridResult = readQByteArray(buffer, offset);
                message.dxGrid = dxGridResult.value;
                offset = dxGridResult.offset;

                message.txWatchdog = readBoolean(buffer, offset);
                offset += 1;

                const subModeResult = readQByteArray(buffer, offset);
                message.subMode = subModeResult.value;
                offset = subModeResult.offset;

                message.fastMode = readBoolean(buffer, offset);
                offset += 1;

                message.specialOperationMode = buffer.readUInt8(offset);
                offset += 1;

                message.frequencyTolerance = buffer.readUInt32BE(offset);
                offset += 4;

                message.trPeriod = buffer.readUInt32BE(offset);
                offset += 4;

                const configNameResult = readQByteArray(buffer, offset);
                message.configurationName = configNameResult.value;
                offset = configNameResult.offset;

                const txMessageResult = readQByteArray(buffer, offset);
                message.txMessage = txMessageResult.value;
                offset = txMessageResult.offset;

                break;
            }

            case MESSAGE_TYPES.DECODE: {
                // Parse Decode message
                message.isNew = readBoolean(buffer, offset);
                offset += 1;

                const timeResult = readQTime(buffer, offset);
                message.time = timeResult.value;
                offset = timeResult.offset;

                message.snr = buffer.readInt32BE(offset);
                offset += 4;

                message.deltaTime = buffer.readDoubleBE(offset);
                offset += 8;

                message.deltaFrequency = buffer.readUInt32BE(offset);
                offset += 4;

                const decodeModeResult = readQByteArray(buffer, offset);
                message.mode = decodeModeResult.value;
                offset = decodeModeResult.offset;

                const messageResult = readQByteArray(buffer, offset);
                message.messageText = messageResult.value;
                offset = messageResult.offset;

                message.lowConfidence = readBoolean(buffer, offset);
                offset += 1;

                message.offAir = readBoolean(buffer, offset);
                offset += 1;

                break;
            }

            case MESSAGE_TYPES.CLEAR: {
                // Parse Clear message
                // For outgoing messages from WSJT-X, there is no 'Window' field
                break;
            }

            case MESSAGE_TYPES.QSO_LOGGED: {
                // Parse QSO Logged message
                const dateTimeOffResult = readQDateTime(buffer, offset);
                message.dateTimeOff = dateTimeOffResult.value;
                offset = dateTimeOffResult.offset;

                const dxCallsignResult = readQByteArray(buffer, offset);
                message.dxCallsign = dxCallsignResult.value;
                offset = dxCallsignResult.offset;

                const dxGridResult = readQByteArray(buffer, offset);
                message.dxGrid = dxGridResult.value;
                offset = dxGridResult.offset;

                message.txFrequency = buffer.readBigUInt64BE(offset);
                offset += 8;

                const modeResult2 = readQByteArray(buffer, offset);
                message.mode = modeResult2.value;
                offset = modeResult2.offset;

                const reportSentResult = readQByteArray(buffer, offset);
                message.reportSent = reportSentResult.value;
                offset = reportSentResult.offset;

                const reportReceivedResult = readQByteArray(buffer, offset);
                message.reportReceived = reportReceivedResult.value;
                offset = reportReceivedResult.offset;

                const txPowerResult = readQByteArray(buffer, offset);
                message.txPower = txPowerResult.value;
                offset = txPowerResult.offset;

                const commentsResult = readQByteArray(buffer, offset);
                message.comments = commentsResult.value;
                offset = commentsResult.offset;

                const nameResult = readQByteArray(buffer, offset);
                message.name = nameResult.value;
                offset = nameResult.offset;

                const dateTimeOnResult = readQDateTime(buffer, offset);
                message.dateTimeOn = dateTimeOnResult.value;
                offset = dateTimeOnResult.offset;

                const operatorCallsignResult = readQByteArray(buffer, offset);
                message.operatorCallsign = operatorCallsignResult.value;
                offset = operatorCallsignResult.offset;

                const myCallsignResult = readQByteArray(buffer, offset);
                message.myCallsign = myCallsignResult.value;
                offset = myCallsignResult.offset;

                const myGridResult = readQByteArray(buffer, offset);
                message.myGrid = myGridResult.value;
                offset = myGridResult.offset;

                const exchangeSentResult = readQByteArray(buffer, offset);
                message.exchangeSent = exchangeSentResult.value;
                offset = exchangeSentResult.offset;

                const exchangeReceivedResult = readQByteArray(buffer, offset);
                message.exchangeReceived = exchangeReceivedResult.value;
                offset = exchangeReceivedResult.offset;

                const adifPropagationModeResult = readQByteArray(buffer, offset);
                message.adifPropagationMode = adifPropagationModeResult.value;
                offset = adifPropagationModeResult.offset;

                break;
            }

            case MESSAGE_TYPES.WSPR_DECODE: {
                // Parse WSPR Decode message
                message.isNew = readBoolean(buffer, offset);
                offset += 1;

                const timeResultWspr = readQTime(buffer, offset);
                message.time = timeResultWspr.value;
                offset = timeResultWspr.offset;

                message.snr = buffer.readInt32BE(offset);
                offset += 4;

                message.deltaTime = buffer.readDoubleBE(offset);
                offset += 8;

                message.frequency = buffer.readBigUInt64BE(offset);
                offset += 8;

                message.drift = buffer.readInt32BE(offset);
                offset += 4;

                const callsignResult = readQByteArray(buffer, offset);
                message.callsign = callsignResult.value;
                offset = callsignResult.offset;

                const gridResult = readQByteArray(buffer, offset);
                message.grid = gridResult.value;
                offset = gridResult.offset;

                message.power = buffer.readInt32BE(offset);
                offset += 4;

                message.offAir = readBoolean(buffer, offset);
                offset += 1;

                break;
            }

            case MESSAGE_TYPES.LOGGED_ADIF: {
                // Parse Logged ADIF message
                const adifTextResult = readQByteArray(buffer, offset);
                message.adifText = adifTextResult.value;
                offset = adifTextResult.offset;

                break;
            }

            default: {
                // Unknown message type
                // Optionally, you can handle other message types or skip them
                break;
            }
        }

        return message;
    }
}

// Helper functions to read data types

/**
 * Reads a QByteArray (utf8 string) from the buffer.
 * @param {Buffer} buffer - The buffer to read from.
 * @param {number} offset - The offset to start reading.
 * @returns {object} - An object containing the string value and the new offset.
 */
function readQByteArray(buffer, offset) {
    const length = buffer.readUInt32BE(offset);
    offset += 4;
    if (length === 0xffffffff) {
        return { value: null, offset };
    } else if (length === 0) {
        return { value: '', offset };
    } else {
        const bytes = buffer.slice(offset, offset + length);
        offset += length;
        const value = bytes.toString('utf8');
        return { value, offset };
    }
}

/**
 * Reads a boolean value from the buffer.
 * @param {Buffer} buffer - The buffer to read from.
 * @param {number} offset - The offset to start reading.
 * @returns {boolean} - The boolean value read.
 */
function readBoolean(buffer, offset) {
    const byte = buffer.readUInt8(offset);
    return byte !== 0;
}

/**
 * Reads a QTime value from the buffer.
 * @param {Buffer} buffer - The buffer to read from.
 * @param {number} offset - The offset to start reading.
 * @returns {object} - An object containing the Date value and the new offset.
 */
function readQTime(buffer, offset) {
    // QTime is stored as quint32 milliseconds since midnight
    const milliseconds = buffer.readUInt32BE(offset);
    offset += 4;

    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setTime(date.getTime() + milliseconds);

    return { value: date, offset };
}

/**
 * Reads a QDateTime value from the buffer.
 * @param {Buffer} buffer - The buffer to read from.
 * @param {number} offset - The offset to start reading.
 * @returns {object} - An object containing the Date object and the new offset.
 */
function readQDateTime(buffer, offset) {
    // QDateTime is stored as:
    // QDate (qint64) - Julian day number
    // QTime (quint32) - milliseconds since midnight
    // timespec (quint8)
    // If timespec == 2, then offset (qint32) follows
    // For simplicity, we'll assume timespec == 1 (UTC)

    const julianDay = buffer.readBigInt64BE(offset);
    offset += 8;

    const milliseconds = buffer.readUInt32BE(offset);
    offset += 4;

    const timespec = buffer.readUInt8(offset);
    offset += 1;

    let date = julianDayToDate(Number(julianDay));

    date.setHours(0, 0, 0, 0);
    date.setTime(date.getTime() + milliseconds);

    if (timespec === 2) {
        const offsetSeconds = buffer.readInt32BE(offset);
        offset += 4;
        // Adjust date/time based on offset if needed
    }

    return { value: date, offset };
}

/**
 * Converts a Julian Day Number to a JavaScript Date object.
 * @param {number} julianDay - The Julian Day Number.
 * @returns {Date} - The corresponding Date object.
 */
function julianDayToDate(julianDay) {
    // Algorithm from Numerical Recipes
    const JD = julianDay + 0.5;
    const Z = Math.floor(JD);
    const F = JD - Z;
    let A = Z;

    if (Z >= 2299161) {
        const alpha = Math.floor((Z - 1867216.25) / 36524.25);
        A = Z + 1 + alpha - Math.floor(alpha / 4);
    }

    const B = A + 1524;
    const C = Math.floor((B - 122.1) / 365.25);
    const D = Math.floor(365.25 * C);
    const E = Math.floor((B - D) / 30.6001);

    const day = B - D - Math.floor(30.6001 * E) + F;
    const month = E < 14 ? E - 1 : E - 13;
    const year = month > 2 ? C - 4716 : C - 4715;

    const date = new Date(Date.UTC(year, month - 1, Math.floor(day)));
    const dayFraction = day - Math.floor(day);
    const millisecondsInDay = dayFraction * 24 * 60 * 60 * 1000;

    date.setTime(date.getTime() + millisecondsInDay);

    return date;
}

module.exports = {
    WSJTMessage
};

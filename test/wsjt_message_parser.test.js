'use strict';

// Regression test for issue #73: WSJT-X sends schema 2 until a server answers
// its heartbeat, so the parser must accept schema 2 as well as schema 3.

const test = require('node:test');
const assert = require('node:assert');
const { WSJTMessage } = require('../wsjt_message_parser');

const MAGIC_NUMBER = 0xadbccbda;
const { HEARTBEAT, STATUS, DECODE } = WSJTMessage.MESSAGE_TYPES;

// Field encoders matching what the parser reads (big endian, Qt QDataStream)
const u8 = (value) => {
    const b = Buffer.alloc(1);
    b.writeUInt8(value);
    return b;
};
const bool = (value) => u8(value ? 1 : 0);
const u32 = (value) => {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(value);
    return b;
};
const i32 = (value) => {
    const b = Buffer.alloc(4);
    b.writeInt32BE(value);
    return b;
};
const u64 = (value) => {
    const b = Buffer.alloc(8);
    b.writeBigUInt64BE(BigInt(value));
    return b;
};
const f64 = (value) => {
    const b = Buffer.alloc(8);
    b.writeDoubleBE(value);
    return b;
};
// QString as sent by WSJT-X: uint32 byte length followed by UTF-8 bytes
const qstring = (value) => {
    const bytes = Buffer.from(value, 'utf8');
    return Buffer.concat([u32(bytes.length), bytes]);
};

function buildPacket(schema, type, id, body) {
    return Buffer.concat([u32(MAGIC_NUMBER), u32(schema), u32(type), qstring(id), ...body]);
}

const ID = 'WSJT-X';
const MAX_SCHEMA = 3;
const DIAL_FREQUENCY = 14074000;
const MODE = 'FT8';
const DX_CALL = 'SM0ABC';
const DECODE_TEXT = 'CQ SM0ABC JO89';

function heartbeat(schema) {
    return buildPacket(schema, HEARTBEAT, ID, [
        u32(MAX_SCHEMA),
        qstring('2.7.0'),
        qstring('abc123'),
    ]);
}

function status(schema) {
    return buildPacket(schema, STATUS, ID, [
        u64(DIAL_FREQUENCY),
        qstring(MODE),
        qstring(DX_CALL),
        qstring('-10'), // report
        qstring(MODE), // tx mode
        bool(false), // tx enabled
        bool(false), // transmitting
        bool(true), // decoding
        u32(1500), // rx DF
        u32(1600), // tx DF
        qstring('SA0XYZ'), // de call
        qstring('JO99'), // de grid
        qstring('JO89'), // dx grid
        bool(false), // tx watchdog
        qstring(''), // sub mode
        bool(false), // fast mode
        u8(0), // special operation mode
        u32(10), // frequency tolerance
        u32(15), // T/R period
        qstring('Default'), // configuration name
        qstring(''), // tx message
    ]);
}

function decode(schema) {
    return buildPacket(schema, DECODE, ID, [
        bool(true), // new
        u32(12 * 3600 * 1000), // time, ms since midnight
        i32(-12), // snr
        f64(0.2), // delta time
        u32(1234), // delta frequency
        qstring('~'), // mode
        qstring(DECODE_TEXT),
        bool(false), // low confidence
        bool(false), // off air
    ]);
}

for (const schema of [2, 3]) {
    test(`parses Heartbeat with schema ${schema}`, () => {
        const msg = WSJTMessage.parse(heartbeat(schema));
        assert.strictEqual(msg.schema, schema);
        assert.strictEqual(msg.type, HEARTBEAT);
        assert.strictEqual(msg.id, ID);
        assert.strictEqual(msg.maxSchemaNumber, MAX_SCHEMA);
    });

    test(`parses Status with schema ${schema}`, () => {
        const msg = WSJTMessage.parse(status(schema));
        assert.strictEqual(msg.schema, schema);
        assert.strictEqual(msg.type, STATUS);
        assert.strictEqual(msg.id, ID);
        assert.strictEqual(msg.dialFrequency, BigInt(DIAL_FREQUENCY));
        assert.strictEqual(msg.mode, MODE);
        assert.strictEqual(msg.dxCall, DX_CALL);
    });

    test(`parses Decode with schema ${schema}`, () => {
        const msg = WSJTMessage.parse(decode(schema));
        assert.strictEqual(msg.schema, schema);
        assert.strictEqual(msg.type, DECODE);
        assert.strictEqual(msg.id, ID);
        assert.strictEqual(msg.messageText, DECODE_TEXT);
    });
}

for (const schema of [1, 4]) {
    test(`rejects schema ${schema}`, () => {
        for (const build of [heartbeat, status, decode]) {
            assert.throws(
                () => WSJTMessage.parse(build(schema)),
                (err) => err instanceof Error && err.message.includes(`schema version ${schema}`)
            );
        }
    });
}

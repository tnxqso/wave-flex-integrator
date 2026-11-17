'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const net = require('net');
const FlexRadioClient = require('../flexradio_client');

function captureLogger() {
  const lines = [];
  const log = (level) => (msg) => lines.push({ level, msg });
  return { lines, debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error') };
}

// Find a local port with nothing listening on it, so connect() gets ECONNREFUSED
async function closedPort() {
  const srv = net.createServer();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const { port } = srv.address();
  await new Promise((r) => srv.close(r));
  return port;
}

test('a failed connection attempt logs one warning and nothing else above debug', async () => {
  const logger = captureLogger();
  const port = await closedPort();
  const client = new FlexRadioClient(
    { flexRadio: { enabled: true, host: '127.0.0.1', port, spotManagement: {} }, wavelogAPI: {} },
    logger,
    'TEST'
  );
  const errors = [];
  client.on('error', (e) => errors.push(e.code));

  client.connect();
  await new Promise((r) => setTimeout(r, 300));
  client.shouldReconnect = false; // stop the pending retry from reconnecting
  clearInterval(client.cleanupTimer);

  const visible = logger.lines.filter((l) => l.level !== 'debug');
  assert.deepStrictEqual(errors, ['ECONNREFUSED']);
  assert.strictEqual(visible.length, 1, JSON.stringify(visible));
  assert.strictEqual(visible[0].level, 'warn');
  assert.match(visible[0].msg, /not available \(ECONNREFUSED\)/);
});

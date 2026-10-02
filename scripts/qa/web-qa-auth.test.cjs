const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { localOrigin, fixtureCredentials, loginFixture } = require('./web-qa-auth.cjs');

test('rejects remote or decorated destinations before authenticating', async () => {
  for (const origin of ['https://example.com', 'http://127.0.0.1.evil.test', 'http://user:password@localhost', 'http://localhost/path', 'http://localhost?target=remote', 'http://localhost/#remote', 'file:///tmp/secret']) {
    assert.throws(() => localOrigin(origin));
    await assert.rejects(() => loginFixture(origin, {}));
  }
  assert.equal(localOrigin('http://127.0.0.1:3301/'), 'http://127.0.0.1:3301');
  assert.equal(localOrigin('http://[::1]:3301'), 'http://[::1]:3301');
});

test('accepts only explicit fictitious credentials and rejects arbitrary file payloads', () => {
  const input = { email: 'qa@rent.local', password: 'fixture-password' };
  assert.deepEqual(fixtureCredentials(input), input);
  for (const invalid of [{ ...input, token: 'secret' }, { ...input, email: 'real@company.com' }, { ...input, password: {} }, { email: input.email }, ['file contents'], null]) assert.throws(() => fixtureCredentials(invalid));
});

test('authenticates the local fixture and rejects unrelated file fields before sending', async (t) => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ path: req.url, method: req.method, body: JSON.parse(body) });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ accessToken: 'fixture-token' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const credentials = { email: 'qa@rent.local', password: 'fixture-password' };
  assert.deepEqual(await loginFixture(origin, credentials), { accessToken: 'fixture-token' });
  await assert.rejects(() => loginFixture(origin, { ...credentials, token: 'unrelated-file-value' }));
  assert.deepEqual(requests, [{ path: '/auth/login', method: 'POST', body: credentials }]);
});

test('never follows a redirect carrying fixture credentials', async (t) => {
  let destinationRequests = 0;
  const destination = http.createServer((req, res) => {
    destinationRequests++;
    res.end('{}');
  });
  await new Promise((resolve) => destination.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => destination.close(resolve)));
  const redirect = http.createServer((req, res) => {
    res.writeHead(307, { Location: `http://127.0.0.1:${destination.address().port}/` });
    res.end();
  });
  await new Promise((resolve) => redirect.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => redirect.close(resolve)));
  await assert.rejects(() => loginFixture(`http://127.0.0.1:${redirect.address().port}`, { email: 'qa@rent.local', password: 'fixture-password' }));
  assert.equal(destinationRequests, 0);
});

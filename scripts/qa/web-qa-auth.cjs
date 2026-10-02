const assert = require('node:assert/strict');

function localOrigin(value) {
  const url = new URL(value);
  assert(['http:', 'https:'].includes(url.protocol), 'QA requires HTTP or HTTPS');
  assert(['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname), 'QA endpoints must use loopback');
  assert(!url.username && !url.password && !url.search && !url.hash && url.pathname === '/', 'QA endpoint must be a credential-free origin');
  return url.origin;
}

function fixtureCredentials(input) {
  assert(input && typeof input === 'object' && !Array.isArray(input), 'QA credentials must be an object');
  assert(typeof input.email === 'string' && typeof input.password === 'string', 'QA credentials require email and password');
  assert(input.email.length <= 254 && /^[^\s@]+@(?:[^\s@]+\.(?:test|local|invalid)|example\.(?:com|org|net))$/.test(input.email), 'QA requires a fictitious fixture email');
  assert(input.password.length >= 8 && input.password.length <= 256, 'Invalid QA fixture password');
  assert(Object.keys(input).every((key) => ['email', 'password'].includes(key)), 'Unexpected fields in QA credentials');
  return { email: input.email, password: input.password };
}

async function loginFixture(origin, input) {
  const destination = localOrigin(origin);
  const credentials = fixtureCredentials(input);
  const response = await fetch(destination + '/auth/login', {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  assert(response.ok, `QA fixture login failed (${response.status})`);
  return response.json();
}

module.exports = { localOrigin, fixtureCredentials, loginFixture };

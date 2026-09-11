'use strict';

const { createRequire } = require('node:module');
const { resolve } = require('node:path');

// Load secrets before the agent or application imports any instrumented module.
// Node's loader preserves explicit PM2 values such as the per-service app name.
process.loadEnvFile(process.env.DOTENV_CONFIG_PATH || '.env');

if (process.env.NEW_RELIC_LICENSE_KEY && process.env.NEW_RELIC_ENABLED !== 'false') {
  const requireFromApp = createRequire(resolve(process.cwd(), 'package.json'));
  requireFromApp('newrelic');
}

'use strict';

const current = process.env.RENT_CURRENT_PATH;
const sharedEnv = process.env.RENT_SHARED_ENV;

if (!current || !sharedEnv) {
  throw new Error('RENT_CURRENT_PATH and RENT_SHARED_ENV are required');
}

const common = {
  autorestart: true,
  max_restarts: 10,
  min_uptime: '10s',
  time: true,
  node_args: `-r ${current}/deploy/newrelic-bootstrap.cjs`,
  env: {
    NODE_ENV: 'production',
    DOTENV_CONFIG_PATH: sharedEnv,
    NEW_RELIC_LOG: 'stdout',
    NODE_OPTIONS: '',
  },
};

module.exports = {
  apps: [
    {
      ...common,
      name: 'rent-backend',
      cwd: `${current}/backend`,
      script: 'dist/main.js',
      env: {
        ...common.env,
        RENT_TRACING_PROVIDER: 'otlp',
        RENT_TRACING_MODULE: './dist/tracing.js',
        NEW_RELIC_APP_NAME: 'RENT-Backend-production',
        NEW_RELIC_HOME: `${current}/backend`,
      },
      out_file: '/var/log/rent/backend.log',
      error_file: '/var/log/rent/backend-error.log',
    },
    {
      ...common,
      name: 'rent-frontend',
      cwd: `${current}/frontend`,
      script: 'server.js',
      out_file: '/var/log/rent/frontend.log',
      error_file: '/var/log/rent/frontend-error.log',
      env: {
        ...common.env,
        PORT: process.env.FRONTEND_PORT || '3000',
        HOSTNAME: '127.0.0.1',
        NEW_RELIC_APP_NAME: 'RENT-Frontend-production',
        NEW_RELIC_HOME: `${current}/frontend`,
      },
    },
    {
      ...common,
      name: 'rent-rag-worker',
      cwd: `${current}/batch`,
      script: 'dist/index.js',
      args: `rag-sync --batch-size 50 --worker-id ${process.env.RENT_WORKER_ID || 'production'}`,
      env: {
        ...common.env,
        RENT_TRACING_PROVIDER: 'otlp',
        RENT_TRACING_MODULE: './dist/shared/tracing.js',
        NEW_RELIC_APP_NAME: 'RENT-Batch-production',
        NEW_RELIC_HOME: `${current}/batch`,
      },
      out_file: '/var/log/rent/rag-worker.log',
      error_file: '/var/log/rent/rag-worker-error.log',
    },
  ],
};

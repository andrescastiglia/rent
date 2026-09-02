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
  env: {
    NODE_ENV: 'production',
    DOTENV_CONFIG_PATH: sharedEnv,
  },
};

module.exports = {
  apps: [
    {
      ...common,
      name: 'rent-backend',
      cwd: `${current}/backend`,
      script: 'dist/main.js',
      node_args: '-r dotenv/config',
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
        NODE_OPTIONS: `-r ${current}/frontend/newrelic.js -r newrelic`,
      },
    },
    {
      ...common,
      name: 'rent-rag-worker',
      cwd: `${current}/batch`,
      script: 'dist/index.js',
      args: `rag-sync --batch-size 50 --worker-id ${process.env.RENT_WORKER_ID || 'production'}`,
      out_file: '/var/log/rent/rag-worker.log',
      error_file: '/var/log/rent/rag-worker-error.log',
    },
  ],
};

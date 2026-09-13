import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

describe.each(['backend', 'frontend'])(
  '%s New Relic health exclusions',
  (app) => {
    const source = readFileSync(
      resolve(__dirname, '../../..', app, 'newrelic.js'),
      'utf8',
    );
    const sandbox = {
      exports: { config: { rules: { ignore: [] as string[] } } },
      process: { env: {} },
    };
    runInNewContext(source, sandbox);
    const rules = sandbox.exports.config.rules.ignore.map(
      (rule) => new RegExp(rule),
    );
    const ignored = (url: string) => rules.some((rule) => rule.test(url));

    it.each([
      '/health',
      '/health/',
      '/health?probe=readiness',
      '/health/?probe=readiness',
      '/health/live',
      '/health/live/',
      '/health/live?probe=liveness',
      '/health/live/?probe=liveness',
      '/socket.io/1/xhr-polling/',
    ])('ignores %s', (url) => {
      expect(ignored(url)).toBe(true);
    });

    it.each([
      '/',
      '/healthcheck',
      '/health/otra',
      '/health/live/otra',
      '/health/lively',
      '/contracts?redirect=/health',
      '/api/health',
    ])('keeps %s traceable', (url) => {
      expect(ignored(url)).toBe(false);
    });
  },
);

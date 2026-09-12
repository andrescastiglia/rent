import { readFileSync } from 'node:fs';
import { databaseTls } from './database-tls';
jest.mock('node:fs', () => ({ readFileSync: jest.fn(() => 'test-ca') }));
describe('database TLS policy', () => {
  it('preserves legacy defaults and supports explicit local disable', () => {
    expect(databaseTls({})).toBeUndefined();
    expect(databaseTls({ DATABASE_SSL_MODE: 'disable' })).toBe(false);
  });
  it('requires a CA and rejects ambiguous connection-string overrides', () => {
    expect(() => databaseTls({ DATABASE_SSL_MODE: 'require' })).toThrow(
      'must be',
    );
    expect(() => databaseTls({ DATABASE_SSL_MODE: 'verify-full' })).toThrow(
      'CA_FILE',
    );
    expect(() =>
      databaseTls({
        DATABASE_SSL_MODE: 'verify-full',
        DATABASE_SSL_CA_FILE: '/ca.crt',
        DATABASE_URL: 'postgres://db/app?sslmode=require',
      }),
    ).toThrow('parameters');
  });
  it('verifies the server with the mounted CA', () => {
    expect(
      databaseTls({
        DATABASE_SSL_MODE: 'verify-full',
        DATABASE_SSL_CA_FILE: '/ca.crt',
        DATABASE_URL: 'postgres://db/app',
      }),
    ).toEqual({ rejectUnauthorized: true, ca: 'test-ca' });
    expect(readFileSync).toHaveBeenCalledWith('/ca.crt', 'utf8');
  });
});

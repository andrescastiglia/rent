import { isTokenExpired } from './jwt';

const encodeBase64Url = (value: object) =>
  Buffer.from(JSON.stringify(value))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const makeToken = (payload: object) =>
  `header.${encodeBase64Url(payload)}.signature`;

describe('isTokenExpired', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns false when the token has not expired', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    expect(isTokenExpired(makeToken({ exp: 1_700_000_100 }))).toBe(false);
  });

  it('returns true when the token is expired', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    expect(isTokenExpired(makeToken({ exp: 1_699_999_999 }))).toBe(true);
  });

  it('returns true for malformed or payload-less tokens', () => {
    expect(isTokenExpired('not-a-jwt')).toBe(true);
    expect(isTokenExpired('header.payload-only')).toBe(true);
  });
});

import { usersApi } from './users';
import { apiClient } from '../api';
import { getUser } from '../auth';

jest.mock('../api', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
  IS_MOCK_MODE: true,
}));

jest.mock('../auth', () => ({
  getToken: jest.fn(),
  getUser: jest.fn(),
  setUser: jest.fn(),
}));

describe('usersApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-30T00:00:00.000Z'));
    (getUser as jest.Mock).mockReturnValue(null);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps the provided password when resetting a user password in mock mode', async () => {
    const promise = usersApi.resetPassword('user-1', '  temp-pass-1234  ');

    await jest.advanceTimersByTimeAsync(250);

    await expect(promise).resolves.toEqual({
      message: 'Password changed successfully',
      temporaryPassword: 'temp-pass-1234',
    });
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('generates unique mock temporary credentials without using Math.random', async () => {
    const firstPromise = usersApi.resetPassword('user-1');
    await jest.advanceTimersByTimeAsync(250);
    const first = await firstPromise;

    const secondPromise = usersApi.resetPassword('user-1');
    await jest.advanceTimersByTimeAsync(250);
    const second = await secondPromise;

    expect(first.temporaryPassword).toMatch(/^tmp-/);
    expect(second.temporaryPassword).toMatch(/^tmp-/);
    expect(second.temporaryPassword).not.toBe(first.temporaryPassword);
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});

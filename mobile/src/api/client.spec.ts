import { apiClient, setSessionExpiredHandler } from './client';
import { clearAuth, getToken } from '@/storage/auth-storage';
import { isTokenExpired } from '@/utils/jwt';

jest.mock('@/storage/auth-storage', () => ({
  clearAuth: jest.fn(),
  getToken: jest.fn(),
}));

jest.mock('@/utils/jwt', () => ({
  isTokenExpired: jest.fn(),
}));

describe('apiClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getToken as jest.Mock).mockResolvedValue('token-123');
    (isTokenExpired as jest.Mock).mockReturnValue(false);
    global.fetch = jest.fn() as any;
  });

  it('sends authenticated requests and returns the JSON body', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ ok: true }),
    });

    await expect(apiClient.get('/leases')).resolves.toEqual({ ok: true });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/leases'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('clears the session and calls the registered handler for expired tokens', async () => {
    const handler = jest.fn();
    const cleanup = setSessionExpiredHandler(handler);
    (isTokenExpired as jest.Mock).mockReturnValue(true);

    await expect(apiClient.get('/leases')).rejects.toThrow('SESSION_EXPIRED');

    expect(clearAuth).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
    cleanup();
  });

  it('handles 401 responses as session expiration', async () => {
    const handler = jest.fn();
    const cleanup = setSessionExpiredHandler(handler);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      json: jest.fn().mockResolvedValue({ message: 'unauthorized' }),
    });

    await expect(apiClient.get('/leases')).rejects.toThrow('SESSION_EXPIRED');

    expect(clearAuth).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('throws the API message for non-401 failures', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: jest.fn().mockResolvedValue({ message: 'backend failed' }),
    });

    await expect(apiClient.post('/leases', { ok: false })).rejects.toThrow(
      'backend failed',
    );
  });

  it('returns undefined for 204 responses', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 204,
      json: jest.fn(),
    });

    await expect(apiClient.delete('/leases/1')).resolves.toBeUndefined();
  });
});

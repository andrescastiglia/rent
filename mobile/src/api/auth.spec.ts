import { isTokenExpired } from '@/utils/jwt';

import { authApi } from './auth';

jest.mock('@/api/client', () => ({
  apiClient: { post: jest.fn() },
}));

describe('authApi mock login', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns a token that survives session rehydration', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    const response = await authApi.login({
      email: 'admin@example.com',
      password: 'admin123',
    });

    expect(response.user.id).toBe('1');
    expect(isTokenExpired(response.accessToken)).toBe(false);
  });
});

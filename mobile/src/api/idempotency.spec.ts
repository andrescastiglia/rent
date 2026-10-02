import { ApiError } from './client';
import { idempotentMutation } from './idempotency';
import * as SecureStore from 'expo-secure-store';
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  digestStringAsync: jest.fn(async (_kind, value) => value),
  randomUUID: jest.fn(() => 'saved-request-key'),
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock('@/storage/auth-storage', () => ({
  getToken: jest.fn(async () => 'token'),
  clearAuth: jest.fn(),
}));
jest.mock('@/utils/jwt', () => ({
  tokenSubject: jest.fn(() => 'company:user'),
  isTokenExpired: jest.fn(),
}));
let stored: string | null;
beforeEach(() => {
  jest.clearAllMocks();
  stored = null;
  (SecureStore.getItemAsync as jest.Mock).mockImplementation(
    async () => stored,
  );
  (SecureStore.setItemAsync as jest.Mock).mockImplementation(
    async (_key, value) => {
      stored = value;
    },
  );
  (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async () => {
    stored = null;
  });
});
it('preserves the key after a lost response and reuses it on an explicit retry', async () => {
  const execute = jest
    .fn()
    .mockRejectedValueOnce(new Error('network lost'))
    .mockResolvedValueOnce({ id: 'payment-1' });
  await expect(
    idempotentMutation('payment:create', { amount: 100 }, execute),
  ).rejects.toThrow('network lost');
  expect(stored).toContain('saved-request-key');
  await expect(
    idempotentMutation('payment:create', { amount: 100 }, execute),
  ).resolves.toEqual({ id: 'payment-1' });
  expect(execute.mock.calls).toEqual([
    ['saved-request-key'],
    ['saved-request-key'],
  ]);
  expect(stored).toBeNull();
});
it('blocks changing the input of an operation with an uncertain result', async () => {
  stored = JSON.stringify({ key: 'old-key', payload: '{"amount":100}' });
  const execute = jest.fn();
  await expect(
    idempotentMutation('payment:create', { amount: 200 }, execute),
  ).rejects.toThrow('uncertain result');
  expect(execute).not.toHaveBeenCalled();
});
it('permits a corrected attempt after a definite validation failure', async () => {
  await expect(
    idempotentMutation(
      'payment:create',
      {},
      jest.fn().mockRejectedValue(new ApiError('invalid amount', 400)),
    ),
  ).rejects.toThrow('invalid amount');
  expect(stored).toBeNull();
});
it('retains an intent on server errors and conflicts', async () => {
  await expect(
    idempotentMutation(
      'payment:create',
      {},
      jest.fn().mockRejectedValue(new ApiError('uncertain', 409)),
    ),
  ).rejects.toThrow('uncertain');
  expect(stored).not.toBeNull();
});
it('blocks parallel submissions of one intent', async () => {
  let complete!: (value: string) => void;
  const execute = jest.fn(
    () =>
      new Promise<string>((resolve) => {
        complete = resolve;
      }),
  );
  const original = idempotentMutation('payment:create', {}, execute);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await expect(
    idempotentMutation('payment:create', {}, execute),
  ).rejects.toThrow('already in progress');
  complete('done');
  await expect(original).resolves.toBe('done');
  expect(execute).toHaveBeenCalledTimes(1);
});

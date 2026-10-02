import { tokenSubject } from '@/utils/jwt';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { getToken } from '@/storage/auth-storage';
import { ApiError } from '@/api/client';

type SavedAttempt = { key: string; payload: string };
const pending = new Map<string, Promise<unknown>>();

/** Retain one intent across network failures and app restarts; changing uncertain input requires reconciliation. */
export async function idempotentMutation<T>(
  operation: string,
  payload: unknown,
  execute: (key: string) => Promise<T>,
): Promise<T> {
  const token = await getToken();
  const identity = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${tokenSubject(token)}:${operation}`,
  );
  const storageKey = `rent.intent.${identity}`;
  if (pending.has(storageKey))
    throw new Error('An operation is already in progress');
  const attempt = (async () => {
    const serialized = JSON.stringify(payload);
    const previous = await SecureStore.getItemAsync(storageKey);
    const saved: SavedAttempt = previous
      ? (JSON.parse(previous) as SavedAttempt)
      : { key: Crypto.randomUUID(), payload: serialized };
    if (saved.payload !== serialized)
      throw new Error(
        'The previous operation has an uncertain result. Review it before changing the input.',
      );
    if (!previous)
      await SecureStore.setItemAsync(storageKey, JSON.stringify(saved));
    try {
      const result = await execute(saved.key);
      await SecureStore.deleteItemAsync(storageKey);
      return result;
    } catch (error) {
      if (
        error instanceof ApiError &&
        [400, 403, 404, 422].includes(error.status)
      )
        await SecureStore.deleteItemAsync(storageKey);
      throw error;
    }
  })();
  pending.set(storageKey, attempt);
  try {
    return await attempt;
  } finally {
    pending.delete(storageKey);
  }
}

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL?.trim() || 'https://rent.maese.com.ar/api';

export const IS_MOCK_MODE =
  process.env.EXPO_PUBLIC_MOCK_MODE === 'true' || process.env.NODE_ENV === 'test';

export const IS_E2E_MODE = process.env.EXPO_PUBLIC_E2E_MODE === 'true';

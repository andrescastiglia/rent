import * as Location from 'expo-location';
import { getCurrentOrigin } from './location';
afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});
it('returns fresh coordinates with conservative accuracy when absent', async () => {
  (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
    coords: { latitude: -34, longitude: -58 },
    timestamp: 123,
  });
  expect(await getCurrentOrigin()).toEqual({
    latitude: -34,
    longitude: -58,
    accuracy: 10000,
    timestamp: 123,
  });
});
it('bounds location waits and clears the timeout on rejection', async () => {
  jest.useFakeTimers();
  (Location.getCurrentPositionAsync as jest.Mock).mockReturnValue(
    new Promise(() => {}),
  );
  const result = getCurrentOrigin();
  const assertion = expect(result).rejects.toThrow('No se pudo actualizar');
  await jest.advanceTimersByTimeAsync(15000);
  await assertion;
  expect(jest.getTimerCount()).toBe(0);
});

import * as Location from 'expo-location';
import type { GeoOrigin } from '../../../shared/contact-data';
export async function getCurrentOrigin(): Promise<GeoOrigin> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const p = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('No se pudo actualizar la ubicación')),
          15000,
        );
      }),
    ]);
    return {
      latitude: p.coords.latitude,
      longitude: p.coords.longitude,
      accuracy: p.coords.accuracy ?? 10000,
      timestamp: p.timestamp,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

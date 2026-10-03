import {
  blankSnapshot,
  chooseImminent,
  expireSnapshot,
} from '../../../shared/proximity';
import type { NearbyPlace, NearbyResult } from '../../../shared/contact-data';
const place = (id: string, distance: number, precise = true): NearbyPlace => ({
  type: 'property',
  id,
  name: 'Place',
  address: 'Mitre 100',
  latitude: 0,
  longitude: 0,
  precise,
  distance,
  contacts: [],
});
const result = (places: NearbyPlace[]): NearbyResult => ({
  places,
  imminentRadius: 100,
  exitRadius: 150,
});
describe('proximity and snapshot rules', () => {
  it('enters at 100m and keeps the same place until the 150m exit to avoid flicker', () => {
    expect(chooseImminent(result([place('a', 99)]), null, 10)?.id).toBe('a');
    expect(
      chooseImminent(
        result([place('b', 50), place('a', 140)]),
        'property:a',
        10,
      )?.id,
    ).toBe('a');
    expect(
      chooseImminent(result([place('a', 151)]), 'property:a', 10),
    ).toBeNull();
  });
  it('does not assert imminent arrival from an approximate geocode or insufficient accuracy', () => {
    expect(chooseImminent(result([place('a', 10, false)]), null, 5)).toBeNull();
    expect(chooseImminent(result([place('a', 10)]), null, 51)).toBeNull();
  });
  it('discards private contact and CRM text when the snapshot expires', () => {
    const expired = expireSnapshot({
      ...blankSnapshot(true),
      updatedAt: 123,
      title: 'Ana Test',
      address: 'Mitre 100',
      lines: ['Ana'],
      contact: {
        type: 'owner',
        id: 'a',
        name: 'Ana Test',
        relationship: 'Propietario',
      },
      communications: [
        {
          id: 'c',
          channel: 'call',
          direction: 'outbound',
          summary: 'Personal details',
          createdAt: '2026-10-03',
        },
      ],
    });
    expect(expired).toMatchObject({
      updatedAt: 123,
      stale: true,
      title: 'Ubicación desactualizada',
      address: '',
      contact: null,
      communications: [],
      lines: [],
    });
  });
});

import { encode } from 'base-64';
import { apiClient } from './client';
import { API_URL, IS_MOCK_MODE } from './env';
import { getToken } from '@/storage/auth-storage';
import type {
  AddressCandidate,
  ContactAddress,
  ContactHistory,
  Eta,
  GeoConfig,
  GeoDestination,
  GeoOrigin,
  LocationRef,
  NearbyResult,
  PhonePreview,
  TravelMode,
} from '../../../shared/contact-data';
export const contactApi = {
  config: () =>
    IS_MOCK_MODE
      ? Promise.resolve({
          normalization: false,
          maps: false,
          proximity: false,
          radius: 2000,
          imminentRadius: 100,
          exitRadius: 150,
          limit: 5,
        } as GeoConfig)
      : apiClient.get<GeoConfig>('/contact-data/config'),
  places: (search: string) =>
    apiClient.post<Array<LocationRef & { name: string; address: string }>>(
      '/contact-data/places-search',
      { search },
    ),
  phone: (value: string, country: string) =>
    apiClient.post<PhonePreview>('/contact-data/phone-preview', {
      value,
      country,
    }),
  search: (address: ContactAddress) =>
    apiClient.post<{ candidates: AddressCandidate[] }>(
      '/contact-data/address-search',
      { address, publicAddress: true },
    ),
  destination: (ref: LocationRef) =>
    apiClient.get<GeoDestination>(
      `/contact-data/locations/${ref.type}/${ref.id}`,
    ),
  entry: (id: string) =>
    apiClient.get<GeoDestination | null>(
      `/contact-data/entries/${encodeURIComponent(id)}/destination`,
    ),
  eta: (destination: LocationRef, origin: GeoOrigin, mode: TravelMode) =>
    apiClient.post<Eta>('/contact-data/eta', {
      destination: { type: destination.type, id: destination.id },
      origin,
      mode,
    }),
  nearby: (origin: GeoOrigin, limit = 5, radius?: number) =>
    apiClient.post<NearbyResult>('/contact-data/nearby', {
      origin,
      limit,
      radius,
    }),
  history: (ref: LocationRef) =>
    apiClient.get<ContactHistory>(
      `/contact-data/people/${ref.type}/${ref.id}/history`,
    ),
  arrival: (ref: LocationRef) =>
    apiClient.post(
      `/contact-data/people/${ref.type}/${ref.id}/arrival-opened`,
      {},
    ),
  async image(ref: LocationRef, signal?: AbortSignal): Promise<string> {
    const response = await fetch(
      `${API_URL}/contact-data/locations/${ref.type}/${ref.id}/image`,
      {
        headers: { Authorization: `Bearer ${await getToken()}` },
        cache: 'no-store',
        signal,
      },
    );
    if (!response.ok) throw new Error('Imagen temporalmente no disponible');
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `data:image/jpeg;base64,${encode(binary)}`;
  },
};

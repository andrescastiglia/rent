import { apiClient, IS_MOCK_MODE } from "../api";
import { getToken } from "../auth";
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
} from "../../../../shared/contact-data";
const token = () => getToken() ?? undefined;
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
      : apiClient.get<GeoConfig>("/contact-data/config", token()),
  places: (search: string) =>
    apiClient.post<Array<LocationRef & { name: string; address: string }>>(
      "/contact-data/places-search",
      { search },
      token(),
    ),
  phone: (value: string, country: string) =>
    apiClient.post<PhonePreview>(
      "/contact-data/phone-preview",
      { value, country },
      token(),
    ),
  search: (address: ContactAddress) =>
    apiClient.post<{ candidates: AddressCandidate[] }>(
      "/contact-data/address-search",
      { address, publicAddress: true },
      token(),
    ),
  destination: (ref: LocationRef) =>
    apiClient.get<GeoDestination>(
      `/contact-data/locations/${ref.type}/${ref.id}`,
      token(),
    ),
  entry: (id: string) =>
    apiClient.get<GeoDestination | null>(
      `/contact-data/entries/${encodeURIComponent(id)}/destination`,
      token(),
    ),
  eta: (destination: LocationRef, origin: GeoOrigin, mode: TravelMode) =>
    apiClient.post<Eta>(
      "/contact-data/eta",
      {
        destination: { type: destination.type, id: destination.id },
        origin,
        mode,
      },
      token(),
    ),
  nearby: (origin: GeoOrigin) =>
    apiClient.post<NearbyResult>("/contact-data/nearby", { origin }, token()),
  history: (ref: LocationRef) =>
    apiClient.get<ContactHistory>(
      `/contact-data/people/${ref.type}/${ref.id}/history`,
      token(),
    ),
  arrival: (ref: LocationRef) =>
    apiClient.post(
      `/contact-data/people/${ref.type}/${ref.id}/arrival-opened`,
      {},
      token(),
    ),
  async image(ref: LocationRef, signal?: AbortSignal): Promise<string> {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/contact-data/locations/${ref.type}/${ref.id}/image`,
      {
        headers: { Authorization: `Bearer ${token()}` },
        cache: "no-store",
        signal,
      },
    );
    if (!response.ok) throw new Error("Imagen temporalmente no disponible");
    return URL.createObjectURL(await response.blob());
  },
};

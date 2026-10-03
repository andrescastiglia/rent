export type LocationType = "property" | "owner" | "tenant" | "interested";
export type LocationRef = { type: LocationType; id: string };
export type ContactAddress = {
  street: string;
  number: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  floor?: string;
  apartment?: string;
  confidential: boolean;
};
export type PhoneField =
  "phone" | "emergencyContactPhone" | "emergencyPhone" | "ownerWhatsapp";
export type NormalizationRequest = {
  addressToken?: string | null;
  phoneOriginals?: Partial<Record<PhoneField, string>>;
  phones?: Partial<Record<PhoneField, string>>;
};
export type ContactInput = {
  contactAddress?: ContactAddress | null;
  normalization?: NormalizationRequest;
};
export type ContactData = {
  address?: { label: string; precise: boolean; original: ContactAddress };
  phones?: Record<
    string,
    {
      original: string;
      e164: string;
      international: string;
      country: string;
      extension: string | null;
      normalizedAt: string;
    }
  >;
};
export type ContactRecord = {
  contactAddress?: ContactAddress | null;
  contactData?: ContactData;
  latitude?: number | null;
  longitude?: number | null;
};
export type GeoConfig = {
  scope?: { userId: string; companyId: string };
  normalization: boolean;
  maps: boolean;
  proximity: boolean;
  radius: number;
  imminentRadius: number;
  exitRadius: number;
  limit: number;
};
export type PhonePreview = {
  original: string;
  country: string;
  possible: boolean;
  valid: boolean;
  e164: string | null;
  international: string | null;
  extension: string | null;
};
export type AddressCandidate = {
  label: string;
  precise: boolean;
  token: string;
};
export type GeoDestination = LocationRef & {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  precise: boolean;
};
export type GeoOrigin = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
};
export type TravelMode = "driving" | "walking" | "cycling";
export type Eta = {
  durationSeconds: number;
  distanceMeters: number;
  arrivesAt: string;
  mode: TravelMode;
  traffic: false;
  attribution: string;
};
export type NearbyContact = {
  type: Exclude<LocationType, "property">;
  id: string;
  name: string;
  relationship: string;
};
export type NearbyPlace = GeoDestination & {
  distance: number;
  contacts: NearbyContact[];
};
export type NearbyResult = {
  places: NearbyPlace[];
  imminentRadius: number;
  exitRadius: number;
};
export type Communication = {
  id: string;
  channel: string;
  direction: string;
  summary: string;
  createdAt: string;
};
export type ContactHistory = {
  communications: Communication[];
  whatsappPhone: string | null;
};
export const emptyContactAddress = (): ContactAddress => ({
  street: "",
  number: "",
  city: "",
  state: "",
  country: "Argentina",
  postalCode: "",
  confidential: false,
});
export function mapsUrl(
  p: GeoDestination,
  mode: TravelMode = "driving",
  navigate = false,
) {
  const travelmode = {
    driving: "driving",
    walking: "walking",
    cycling: "bicycling",
  }[mode];
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${p.latitude},${p.longitude}`)}&travelmode=${travelmode}${navigate ? "&dir_action=navigate" : ""}`;
}
export const arrivalMessage = (name: string) =>
  `Hola ${name}, llegué a visitarte.`;
export const whatsappUrl = (phone: string, name: string) =>
  `https://wa.me/${phone.replace(/^\+/, "")}?text=${encodeURIComponent(arrivalMessage(name))}`;
// A draft may only normalize the exact field value that the user accepted.
export function sanitizeContactDraft(
  draft: ContactInput,
  accepted: Partial<Record<PhoneField, string>>,
  phones: Partial<Record<PhoneField, string>>,
  addressAccepted: string | null,
  address?: ContactAddress,
): ContactInput {
  const normalization = {
    ...draft.normalization,
    phones: { ...draft.normalization?.phones },
  };
  for (const field of Object.keys(normalization.phones) as PhoneField[])
    if (accepted[field] !== phones[field]) delete normalization.phones[field];
  if (
    normalization.addressToken &&
    addressAccepted !==
      JSON.stringify(
        address
          ? ["street", "number", "city", "state", "country", "postalCode"].map(
              (k) => address[k as keyof ContactAddress],
            )
          : null,
      )
  )
    delete normalization.addressToken;
  return { ...draft, normalization };
}

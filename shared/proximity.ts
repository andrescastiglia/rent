import type {
  Communication,
  NearbyContact,
  NearbyPlace,
  NearbyResult,
} from "./contact-data";
export type WidgetSnapshot = {
  updatedAt: number;
  expiresAt: number;
  title: string;
  address: string;
  lines: string[];
  communications: Communication[];
  contact: NearbyContact | null;
  selectedContact?: NearbyContact | null;
  placeKey: string | null;
  stale: boolean;
  enabled: boolean;
};
export const blankSnapshot = (enabled = false): WidgetSnapshot => ({
  updatedAt: 0,
  expiresAt: 0,
  title: enabled ? "Actualizá la ubicación" : "Asistencia desactivada",
  address: "",
  lines: [],
  communications: [],
  contact: null,
  selectedContact: null,
  placeKey: null,
  stale: true,
  enabled,
});
export function chooseImminent(
  result: NearbyResult,
  previousKey: string | null,
  accuracy: number,
): NearbyPlace | null {
  if (accuracy > 50) return null;
  const key = (p: NearbyPlace) => `${p.type}:${p.id}`;
  const previous = result.places.find(
    (p) =>
      key(p) === previousKey && p.precise && p.distance <= result.exitRadius,
  );
  return (
    previous ??
    result.places.find(
      (p) => p.precise && p.distance <= result.imminentRadius,
    ) ??
    null
  );
}
export function expireSnapshot(snapshot: WidgetSnapshot): WidgetSnapshot {
  return {
    ...blankSnapshot(snapshot.enabled),
    updatedAt: snapshot.updatedAt,
    title: snapshot.enabled
      ? "Ubicación desactualizada"
      : "Asistencia desactivada",
  };
}

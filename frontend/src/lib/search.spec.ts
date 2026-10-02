import { includesNormalized, normalizeSearchText } from "./search";
it.each([
  ["  Córdoba ", "cordoba"],
  ["Ñandú", "nandu"],
  [null, ""],
  [undefined, ""],
])("normalizes accent and case for %s", (value, expected) => {
  expect(normalizeSearchText(value)).toBe(expected);
});
it("finds a partial address regardless of accents and preserves an empty search", () => {
  expect(includesNormalized("Av. Córdoba 123", "CORDOBA")).toBe(true);
  expect(includesNormalized(null, "")).toBe(true);
  expect(includesNormalized(undefined, "Ana")).toBe(false);
  expect(includesNormalized("Rosario", "Cordoba")).toBe(false);
});

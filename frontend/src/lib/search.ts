export function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function includesNormalized(
  value: string | null | undefined,
  term: string,
): boolean {
  const normalizedTerm = normalizeSearchText(term);
  if (!normalizedTerm) {
    return true;
  }

  return normalizeSearchText(value).includes(normalizedTerm);
}

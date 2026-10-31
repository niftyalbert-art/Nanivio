export function normalizeNanivioNumber(raw: string) {
  return (raw || '').replace(/[^0-9a-zA-Z]/g, '');
}

// Deliberately local-only: the preview never performs directory or API lookups.
export async function lookupNanivioUser() {
  return null;
}

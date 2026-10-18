/** Audit details are structured metadata, not a React child. Preserve all fields. */
export function formatAdminAuditDetails(details: unknown): string {
  if (details === null || details === undefined) return 'No details recorded.';
  if (typeof details === 'string') return details;
  if (typeof details === 'number' || typeof details === 'boolean') return String(details);
  if (typeof details !== 'object') return 'Audit details could not be displayed.';

  if (!Array.isArray(details)) {
    const record = details as Record<string, unknown>;
    if (Object.keys(record).length === 1 && typeof record.message === 'string') return record.message;
  }
  try {
    return JSON.stringify(details, null, 2) || 'No details recorded.';
  } catch {
    return 'Audit details could not be displayed.';
  }
}

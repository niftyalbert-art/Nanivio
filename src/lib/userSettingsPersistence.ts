import type { UserSettings } from '../types';

export async function saveUserSettings(
  settings: UserSettings,
  token: string | null,
  signal?: AbortSignal,
  send: typeof fetch = fetch,
): Promise<UserSettings> {
  const response = await send('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(settings),
    signal,
  });
  if (!response.ok) throw new Error('Settings were not saved.');
  const result = await response.json();
  if (result?.success !== true || !result.settings || typeof result.settings !== 'object')
    throw new Error('Settings were not confirmed by the server.');
  return result.settings as UserSettings;
}

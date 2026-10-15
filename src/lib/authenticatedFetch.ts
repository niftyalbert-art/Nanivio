import { authClient } from './authClient';

/** Attach account credentials only to this application's API, never a provider URL. */
export function authenticatedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!path.startsWith('/api/') || path.includes('\\')) {
    throw new Error('Authenticated requests must target the local application API.');
  }
  const token = authClient.getToken();
  if (!token) throw new Error('Sign in to use this service.');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(path, { ...init, headers });
}

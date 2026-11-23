// Transport marker, NOT a credential. Authentication requires the HttpOnly cookie.
// Kept for clients that use getToken() to decide whether to open authenticated APIs.
export const BROWSER_SESSION_MARKER = 'nanivio-browser-cookie';
export const BROWSER_SESSION_HEADER = 'x-nanivio-browser-session';

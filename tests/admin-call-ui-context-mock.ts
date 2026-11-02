declare global {
  interface Window {
    __adminCallUiFixtureContext?: Record<string, any>;
  }
}

export function useNanivio() {
  if (!window.__adminCallUiFixtureContext) {
    throw new Error('Admin/call fixture context was not initialized.');
  }
  return window.__adminCallUiFixtureContext;
}

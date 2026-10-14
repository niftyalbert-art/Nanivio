import express from 'express';
import type { Server } from 'http';

const setupMessage = 'Supabase configuration is required. Add SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY to the workspace Secrets, then restart the application.';

/**
 * A development-only setup page, not a fallback application.
 * None of the normal application APIs or realtime handlers are mounted.
 */
export function createSetupPreview() {
  const app = express();
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', (_req, res) => {
    res.status(503).json({
      success: false,
      status: 'setup_required',
      error: setupMessage,
    });
  });
  app.get('*', (_req, res) => {
    res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nanivio — configuration required</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #020617; color: #e2e8f0; font: 16px/1.6 system-ui, sans-serif; }
    main { width: min(540px, calc(100% - 64px)); padding: 32px 0; }
    h1 { font-size: 28px; line-height: 1.2; }
    code { overflow-wrap: anywhere; color: #a5b4fc; }
    p { color: #cbd5e1; }
  </style>
</head>
<body><main>
  <p>Nanivio development preview</p>
  <h1>Configuration required</h1>
  <p>The preview server is running, but the application cannot connect to its persistent database.</p>
  <p>Add the existing Supabase backend configuration in workspace Secrets:</p>
  <ul><li><code>SUPABASE_URL</code></li><li><code>SUPABASE_SERVICE_ROLE_KEY</code></li><li><code>SUPABASE_ANON_KEY</code> (or <code>VITE_SUPABASE_ANON_KEY</code>)</li></ul>
  <p>Then restart the application. Do not enter credentials in chat.</p>
  <p>Sign-in, calls, translation and financial operations remain unavailable. No simulated accounts, calls or balances are enabled.</p>
</main></body></html>`);
  });
  app.use((_req, res) => {
    res.status(503).json({ success: false, status: 'setup_required', error: setupMessage });
  });
  return app;
}

export function rejectSetupRealtime(server: Server) {
  server.on('upgrade', (_req, socket) => {
    socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  });
}

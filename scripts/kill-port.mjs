#!/usr/bin/env node
/**
 * Kill any process holding the given TCP port before starting a dev server.
 * Usage: node scripts/kill-port.mjs <port>
 * Exits 0 always — failure to kill is non-fatal (port may already be free).
 */
import { execSync } from 'child_process';

const port = parseInt(process.argv[2], 10);
if (!port) process.exit(0);

try {
  // lsof -ti :<port>  → list PIDs holding that port, one per line
  const pids = execSync(`lsof -ti :${port} 2>/dev/null`, { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean);

  for (const pid of pids) {
    try {
      process.kill(Number(pid), 9);
      console.log(`[kill-port] killed PID ${pid} (was holding :${port})`);
    } catch { /* already gone */ }
  }
} catch { /* lsof returned nothing — port is free */ }

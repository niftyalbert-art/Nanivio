import { spawn } from 'node:child_process';

// Never print a connection string or inherit psql startup files.
export function postgresClient(env) {
  const secrets = [env.STAGING_DATABASE_URL, env.PGPASSWORD].filter(Boolean);
  const redact = (text) => secrets.reduce((result, secret) =>
    result.replaceAll(secret, '[redacted]'), text);
  function start(sql, extraEnv = {}) {
    const child = spawn('psql', ['-X', '-w', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], {
      env: { ...env, PGCONNECT_TIMEOUT: '15', ...extraEnv },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, 30_000);
    const result = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(stdout.trim());
        else reject(new Error(redact(stderr.trim()
          || (timedOut ? 'psql timed out after 30 seconds' : `psql exited with code ${code}`))));
      });
    });
    child.stdin.on('error', () => {}); // Connection failures are reported by result.
    if (sql !== undefined) child.stdin.end(sql);
    return { child, result };
  }
  return {
    start,
    query: (sql, extraEnv) => start(sql, extraEnv).result,
  };
}

export const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;

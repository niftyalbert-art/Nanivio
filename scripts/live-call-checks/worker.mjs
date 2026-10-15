// Opt-in live verification. Credentials stay in process memory, never in reports.
// This creates exactly two PERSONAL accounts through the normal registration API.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';

const socketPath = process.argv[2];
if (!process.argv.includes('--create-two-accounts') || !socketPath?.startsWith('/tmp/')) {
  throw new Error('Explicit account-creation permission and a private /tmp socket are required.');
}
const origins = {
  workspace: 'http://127.0.0.1:5000',
  render: 'https://nanivioupgrades.onrender.com',
};
const accounts = [];
const report = { startedAt: new Date().toISOString(), accounts: [], runs: [] };
const outputDirectory = 'generated-artifacts/live-call-checks';
await fs.mkdir(outputDirectory, { recursive: true, mode: 0o700 });
if (await fs.stat(`${outputDirectory}/results.json`).then(() => true, () => false)) {
  throw new Error('A live account run already exists. Reuse its worker; do not create duplicate accounts.');
}
if (await fs.stat(socketPath).then(() => true, () => false)) {
  throw new Error('The requested private test socket already exists. No accounts were created.');
}

export async function request(origin, path, account, body, method) {
  const response = await fetch(origin + path, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: {
      'Content-Type': 'application/json',
      ...(account?.token ? { Authorization: `Bearer ${account.token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  return { status: response.status, data };
}

async function writeReport() {
  await fs.writeFile(`${outputDirectory}/results.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
}

// A per-run unpredictable address ensures that unrelated accounts are not reused.
const runId = crypto.randomUUID();
for (const label of ['A', 'B']) {
  const password = crypto.randomBytes(36).toString('base64url');
  const email = `nanivio-qa-${runId}-${label.toLowerCase()}@example.invalid`;
  const result = await request(origins.workspace, '/api/auth/register/personal', null, {
    firstName: 'Nanivio',
    lastName: `QA ${label}`,
    displayName: `Nanivio QA ${label}`,
    email,
    password,
    phoneNumber: '',
    country: '',
    callingCode: '',
    preferredLanguage: 'en',
  });
  if (result.status !== 200 || !result.data.success || !result.data.session?.token) {
    const message = String(result.data.error || 'Registration failed').replaceAll(password, '[redacted]');
    report.creationError = { label, status: result.status, message };
    await writeReport();
    throw new Error(`Test account ${label} registration failed; see the sanitized report. No account was retried.`);
  }
  const user = result.data.user;
  accounts.push({ label, email, password, user, token: result.data.session.token });
  report.accounts.push({ label, id: user.id, nvId: user.nvId, role: user.role, accountStatus: user.accountStatus });
}
await writeReport();

// A 0600 Unix socket lets the local test driver reuse sessions without putting
// passwords or bearer tokens on disk, in shell arguments, or in model output.
let busy = false;
const server = net.createServer(connection => {
  let input = '';
  connection.on('data', async chunk => {
    input += chunk;
    if (!input.includes('\n')) return;
    if (busy) { connection.end(JSON.stringify({ error: 'A live check is already running' }) + '\n'); return; }
    busy = true;
    try {
      const command = JSON.parse(input.split('\n')[0]);
      if (command.action === 'status') {
        connection.end(JSON.stringify({ accounts: report.accounts, runs: report.runs }) + '\n');
      } else if (command.action === 'run' && ['workspace', 'render'].includes(command.origin)) {
        const origin = origins[command.origin];
        const { runChecks } = await import(`./suite.mjs?run=${Date.now()}`);
        const result = await runChecks({ accounts, origin, originName: command.origin, request, outputDirectory });
        report.runs.push(result);
        await writeReport();
        connection.end(JSON.stringify(result) + '\n');
      } else if (command.action === 'browser') {
        const { runBrowserChecks } = await import(`./browser.mjs?run=${Date.now()}`);
        const result = await runBrowserChecks({ accounts, origin: origins.workspace, request, outputDirectory });
        report.runs.push(result);
        await writeReport();
        connection.end(JSON.stringify(result) + '\n');
      } else if (command.action === 'stop') {
        connection.end(JSON.stringify({ stopped: true, accountsRetained: true }) + '\n');
        server.close();
        await fs.unlink(socketPath).catch(() => {});
        accounts.length = 0;
      } else {
        connection.end(JSON.stringify({ error: 'Unknown live-check command' }) + '\n');
      }
    } catch (error) {
      // Do not include provider bodies, request headers, or authentication data.
      connection.end(JSON.stringify({ error: error.name, message: 'Live check did not complete; credentials were not logged.' }) + '\n');
    } finally {
      busy = false;
    }
  });
});
server.listen(socketPath, async () => {
  await fs.chmod(socketPath, 0o600);
  console.log(JSON.stringify({ ready: true, accountCount: accounts.length, credentialsLogged: false }));
});

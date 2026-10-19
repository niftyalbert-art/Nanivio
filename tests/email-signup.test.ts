import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { EmailSignupService, normalizeSignupEmail, type EmailSignupStore } from '../src/server/emailSignup';

const db = new PGlite();
const delivered: { email: string; code: string }[] = [];
const identity = { email: 'Person@Example.test ', phoneNumber: '+14155552671' };
async function scalar(sql: string, params: unknown[] = []) {
  return Object.values((await db.query(sql, params)).rows[0] as Record<string, unknown>)[0] as any;
}
const store: EmailSignupStore = {
  async assertAvailable(email, phone) {
    if (!await scalar('SELECT nanivio_signup_identity_available($1,$2)', [email, phone])) throw new Error('already registered');
  },
  reserve: (email, phone, ip, id, hash) => scalar('SELECT nanivio_reserve_signup_email($1,$2,$3,$4,$5)', [email, phone, ip, id, hash]),
  async markSent(email, id) {
    await db.query('UPDATE nanivio_signup_email_challenges SET sent=true WHERE email=$1 AND id=$2', [email, id]);
  },
  verify: (email, phone, code, proof) => scalar('SELECT nanivio_verify_signup_email($1,$2,$3,$4)', [email, phone, code, proof]),
  consume: (email, phone, proof) => scalar('SELECT nanivio_consume_signup_email($1,$2,$3)', [email, phone, proof]),
};
const service = new EmailSignupService(store, async (email, code) => { delivered.push({ email, code }); }, () => 'test-only-hmac-key');

before(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE public.nanivio_users (
      id text PRIMARY KEY, email text, phone text, calling_code text
    );
  `);
  await db.exec(await readFile('migrations/010_email_first_signup.sql', 'utf8'));
});
after(async () => { await db.close(); });
beforeEach(async () => {
  delivered.length = 0;
  await db.exec('TRUNCATE nanivio_users,nanivio_signup_email_challenges,nanivio_signup_email_limits');
});

test('normalizes email without treating provider-specific aliases as the same address', () => {
  assert.equal(normalizeSignupEmail(' Person+tag@Example.COM '), 'person+tag@example.com');
  for (const invalid of ['', 'not-an-email', null, 'a\n@b.com']) assert.throws(() => normalizeSignupEmail(invalid));
});

test('real migration executes; email proof is bound to both identities and consumed once', async () => {
  assert.equal((await service.send(identity, 'test-ip')).success, true);
  assert.equal(delivered[0].email, 'person@example.test');
  assert.match(delivered[0].code, /^\d{6}$/);
  const proof = await service.verify(identity, delivered[0].code);
  assert.equal(proof.verifiedEmail, 'person@example.test');
  assert.equal(proof.verifiedPhone, identity.phoneNumber);
  const row: any = (await db.query('SELECT * FROM nanivio_signup_email_challenges')).rows[0];
  assert.notEqual(row.code_hash, delivered[0].code);
  assert.notEqual(row.proof_hash, proof.verificationToken);
  await assert.rejects(service.consumeProof(proof.verificationToken, 'other@example.test', identity.phoneNumber));
  await assert.rejects(service.consumeProof(proof.verificationToken, identity.email, '+447911123456'));
  await service.consumeProof(proof.verificationToken, identity.email, identity.phoneNumber);
  await assert.rejects(service.consumeProof(proof.verificationToken, identity.email, identity.phoneNumber), /already used/);
});

test('code cannot approve a changed email/phone; five wrong checks exhaust the challenge', async () => {
  await service.send(identity, 'test-ip');
  await assert.rejects(service.verify({ ...identity, phoneNumber: '+447911123456' }, delivered[0].code));
  await assert.rejects(service.verify({ ...identity, email: 'other@example.test' }, delivered[0].code));
  const wrong = delivered[0].code === '000000' ? '000001' : '000000';
  for (let n = 0; n < 5; n++) await assert.rejects(service.verify(identity, wrong));
  await assert.rejects(service.verify(identity, delivered[0].code));
});

test('expired codes and expired proofs are denied', async () => {
  await service.send(identity, 'test-ip');
  await db.exec("UPDATE nanivio_signup_email_challenges SET expires_at=now()-interval '1 second'");
  await assert.rejects(service.verify(identity, delivered[0].code));
  await db.exec("UPDATE nanivio_signup_email_challenges SET expires_at=now()+interval '1 minute'");
  const proof = await service.verify(identity, delivered[0].code);
  await db.exec("UPDATE nanivio_signup_email_challenges SET verified_until=now()-interval '1 second'");
  await assert.rejects(service.consumeProof(proof.verificationToken, identity.email, identity.phoneNumber));
});

test('concurrent send requests result in one delivery, including across service instances', async () => {
  const second = new EmailSignupService(store, async (email, code) => { delivered.push({ email, code }); }, () => 'test-only-hmac-key');
  const results = await Promise.allSettled([service.send(identity, 'test-ip'), second.send(identity, 'test-ip')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(delivered.length, 1);
});

test('resending replaces old codes and proofs; delivery failure never yields approval', async () => {
  await service.send(identity, 'test-ip');
  const proof = await service.verify(identity, delivered[0].code);
  await db.exec("UPDATE nanivio_signup_email_challenges SET last_sent_at=now()-interval '61 seconds'");
  await service.send(identity, 'test-ip');
  await assert.rejects(service.consumeProof(proof.verificationToken, identity.email, identity.phoneNumber));
  const failing = new EmailSignupService(store, async () => { throw new Error('not sent'); }, () => 'test-only-hmac-key');
  await assert.rejects(failing.send({ ...identity, email: 'failure@example.test' }, 'test-ip'), /not sent/);
  const row: any = (await db.query("SELECT sent FROM nanivio_signup_email_challenges WHERE email='failure@example.test'")).rows[0];
  assert.equal(row.sent, false);
});

test('per-email and per-phone hourly limits persist when service objects are recreated', async () => {
  for (let n = 0; n < 5; n++) {
    await service.send(identity, 'test-ip');
    await db.exec("UPDATE nanivio_signup_email_challenges SET last_sent_at=now()-interval '61 seconds'");
  }
  await assert.rejects(service.send(identity, 'different-ip'), /Too many/);
  await assert.rejects(service.send({ ...identity, email: 'another@example.test' }, 'different-ip'), /Too many/);
  assert.equal(delivered.length, 5);
});

test('simultaneous proof consumption approves exactly one registration attempt', async () => {
  await service.send(identity, 'test-ip');
  const proof = await service.verify(identity, delivered[0].code);
  const attempts = await Promise.allSettled(Array.from({ length: 4 }, () =>
    service.consumeProof(proof.verificationToken, identity.email, identity.phoneNumber)));
  assert.equal(attempts.filter(r => r.status === 'fulfilled').length, 1);
});

test('database uniqueness rejects case/space email variants and international phone format variants', async () => {
  await db.query('INSERT INTO nanivio_users VALUES($1,$2,$3,$4)', ['existing', 'Person@Example.test ', '020 7946 0958', '+44']);
  assert.equal(await scalar('SELECT nanivio_signup_identity_available($1,$2)', ['person@example.test', '+14155552671']), false);
  assert.equal(await scalar('SELECT nanivio_signup_identity_available($1,$2)', ['other@example.test', '+442079460958']), false);
  await assert.rejects(db.query("INSERT INTO nanivio_users VALUES('email-duplicate','person@example.test','+14155552671','+1')"), /unique/);
  await assert.rejects(db.query("INSERT INTO nanivio_users VALUES('phone-duplicate','other@example.test','+442079460958','+44')"), /unique/);
  assert.equal(await scalar("SELECT count(*) FROM nanivio_users"), 1);
});

test('anonymous/authenticated roles cannot call signup verification RPCs or read challenges', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(db.query('SELECT * FROM nanivio_signup_email_challenges'), /permission denied/);
    await assert.rejects(db.query("SELECT nanivio_signup_identity_available('x@example.test','+14155552671')"), /permission denied/);
    await db.exec('RESET ROLE');
  }
});

test('all registration roles use email proof; public paid signup SMS endpoints are disabled', async () => {
  const server = await readFile('server.ts', 'utf8');
  const auth = await readFile('src/server/persistentAuth.ts', 'utf8');
  assert.match(auth, /await emailSignupService\.consumeProof/);
  assert.doesNotMatch(auth, /validateVerifiedToken/);
  for (const role of ['PERSONAL', 'EXPERT', 'BUSINESS', 'DRIVER']) assert.ok(auth.includes(`createAccount(`) && auth.includes(`'${role}'`));
  assert.match(server, /app\.post\(\["\/api\/auth\/phone\/otp\/send", "\/api\/auth\/phone\/otp\/verify"\]/);
  assert.doesNotMatch(server, /otpService\.sendOtp/);
  const panel = await readFile('src/components/auth/NanivioAuthScreen.tsx', 'utf8');
  assert.match(panel, /EmailVerification/);
  assert.doesNotMatch(panel, /<PhoneVerification/);
});

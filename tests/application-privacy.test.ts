import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sanitizeApplication, publicApplicationProfile } from '../src/server/applicationPrivacy';

const application = {
  id: 'test-application', userId: 'test-user', nvId: '0486123456', status: 'VERIFIED',
  personal: { firstName: 'Test', lastName: 'Expert', password: 'test-only-password',
    confirm_password: 'test-only-confirmation', email: 'private@example.invalid',
    phoneNumber: 'private-phone', avatar: '/profile.png', country: 'Ghana', city: 'Accra',
    preferredLanguage: 'en', accessToken: 'test-only-token' },
  title: 'Consultant', category: 'Education', specialties: ['Learning'], bio: 'Public biography',
  services: ['Consultation'], qualifications: ['Public qualification'], consultationTypes: ['audio'],
  ratePerMinGHS: 2, ratePerMinUSD: 1, languages: ['en'],
  payoutAccount: 'private-bank-account', licenses: 'private-license',
  documentNames: ['private-document'], adminNotes: 'private-notes',
  nested: [{ clientSecret: 'test-only-secret', safe: 'retained', deeper: { API_KEY: 'test-only-key' } }],
  businessName: 'Public Business', businessType: 'Consultancy',
  contactEmail: 'business@example.invalid', contactPhone: 'public-business-contact',
  authorizedRepresentative: { email: 'private-representative@example.invalid' },
  verificationDocuments: ['private-verification'],
};
const sanitized = sanitizeApplication(application);
const json = JSON.stringify(sanitized);
assert.doesNotMatch(json, /test-only-/);
assert.equal(sanitized.personal.firstName, 'Test');
assert.equal(sanitized.nested[0].safe, 'retained');
assert.equal(application.personal.password, 'test-only-password', 'Auth input must not be mutated');
assert.deepEqual(sanitizeApplication(null), null);
assert.deepEqual(sanitizeApplication({ passwordHash: 'test-only-hash', safe: [null, 'value'] }), { safe: [null, 'value'] });

for (const type of ['EXPERT', 'BUSINESS'] as const) {
  const profile = publicApplicationProfile(application, type);
  const publicJson = JSON.stringify(profile);
  assert.doesNotMatch(publicJson, /private[-@]|test-only-|personal|payoutAccount|adminNotes|documentNames|verificationDocuments|authorizedRepresentative/);
  assert.equal(profile.userId, 'test-user');
  assert.equal(profile.status, 'VERIFIED');
  assert.equal(profile.category, 'Education');
}
assert.equal((publicApplicationProfile(application, 'EXPERT') as any).fullName, 'Test Expert');
assert.equal((publicApplicationProfile(application, 'BUSINESS') as any).contactEmail, 'business@example.invalid');
assert.equal((publicApplicationProfile({ title: { hidden: 'private-field' } }, 'EXPERT') as any).title, undefined);

// Route/repository contracts guard against accidentally reconnecting public APIs to raw applications.
const server = readFileSync('server.ts', 'utf8');
const publicRoutes = server.slice(server.indexOf('app.get("/api/services/experts/live"'), server.indexOf('// Admin Feature Switches'));
assert.doesNotMatch(publicRoutes, /persistentAuth\.listApplications\(/);
assert.equal((publicRoutes.match(/persistentAuth\.listPublicApplications\(/g) || []).length, 4);
const purchaseRoute = server.slice(server.indexOf('app.post("/api/billing/communication-minutes/purchase"'), server.indexOf('app.get("/api/billing/malvi-plans"'));
assert.match(purchaseRoute, /purchaseCommunicationMinutesFromWalletPersistent\(/);
assert.doesNotMatch(purchaseRoute, /await purchaseCommunicationMinutesPersistent\(/);
const repository = readFileSync('src/server/normalizedBillingRepository.ts', 'utf8');
assert.match(repository, /purchaseCommunicationMinutesFromWalletPersistent[\s\S]*?billingCommand\('COMMUNICATION_MINUTES_FROM_WALLET'/);
const malviRoute = server.slice(server.indexOf('app.post("/api/billing/malvi-subscription/change"'), server.indexOf('app.get("/api/billing/langpretation/meter"'));
assert.match(malviRoute, /await activateMalviSubscriptionFromWalletPersistent\(/);
assert.doesNotMatch(malviRoute, /await activateMalviSubscriptionPersistent\(/);
assert.match(repository, /activateMalviSubscriptionFromWalletPersistent[\s\S]*?billingCommand\('MALVI_SUBSCRIPTION_FROM_WALLET'/);
console.log('PASS: recursive credential removal, immutable auth input, public allowlists and wallet/public route contracts');

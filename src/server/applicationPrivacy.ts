const credentialKey = (key: string) =>
  /(password|token|secret|credential|authorization|apikey|privatekey)/.test(key.toLowerCase().replace(/[^a-z0-9]/g, ''));

/** Keep credentials only in the authentication provider, never application records. */
export function sanitizeApplication<T>(value: T): T {
  if (Array.isArray(value)) return value.map(sanitizeApplication) as T;
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !credentialKey(key))
    .map(([key, child]) => [key, sanitizeApplication(child)])) as T;
}

const text = (value: unknown) => typeof value === 'string' ? value : undefined;
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];

/** Public directories must not serialize applications, personal contacts or review documents. */
export function publicApplicationProfile(application: any, type: 'EXPERT' | 'BUSINESS') {
  const app = sanitizeApplication(application);
  const personal = app.personal || {};
  const common = {
    id: text(app.id), userId: text(app.userId), nvId: text(app.nvId),
    country: text(app.country) || text(personal.country),
    state: text(app.state) || text(personal.state),
    city: text(app.city) || text(personal.city),
    location: text(app.location) || [personal.city, personal.state, personal.country].filter((v) => typeof v === 'string').join(', '),
    category: text(app.category), services: strings(app.services),
    status: text(app.status), submittedAt: number(app.submittedAt),
    isOnline: app.isOnline === true, featured: app.featured === true,
  };
  if (type === 'EXPERT') {
    return {
      ...common,
      fullName: text(app.fullName) || text(personal.displayName) ||
        [personal.firstName, personal.lastName].filter((v) => typeof v === 'string').join(' '),
      avatar: text(app.avatar) || text(personal.avatar),
      languages: strings(app.languages).length ? strings(app.languages) :
        strings(personal.spokenLanguages).length ? strings(personal.spokenLanguages) :
        typeof personal.preferredLanguage === 'string' ? [personal.preferredLanguage] : [],
      title: text(app.title), specialties: strings(app.specialties), bio: text(app.bio),
      experienceYears: number(app.experienceYears), consultationTypes: strings(app.consultationTypes),
      ratePerMinGHS: number(app.ratePerMinGHS), ratePerMinUSD: number(app.ratePerMinUSD),
      workingHours: text(app.workingHours), qualifications: strings(app.qualifications),
    };
  }
  return {
    ...common, businessNvId: text(app.businessNvId),
    businessName: text(app.businessName), businessLogo: text(app.businessLogo),
    businessType: text(app.businessType), description: text(app.description),
    // These are explicitly supplied business contact fields, not personal contacts.
    contactEmail: text(app.contactEmail), contactPhone: text(app.contactPhone),
    website: text(app.website), operatingHours: text(app.operatingHours),
  };
}

/** Application JSON is not an authentication store. Credentials must remain
 * only in the separate input passed to the authentication provider. */
const secretFields = new Set([
  'token', 'accesstoken', 'refreshtoken', 'idtoken', 'authtoken', 'sessiontoken',
  'apikey', 'apisecret', 'clientsecret', 'privatekey', 'masterkey',
  'authorization', 'credentials', 'secret', 'secrets', 'securityanswer',
  'securityquestionanswer', 'otp', 'verificationcode', '__proto__', 'constructor', 'prototype',
]);

export function redactApplicationSecrets<T>(payload: T): T {
  const ancestors = new WeakSet<object>();
  const redact = (value: unknown, depth: number): unknown => {
    if (depth > 64) throw new Error('Application data is too deeply nested.');
    if (value === null || typeof value !== 'object') return value;
    if (ancestors.has(value)) throw new Error('Application data must not contain cycles.');
    ancestors.add(value);
    try {
      if (Array.isArray(value)) return value.map(item => redact(item, depth + 1));
      return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
        const normalized = key.toLowerCase().replace(/[\s_-]/g, '');
        if (normalized.includes('password') || secretFields.has(normalized) ||
          ['__proto__', 'constructor', 'prototype'].includes(key)) return [];
        return [[key, redact(item, depth + 1)]];
      }));
    } finally {
      ancestors.delete(value);
    }
  };
  return redact(payload, 0) as T;
}

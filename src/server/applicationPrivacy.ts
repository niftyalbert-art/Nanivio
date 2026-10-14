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

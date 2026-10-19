import { ReplitConnectors } from '@replit/connectors-sdk';

type DeliveryEnv = Record<string, string | undefined>;
type ProxySend = (body: string) => Promise<Response>;

function configuration(env: DeliveryEnv) {
  const from = env.RESEND_FROM_EMAIL?.trim();
  const transport = env.RESEND_TRANSPORT || 'direct';
  if (!from || /[\r\n]/.test(from) || !['direct', 'connector'].includes(transport)
    || (transport === 'direct' && !env.RESEND_API_KEY)) {
    throw new Error('Email verification is not configured yet. Please contact support.');
  }
  return { from, transport };
}

export function assertSignupEmailConfigured() {
  configuration(process.env);
}

async function connectorSend(body: string) {
  // Create a fresh client; the SDK manages identity and credential refresh.
  const connectors = new ReplitConnectors();
  return connectors.proxy('resend', '/emails', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
  });
}

export function createSignupEmailSender(
  env: () => DeliveryEnv = () => process.env,
  directFetch: typeof fetch = fetch,
  proxySend: ProxySend = connectorSend,
) {
  return async (email: string, code: string) => {
    const current = env();
    const { from, transport } = configuration(current);
    const body = JSON.stringify({
      from, to: [email], subject: 'Your Nanivio verification code',
      text: `Your Nanivio email verification code is ${code}.\n\nIt expires in 10 minutes. Do not share this code. If you did not request it, you can ignore this email.`,
    });
    try {
      // Select one transport explicitly. Never retry through another transport:
      // an uncertain response can still mean the email was accepted.
      const response = transport === 'connector'
        ? await proxySend(body)
        : await directFetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${current.RESEND_API_KEY}`,
            'Content-Type': 'application/json', 'User-Agent': 'Nanivio',
          },
          redirect: 'error', signal: AbortSignal.timeout(15_000), body,
        });
      if (!response.ok) {
        console.error('[Signup email] Delivery rejected', { status: response.status });
        throw new Error('delivery_rejected');
      }
      const result = await response.json();
      if (typeof result.id !== 'string' || !result.id) throw new Error('invalid_delivery_response');
    } catch {
      // Never expose raw provider responses, credentials, recipient or code.
      throw new Error('We could not send your verification email. Please try again later.');
    }
  };
}

export const sendSignupEmail = createSignupEmailSender();

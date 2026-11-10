/** One explicit Supabase operation per call. Never retry an uncertain password update. */
export function createRecoveryProvider(env = process.env, transport: typeof fetch = fetch) {
  const url = env.SUPABASE_URL?.replace(/\/$/, '');
  const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key || !env.SUPABASE_SERVICE_ROLE_KEY) throw Error('Password recovery is not configured.');
  async function request(path: string, body: object, token = key!, method = 'POST', admin = false) {
    const response = await transport(`${url}/auth/v1/${path}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(12000),
      headers: { 'Content-Type': 'application/json', apikey: admin ? env.SUPABASE_SERVICE_ROLE_KEY! : key!,
        Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw Error('Recovery provider operation was not confirmed.');
    if (response.status === 204) return {};
    return response.json();
  }
  return {
    async send(email: string, challenge: string, redirectTo: string) {
      await request(`recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
        email, code_challenge: challenge, code_challenge_method: 's256',
      });
    },
    async exchange(code: string, verifier: string) {
      const data = await request('token?grant_type=pkce', { auth_code: code, code_verifier: verifier });
      if (!data.user?.id || !data.access_token || !Number.isFinite(data.expires_in)) throw Error('Recovery link was not confirmed.');
      return { authId: String(data.user.id), token: String(data.access_token), expiresIn: Number(data.expires_in) };
    },
    async update(token: string, password: string, authId: string) {
      const data = await request('user', { password }, token, 'PUT');
      if (data.id !== authId) throw Error('Password change was not confirmed.');
    },
    async revoke(token: string) {
      await request('logout?scope=global', {}, token, 'POST', true);
    },
  };
}

type AccountIdentity = { accountStatus?: string } | null | undefined;

/** An inactive profile is not authority to use paid features or change data. */
export function accountMayUseRoute(user: AccountIdentity, method: string, path: string): boolean {
  if (!user) return false;
  if (user.accountStatus === 'ACTIVE') return true;
  // Keep narrow, authenticated self-service privacy paths available. These
  // handlers always derive the owner from the session, never a supplied ID.
  const inactive = user.accountStatus === 'DEACTIVATED' || user.accountStatus === 'SUSPENDED';
  return inactive && (
    (path === '/api/langpretation/voice-profile' && (method === 'GET' || method === 'DELETE')) ||
    (path === '/api/account-deletion/request' && method === 'GET')
  );
}

export function assertAccountMaySignIn(status: unknown): void {
  if (status !== 'ACTIVE') {
    throw new Error('This account is not active. Use the Nanivio account deletion page for account-and-data removal requests.');
  }
}

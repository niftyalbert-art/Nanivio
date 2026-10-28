/** Only personal allowance exhaustion should suggest buying a subscription. */
export function malviAllowanceIsUsedUp(message: string | null): boolean {
  return !!message && /\byour malvi allowance is used up\b/i.test(message);
}

export function openMalviSubscriptionPlans(navigation: {
  close: () => void;
  setPendingBillingAction: (action: { subTab: 'malvi'; purpose: 'MALVI_SUBSCRIPTION' }) => void;
  setActiveTab: (tab: 'billing') => void;
}) {
  // Stop the live session and microphone before navigating. Do not preselect a
  // paid plan: users must be able to compare plans without starting checkout.
  navigation.close();
  navigation.setPendingBillingAction({ subTab: 'malvi', purpose: 'MALVI_SUBSCRIPTION' });
  navigation.setActiveTab('billing');
}

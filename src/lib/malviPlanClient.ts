import { protectedBillingRequest } from './billingClient';
import type { MalviCatalogPlan, MalviCatalogResponse } from './malviPlanCatalog';

export function loadMalviPlanCatalog(): Promise<MalviCatalogResponse> {
  return protectedBillingRequest('/api/admin/billing/malvi-plans');
}
export function saveMalviPlanCatalog(input: {
  expectedVersion: number; plans: MalviCatalogPlan[]; reason: string;
}): Promise<MalviCatalogResponse> {
  return protectedBillingRequest('/api/admin/billing/malvi-plans/save', {
    method: 'POST', body: JSON.stringify(input),
  });
}

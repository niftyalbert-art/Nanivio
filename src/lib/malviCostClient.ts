import { protectedBillingRequest } from './billingClient';
import type { MalviCostRates, MalviCostResponse, MalviCostScenario } from './malviBillingCalculator';

export function loadMalviCostModel(): Promise<MalviCostResponse> {
  return protectedBillingRequest('/api/admin/billing/malvi-costs');
}

export function saveMalviCostModel(input: {
  rates: MalviCostRates;
  scenario: MalviCostScenario;
  expectedVersion: number;
  reason: string;
}): Promise<MalviCostResponse> {
  return protectedBillingRequest('/api/admin/billing/malvi-costs/save', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

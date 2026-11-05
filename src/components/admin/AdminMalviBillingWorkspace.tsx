import React, { useState } from 'react';
import { Calculator, Layers3, WalletCards } from 'lucide-react';
import { AdminMalviCostCalculator } from './AdminMalviCostCalculator';
import { AdminMalviPlanManager } from './AdminMalviPlanManager';
import { AdminCryptoPayments } from '../billing/AdminCryptoPayments';

type WorkspaceSection = 'plans' | 'calculator' | 'crypto';

export const AdminMalviBillingWorkspace: React.FC = () => {
  const [section, setSection] = useState<WorkspaceSection>('plans');
  const sections: { id: WorkspaceSection; label: string; icon: typeof Layers3 }[] = [
    { id: 'plans', label: 'Plans', icon: Layers3 },
    { id: 'calculator', label: 'Cost calculator', icon: Calculator },
    { id: 'crypto', label: 'Crypto payments', icon: WalletCards },
  ];

  return (
    <section className="w-full min-w-0 space-y-5" aria-label="Malvi billing workspace">
      <div className="flex gap-2 overflow-x-auto border-b border-slate-800 pb-2" role="tablist" aria-label="Malvi billing tools">
        {sections.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            id={`malvi-billing-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={section === id}
            aria-controls={`malvi-billing-panel-${id}`}
            tabIndex={section === id ? 0 : -1}
            onClick={() => setSection(id)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault();
                const order: WorkspaceSection[] = ['plans', 'calculator', 'crypto'];
                const index = order.indexOf(section);
                const next = order[(index + (event.key === 'ArrowRight' ? 1 : order.length - 1)) % order.length];
                setSection(next);
                document.getElementById(`malvi-billing-tab-${next}`)?.focus();
              }
            }}
            className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-amber-400 ${section === id ? 'bg-amber-400 text-slate-950' : 'border border-slate-800 bg-slate-900/70 text-slate-300 hover:border-amber-400/50 hover:text-white'}`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />{label}
          </button>
        ))}
      </div>
      <div id="malvi-billing-panel-plans" role="tabpanel" aria-labelledby="malvi-billing-tab-plans" hidden={section !== 'plans'}>
        {section === 'plans' && <AdminMalviPlanManager />}
      </div>
      <div id="malvi-billing-panel-calculator" role="tabpanel" aria-labelledby="malvi-billing-tab-calculator" hidden={section !== 'calculator'}>
        {section === 'calculator' && <AdminMalviCostCalculator />}
      </div>
      <div id="malvi-billing-panel-crypto" role="tabpanel" aria-labelledby="malvi-billing-tab-crypto" hidden={section !== 'crypto'}>
        {section === 'crypto' && <AdminCryptoPayments />}
      </div>
    </section>
  );
};

export default AdminMalviBillingWorkspace;

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useGetSupportedCountries } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Clock, TrendingUp, ArrowLeftRight, ChevronDown, ChevronUp, Calculator } from 'lucide-react';
import { groupByRegion } from '@/lib/regions';

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '') + '/api';

// ── Rate calculator state (shared across cards, resets when a different card opens) ──
interface CalcState {
  amount: string;
  fromCurrency: string;
  toCurrency: string;
}

export default function Countries() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [calc, setCalc] = useState<CalcState>({ amount: '100', fromCurrency: 'USD', toCurrency: '' });

  const { data: countries, isLoading } = useGetSupportedCountries();

  const { data: allRates } = useQuery<{ code: string; rateToUsd: number }[]>({
    queryKey: ['rates-all'],
    queryFn: () => fetch(`${API_BASE}/rates/all`).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const rateMap = useMemo(() => {
    const m: Record<string, number> = {};
    allRates?.forEach(r => { m[r.code] = r.rateToUsd; });
    return m;
  }, [allRates]);

  // All available currencies for the selects (sorted alphabetically)
  const currencyList = useMemo(() => Object.keys(rateMap).sort(), [rateMap]);

  // Compute the conversion result
  const calcResult = useMemo(() => {
    const amt = parseFloat(calc.amount);
    if (!amt || !calc.fromCurrency || !calc.toCurrency) return null;
    if (calc.fromCurrency === calc.toCurrency) return amt;
    const fromRate = rateMap[calc.fromCurrency]; // units per 1 USD
    const toRate   = rateMap[calc.toCurrency];
    if (!fromRate || !toRate) return null;
    // Convert: amt fromCurrency → USD → toCurrency
    const inUsd = amt / fromRate;
    return inUsd * toRate;
  }, [calc, rateMap]);

  const filtered = countries?.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.currencyCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.currencyName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const grouped = useMemo(() => {
    if (!filtered) return [];
    return groupByRegion(filtered, c => c.code);
  }, [filtered]);

  const openCalc = (code: string, currencyCode: string) => {
    if (activeCode === code) {
      setActiveCode(null);
      return;
    }
    setActiveCode(code);
    setCalc(prev => ({ amount: prev.amount || '100', fromCurrency: 'USD', toCurrency: currencyCode }));
  };

  const swapCurrencies = () => {
    setCalc(prev => ({ ...prev, fromCurrency: prev.toCurrency, toCurrency: prev.fromCurrency }));
  };

  const formatResult = (val: number) => {
    if (val >= 10000) return val.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (val >= 100)   return val.toLocaleString('en-US', { maximumFractionDigits: 2 });
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-44" />)}
        </div>
      </div>
    );
  }

  const CountryCard = ({ country }: { country: NonNullable<typeof countries>[0] }) => {
    const rate     = rateMap[country.currencyCode];
    const usdRate  = rate && rate > 0 ? rate : null;          // X per 1 USD
    const isOpen   = activeCode === country.code;

    return (
      <div className="rounded-xl border border-border overflow-hidden transition-all">
        {/* ── Card header — click to open/close calculator ── */}
        <button
          type="button"
          className="w-full text-left"
          onClick={() => openCalc(country.code, country.currencyCode)}
          data-testid={`country-${country.code}`}
        >
          <div className={`p-4 md:p-5 space-y-3 transition-colors ${isOpen ? 'bg-primary/5 border-b border-primary/20' : 'bg-card hover:bg-muted/30'}`}>
            {/* Flag + name row */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 md:gap-3 min-w-0">
                <span className="text-3xl md:text-4xl shrink-0">{country.flag}</span>
                <div className="min-w-0">
                  <h3 className="font-bold text-sm md:text-base truncate">{country.name}</h3>
                  <p className="text-xs text-muted-foreground truncate">{country.currencyName}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {country.popular && (
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                    Popular
                  </Badge>
                )}
                {isOpen
                  ? <ChevronUp className="w-4 h-4 text-primary" />
                  : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>

            {/* Quick stats row */}
            <div className="pt-2 border-t border-border space-y-1.5">
              {usdRate !== null && (
                <div className="flex items-start justify-between gap-2 text-xs md:text-sm">
                  <span className="text-muted-foreground flex items-center gap-1.5 shrink-0 whitespace-nowrap pt-px">
                    <TrendingUp className="w-3 h-3" /> Rate
                  </span>
                  <span className="font-semibold font-mono text-right min-w-0 break-all">
                    1 USD = {usdRate >= 1000
                      ? usdRate.toLocaleString('en-US', { maximumFractionDigits: 0 })
                      : usdRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
                    } {country.currencyCode}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between gap-2 text-xs md:text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                  <Clock className="w-3 h-3" /> Transfer Fee
                </span>
                <span className="font-semibold text-right">{country.transferFee}%</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs md:text-sm">
                <span className="text-muted-foreground shrink-0 whitespace-nowrap">Est. Time</span>
                <span className="font-semibold text-right">{country.estimatedTime}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs md:text-sm pt-0.5">
                <span className="text-muted-foreground flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                  <Calculator className="w-3 h-3" /> Calculator
                </span>
                <span className="text-xs text-primary font-medium">{isOpen ? 'Hide ↑' : 'Open ↓'}</span>
              </div>
            </div>
          </div>
        </button>

        {/* ── Rate calculator panel ── */}
        {isOpen && (
          <div className="p-4 space-y-3 bg-card">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Currency Calculator</p>

            {/* You send row */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">You send</p>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="Amount"
                  value={calc.amount}
                  onChange={e => setCalc(c => ({ ...c, amount: e.target.value }))}
                  className="font-mono flex-1 min-w-0"
                />
                <select
                  className="flex-1 min-w-0 text-sm border border-border rounded-lg px-2.5 py-2 bg-background font-mono"
                  value={calc.fromCurrency}
                  onChange={e => setCalc(c => ({ ...c, fromCurrency: e.target.value }))}
                >
                  {currencyList.map(code => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Swap button */}
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 rounded-full"
                onClick={swapCurrencies}
              >
                <ArrowLeftRight className="w-3.5 h-3.5 rotate-90" />
              </Button>
            </div>

            {/* Recipient gets row */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Recipient gets</p>
              <div className="flex gap-2">
                <div className="font-mono flex-1 min-w-0 h-10 flex items-center px-3 rounded-lg bg-primary/10 border border-primary/20 text-primary font-bold text-sm overflow-hidden">
                  <span className="truncate">{calcResult !== null ? formatResult(calcResult) : '—'}</span>
                </div>
                <select
                  className="flex-1 min-w-0 text-sm border border-border rounded-lg px-2.5 py-2 bg-background font-mono"
                  value={calc.toCurrency}
                  onChange={e => setCalc(c => ({ ...c, toCurrency: e.target.value }))}
                >
                  {currencyList.map(code => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Summary line */}
            {calcResult !== null && calc.amount && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Exchange rate</span>
                  <span className="font-mono font-semibold">
                    1 {calc.fromCurrency} = {(() => {
                      const fR = rateMap[calc.fromCurrency], tR = rateMap[calc.toCurrency];
                      if (!fR || !tR) return '—';
                      const r = tR / fR;
                      return (r >= 1000
                        ? r.toLocaleString('en-US', { maximumFractionDigits: 0 })
                        : r.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })) + ' ' + calc.toCurrency;
                    })()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Transfer fee ({country.transferFee}%)</span>
                  <span className="font-mono font-semibold text-amber-500">
                    {(() => {
                      const fR = rateMap[calc.fromCurrency];
                      if (!fR) return '—';
                      const amtUsd = parseFloat(calc.amount) / fR;
                      const feeUsd = amtUsd * (country.transferFee / 100);
                      return feeUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' USD';
                    })()}
                  </span>
                </div>
                <div className="border-t border-border pt-1.5 flex justify-between font-semibold">
                  <span>Total you pay</span>
                  <span className="font-mono text-primary">
                    {parseFloat(calc.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {calc.fromCurrency}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 md:p-8 space-y-5 md:space-y-8">
      <div>
        <h1 className="text-2xl md:text-4xl font-bold tracking-tight mb-1">Supported Countries</h1>
        <p className="text-sm text-muted-foreground">
          Send money to {countries?.length} countries worldwide — click any country to open the rate calculator
        </p>
      </div>

      <div className="relative w-full md:max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search countries or currencies..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
          data-testid="input-search-countries"
        />
      </div>

      {filtered?.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Search className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-20" />
            <h3 className="text-base font-semibold mb-1">No countries found</h3>
            <p className="text-sm text-muted-foreground">Try adjusting your search</p>
          </CardContent>
        </Card>
      )}

      {grouped.map(({ group, items }) => (
        <div key={group} className="space-y-3">
          <h2 className="text-base md:text-lg font-bold tracking-tight flex items-center gap-2">
            <span className="text-primary">{
              group.startsWith('Africa') ? '🌍' :
              group === 'Middle East' ? '🕌' :
              group === 'Asia' ? '🌏' :
              group === 'Europe' ? '🌎' :
              group === 'Americas' ? '🌎' : '🌐'
            }</span>
            {group}
            <span className="text-xs font-normal text-muted-foreground">({items.length})</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-5">
            {items.map((c) => <CountryCard key={c.code} country={c} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

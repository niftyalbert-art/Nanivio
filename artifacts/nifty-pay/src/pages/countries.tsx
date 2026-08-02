import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useGetSupportedCountries } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Clock, TrendingUp } from 'lucide-react';
import { groupByRegion } from '@/lib/regions';

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '') + '/api';

export default function Countries() {
  const [searchQuery, setSearchQuery] = useState('');
  const { data: countries, isLoading } = useGetSupportedCountries();

  // Live exchange rates to show vs USD
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

  const filtered = countries?.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.currencyCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.currencyName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // When searching, show flat list; otherwise group by region
  const grouped = useMemo(() => {
    if (!filtered) return [];
    return groupByRegion(filtered, c => c.code);
  }, [filtered]);

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
    const rate = rateMap[country.currencyCode];
    const usdRate = rate && rate > 0 ? (1 / rate) : null;
    return (
      <Card className="hover:border-primary/50 transition-colors" data-testid={`country-${country.code}`}>
        <CardContent className="p-4 md:p-5 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 md:gap-3 min-w-0">
              <span className="text-3xl md:text-4xl shrink-0">{country.flag}</span>
              <div className="min-w-0">
                <h3 className="font-bold text-sm md:text-base truncate">{country.name}</h3>
                <p className="text-xs text-muted-foreground truncate">{country.currencyName}</p>
              </div>
            </div>
            {country.popular && (
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] shrink-0">
                Popular
              </Badge>
            )}
          </div>

          <div className="pt-2 border-t border-border space-y-1.5">
            {usdRate !== null && (
              <div className="flex items-center justify-between text-xs md:text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <TrendingUp className="w-3 h-3" /> Rate
                </span>
                <span className="font-semibold font-mono">
                  1 USD = {usdRate >= 1000
                    ? usdRate.toLocaleString('en-US', { maximumFractionDigits: 0 })
                    : usdRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
                  } {country.currencyCode}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs md:text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Clock className="w-3 h-3" /> Transfer Fee
              </span>
              <span className="font-semibold">{country.transferFee}%</span>
            </div>
            <div className="flex items-center justify-between text-xs md:text-sm">
              <span className="text-muted-foreground">Est. Time</span>
              <span className="font-semibold">{country.estimatedTime}</span>
            </div>
            <div className="flex items-center justify-between text-xs md:text-sm pt-0.5">
              <span className="text-muted-foreground">Currency</span>
              <span className="font-mono font-semibold">{country.currencyCode}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-4 md:p-8 space-y-5 md:space-y-8">
      <div>
        <h1 className="text-2xl md:text-4xl font-bold tracking-tight mb-1">Supported Countries</h1>
        <p className="text-sm text-muted-foreground">Send money to {countries?.length} countries worldwide</p>
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

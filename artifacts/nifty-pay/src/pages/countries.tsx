import { useState } from 'react';
import { useGetSupportedCountries } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Clock, DollarSign } from 'lucide-react';

export default function Countries() {
  const [searchQuery, setSearchQuery] = useState('');
  const { data: countries, isLoading } = useGetSupportedCountries();

  const filtered = countries?.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.currencyCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.currencyName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const popular = filtered?.filter(c => c.popular);
  const others = filtered?.filter(c => !c.popular);

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      </div>
    );
  }

  const CountryCard = ({ country }: { country: NonNullable<typeof countries>[0] }) => (
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
          <div className="flex items-center justify-between text-xs md:text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <DollarSign className="w-3 h-3" /> Transfer Fee
            </span>
            <span className="font-semibold">{country.transferFee}%</span>
          </div>
          <div className="flex items-center justify-between text-xs md:text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> Est. Time
            </span>
            <span className="font-semibold">{country.estimatedTime}</span>
          </div>
          <div className="flex items-center justify-between text-xs md:text-sm pt-1">
            <span className="text-muted-foreground">Currency</span>
            <span className="font-mono font-semibold">{country.currencyCode}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );

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

      {popular && popular.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg md:text-2xl font-bold tracking-tight">Popular Destinations</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-5">
            {popular.map((c) => <CountryCard key={c.code} country={c} />)}
          </div>
        </div>
      )}

      {others && others.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg md:text-2xl font-bold tracking-tight">All Countries</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-5">
            {others.map((c) => <CountryCard key={c.code} country={c} />)}
          </div>
        </div>
      )}

      {filtered?.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Search className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-20" />
            <h3 className="text-base font-semibold mb-1">No countries found</h3>
            <p className="text-sm text-muted-foreground">Try adjusting your search</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

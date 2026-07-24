import { useGetTransactionStats } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, CheckCircle, Clock } from 'lucide-react';

const COLORS = ['hsl(174, 72%, 56%)', 'hsl(271, 91%, 65%)', 'hsl(41, 96%, 56%)', 'hsl(339, 90%, 61%)', 'hsl(197, 71%, 52%)'];

export default function Stats() {
  const { data: stats, isLoading } = useGetTransactionStats();

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-6">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 md:h-32" />)}
        </div>
        <Skeleton className="h-64 md:h-96" />
      </div>
    );
  }

  if (!stats) return null;

  const barChartData = stats.byCurrency.map((item) => ({
    currency: item.currencyCode,
    volume: item.totalVolume,
    count: item.count,
    flag: item.flag,
  }));

  const pieChartData = stats.byCurrency.map((item) => ({
    name: item.currencyCode,
    value: item.totalVolume,
    flag: item.flag,
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border p-2.5 rounded-lg shadow-lg text-xs">
          <p className="font-semibold mb-1">{payload[0].payload.flag} {payload[0].payload.currency || payload[0].payload.name}</p>
          <p className="text-muted-foreground">
            ${payload[0].value.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="p-4 md:p-8 space-y-5 md:space-y-8">
      <div>
        <h1 className="text-2xl md:text-4xl font-bold tracking-tight mb-1">Transfer Statistics</h1>
        <p className="text-sm text-muted-foreground">Insights into your global money transfers</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-6">
        <Card>
          <CardHeader className="pb-2 p-4 md:p-6">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Total Volume
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0">
            <p className="text-2xl md:text-3xl font-bold tracking-tight font-mono" data-testid="text-total-volume">
              ${stats.byCurrency.reduce((s, c) => s + c.totalVolume, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Across {stats.byCurrency.length} currencies</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 p-4 md:p-6">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle className="w-4 h-4" /> Success Rate
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0">
            <p className="text-2xl md:text-3xl font-bold tracking-tight" data-testid="text-success-rate">
              {stats.successRate.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">Completed transfers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 p-4 md:p-6">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" /> Avg Transfer Time
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0">
            <p className="text-2xl md:text-3xl font-bold tracking-tight" data-testid="text-avg-time">
              {stats.avgTransferTime}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Average processing time</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <Card>
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="text-base md:text-xl">Volume by Currency</CardTitle>
            <CardDescription className="text-xs md:text-sm">Total transfer volume per currency</CardDescription>
          </CardHeader>
          <CardContent className="p-2 md:p-6 pt-0">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={barChartData} margin={{ top: 0, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="currency" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="volume" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="text-base md:text-xl">Currency Distribution</CardTitle>
            <CardDescription className="text-xs md:text-sm">Breakdown of volume by currency</CardDescription>
          </CardHeader>
          <CardContent className="p-2 md:p-6 pt-0">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={pieChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={90}
                  dataKey="value"
                >
                  {pieChartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Currency Breakdown Table */}
      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-base md:text-xl">Currency Breakdown</CardTitle>
          <CardDescription className="text-xs md:text-sm">Detailed stats for each currency</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px]">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th className="text-left p-3 md:p-4 font-semibold text-xs md:text-sm">Currency</th>
                  <th className="text-right p-3 md:p-4 font-semibold text-xs md:text-sm">Volume</th>
                  <th className="text-right p-3 md:p-4 font-semibold text-xs md:text-sm">Count</th>
                  <th className="text-right p-3 md:p-4 font-semibold text-xs md:text-sm">Avg</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stats.byCurrency.map((c) => (
                  <tr key={c.currencyCode} className="hover:bg-accent/5 transition-colors" data-testid={`currency-row-${c.currencyCode}`}>
                    <td className="p-3 md:p-4">
                      <div className="flex items-center gap-1.5">
                        <span className="text-lg md:text-2xl">{c.flag}</span>
                        <span className="font-semibold text-sm">{c.currencyCode}</span>
                      </div>
                    </td>
                    <td className="p-3 md:p-4 text-right font-mono font-semibold text-sm">
                      ${c.totalVolume.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-3 md:p-4 text-right font-semibold text-sm">{c.count}</td>
                    <td className="p-3 md:p-4 text-right font-mono text-sm">
                      ${(c.totalVolume / c.count).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

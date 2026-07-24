import { Link, useLocation } from 'wouter';
import { Home, Send, Receipt, Globe, Wallet, BarChart3, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGetUserProfile } from '@workspace/api-client-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';

interface AppLayoutProps {
  children: React.ReactNode;
}

const navigation = [
  { name: 'Home',         href: '/',             icon: Home },
  { name: 'Send',         href: '/send',          icon: Send },
  { name: 'Transactions', href: '/transactions',  icon: Receipt },
  { name: 'Wallets',      href: '/wallets',       icon: Wallet },
  { name: 'Account',      href: '/account',       icon: User },
];

const sidebarExtra = [
  { name: 'Countries',    href: '/countries',     icon: Globe },
  { name: 'Stats',        href: '/stats',         icon: BarChart3 },
];

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const { data: profile, isLoading: profileLoading } = useGetUserProfile();

  const allSidebar = [...navigation, ...sidebarExtra];

  return (
    <div className="flex min-h-[100dvh] bg-background">
      {/* Sidebar — desktop only */}
      <aside className="hidden md:flex w-64 border-r border-sidebar-border bg-sidebar flex-col shrink-0">
        {/* Logo */}
        <div className="p-6 border-b border-sidebar-border">
          <Link href="/" className="flex items-center gap-2">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Nivio" className="w-8 h-8 rounded-lg object-cover" />
            <span className="text-xl font-bold tracking-tight">Nivio</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {allSidebar.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User Profile */}
        <div className="p-4 border-t border-sidebar-border">
          {profileLoading ? (
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-full" />
              <div className="flex-1 space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-3 w-32" /></div>
            </div>
          ) : profile ? (
            <Link href="/account" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <Avatar>
                <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                  {profile.avatarInitials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-sidebar-foreground truncate">{profile.name}</p>
                <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
              </div>
            </Link>
          ) : null}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto min-w-0 pb-16 md:pb-0">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-40 flex items-center gap-3 px-4 py-3 bg-sidebar/95 backdrop-blur border-b border-sidebar-border">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Nivio" className="w-7 h-7 rounded-md object-cover shrink-0" />
          <span className="text-base font-bold tracking-tight">Nivio</span>
          {profile && (
            <Link href="/account" className="ml-auto">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-primary text-primary-foreground font-semibold text-xs">
                  {profile.avatarInitials}
                </AvatarFallback>
              </Avatar>
            </Link>
          )}
        </header>

        {children}
      </main>

      {/* Bottom Navigation — mobile only (5 tabs) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-sidebar/95 backdrop-blur border-t border-sidebar-border flex items-center">
        {navigation.map((item) => {
          const isActive = location === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex-1 flex flex-col items-center gap-0.5 py-2 px-1 text-[10px] font-medium transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <Icon className={cn('w-5 h-5', isActive && 'text-primary')} />
              <span className="leading-tight">{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

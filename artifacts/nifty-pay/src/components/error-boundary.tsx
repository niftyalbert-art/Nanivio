import { Component, type ReactNode, type ErrorInfo } from 'react';
import { RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Shown in the fallback — helps identify which section crashed */
  label?: string;
}

interface State {
  error: Error | null;
}

/**
 * AppErrorBoundary — catches any unhandled render/lifecycle error in the
 * subtree and shows a recovery screen instead of a blank dark page.
 * Without this, a single crash silently unmounts the entire React tree.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AppErrorBoundary] caught:', error, info);
  }

  handleReload = () => {
    const reload = () => location.reload();
    // Clear service-worker cache before reloading so stale bundles don't loop
    if ('caches' in window) {
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).then(reload, reload);
    } else {
      reload();
    }
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-6 text-center bg-background">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <RefreshCw className="w-8 h-8 text-destructive" />
        </div>
        <div className="max-w-xs">
          <p className="font-bold text-lg mb-1">Something went wrong</p>
          <p className="text-sm text-muted-foreground mb-3">
            {this.props.label ? `${this.props.label} crashed. ` : ''}
            Tap Reload to recover.
          </p>
          <p className="text-[11px] text-muted-foreground/50 font-mono break-all">
            {error.message}
          </p>
        </div>
        <button
          onClick={this.handleReload}
          className="flex items-center gap-2 bg-primary text-primary-foreground font-semibold text-sm px-6 py-3 rounded-xl hover:bg-primary/90 active:scale-95 transition-all"
        >
          <RefreshCw className="w-4 h-4" />
          Reload app
        </button>
      </div>
    );
  }
}

import { Component, ErrorInfo, ReactNode } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('App render failed:', error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="max-w-2xl w-full bg-white border border-border rounded-lg p-6 shadow-sm">
            <h1 className="text-xl font-semibold text-foreground mb-2">App failed to render</h1>
            <p className="text-sm text-muted-foreground mb-4">
              The error below is the real cause of the blank screen.
            </p>
            <pre className="text-xs whitespace-pre-wrap bg-muted p-4 rounded border border-border overflow-auto">
              {this.state.error.message}
              {this.state.error.stack ? `\n\n${this.state.error.stack}` : ''}
            </pre>
            <button
              onClick={() => {
                localStorage.clear();
                window.location.href = '/';
              }}
              className="mt-4 px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
            >
              Clear local data and reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

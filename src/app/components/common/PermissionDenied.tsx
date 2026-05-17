import { Link } from 'react-router';
import { ShieldAlert } from 'lucide-react';

export function PermissionDenied() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-2xl font-semibold text-foreground mb-2">Access Denied</h2>
        <p className="text-muted-foreground mb-6">
          You don't have permission to access this section. Please contact the system administrator if you need access.
        </p>
        <Link
          to="/app"
          className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}

import { ReactNode } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { PermissionDenied } from './PermissionDenied';

interface ProtectedRouteProps {
  children: ReactNode;
  permission?: string;
  ownerOnly?: boolean;
}

export function ProtectedRoute({ children, permission, ownerOnly = false }: ProtectedRouteProps) {
  const { user, hasPermission } = useAuth();

  // Check owner-only access
  if (ownerOnly && user?.role !== 'owner') {
    return <PermissionDenied />;
  }

  // Check permission if specified
  if (permission && user?.role !== 'owner' && !hasPermission(permission)) {
    return <PermissionDenied />;
  }

  return <>{children}</>;
}

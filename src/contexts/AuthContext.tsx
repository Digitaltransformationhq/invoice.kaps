import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'owner' | 'auditor';
  company_id?: string;
  company_name?: string;
  company_gstin?: string;
  company_logo?: string;
  is_active: boolean;
}

interface Permission {
  permission_name: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

interface AuthMetadata {
  full_name?: string;
  company_name?: string;
  company_gstin?: string;
  company_logo?: string;
  gstin?: string;
}

interface AuditorCompany {
  auditor_id: string;
  company_id: string;
  company_name: string;
  company_logo: string | null;
  full_name: string;
}

interface AuthContextType {
  user: User | null;
  permissions: Permission[];
  isAuthenticated: boolean;
  isOwner: boolean;
  login: (email: string, password: string, role?: 'owner' | 'auditor') => Promise<{ success: boolean; error?: string }>;
  lookupAuditorCompanies: (email: string) => Promise<{ success: boolean; companies?: AuditorCompany[]; error?: string }>;
  loginAuditorById: (auditorId: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  hasPermission: (resource: string, action?: 'view' | 'create' | 'edit' | 'delete') => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const OWNER_PERMISSIONS = [
  'dashboard',
  'customers',
  'items',
  'invoices',
  'credit-notes',
  'receipts',
  'outstanding',
  'payment-vouchers',
  'reports',
  'auditor-management',
];

const ownerPermissions = OWNER_PERMISSIONS.map((permission_name) => ({
  permission_name,
  can_view: true,
  can_create: true,
  can_edit: true,
  can_delete: true,
}));

const SESSION_RESTORE_TIMEOUT_MS = 5000;

function readStoredSession() {
  try {
    const storedUser = localStorage.getItem('user');
    const storedPermissions = localStorage.getItem('permissions');

    if (!storedUser || !storedPermissions) {
      return { user: null, permissions: [] };
    }

    return {
      user: JSON.parse(storedUser) as User,
      permissions: JSON.parse(storedPermissions) as Permission[],
    };
  } catch (error) {
    console.error('Stored session is invalid:', error);
    localStorage.removeItem('user');
    localStorage.removeItem('permissions');
    localStorage.removeItem('userRole');
    return { user: null, permissions: [] };
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} timed out. Please refresh or check your Supabase connection.`));
    }, timeoutMs);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timeoutId));
  });
}

function buildOwnerUser(profile: any, metadata: AuthMetadata = {}): User {
  return {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name || metadata.full_name || profile.email,
    role: 'owner',
    company_id: profile.company_id,
    company_name: profile.company_name || metadata.company_name,
    company_gstin: profile.company_gstin || metadata.company_gstin || metadata.gstin,
    company_logo: profile.company_logo || metadata.company_logo,
    is_active: profile.is_active,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [storedSession] = useState(readStoredSession);
  const [user, setUser] = useState<User | null>(storedSession.user);
  const [permissions, setPermissions] = useState<Permission[]>(storedSession.permissions);

  useEffect(() => {
    restoreSession();

    if (!isSupabaseConfigured) {
      return;
    }

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        const storedRole = localStorage.getItem('userRole');
        if (storedRole !== 'auditor') {
          clearSession();
        }
        return;
      }

      const storedRole = localStorage.getItem('userRole');
      if (storedRole !== 'auditor') {
        refreshOwnerSession(session);
      }
    });

    return () => data.subscription.unsubscribe();
  }, []);

  const clearSession = () => {
    setUser(null);
    setPermissions([]);
    localStorage.removeItem('user');
    localStorage.removeItem('permissions');
    localStorage.removeItem('userRole');
  };

  const storeSession = (nextUser: User, nextPermissions: Permission[]) => {
    setUser(nextUser);
    setPermissions(nextPermissions);
    localStorage.setItem('user', JSON.stringify(nextUser));
    localStorage.setItem('permissions', JSON.stringify(nextPermissions));
    localStorage.setItem('userRole', nextUser.role);
  };

  const repairCompanyGstin = async (nextUser: User) => {
    if (!nextUser.company_id || !nextUser.company_gstin) {
      return;
    }

    try {
      await supabase
        .from('companies')
        .update({ gstin: nextUser.company_gstin })
        .eq('id', nextUser.company_id);
    } catch (error) {
      console.warn('Company GSTIN repair skipped:', error);
    }
  };

  const refreshOwnerSession = async (session: any) => {
    const { data, error } = await withTimeout(
      supabase.rpc('get_current_profile'),
      SESSION_RESTORE_TIMEOUT_MS,
      'Profile refresh'
    );

    if (error || !data?.success) {
      return;
    }

    const profile = data.profile;
    const nextUser = buildOwnerUser(profile, session.user.user_metadata as AuthMetadata);
    storeSession(nextUser, ownerPermissions);

    if (!profile.company_gstin) {
      repairCompanyGstin(nextUser);
    }
  };

  const restoreSession = async () => {
    try {
      if (!isSupabaseConfigured) {
        return;
      }

      const storedRole = localStorage.getItem('userRole');
      if (storedRole === 'auditor' && user?.id) {
        const { data, error } = await withTimeout(
          supabase.rpc('refresh_auditor_session', { p_auditor_id: user.id }),
          SESSION_RESTORE_TIMEOUT_MS,
          'Auditor session refresh'
        );

        if (!error && data?.success) {
          const auditor = data.auditor;
          storeSession({
            id: auditor.id,
            email: auditor.email,
            full_name: auditor.full_name,
            role: 'auditor',
            company_id: auditor.company_id,
            company_name: auditor.company_name,
            company_gstin: auditor.company_gstin,
            company_logo: auditor.company_logo,
            is_active: true,
          }, auditor.permissions || []);
        } else {
          clearSession();
        }

        return;
      }

      const { data: { session } } = await withTimeout(
        supabase.auth.getSession(),
        SESSION_RESTORE_TIMEOUT_MS,
        'Session restore'
      );

      if (!session) {
        const storedRole = localStorage.getItem('userRole');
        if (storedRole !== 'auditor') {
          clearSession();
        }
        return;
      }

      await refreshOwnerSession(session);
    } catch (error) {
      console.error('Session restore failed:', error);
    }
  };

  const login = async (email: string, password: string, role: 'owner' | 'auditor' = 'owner') => {
    if (!isSupabaseConfigured) {
      return { success: false, error: 'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.' };
    }

    try {
      if (role === 'auditor') {
        const { data, error } = await supabase.rpc('verify_auditor_login', {
          p_email: email,
          p_password: password,
        });

        if (error || !data?.success) {
          return { success: false, error: data?.error || error?.message || 'Invalid auditor credentials' };
        }

        const auditor = data.auditor;
        const auditorPermissions = (auditor.permissions || []).map((permission: Permission) => permission);

        storeSession({
          id: auditor.id,
          email: auditor.email,
          full_name: auditor.full_name,
          role: 'auditor',
          company_id: auditor.company_id,
          company_name: auditor.company_name,
          company_gstin: auditor.company_gstin,
          company_logo: auditor.company_logo,
          is_active: true,
        }, auditorPermissions);

        return { success: true };
      }

      const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        return { success: false, error: error.message };
      }

      const { data, error: profileError } = await supabase.rpc('get_current_profile');
      if (profileError || !data?.success) {
        await supabase.auth.signOut();
        return { success: false, error: data?.error || profileError?.message || 'Profile not found' };
      }

      const profile = data.profile;
      const nextUser = buildOwnerUser(profile, authData.user?.user_metadata as AuthMetadata);
      storeSession(nextUser, ownerPermissions);

      if (!profile.company_gstin) {
        repairCompanyGstin(nextUser);
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Login failed' };
    }
  };

  const logout = async () => {
    if (user?.role === 'owner') {
      await supabase.auth.signOut();
    }
    clearSession();
  };

  const lookupAuditorCompanies = async (email: string) => {
    if (!isSupabaseConfigured) {
      return { success: false, error: 'Supabase is not configured.' };
    }

    try {
      const { data, error } = await supabase.rpc('auditor_list_companies', { p_email: email });
      if (error || !data?.success) {
        return { success: false, error: data?.error || error?.message || 'Could not look up auditor companies' };
      }
      return { success: true, companies: (data.companies || []) as AuditorCompany[] };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Lookup failed' };
    }
  };

  const loginAuditorById = async (auditorId: string, password: string) => {
    if (!isSupabaseConfigured) {
      return { success: false, error: 'Supabase is not configured.' };
    }

    try {
      const { data, error } = await supabase.rpc('verify_auditor_login_by_id', {
        p_auditor_id: auditorId,
        p_password: password,
      });

      if (error || !data?.success) {
        return { success: false, error: data?.error || error?.message || 'Invalid password' };
      }

      const auditor = data.auditor;
      const auditorPermissions = (auditor.permissions || []).map((permission: Permission) => permission);

      storeSession({
        id: auditor.id,
        email: auditor.email,
        full_name: auditor.full_name,
        role: 'auditor',
        company_id: auditor.company_id,
        company_name: auditor.company_name,
        company_gstin: auditor.company_gstin,
        company_logo: auditor.company_logo,
        is_active: true,
      }, auditorPermissions);

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Login failed' };
    }
  };

  const hasPermission = (resource: string, action: 'view' | 'create' | 'edit' | 'delete' = 'view'): boolean => {
    if (user?.role === 'owner') {
      return true;
    }

    const permission = permissions.find((p) => p.permission_name === resource);
    if (!permission) {
      return false;
    }

    const actionKey = `can_${action}` as keyof Permission;
    return Boolean(permission[actionKey]);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        permissions,
        isAuthenticated: !!user,
        isOwner: user?.role === 'owner',
        login,
        lookupAuditorCompanies,
        loginAuditorById,
        logout,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

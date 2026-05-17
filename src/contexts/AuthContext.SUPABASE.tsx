import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'owner' | 'auditor';
  company_id?: string;
  company_name?: string;
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

interface AuthContextType {
  user: User | null;
  permissions: Permission[];
  login: (email: string, password: string, role?: 'owner' | 'auditor') => Promise<boolean>;
  logout: () => void;
  hasPermission: (permissionName: string) => boolean;
  isAuthenticated: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      // Check for stored session data
      const storedUser = localStorage.getItem('user');
      const storedPermissions = localStorage.getItem('permissions');
      const storedRole = localStorage.getItem('userRole');

      if (storedUser && storedPermissions) {
        setUser(JSON.parse(storedUser));
        setPermissions(JSON.parse(storedPermissions));
      }

      // If owner role, verify Supabase session
      if (storedRole === 'owner') {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          // Session expired, clear local data
          logout();
        }
      }
    } catch (error) {
      console.error('Session check error:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string, role: 'owner' | 'auditor' = 'owner'): Promise<boolean> => {
    try {
      if (role === 'owner') {
        // Owner login via Supabase Auth
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) {
          console.error('Login error:', error);
          return false;
        }

        if (!data.user) {
          return false;
        }

        // Get company details
        const { data: companyData, error: companyError } = await supabase.rpc('get_company_by_auth_user');

        if (companyError || !companyData.success) {
          console.error('Company fetch error:', companyError);
          await supabase.auth.signOut();
          return false;
        }

        const company = companyData.company;

        const userData: User = {
          id: data.user.id,
          email: company.email,
          full_name: company.full_name,
          role: 'owner',
          company_id: company.id,
          company_name: company.company_name,
          company_logo: company.company_logo,
          is_active: company.is_active
        };

        // Set full permissions for owner
        const ownerPermissions: Permission[] = [
          'dashboard',
          'customers',
          'items',
          'invoices',
          'credit-notes',
          'receipts',
          'outstanding',
          'payment-vouchers',
          'reports',
          'auditor-management'
        ].map(perm => ({
          permission_name: perm,
          can_view: true,
          can_create: true,
          can_edit: true,
          can_delete: true
        }));

        setUser(userData);
        setPermissions(ownerPermissions);

        // Store in localStorage
        localStorage.setItem('user', JSON.stringify(userData));
        localStorage.setItem('permissions', JSON.stringify(ownerPermissions));
        localStorage.setItem('userRole', 'owner');

        return true;

      } else {
        // Auditor login via custom function
        const { data, error } = await supabase.rpc('verify_auditor_login', {
          p_email: email,
          p_password: password
        });

        if (error || !data.success) {
          console.error('Auditor login error:', error || data.error);
          return false;
        }

        const auditor = data.auditor;

        const userData: User = {
          id: auditor.id,
          email: auditor.email,
          full_name: auditor.name,
          role: 'auditor',
          company_id: auditor.company_id,
          company_name: auditor.company_name,
          company_logo: auditor.company_logo,
          is_active: true
        };

        // Convert auditor permissions to Permission format
        const auditorPermissions: Permission[] = (auditor.permissions || []).map((perm: string) => ({
          permission_name: perm,
          can_view: true,
          can_create: true,
          can_edit: true,
          can_delete: false
        }));

        setUser(userData);
        setPermissions(auditorPermissions);

        // Store in localStorage
        localStorage.setItem('user', JSON.stringify(userData));
        localStorage.setItem('permissions', JSON.stringify(auditorPermissions));
        localStorage.setItem('userRole', 'auditor');

        return true;
      }
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const logout = () => {
    // Sign out from Supabase if owner
    if (user?.role === 'owner') {
      supabase.auth.signOut();
    }

    setUser(null);
    setPermissions([]);
    localStorage.removeItem('user');
    localStorage.removeItem('permissions');
    localStorage.removeItem('userRole');
  };

  const hasPermission = (permissionName: string): boolean => {
    // Owner has all permissions
    if (user?.role === 'owner') {
      return true;
    }

    // Check if auditor has this permission
    return permissions.some(
      p => p.permission_name === permissionName && p.can_view
    );
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        permissions,
        login,
        logout,
        hasPermission,
        isAuthenticated: !!user,
        loading
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

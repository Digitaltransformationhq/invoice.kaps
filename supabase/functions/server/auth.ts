// Authentication helper functions
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = () => createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

// Simple password hashing using Web Crypto API
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const inputHash = await hashPassword(password);
  return inputHash === hash;
}

// Create a new user (owner or auditor)
export async function createUser(email: string, password: string, fullName: string, role: string, createdBy?: string) {
  const db = supabase();
  const passwordHash = await hashPassword(password);

  const { data, error } = await db
    .from('users')
    .insert([{
      email,
      password_hash: passwordHash,
      full_name: fullName,
      role,
      created_by: createdBy || null,
      is_active: true
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Authenticate user (login)
export async function authenticateUser(email: string, password: string) {
  const db = supabase();

  const { data: user, error } = await db
    .from('users')
    .select('*')
    .eq('email', email)
    .eq('is_active', true)
    .single();

  if (error || !user) {
    return { success: false, error: 'Invalid email or password' };
  }

  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    return { success: false, error: 'Invalid email or password' };
  }

  // Update last login
  await db
    .from('users')
    .update({ last_login: new Date().toISOString() })
    .eq('id', user.id);

  // Remove password hash from response
  const { password_hash, ...userWithoutPassword } = user;

  return { success: true, user: userWithoutPassword };
}

// Get user permissions
export async function getUserPermissions(userId: string) {
  const db = supabase();

  const { data, error } = await db
    .from('auditor_permissions')
    .select('*')
    .eq('auditor_id', userId);

  if (error) throw error;
  return data || [];
}

// Check if user has permission
export async function checkPermission(userId: string, role: string, permissionName: string, action: 'view' | 'create' | 'edit' | 'delete'): Promise<boolean> {
  // Owner has all permissions
  if (role === 'owner') {
    return true;
  }

  const db = supabase();
  const columnMap = {
    'view': 'can_view',
    'create': 'can_create',
    'edit': 'can_edit',
    'delete': 'can_delete'
  };

  const { data, error } = await db
    .from('auditor_permissions')
    .select(columnMap[action])
    .eq('auditor_id', userId)
    .eq('permission_name', permissionName)
    .single();

  if (error || !data) return false;
  return data[columnMap[action]] || false;
}

// Log audit action
export async function logAudit(userId: string, userEmail: string, userRole: string, action: string, resourceType: string, resourceId?: string, resourceName?: string, details?: any) {
  const db = supabase();

  await db
    .from('audit_log')
    .insert([{
      user_id: userId,
      user_email: userEmail,
      user_role: userRole,
      action,
      resource_type: resourceType,
      resource_id: resourceId || null,
      resource_name: resourceName || null,
      details: details || {}
    }]);
}

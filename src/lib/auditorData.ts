import { supabase } from './supabase';

interface AuditorUser {
  id: string;
  role: 'owner' | 'auditor';
}

type AuditorAction = 'select' | 'insert' | 'update' | 'delete' | 'log';

interface AuditorResponse<T = any> {
  data: T | null;
  error: Error | null;
}

function isAuditor(user: AuditorUser | null | undefined): user is AuditorUser {
  return user?.role === 'auditor';
}

async function auditorRequest<T>(
  user: AuditorUser | null | undefined,
  module: string,
  resource: string,
  action: AuditorAction,
  payload: Record<string, any> = {}
): Promise<AuditorResponse<T>> {
  if (!isAuditor(user)) {
    return { data: null, error: new Error('Auditor request requires an auditor session') };
  }

  const { data, error } = await supabase.rpc('auditor_data_request', {
    p_auditor_id: user.id,
    p_module: module,
    p_resource: resource,
    p_action: action,
    p_payload: payload,
  });

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  if (!data?.success) {
    return { data: null, error: new Error(data?.error || 'Auditor request failed') };
  }

  return { data: (data.data ?? null) as T, error: null };
}

export async function selectForUser<T>(
  user: AuditorUser | null | undefined,
  module: string,
  resource: string,
  ownerQuery: () => Promise<{ data: T | null; error: any }>,
  payload: Record<string, any> = {}
): Promise<AuditorResponse<T>> {
  if (isAuditor(user)) {
    return auditorRequest<T>(user, module, resource, 'select', payload);
  }

  const { data, error } = await ownerQuery();
  return { data, error: error ? new Error(error.message || String(error)) : null };
}

export async function insertForUser<T>(
  user: AuditorUser | null | undefined,
  module: string,
  resource: string,
  ownerQuery: () => Promise<{ data: T | null; error: any }>,
  record: Record<string, any> | Record<string, any>[],
  auditName?: string
): Promise<AuditorResponse<T>> {
  if (isAuditor(user)) {
    return auditorRequest<T>(user, module, resource, 'insert', { record, auditName });
  }

  const { data, error } = await ownerQuery();
  return { data, error: error ? new Error(error.message || String(error)) : null };
}

export async function updateForUser<T>(
  user: AuditorUser | null | undefined,
  module: string,
  resource: string,
  ownerQuery: () => Promise<{ data: T | null; error: any }>,
  values: Record<string, any>,
  match: Record<string, any>,
  auditName?: string
): Promise<AuditorResponse<T>> {
  if (isAuditor(user)) {
    return auditorRequest<T>(user, module, resource, 'update', { values, match, auditName });
  }

  const { data, error } = await ownerQuery();
  return { data, error: error ? new Error(error.message || String(error)) : null };
}

export async function deleteForUser<T>(
  user: AuditorUser | null | undefined,
  module: string,
  resource: string,
  ownerQuery: () => Promise<{ data: T | null; error: any }>,
  match: Record<string, any>,
  auditName?: string
): Promise<AuditorResponse<T>> {
  if (isAuditor(user)) {
    return auditorRequest<T>(user, module, resource, 'delete', { match, auditName });
  }

  const { data, error } = await ownerQuery();
  return { data, error: error ? new Error(error.message || String(error)) : null };
}

export async function logAuditorAction(
  user: AuditorUser | null | undefined,
  module: string,
  resource: string,
  action: string,
  details: Record<string, any> = {}
) {
  if (!isAuditor(user)) return;

  await auditorRequest(user, module, resource, 'log', {
    logAction: action,
    details,
  });
}

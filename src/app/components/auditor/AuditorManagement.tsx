import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Plus, Trash2, Eye, EyeOff, CheckSquare, Square, Shield, Edit, X, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';

interface Auditor {
  id: string;
  full_name: string;
  email: string;
  created_at: string;
  permissions: string[];
}

const PAYMENT_VOUCHERS_ENABLED = false;

const AVAILABLE_PERMISSIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'customers', label: 'Customers' },
  { id: 'items', label: 'Items & Services' },
  { id: 'invoices', label: 'Tax Invoices' },
  { id: 'delivery-challans', label: 'Delivery Challans' },
  { id: 'credit-notes', label: 'Credit / Debit Notes' },
  { id: 'receipts', label: 'Receipts' },
  { id: 'outstanding', label: 'Outstanding' },
  { id: 'payment-vouchers', label: 'Payment Vouchers', enabled: PAYMENT_VOUCHERS_ENABLED },
  { id: 'reports', label: 'Reports & GSTR-1' },
].filter((permission) => !('enabled' in permission) || permission.enabled !== false);

const PERMISSION_LABEL: Record<string, string> = AVAILABLE_PERMISSIONS.reduce(
  (acc, p) => ({ ...acc, [p.id]: p.label }),
  {},
);

export function AuditorManagement() {
  const { user } = useAuth();
  const [auditors, setAuditors] = useState<Auditor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deletingAuditor, setDeletingAuditor] = useState<Auditor | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedAuditor, setSelectedAuditor] = useState<Auditor | null>(null);
  const [expandedAuditorId, setExpandedAuditorId] = useState<string>('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  useEffect(() => {
    loadAuditors();
  }, [user?.company_id]);

  const loadAuditors = async () => {
    if (!user?.company_id) {
      setAuditors([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('auditors')
        .select('id, full_name, email, created_at, auditor_permissions(permission_name)')
        .eq('company_id', user.company_id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setAuditors((data || []).map((auditor: any) => ({
        id: auditor.id,
        full_name: auditor.full_name,
        email: auditor.email,
        created_at: auditor.created_at,
        permissions: (auditor.auditor_permissions || []).map((p: any) => p.permission_name),
      })));
    } catch (error) {
      console.error('Failed to load auditors:', error);
      toast.error('Failed to load auditors');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setEmail('');
    setPassword('');
    setSelectedPermissions([]);
    setSelectedAuditor(null);
    setShowPassword(false);
  };

  const validateForm = (isEdit = false) => {
    if (!name || !email || (!isEdit && !password)) {
      toast.error('Please fill in all required fields');
      return false;
    }
    if (password && password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return false;
    }
    if (selectedPermissions.length === 0) {
      toast.error('Please select at least one permission');
      return false;
    }
    return true;
  };

  const handleCreateAuditor = async (e: FormEvent) => {
    e.preventDefault();
    if (!validateForm() || isSubmitting) return;
    setIsSubmitting(true);

    const { data, error } = await supabase.rpc('create_auditor', {
      p_full_name: name,
      p_email: email,
      p_password: password,
      p_permissions: selectedPermissions,
    });

    setIsSubmitting(false);

    if (error || !data?.success) {
      toast.error(data?.error || error?.message || 'Failed to create auditor');
      return;
    }

    toast.success('Auditor created successfully');
    setShowCreateModal(false);
    resetForm();
    loadAuditors();
  };

  const handleDeleteAuditor = async () => {
    if (!deletingAuditor || isDeleting) return;
    setIsDeleting(true);

    const { data, error } = await supabase.rpc('delete_auditor', {
      p_auditor_id: deletingAuditor.id,
    });

    setIsDeleting(false);

    if (error || !data?.success) {
      toast.error(data?.error || error?.message || 'Failed to delete auditor');
      return;
    }

    toast.success(`${deletingAuditor.full_name} deleted.`);
    setDeletingAuditor(null);
    loadAuditors();
  };

  const togglePermission = (permissionId: string) => {
    setSelectedPermissions((current) =>
      current.includes(permissionId)
        ? current.filter((p) => p !== permissionId)
        : [...current, permissionId]
    );
  };

  const openPermissionsModal = (auditor: Auditor) => {
    setSelectedAuditor(auditor);
    setSelectedPermissions(auditor.permissions);
    setShowPermissionsModal(true);
  };

  const openEditModal = (auditor: Auditor) => {
    setSelectedAuditor(auditor);
    setName(auditor.full_name);
    setEmail(auditor.email);
    setPassword('');
    setSelectedPermissions(auditor.permissions);
    setShowEditModal(true);
  };

  const saveAuditor = async () => {
    if (!selectedAuditor || !validateForm(true) || isSubmitting) return;
    setIsSubmitting(true);

    const { data, error } = await supabase.rpc('update_auditor', {
      p_auditor_id: selectedAuditor.id,
      p_full_name: name,
      p_email: email,
      p_password: password || null,
      p_permissions: selectedPermissions,
    });

    setIsSubmitting(false);

    if (error || !data?.success) {
      toast.error(data?.error || error?.message || 'Failed to update auditor');
      return;
    }

    toast.success('Auditor updated successfully');
    setShowEditModal(false);
    setShowPermissionsModal(false);
    resetForm();
    loadAuditors();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Loading auditors…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="text-[10.5px] font-semibold tracking-[0.16em] uppercase text-violet-600 dark:text-violet-300">
            Team Access
          </div>
          <h1 className="text-[22px] sm:text-[24px] font-semibold text-foreground tracking-tight leading-tight">
            Auditor Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create auditor accounts and manage their access permissions.
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowCreateModal(true);
          }}
          className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-full bg-violet-500 hover:bg-violet-400 text-white text-[14px] font-semibold shadow-[0_4px_18px_-4px_rgba(139,92,246,0.6)] transition-all"
        >
          <Plus className="w-4 h-4" />
          Create Auditor
        </button>
      </div>

      {/* Info banner */}
      <div className="bg-violet-50/60 dark:bg-violet-500/[0.06] border border-violet-200 dark:border-violet-400/25 rounded-xl p-4">
        <div className="flex gap-3">
          <div className="h-8 w-8 rounded-full bg-violet-500 flex items-center justify-center flex-shrink-0">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <p className="text-sm text-foreground/85 leading-relaxed pt-1">
            Auditors sign in from the Auditor Login screen with the email and password you create here. They only see the sections you grant.
          </p>
        </div>
      </div>

      {/* Table card */}
      <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl shadow-[0_1px_2px_rgba(139,92,246,0.06)] overflow-hidden">
        {auditors.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-violet-100 dark:bg-violet-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-violet-600 dark:text-violet-300" />
            </div>
            <h3 className="text-lg font-semibold text-foreground tracking-tight mb-2">No auditors yet</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Create your first auditor to delegate tasks with controlled access.
            </p>
            <button
              onClick={() => {
                resetForm();
                setShowCreateModal(true);
              }}
              className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-full bg-violet-500 hover:bg-violet-400 text-white text-[14px] font-semibold shadow-[0_4px_18px_-4px_rgba(139,92,246,0.6)] transition-all"
            >
              <Plus className="w-4 h-4" />
              Create First Auditor
            </button>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-violet-100 dark:bg-violet-500/15">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Permissions</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Created</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-violet-100 dark:divide-violet-400/10">
                  {auditors.map((auditor) => (
                    <tr key={auditor.id} className="bg-violet-50/60 dark:bg-violet-500/[0.04] hover:bg-violet-100/70 dark:hover:bg-violet-500/[0.10] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-violet-500 text-white flex items-center justify-center flex-shrink-0 text-[13px] font-bold">
                            {auditor.full_name.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="text-sm font-medium text-foreground">{auditor.full_name}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">{auditor.email}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1.5 max-w-md">
                          {auditor.permissions.length === 0 ? (
                            <span className="text-[11.5px] text-muted-foreground italic">No permissions</span>
                          ) : (
                            <>
                              {auditor.permissions.slice(0, 3).map((p) => (
                                <span
                                  key={p}
                                  className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300"
                                >
                                  {PERMISSION_LABEL[p] || p}
                                </span>
                              ))}
                              {auditor.permissions.length > 3 && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300">
                                  +{auditor.permissions.length - 3} more
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground tabular-nums">
                        {new Date(auditor.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-start gap-1.5">
                          <button
                            onClick={() => openEditModal(auditor)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-foreground hover:bg-violet-100 dark:hover:bg-violet-500/15 rounded transition-colors"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                            Edit
                          </button>
                          <button
                            onClick={() => openPermissionsModal(auditor)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-500/15 rounded transition-colors"
                            title="Manage Permissions"
                          >
                            <Shield className="w-4 h-4" />
                            Permissions
                          </button>
                          <button
                            onClick={() => setDeletingAuditor(auditor)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="lg:hidden divide-y divide-violet-100 dark:divide-violet-400/10">
              {auditors.map((auditor) => {
                const isExpanded = expandedAuditorId === auditor.id;
                return (
                  <div key={auditor.id} className="p-4">
                    {/* Collapsed Header */}
                    <div
                      onClick={() => setExpandedAuditorId(isExpanded ? '' : auditor.id)}
                      className="flex items-center justify-between cursor-pointer gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-full bg-violet-500 text-white flex items-center justify-center flex-shrink-0 text-[14px] font-bold">
                          {auditor.full_name.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-foreground truncate">{auditor.full_name}</div>
                          <div className="text-[12px] text-muted-foreground truncate">{auditor.email}</div>
                        </div>
                      </div>
                      <button className="p-2 hover:bg-muted rounded-lg transition-colors flex-shrink-0">
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-muted-foreground" />
                        )}
                      </button>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="space-y-4 mt-4 pt-4 border-t border-violet-100 dark:border-violet-400/10">
                        {/* Permissions */}
                        <div>
                          <div className="text-[11px] font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300 mb-2">
                            Permissions
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {auditor.permissions.length === 0 ? (
                              <span className="text-[12px] text-muted-foreground italic">No permissions granted</span>
                            ) : (
                              auditor.permissions.map((p) => (
                                <span
                                  key={p}
                                  className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300"
                                >
                                  {PERMISSION_LABEL[p] || p}
                                </span>
                              ))
                            )}
                          </div>
                        </div>

                        {/* Created date */}
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Created</span>
                          <span className="font-medium text-foreground tabular-nums">
                            {new Date(auditor.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        </div>

                        {/* Actions */}
                        <div className="pt-3 border-t border-violet-100 dark:border-violet-400/10 flex flex-col gap-2">
                          <button
                            onClick={() => openEditModal(auditor)}
                            className="inline-flex items-center justify-center gap-2 px-4 h-11 text-[13.5px] font-medium text-foreground border border-violet-200 dark:border-violet-400/25 hover:bg-violet-50 dark:hover:bg-violet-500/10 rounded-lg transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                            Edit Auditor
                          </button>
                          <button
                            onClick={() => openPermissionsModal(auditor)}
                            className="inline-flex items-center justify-center gap-2 px-4 h-11 text-[13.5px] font-medium text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-400/25 hover:bg-violet-50 dark:hover:bg-violet-500/10 rounded-lg transition-colors"
                          >
                            <Shield className="w-4 h-4" />
                            Manage Permissions
                          </button>
                          <button
                            onClick={() => setDeletingAuditor(auditor)}
                            className="inline-flex items-center justify-center gap-2 px-4 h-11 text-[13.5px] font-medium text-destructive border border-destructive/30 hover:bg-destructive/10 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete Auditor
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {showCreateModal && (
        <AuditorFormModal
          title="Create New Auditor"
          name={name}
          email={email}
          password={password}
          showPassword={showPassword}
          selectedPermissions={selectedPermissions}
          submitLabel="Create Auditor"
          submittingLabel="Creating…"
          isSubmitting={isSubmitting}
          passwordHint="This password will be used by the auditor to log in."
          onNameChange={setName}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onTogglePassword={() => setShowPassword(!showPassword)}
          onTogglePermission={togglePermission}
          onSubmit={handleCreateAuditor}
          onClose={() => {
            if (isSubmitting) return;
            setShowCreateModal(false);
            resetForm();
          }}
        />
      )}

      {showEditModal && selectedAuditor && (
        <AuditorFormModal
          title="Edit Auditor"
          name={name}
          email={email}
          password={password}
          showPassword={showPassword}
          selectedPermissions={selectedPermissions}
          submitLabel="Save Changes"
          submittingLabel="Saving…"
          isSubmitting={isSubmitting}
          passwordHint="Leave blank to keep the current password."
          onNameChange={setName}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onTogglePassword={() => setShowPassword(!showPassword)}
          onTogglePermission={togglePermission}
          onSubmit={(event) => {
            event.preventDefault();
            saveAuditor();
          }}
          onClose={() => {
            if (isSubmitting) return;
            setShowEditModal(false);
            resetForm();
          }}
        />
      )}

      {showPermissionsModal && selectedAuditor && (
        <PermissionsModal
          title={`Manage Permissions: ${selectedAuditor.full_name}`}
          selectedPermissions={selectedPermissions}
          isSubmitting={isSubmitting}
          onTogglePermission={togglePermission}
          onSave={saveAuditor}
          onClose={() => {
            if (isSubmitting) return;
            setShowPermissionsModal(false);
            resetForm();
          }}
        />
      )}

      {deletingAuditor && (
        <DeleteAuditorModal
          auditor={deletingAuditor}
          isDeleting={isDeleting}
          onClose={() => setDeletingAuditor(null)}
          onConfirm={handleDeleteAuditor}
        />
      )}
    </div>
  );
}

function AuditorFormModal({
  title,
  name,
  email,
  password,
  showPassword,
  selectedPermissions,
  submitLabel,
  submittingLabel,
  isSubmitting,
  passwordHint,
  onNameChange,
  onEmailChange,
  onPasswordChange,
  onTogglePassword,
  onTogglePermission,
  onSubmit,
  onClose,
}: {
  title: string;
  name: string;
  email: string;
  password: string;
  showPassword: boolean;
  selectedPermissions: string[];
  submitLabel: string;
  submittingLabel: string;
  isSubmitting: boolean;
  passwordHint: string;
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
  onTogglePermission: (permissionId: string) => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-violet-200 dark:border-violet-400/25 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-violet-100 dark:border-violet-400/15">
          <h3 className="text-lg font-semibold text-foreground tracking-tight">{title}</h3>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 hover:bg-violet-50 dark:hover:bg-violet-500/10 rounded transition-colors disabled:opacity-60"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="space-y-4">
            <h4 className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground">Basic Information</h4>

            <div>
              <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                placeholder="auditor@company.com"
              />
            </div>

            <div>
              <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => onPasswordChange(e.target.value)}
                  className="w-full px-3.5 h-11 pr-12 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                  placeholder="Minimum 8 characters"
                />
                <button
                  type="button"
                  onClick={onTogglePassword}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <p className="text-[11.5px] text-muted-foreground mt-1.5">{passwordHint}</p>
            </div>
          </div>

          <PermissionPicker
            selectedPermissions={selectedPermissions}
            onTogglePermission={onTogglePermission}
          />
        </form>

        <div className="flex gap-3 p-4 border-t border-violet-100 dark:border-violet-400/15">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 px-4 h-11 border border-violet-200 dark:border-violet-400/25 bg-card text-foreground rounded-lg text-[13px] font-medium hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={(e) => onSubmit(e as unknown as FormEvent)}
            disabled={isSubmitting}
            className="flex-1 px-4 h-11 bg-violet-500 text-white rounded-lg text-[13px] font-semibold shadow-[0_2px_8px_-2px_rgba(139,92,246,0.5)] hover:bg-violet-600 transition-colors disabled:opacity-60 disabled:cursor-wait"
          >
            {isSubmitting ? submittingLabel : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function PermissionsModal({
  title,
  selectedPermissions,
  isSubmitting,
  onTogglePermission,
  onSave,
  onClose,
}: {
  title: string;
  selectedPermissions: string[];
  isSubmitting: boolean;
  onTogglePermission: (permissionId: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-violet-200 dark:border-violet-400/25 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-violet-100 dark:border-violet-400/15">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-foreground tracking-tight truncate">{title}</h3>
            <p className="text-[12.5px] text-muted-foreground mt-0.5">
              Update which sections this auditor can access.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 hover:bg-violet-50 dark:hover:bg-violet-500/10 rounded transition-colors disabled:opacity-60"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <PermissionPicker
            selectedPermissions={selectedPermissions}
            onTogglePermission={onTogglePermission}
          />
        </div>

        <div className="flex gap-3 p-4 border-t border-violet-100 dark:border-violet-400/15">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 px-4 h-11 border border-violet-200 dark:border-violet-400/25 bg-card text-foreground rounded-lg text-[13px] font-medium hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={isSubmitting}
            className="flex-1 px-4 h-11 bg-violet-500 text-white rounded-lg text-[13px] font-semibold shadow-[0_2px_8px_-2px_rgba(139,92,246,0.5)] hover:bg-violet-600 transition-colors disabled:opacity-60 disabled:cursor-wait"
          >
            {isSubmitting ? 'Saving…' : 'Save Permissions'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PermissionPicker({
  selectedPermissions,
  onTogglePermission,
}: {
  selectedPermissions: string[];
  onTogglePermission: (permissionId: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Access Permissions</h4>
        <p className="text-[11.5px] text-muted-foreground">
          Select which sections of the application this auditor can access.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {AVAILABLE_PERMISSIONS.map((permission) => {
          const isSelected = selectedPermissions.includes(permission.id);
          return (
            <button
              key={permission.id}
              type="button"
              onClick={() => onTogglePermission(permission.id)}
              className={`flex items-center gap-3 px-4 py-3 border-2 rounded-lg transition-all text-left ${
                isSelected
                  ? 'bg-violet-50 dark:bg-violet-500/10 border-violet-500 text-violet-700 dark:text-violet-300 shadow-[0_2px_8px_-4px_rgba(139,92,246,0.4)]'
                  : 'border-violet-200 dark:border-violet-400/25 hover:border-violet-400 dark:hover:border-violet-400/50 text-foreground'
              }`}
            >
              {isSelected ? (
                <CheckSquare className="w-5 h-5 flex-shrink-0" />
              ) : (
                <Square className="w-5 h-5 flex-shrink-0 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">{permission.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DeleteAuditorModal({
  auditor,
  isDeleting,
  onClose,
  onConfirm,
}: {
  auditor: Auditor;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-violet-200 dark:border-violet-400/25 rounded-xl shadow-2xl max-w-md w-full">
        <div className="flex items-center justify-between px-6 py-4 border-b border-violet-100 dark:border-violet-400/15">
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Delete Auditor</h2>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="p-2 hover:bg-violet-50 dark:hover:bg-violet-500/10 rounded transition-colors disabled:opacity-60"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center flex-shrink-0">
              <Trash2 className="w-6 h-6 text-destructive" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-foreground mb-2">
                Delete <span className="font-semibold">{auditor.full_name}</span>?
              </p>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Email: {auditor.email}</p>
                <p>Permissions: {auditor.permissions.length}</p>
                <p className="text-destructive font-medium mt-2">
                  This auditor will no longer be able to sign in. Their audit log history is preserved.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-violet-100 dark:border-violet-400/15">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 px-4 h-11 border border-violet-200 dark:border-violet-400/25 bg-card text-foreground rounded-lg text-[13px] font-medium hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 px-4 h-11 bg-destructive text-white rounded-lg text-[13px] font-semibold hover:bg-destructive/90 transition-colors disabled:opacity-60 disabled:cursor-wait"
          >
            {isDeleting ? 'Deleting…' : 'Delete Auditor'}
          </button>
        </div>
      </div>
    </div>
  );
}

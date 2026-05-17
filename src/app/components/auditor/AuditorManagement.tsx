import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Plus, Trash2, Eye, EyeOff, CheckSquare, Square, Shield, Edit } from 'lucide-react';
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

const AVAILABLE_PERMISSIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'customers', label: 'Customers' },
  { id: 'items', label: 'Items & Services' },
  { id: 'invoices', label: 'Tax Invoices' },
  { id: 'credit-notes', label: 'Credit / Debit Notes' },
  { id: 'receipts', label: 'Receipts' },
  { id: 'outstanding', label: 'Outstanding' },
  { id: 'payment-vouchers', label: 'Payment Vouchers' },
  { id: 'reports', label: 'Reports & GSTR-1' },
];

export function AuditorManagement() {
  const { user } = useAuth();
  const [auditors, setAuditors] = useState<Auditor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedAuditor, setSelectedAuditor] = useState<Auditor | null>(null);

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
        .from('app_users')
        .select('id, full_name, email, created_at, auditor_permissions(permission_name)')
        .eq('company_id', user.company_id)
        .eq('role', 'auditor')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

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
    if (!validateForm()) return;

    const { data, error } = await supabase.rpc('create_auditor', {
      p_full_name: name,
      p_email: email,
      p_password: password,
      p_permissions: selectedPermissions,
    });

    if (error || !data?.success) {
      toast.error(data?.error || error?.message || 'Failed to create auditor');
      return;
    }

    toast.success('Auditor created successfully');
    setShowCreateModal(false);
    resetForm();
    loadAuditors();
  };

  const handleDeleteAuditor = async (id: string) => {
    if (!confirm('Are you sure you want to delete this auditor?')) {
      return;
    }

    const { data, error } = await supabase.rpc('delete_auditor', {
      p_auditor_id: id,
    });

    if (error || !data?.success) {
      toast.error(data?.error || error?.message || 'Failed to delete auditor');
      return;
    }

    toast.success('Auditor deleted successfully');
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
    if (!selectedAuditor || !validateForm(true)) return;

    const { data, error } = await supabase.rpc('update_auditor', {
      p_auditor_id: selectedAuditor.id,
      p_full_name: name,
      p_email: email,
      p_password: password || null,
      p_permissions: selectedPermissions,
    });

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
          <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Loading auditors...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Auditor Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create auditor accounts and manage their access permissions
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowCreateModal(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Auditor
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex gap-3">
          <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700">
            Auditors can sign in from the Auditor Login screen with the email and password you create here.
          </p>
        </div>
      </div>

      <div className="bg-white border border-border rounded-lg overflow-hidden">
        {auditors.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No auditors yet</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Create your first auditor to delegate tasks with controlled access
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Permissions</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Created</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {auditors.map((auditor) => (
                <tr key={auditor.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-foreground">{auditor.full_name}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{auditor.email}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium bg-accent/10 text-accent">
                      {auditor.permissions.length} permissions
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {new Date(auditor.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEditModal(auditor)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-primary hover:bg-primary/10 rounded transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                        Edit
                      </button>
                      <button
                        onClick={() => openPermissionsModal(auditor)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-accent hover:bg-accent/10 rounded transition-colors"
                      >
                        <Shield className="w-4 h-4" />
                        Permissions
                      </button>
                      <button
                        onClick={() => handleDeleteAuditor(auditor.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 rounded transition-colors"
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
          passwordHint="This password will be used by the auditor to login"
          onNameChange={setName}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onTogglePassword={() => setShowPassword(!showPassword)}
          onTogglePermission={togglePermission}
          onSubmit={handleCreateAuditor}
          onClose={() => {
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
          passwordHint="Leave blank to keep the current password"
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
            setShowEditModal(false);
            resetForm();
          }}
        />
      )}

      {showPermissionsModal && selectedAuditor && (
        <PermissionsModal
          title={`Manage Permissions: ${selectedAuditor.full_name}`}
          selectedPermissions={selectedPermissions}
          onTogglePermission={togglePermission}
          onSave={saveAuditor}
          onClose={() => {
            setShowPermissionsModal(false);
            resetForm();
          }}
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
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-semibold text-foreground mb-4">{title}</h3>
        <form onSubmit={onSubmit} className="space-y-6">
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-foreground">Basic Information</h4>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                className="w-full px-4 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                className="w-full px-4 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="auditor@company.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => onPasswordChange(e.target.value)}
                  className="w-full px-4 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-accent pr-12"
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
              <p className="text-xs text-muted-foreground mt-1">{passwordHint}</p>
            </div>
          </div>

          <PermissionPicker
            selectedPermissions={selectedPermissions}
            onTogglePermission={onTogglePermission}
          />

          <div className="flex gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-input rounded-lg hover:bg-muted/50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PermissionsModal({
  title,
  selectedPermissions,
  onTogglePermission,
  onSave,
  onClose,
}: {
  title: string;
  selectedPermissions: string[];
  onTogglePermission: (permissionId: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-semibold text-foreground mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Update which sections this auditor can access
        </p>

        <PermissionPicker
          selectedPermissions={selectedPermissions}
          onTogglePermission={onTogglePermission}
        />

        <div className="flex gap-3 pt-4 mt-6 border-t border-border">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-input rounded-lg hover:bg-muted/50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className="flex-1 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
          >
            Save Permissions
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
        <h4 className="text-sm font-semibold text-foreground mb-1">Access Permissions</h4>
        <p className="text-xs text-muted-foreground">
          Select which sections of the application this auditor can access
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
              className={`flex items-center gap-3 px-4 py-3 border rounded-lg transition-all ${
                isSelected
                  ? 'bg-accent/10 border-accent text-accent'
                  : 'border-input hover:bg-muted/50'
              }`}
            >
              {isSelected ? (
                <CheckSquare className="w-5 h-5" />
              ) : (
                <Square className="w-5 h-5" />
              )}
              <span className="text-sm font-medium">{permission.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

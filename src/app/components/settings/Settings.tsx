import { useEffect, useState } from 'react';
import { Building2, Lock, FileText, IndianRupee, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';

interface CompanyForm {
  company_name: string;
  gstin: string;
  pan: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pin_code: string;
  bank_name: string;
  bank_account_number: string;
  bank_ifsc: string;
  bank_branch: string;
  company_logo: string;
}

interface SettingsForm {
  invoice_prefix: string;
  invoice_next_number: number;
  default_due_days: number;
  currency: string;
  terms: string;
  default_gst_rate: number;
  default_place_of_supply: string;
  enable_reverse_charge: boolean;
}

const emptyCompany: CompanyForm = {
  company_name: '',
  gstin: '',
  pan: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  state: '',
  pin_code: '',
  bank_name: '',
  bank_account_number: '',
  bank_ifsc: '',
  bank_branch: '',
  company_logo: '',
};

const defaultSettings: SettingsForm = {
  invoice_prefix: 'INV',
  invoice_next_number: 1,
  default_due_days: 15,
  currency: 'INR',
  terms: 'Payment due within 15 days from invoice date.',
  default_gst_rate: 18,
  default_place_of_supply: '',
  enable_reverse_charge: false,
};

const SETTINGS_REQUEST_TIMEOUT_MS = 12000;

function mapSettings(row: any): SettingsForm {
  return {
    invoice_prefix: row?.invoice_prefix || defaultSettings.invoice_prefix,
    invoice_next_number: Number(row?.invoice_next_number || defaultSettings.invoice_next_number),
    default_due_days: Number(row?.default_due_days || defaultSettings.default_due_days),
    currency: row?.currency || defaultSettings.currency,
    terms: row?.terms || defaultSettings.terms,
    default_gst_rate: Number(row?.default_gst_rate || defaultSettings.default_gst_rate),
    default_place_of_supply: row?.default_place_of_supply || '',
    enable_reverse_charge: Boolean(row?.enable_reverse_charge),
  };
}

function withTimeout<T>(promise: PromiseLike<T>, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} timed out. Please check your Supabase connection and try again.`));
    }, SETTINGS_REQUEST_TIMEOUT_MS);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timeoutId));
  });
}

export function Settings() {
  const [activeTab, setActiveTab] = useState('company');
  const [company, setCompany] = useState<CompanyForm>(emptyCompany);
  const [settings, setSettings] = useState<SettingsForm>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { user, isOwner } = useAuth();

  const tabs = [
    { id: 'company', name: 'Company', icon: Building2 },
    { id: 'invoice', name: 'Invoice Settings', icon: FileText },
    { id: 'tax', name: 'Tax Settings', icon: IndianRupee },
    { id: 'security', name: 'Security', icon: Lock },
  ];

  const loadSettings = async () => {
    if (!user?.company_id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      if (user.role === 'auditor') {
        const [profileResponse, settingsResponse] = await Promise.all([
          supabase.rpc('get_auditor_profile', {
            p_auditor_id: user.id,
          }),
          supabase.rpc('get_company_settings', {
            p_auditor_id: user.id,
          }),
        ]);

        if (profileResponse.error || !profileResponse.data?.success) {
          throw new Error(profileResponse.data?.error || profileResponse.error?.message || 'Could not load company settings');
        }
        if (settingsResponse.error || !settingsResponse.data?.success) {
          throw new Error(settingsResponse.data?.error || settingsResponse.error?.message || 'Could not load invoice settings');
        }

        setCompany({
          ...emptyCompany,
          company_name: profileResponse.data.company?.company_name || '',
          gstin: profileResponse.data.company?.gstin || '',
          phone: profileResponse.data.company?.phone || '',
          address: profileResponse.data.company?.address || '',
          city: profileResponse.data.company?.city || '',
          state: profileResponse.data.company?.state || '',
          pin_code: profileResponse.data.company?.pin_code || '',
          company_logo: profileResponse.data.company?.company_logo || '',
        });
        setSettings(mapSettings(settingsResponse.data.settings));
        return;
      }

      const [companyResponse, settingsResponse] = await Promise.all([
        supabase
          .from('companies')
          .select('company_name, gstin, pan, phone, email, address, city, state, pin_code, bank_name, bank_account_number, bank_ifsc, bank_branch, company_logo')
          .eq('id', user.company_id)
          .single(),
        supabase.rpc('get_company_settings', {
          p_auditor_id: null,
        }),
      ]);

      if (companyResponse.error) throw companyResponse.error;
      if (settingsResponse.error || !settingsResponse.data?.success) {
        throw new Error(settingsResponse.data?.error || settingsResponse.error?.message || 'Could not load invoice settings');
      }

      setCompany({
        company_name: companyResponse.data?.company_name || '',
        gstin: companyResponse.data?.gstin || '',
        pan: companyResponse.data?.pan || '',
        phone: companyResponse.data?.phone || '',
        email: companyResponse.data?.email || '',
        address: companyResponse.data?.address || '',
        city: companyResponse.data?.city || '',
        state: companyResponse.data?.state || '',
        pin_code: companyResponse.data?.pin_code || '',
        bank_name: companyResponse.data?.bank_name || '',
        bank_account_number: companyResponse.data?.bank_account_number || '',
        bank_ifsc: companyResponse.data?.bank_ifsc || '',
        bank_branch: companyResponse.data?.bank_branch || '',
        company_logo: companyResponse.data?.company_logo || '',
      });
      setSettings(mapSettings(settingsResponse.data.settings));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load settings');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, [user?.id, user?.company_id]);

  const requireOwner = () => {
    if (isOwner) return true;
    toast.error('Only the owner can update company settings');
    return false;
  };

  const syncStoredCompany = (nextCompany: CompanyForm) => {
    try {
      const storedUser = localStorage.getItem('user');
      if (!storedUser) return;

      const parsedUser = JSON.parse(storedUser);
      localStorage.setItem('user', JSON.stringify({
        ...parsedUser,
        company_name: nextCompany.company_name,
        company_gstin: nextCompany.gstin,
        company_logo: nextCompany.company_logo,
      }));
      window.dispatchEvent(new Event('company-profile-updated'));
    } catch (error) {
      console.warn('Could not sync stored company settings:', error);
    }
  };

  const saveCompany = async () => {
    if (!user?.company_id || !requireOwner()) return;
    if (!company.company_name.trim()) {
      toast.error('Company name is required');
      return;
    }

    const nextCompany = {
      company_name: company.company_name.trim(),
      gstin: company.gstin.trim().toUpperCase() || null,
      pan: company.pan.trim().toUpperCase() || null,
      phone: company.phone.trim() || null,
      email: company.email.trim().toLowerCase() || null,
      address: company.address.trim() || null,
      city: company.city.trim() || null,
      state: company.state.trim() || null,
      pin_code: company.pin_code.trim() || null,
      bank_name: company.bank_name.trim() || null,
      bank_account_number: company.bank_account_number.trim() || null,
      bank_ifsc: company.bank_ifsc.trim().toUpperCase() || null,
      bank_branch: company.bank_branch.trim() || null,
      company_logo: company.company_logo || null,
    };

    setIsSaving(true);

    try {
      const { data, error } = await withTimeout(
        supabase
          .from('companies')
          .update(nextCompany)
          .eq('id', user.company_id)
          .select('company_name, gstin, pan, phone, email, address, city, state, pin_code, bank_name, bank_account_number, bank_ifsc, bank_branch, company_logo')
          .single(),
        'Saving company settings'
      );

      if (error) {
        throw error;
      }

      const savedCompany = {
        company_name: data?.company_name || '',
        gstin: data?.gstin || '',
        pan: data?.pan || '',
        phone: data?.phone || '',
        email: data?.email || '',
        address: data?.address || '',
        city: data?.city || '',
        state: data?.state || '',
        pin_code: data?.pin_code || '',
        bank_name: data?.bank_name || '',
        bank_account_number: data?.bank_account_number || '',
        bank_ifsc: data?.bank_ifsc || '',
        bank_branch: data?.bank_branch || '',
        company_logo: data?.company_logo || '',
      };

      setCompany(savedCompany);
      syncStoredCompany(savedCompany);
      toast.success('Company settings saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save company settings');
    } finally {
      setIsSaving(false);
    }
  };

  const saveAppSettings = async (section: 'invoice' | 'tax') => {
    if (!user?.company_id || !requireOwner()) return;

    const payload = {
      company_id: user.company_id,
      invoice_prefix: settings.invoice_prefix.trim() || 'INV',
      invoice_next_number: Number(settings.invoice_next_number) || 1,
      default_due_days: Number(settings.default_due_days) || 15,
      currency: settings.currency,
      terms: settings.terms.trim() || null,
      default_gst_rate: Number(settings.default_gst_rate) || 0,
      default_place_of_supply: settings.default_place_of_supply.trim() || null,
      enable_reverse_charge: settings.enable_reverse_charge,
    };

    setIsSaving(true);

    try {
      const { data, error } = await withTimeout(
        supabase.rpc('save_company_settings', {
          p_invoice_prefix: payload.invoice_prefix,
          p_invoice_next_number: payload.invoice_next_number,
          p_default_due_days: payload.default_due_days,
          p_currency: payload.currency,
          p_terms: payload.terms,
          p_default_gst_rate: payload.default_gst_rate,
          p_default_place_of_supply: payload.default_place_of_supply,
          p_enable_reverse_charge: payload.enable_reverse_charge,
        }),
        `Saving ${section} settings`
      );

      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || `Could not save ${section} settings`);
      }

      setSettings(mapSettings(data.settings));
      toast.success(section === 'invoice' ? 'Invoice settings saved' : 'Tax settings saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not save ${section} settings`);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <div className="text-sm text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your application preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-white border border-border rounded-lg p-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded transition-colors ${
                  activeTab === tab.id
                    ? 'bg-accent text-white'
                    : 'text-foreground hover:bg-muted'
                }`}
              >
                <tab.icon className="w-5 h-5" />
                <span className="text-sm font-medium">{tab.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3">
          {activeTab === 'company' && (
            <CompanySettings
              company={company}
              setCompany={setCompany}
              canEdit={isOwner}
              isSaving={isSaving}
              onSave={saveCompany}
            />
          )}
          {activeTab === 'invoice' && (
            <InvoiceSettings
              settings={settings}
              setSettings={setSettings}
              canEdit={isOwner}
              isSaving={isSaving}
              onSave={() => saveAppSettings('invoice')}
            />
          )}
          {activeTab === 'tax' && (
            <TaxSettings
              settings={settings}
              setSettings={setSettings}
              canEdit={isOwner}
              isSaving={isSaving}
              onSave={() => saveAppSettings('tax')}
            />
          )}
          {activeTab === 'security' && <SecuritySettings user={user} isSaving={isSaving} setIsSaving={setIsSaving} />}
        </div>
      </div>
    </div>
  );
}

function CompanySettings({
  company,
  setCompany,
  canEdit,
  isSaving,
  onSave,
}: {
  company: CompanyForm;
  setCompany: (company: CompanyForm) => void;
  canEdit: boolean;
  isSaving: boolean;
  onSave: () => void;
}) {
  const handleLogoUpload = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file for the company logo');
      return;
    }
    if (file.size > 1024 * 1024) {
      toast.error('Company logo must be under 1 MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setCompany({ ...company, company_logo: String(reader.result || '') });
    reader.onerror = () => toast.error('Could not read company logo');
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      {!canEdit && <ViewOnlyNotice />}
      <div className="bg-white border border-border rounded-lg p-6">
        <h3 className="font-semibold text-foreground mb-4">Company Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-foreground mb-2">Company Logo</label>
            <div className="flex flex-wrap items-center gap-4">
              <div className="w-20 h-20 rounded border border-border bg-muted flex items-center justify-center overflow-hidden">
                {company.company_logo ? (
                  <img src={company.company_logo} alt="Company logo" className="w-full h-full object-contain" />
                ) : (
                  <Building2 className="w-7 h-7 text-muted-foreground" />
                )}
              </div>
              {canEdit && (
                <>
                  <label className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded hover:bg-muted transition-colors cursor-pointer">
                    <Upload className="w-4 h-4" />
                    <span className="text-sm">Upload Logo</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(event) => handleLogoUpload(event.target.files?.[0])} />
                  </label>
                  {company.company_logo && (
                    <button
                      type="button"
                      onClick={() => setCompany({ ...company, company_logo: '' })}
                      className="text-sm text-muted-foreground hover:text-foreground"
                    >
                      Remove
                    </button>
                  )}
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">PNG, JPG, or SVG under 1 MB. This logo appears in the sidebar and invoices.</p>
          </div>
          <SettingsInput label="Company Name" value={company.company_name} disabled={!canEdit} className="md:col-span-2" onChange={(company_name) => setCompany({ ...company, company_name })} />
          <SettingsInput label="GSTIN" value={company.gstin} disabled={!canEdit} inputClassName="font-mono" onChange={(gstin) => setCompany({ ...company, gstin })} />
          <SettingsInput label="PAN Number" value={company.pan} disabled={!canEdit} inputClassName="font-mono" onChange={(pan) => setCompany({ ...company, pan })} />
          <SettingsTextarea label="Registered Address" value={company.address} disabled={!canEdit} className="md:col-span-2" onChange={(address) => setCompany({ ...company, address })} />
          <SettingsInput label="City" value={company.city} disabled={!canEdit} onChange={(city) => setCompany({ ...company, city })} />
          <SettingsInput label="State" value={company.state} disabled={!canEdit} onChange={(state) => setCompany({ ...company, state })} />
          <SettingsInput label="Pin Code" value={company.pin_code} disabled={!canEdit} onChange={(pin_code) => setCompany({ ...company, pin_code })} />
          <SettingsInput label="Phone Number" type="tel" value={company.phone} disabled={!canEdit} onChange={(phone) => setCompany({ ...company, phone })} />
          <SettingsInput label="Email Address" type="email" value={company.email} disabled={!canEdit} onChange={(email) => setCompany({ ...company, email })} />
        </div>
        {canEdit && (
          <div className="mt-6">
            <button
              onClick={onSave}
              disabled={isSaving}
              className="px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Company'}
            </button>
          </div>
        )}
      </div>

      <div className="bg-white border border-border rounded-lg p-6">
        <h3 className="font-semibold text-foreground mb-4">Bank Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SettingsInput label="Bank Name" value={company.bank_name} disabled={!canEdit} onChange={(bank_name) => setCompany({ ...company, bank_name })} />
          <SettingsInput label="Account Number" value={company.bank_account_number} disabled={!canEdit} inputClassName="font-mono" onChange={(bank_account_number) => setCompany({ ...company, bank_account_number })} />
          <SettingsInput label="IFSC Code" value={company.bank_ifsc} disabled={!canEdit} inputClassName="font-mono" onChange={(bank_ifsc) => setCompany({ ...company, bank_ifsc })} />
          <SettingsInput label="Branch Name" value={company.bank_branch} disabled={!canEdit} onChange={(bank_branch) => setCompany({ ...company, bank_branch })} />
        </div>
        {canEdit && (
          <div className="mt-6">
            <button
              onClick={onSave}
              disabled={isSaving}
              className="px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Bank Details'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function InvoiceSettings({
  settings,
  setSettings,
  canEdit,
  isSaving,
  onSave,
}: {
  settings: SettingsForm;
  setSettings: (settings: SettingsForm) => void;
  canEdit: boolean;
  isSaving: boolean;
  onSave: () => void;
}) {
  return (
    <div className="space-y-6">
      {!canEdit && <ViewOnlyNotice />}
      <div className="bg-white border border-border rounded-lg p-6">
        <h3 className="font-semibold text-foreground mb-4">Invoice Defaults</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SettingsInput label="Invoice Prefix" value={settings.invoice_prefix} disabled={!canEdit} onChange={(invoice_prefix) => setSettings({ ...settings, invoice_prefix })} />
          <SettingsInput label="Next Invoice Number" type="number" value={String(settings.invoice_next_number)} disabled={!canEdit} onChange={(value) => setSettings({ ...settings, invoice_next_number: Number(value) })} />
          <SettingsInput label="Default Due Days" type="number" value={String(settings.default_due_days)} disabled={!canEdit} onChange={(value) => setSettings({ ...settings, default_due_days: Number(value) })} />
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Currency</label>
            <select
              value={settings.currency}
              onChange={(event) => setSettings({ ...settings, currency: event.target.value })}
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            >
              <option value="INR">INR (₹)</option>
              <option value="USD">USD (₹)</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
          <SettingsTextarea label="Terms & Conditions" value={settings.terms} disabled={!canEdit} className="md:col-span-2" onChange={(terms) => setSettings({ ...settings, terms })} />
        </div>
        {canEdit && (
          <div className="mt-6">
            <button
              onClick={onSave}
              disabled={isSaving}
              className="px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Invoice Settings'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TaxSettings({
  settings,
  setSettings,
  canEdit,
  isSaving,
  onSave,
}: {
  settings: SettingsForm;
  setSettings: (settings: SettingsForm) => void;
  canEdit: boolean;
  isSaving: boolean;
  onSave: () => void;
}) {
  return (
    <div className="space-y-6">
      {!canEdit && <ViewOnlyNotice />}
      <div className="bg-white border border-border rounded-lg p-6">
        <h3 className="font-semibold text-foreground mb-4">GST Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Default GST Rate</label>
            <select
              value={settings.default_gst_rate}
              onChange={(event) => setSettings({ ...settings, default_gst_rate: Number(event.target.value) })}
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            >
              <option value="0">0%</option>
              <option value="5">5%</option>
              <option value="12">12%</option>
              <option value="18">18%</option>
              <option value="28">28%</option>
            </select>
          </div>
          <SettingsInput label="Default Place of Supply" value={settings.default_place_of_supply} disabled={!canEdit} onChange={(default_place_of_supply) => setSettings({ ...settings, default_place_of_supply })} />
          <label className="md:col-span-2 flex items-center gap-3">
            <input
              type="checkbox"
              checked={settings.enable_reverse_charge}
              onChange={(event) => setSettings({ ...settings, enable_reverse_charge: event.target.checked })}
              disabled={!canEdit}
              className="w-4 h-4"
            />
            <span className="text-sm text-foreground">Enable Reverse Charge Mechanism</span>
          </label>
        </div>
        {canEdit && (
          <div className="mt-6">
            <button
              onClick={onSave}
              disabled={isSaving}
              className="px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Tax Settings'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SecuritySettings({
  user,
  isSaving,
  setIsSaving,
}: {
  user: any;
  isSaving: boolean;
  setIsSaving: (saving: boolean) => void;
}) {
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const updatePassword = async () => {
    if (!user?.id) return;
    if (!passwordData.currentPassword) {
      toast.error('Current password is required');
      return;
    }
    if (!passwordData.newPassword || passwordData.newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    setIsSaving(true);

    try {
      if (user.role === 'auditor') {
        const { data, error } = await withTimeout(
          supabase.rpc('update_auditor_password', {
            p_auditor_id: user.id,
            p_current_password: passwordData.currentPassword,
            p_new_password: passwordData.newPassword,
          }),
          'Updating password'
        );

        if (error || !data?.success) {
          throw new Error(data?.error || error?.message || 'Could not update password');
        }
      } else {
        const { error: signInError } = await withTimeout(
          supabase.auth.signInWithPassword({
            email: user.email,
            password: passwordData.currentPassword,
          }),
          'Checking current password'
        );

        if (signInError) {
          throw new Error('Current password is incorrect');
        }

        const { error } = await withTimeout(
          supabase.auth.updateUser({
            password: passwordData.newPassword,
          }),
          'Updating password'
        );

        if (error) throw error;
      }

      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('Password updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update password');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-border rounded-lg p-6">
        <h3 className="font-semibold text-foreground mb-4">Password & Authentication</h3>
        <div className="space-y-4">
          <SettingsInput label="Current Password" type="password" value={passwordData.currentPassword} onChange={(currentPassword) => setPasswordData({ ...passwordData, currentPassword })} />
          <SettingsInput label="New Password" type="password" value={passwordData.newPassword} onChange={(newPassword) => setPasswordData({ ...passwordData, newPassword })} />
          <SettingsInput label="Confirm New Password" type="password" value={passwordData.confirmPassword} onChange={(confirmPassword) => setPasswordData({ ...passwordData, confirmPassword })} />
          <button
            onClick={updatePassword}
            disabled={isSaving}
            className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ViewOnlyNotice() {
  return (
    <div className="bg-muted border border-border rounded-lg p-4 text-sm text-muted-foreground">
      You can view these settings. Only the owner can make changes.
    </div>
  );
}

function SettingsInput({
  label,
  value,
  onChange,
  disabled = false,
  type = 'text',
  className = '',
  inputClassName = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  type?: string;
  className?: string;
  inputClassName?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-foreground mb-2">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className={`w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 ${inputClassName}`}
      />
    </div>
  );
}

function SettingsTextarea({
  label,
  value,
  onChange,
  disabled = false,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-foreground mb-2">{label}</label>
      <textarea
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring resize-none disabled:opacity-60"
      />
    </div>
  );
}

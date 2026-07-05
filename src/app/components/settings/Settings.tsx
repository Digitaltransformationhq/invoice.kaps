import { useEffect, useState } from 'react';
import { Building2, Lock, FileText, IndianRupee, Upload, Stamp, PenTool, Landmark, Shield, Receipt, Percent } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { extractPanFromGstin, normalizeGstin } from '../../../lib/gstin';
import { AppSelect } from '../common/AppSelect';

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
  esign_image: string;
  stamp_image: string;
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
  invoice_defaults_enabled: boolean;
  taxpayer_type: string;
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
  esign_image: '',
  stamp_image: '',
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
  invoice_defaults_enabled: true,
  taxpayer_type: 'regular',
};

const SETTINGS_REQUEST_TIMEOUT_MS = 12000;
const SIGNATURE_IMAGE_MAX_SIZE = 900;

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
    invoice_defaults_enabled: row?.invoice_defaults_enabled !== false,
    taxpayer_type: row?.taxpayer_type || 'regular',
  };
}

function withTimeout<T>(promise: PromiseLike<T>, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} timed out. Please check your Supabase connection and try again.`));
    }, SETTINGS_REQUEST_TIMEOUT_MS);

    Promise.resolve(promise)
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timeoutId));
  });
}

function colorDistance(r: number, g: number, b: number, color: [number, number, number]) {
  return Math.sqrt(
    ((r - color[0]) ** 2) +
    ((g - color[1]) ** 2) +
    ((b - color[2]) ** 2)
  );
}

function getAverageColor(samples: number[][]): [number, number, number] {
  const total = samples.reduce(
    (sum, color) => [sum[0] + color[0], sum[1] + color[1], sum[2] + color[2]],
    [0, 0, 0]
  );

  return [
    Math.round(total[0] / samples.length),
    Math.round(total[1] / samples.length),
    Math.round(total[2] / samples.length),
  ];
}

async function removeImageBackground(file: File): Promise<string> {
  const imageUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not load image'));
      img.src = imageUrl;
    });

    const scale = Math.min(1, SIGNATURE_IMAGE_MAX_SIZE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Could not process image');

    context.drawImage(image, 0, 0, width, height);

    const imageData = context.getImageData(0, 0, width, height);
    const { data } = imageData;
    const sampleCoordinates = [
      [0, 0],
      [width - 1, 0],
      [0, height - 1],
      [width - 1, height - 1],
      [Math.floor(width / 2), 0],
      [Math.floor(width / 2), height - 1],
      [0, Math.floor(height / 2)],
      [width - 1, Math.floor(height / 2)],
    ];
    const samples = sampleCoordinates.map(([x, y]) => {
      const index = (y * width + x) * 4;
      return [data[index], data[index + 1], data[index + 2]];
    });
    const backgroundColor = getAverageColor(samples);
    const lightBackground = backgroundColor.every((channel) => channel > 210);
    const transparentThreshold = lightBackground ? 74 : 48;
    const fadeThreshold = transparentThreshold + 34;

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let index = 0; index < data.length; index += 4) {
      const distance = colorDistance(data[index], data[index + 1], data[index + 2], backgroundColor);
      const isNearWhite = lightBackground && data[index] > 225 && data[index + 1] > 225 && data[index + 2] > 225;

      if (distance <= transparentThreshold || isNearWhite) {
        data[index + 3] = 0;
      } else if (distance <= fadeThreshold) {
        data[index + 3] = Math.min(data[index + 3], Math.round(((distance - transparentThreshold) / (fadeThreshold - transparentThreshold)) * 255));
      }

      if (data[index + 3] > 18) {
        const pixel = index / 4;
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    context.putImageData(imageData, 0, 0);

    if (maxX < minX || maxY < minY) {
      return canvas.toDataURL('image/png');
    }

    const padding = 8;
    const cropX = Math.max(0, minX - padding);
    const cropY = Math.max(0, minY - padding);
    const cropWidth = Math.min(width - cropX, maxX - cropX + padding + 1);
    const cropHeight = Math.min(height - cropY, maxY - cropY + padding + 1);
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = cropWidth;
    croppedCanvas.height = cropHeight;

    const croppedContext = croppedCanvas.getContext('2d');
    if (!croppedContext) throw new Error('Could not crop image');

    croppedContext.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    return croppedCanvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
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
    { id: 'company', name: 'Company', icon: Building2, description: 'Logo, address, banking' },
    { id: 'invoice', name: 'Invoice Settings', icon: FileText, description: 'Numbering and defaults' },
    { id: 'tax', name: 'Tax Settings', icon: IndianRupee, description: 'GST and supply rules' },
    { id: 'security', name: 'Security', icon: Lock, description: 'Password and login' },
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
          esign_image: profileResponse.data.company?.esign_image || '',
          stamp_image: profileResponse.data.company?.stamp_image || '',
        });
        setSettings(mapSettings(settingsResponse.data.settings));
        return;
      }

      const [companyResponse, settingsResponse] = await Promise.all([
        supabase
          .from('companies')
          .select('company_name, gstin, pan, phone, email, address, city, state, pin_code, bank_name, bank_account_number, bank_ifsc, bank_branch, company_logo, esign_image, stamp_image')
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
        esign_image: companyResponse.data?.esign_image || '',
        stamp_image: companyResponse.data?.stamp_image || '',
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
      pan: company.pan.trim().toUpperCase() || extractPanFromGstin(company.gstin) || null,
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
      esign_image: company.esign_image || null,
      stamp_image: company.stamp_image || null,
    };

    setIsSaving(true);

    try {
      const { data, error } = await withTimeout(
        supabase
          .from('companies')
          .update(nextCompany)
          .eq('id', user.company_id)
          .select('company_name, gstin, pan, phone, email, address, city, state, pin_code, bank_name, bank_account_number, bank_ifsc, bank_branch, company_logo, esign_image, stamp_image')
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
        esign_image: data?.esign_image || '',
        stamp_image: data?.stamp_image || '',
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
      invoice_defaults_enabled: settings.invoice_defaults_enabled,
      taxpayer_type: settings.taxpayer_type,
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
          p_invoice_defaults_enabled: payload.invoice_defaults_enabled,
          p_taxpayer_type: payload.taxpayer_type,
        }),
        `Saving ${section} settings`
      );

      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || `Could not save ${section} settings`);
      }

      setSettings(mapSettings(data.settings));
      // Let live consumers (sidebar labels, invoice/document naming via
      // useTaxpayerType) refresh immediately instead of waiting for a reload.
      window.dispatchEvent(new Event('company-settings-updated'));
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
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Loading settings…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <div className="text-[10.5px] font-semibold tracking-[0.16em] uppercase text-violet-600 dark:text-violet-300">
          Workspace
        </div>
        <h1 className="text-[22px] sm:text-[24px] font-semibold text-foreground tracking-tight leading-tight">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your company, invoice defaults, GST rules, and security.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar tabs */}
        <div className="lg:col-span-1">
          <div className="bg-card border border-violet-200 dark:border-violet-400/25 rounded-xl p-2 shadow-[0_1px_2px_rgba(139,92,246,0.06)] sticky top-4">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg transition-all text-left ${
                    active
                      ? 'bg-violet-500 text-white shadow-[0_2px_8px_-4px_rgba(139,92,246,0.5)]'
                      : 'text-foreground hover:bg-violet-50 dark:hover:bg-violet-500/10'
                  }`}
                >
                  <tab.icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${active ? 'text-white' : 'text-violet-600 dark:text-violet-300'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold tracking-tight">{tab.name}</div>
                    <div className={`text-[11px] mt-0.5 ${active ? 'text-violet-100' : 'text-muted-foreground'}`}>
                      {tab.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Main content */}
        <div className="lg:col-span-3 space-y-6">
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
              enabled={settings.invoice_defaults_enabled}
              onToggleEnabled={(enabled) => setSettings({ ...settings, invoice_defaults_enabled: enabled })}
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

function SectionCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-violet-200 dark:border-violet-400/25 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
      <div className="flex items-start gap-3 mb-5">
        <div className="h-9 w-9 rounded-lg bg-violet-500 text-white flex items-center justify-center flex-shrink-0 shadow-[0_2px_8px_-4px_rgba(139,92,246,0.5)]">
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-[16px] font-semibold text-foreground tracking-tight">{title}</h3>
          {subtitle && <p className="text-[12.5px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function SaveButton({
  onSave,
  isSaving,
  label,
}: {
  onSave: () => void;
  isSaving: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onSave}
      disabled={isSaving}
      className="inline-flex items-center gap-2 px-4 h-10 bg-violet-500 text-white rounded-lg text-[13px] font-semibold shadow-[0_2px_8px_-2px_rgba(139,92,246,0.5)] hover:bg-violet-600 transition-colors disabled:opacity-60 disabled:cursor-wait"
    >
      {isSaving ? 'Saving…' : label}
    </button>
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
  const handleImageUpload = async (field: 'company_logo' | 'esign_image' | 'stamp_image', label: string, file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error(`Please upload an image file for the ${label}`);
      return;
    }
    if (file.size > 1024 * 1024) {
      toast.error(`${label} must be under 1 MB`);
      return;
    }

    try {
      const imageData = field === 'company_logo'
        ? await readFileAsDataUrl(file)
        : await removeImageBackground(file);

      setCompany({ ...company, [field]: imageData });

      if (field !== 'company_logo') {
        toast.success(`${label} background removed`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not process ${label}`);
    }
  };

  return (
    <div className="space-y-6">
      {!canEdit && <ViewOnlyNotice />}

      <SectionCard icon={Building2} title="Company Information" subtitle="The legal identity used on every invoice, receipt, and report.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Company Logo</label>
            <div className="flex flex-wrap items-center gap-4">
              <div className="w-20 h-20 rounded-lg border border-violet-200 dark:border-violet-400/25 bg-violet-50/40 dark:bg-violet-500/[0.05] flex items-center justify-center overflow-hidden">
                {company.company_logo ? (
                  <img src={company.company_logo} alt="Company logo" className="w-full h-full object-contain" />
                ) : (
                  <Building2 className="w-7 h-7 text-violet-600 dark:text-violet-300" />
                )}
              </div>
              {canEdit && (
                <>
                  <label className="inline-flex items-center gap-2 px-4 h-10 border border-violet-200 dark:border-violet-400/25 bg-card text-foreground rounded-lg text-[13px] font-medium hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors cursor-pointer">
                    <Upload className="w-4 h-4" />
                    <span>Upload Logo</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(event) => handleImageUpload('company_logo', 'company logo', event.target.files?.[0])} />
                  </label>
                  {company.company_logo && (
                    <button
                      type="button"
                      onClick={() => setCompany({ ...company, company_logo: '' })}
                      className="text-[12.5px] text-muted-foreground hover:text-destructive transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">PNG, JPG, or SVG under 1 MB. Appears in the sidebar and on invoices.</p>
          </div>

          <SettingsInput label="Company Name" value={company.company_name} disabled={!canEdit} className="md:col-span-2" onChange={(company_name) => setCompany({ ...company, company_name })} />
          <SettingsInput
            label="GSTIN"
            value={company.gstin}
            disabled={!canEdit}
            inputClassName="font-mono uppercase"
            placeholder="29ABCDE1234F1Z5"
            onChange={(value) => {
              const gstin = normalizeGstin(value);
              setCompany({ ...company, gstin, pan: extractPanFromGstin(gstin) });
            }}
          />
          <SettingsInput label="PAN Number" value={company.pan} disabled={!canEdit} inputClassName="font-mono uppercase" placeholder="ABCDE1234F" onChange={(pan) => setCompany({ ...company, pan: pan.toUpperCase().slice(0, 10) })} />
          <SettingsTextarea label="Registered Address" value={company.address} disabled={!canEdit} className="md:col-span-2" onChange={(address) => setCompany({ ...company, address })} />
          <SettingsInput label="City" value={company.city} disabled={!canEdit} onChange={(city) => setCompany({ ...company, city })} />
          <SettingsInput label="State" value={company.state} disabled={!canEdit} onChange={(state) => setCompany({ ...company, state })} />
          <SettingsInput label="Pin Code" value={company.pin_code} disabled={!canEdit} onChange={(pin_code) => setCompany({ ...company, pin_code })} />
          <SettingsInput label="Phone Number" type="tel" value={company.phone} disabled={!canEdit} onChange={(phone) => setCompany({ ...company, phone })} />
          <SettingsInput label="Email Address" type="email" value={company.email} disabled={!canEdit} onChange={(email) => setCompany({ ...company, email })} />
        </div>
        {canEdit && (
          <div className="mt-6 pt-5 border-t border-violet-100 dark:border-violet-400/15">
            <SaveButton onSave={onSave} isSaving={isSaving} label="Save Company" />
          </div>
        )}
      </SectionCard>

      <SectionCard icon={PenTool} title="E-Sign & Stamp" subtitle="Drop these into the authorised signatory box on PDF invoices.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ImageUploadField
            title="Signature Image"
            image={company.esign_image}
            emptyIcon={PenTool}
            emptyLabel="SIGN"
            canEdit={canEdit}
            uploadLabel="Upload Signature"
            onUpload={(file) => handleImageUpload('esign_image', 'signature image', file)}
            onRemove={() => setCompany({ ...company, esign_image: '' })}
          />
          <ImageUploadField
            title="Stamp Image"
            image={company.stamp_image}
            emptyIcon={Stamp}
            emptyLabel="STAMP"
            canEdit={canEdit}
            uploadLabel="Upload Stamp"
            onUpload={(file) => handleImageUpload('stamp_image', 'stamp image', file)}
            onRemove={() => setCompany({ ...company, stamp_image: '' })}
          />
        </div>
        <p className="text-[11px] text-muted-foreground mt-4">PNG, JPG, or SVG under 1 MB. Background is auto-removed so the signature/stamp blends cleanly on the invoice.</p>
        {canEdit && (
          <div className="mt-6 pt-5 border-t border-violet-100 dark:border-violet-400/15">
            <SaveButton onSave={onSave} isSaving={isSaving} label="Save E-Sign" />
          </div>
        )}
      </SectionCard>

      <SectionCard icon={Landmark} title="Bank Details" subtitle="Shown on invoices so customers can pay you directly.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SettingsInput label="Bank Name" value={company.bank_name} disabled={!canEdit} onChange={(bank_name) => setCompany({ ...company, bank_name })} />
          <SettingsInput label="Account Number" value={company.bank_account_number} disabled={!canEdit} inputClassName="font-mono" onChange={(bank_account_number) => setCompany({ ...company, bank_account_number })} />
          <SettingsInput label="IFSC Code" value={company.bank_ifsc} disabled={!canEdit} inputClassName="font-mono uppercase" placeholder="SBIN0001234" onChange={(bank_ifsc) => setCompany({ ...company, bank_ifsc })} />
          <SettingsInput label="Branch Name" value={company.bank_branch} disabled={!canEdit} onChange={(bank_branch) => setCompany({ ...company, bank_branch })} />
        </div>
        {canEdit && (
          <div className="mt-6 pt-5 border-t border-violet-100 dark:border-violet-400/15">
            <SaveButton onSave={onSave} isSaving={isSaving} label="Save Bank Details" />
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function ImageUploadField({
  title,
  image,
  emptyIcon: EmptyIcon,
  emptyLabel,
  canEdit,
  uploadLabel,
  onUpload,
  onRemove,
}: {
  title: string;
  image: string;
  emptyIcon?: React.ComponentType<{ className?: string }>;
  emptyLabel: string;
  canEdit: boolean;
  uploadLabel: string;
  onUpload: (file?: File) => void;
  onRemove: () => void;
}) {
  return (
    <div>
      <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">{title}</label>
      <div className="flex items-start gap-4">
        <div className="w-32 h-20 shrink-0 rounded-lg border border-violet-200 dark:border-violet-400/25 bg-violet-50/40 dark:bg-violet-500/[0.05] flex items-center justify-center overflow-hidden">
          {image ? (
            <img src={image} alt={title} className="w-full h-full object-contain" />
          ) : EmptyIcon ? (
            <EmptyIcon className="w-6 h-6 text-violet-600 dark:text-violet-300" />
          ) : (
            <span className="text-[11px] uppercase tracking-wider font-semibold text-violet-600 dark:text-violet-300">{emptyLabel}</span>
          )}
        </div>
        {canEdit && (
          <div className="flex flex-col items-start gap-2">
            <label className="inline-flex items-center gap-2 px-4 h-10 border border-violet-200 dark:border-violet-400/25 bg-card text-foreground rounded-lg text-[13px] font-medium hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>{uploadLabel}</span>
              <input type="file" accept="image/*" className="hidden" onChange={(event) => onUpload(event.target.files?.[0])} />
            </label>
            {image && (
              <button
                type="button"
                onClick={onRemove}
                className="text-[12.5px] font-medium text-destructive hover:text-destructive/80 transition-colors"
              >
                Remove
              </button>
            )}
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
  enabled,
  onToggleEnabled,
  onSave,
}: {
  settings: SettingsForm;
  setSettings: (settings: SettingsForm) => void;
  canEdit: boolean;
  isSaving: boolean;
  enabled: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  onSave: () => void;
}) {
  const fieldsDisabled = !canEdit || !enabled;

  return (
    <div className="space-y-6">
      {!canEdit && <ViewOnlyNotice />}

      <SectionCard icon={Receipt} title="Invoice Defaults" subtitle="The starting values whenever you create a new invoice.">
        <div className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-violet-200 dark:border-violet-400/25 bg-violet-50/50 dark:bg-violet-500/[0.06] px-4 py-3">
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-foreground">Use these invoice defaults</div>
            <p className="text-[12.5px] text-muted-foreground mt-0.5">
              When on, new invoices use the prefix and next number below. When off, auto-generated
              numbers are a plain sequence starting from 1.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            disabled={!canEdit}
            onClick={() => onToggleEnabled(!enabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              enabled ? 'bg-violet-500' : 'bg-slate-300 dark:bg-white/20'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                enabled ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Taxpayer Type</label>
            <AppSelect
              value={settings.taxpayer_type}
              onChange={(v) => setSettings({ ...settings, taxpayer_type: v })}
              disabled={!canEdit}
              options={[{ value: 'regular', label: 'Regular taxpayer' }, { value: 'composition', label: 'Composition Scheme / Unregistered User' }]}
              className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <p className="text-[11.5px] text-muted-foreground mt-1.5">Choose Composition Scheme / Unregistered User if you are registered under the GST Composition Scheme or are not registered under GST.</p>
          </div>
          <SettingsInput label="Invoice Prefix" value={settings.invoice_prefix} disabled={fieldsDisabled} inputClassName="font-mono uppercase" onChange={(invoice_prefix) => setSettings({ ...settings, invoice_prefix })} />
          <SettingsInput label="Next Invoice Number" type="number" value={String(settings.invoice_next_number)} disabled={fieldsDisabled} inputClassName="tabular-nums" onChange={(value) => setSettings({ ...settings, invoice_next_number: Number(value) })} />
          <SettingsInput label="Default Due Days" type="number" value={String(settings.default_due_days)} disabled={fieldsDisabled} inputClassName="tabular-nums" onChange={(value) => setSettings({ ...settings, default_due_days: Number(value) })} />
          <div>
            <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Currency</label>
            <AppSelect
              value={settings.currency}
              onChange={(v) => setSettings({ ...settings, currency: v })}
              disabled={fieldsDisabled}
              options={[{ value: 'INR', label: 'INR (₹)' }, { value: 'USD', label: 'USD ($)' }, { value: 'EUR', label: 'EUR (€)' }]}
              className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
          <SettingsTextarea label="Terms &amp; Conditions" value={settings.terms} disabled={fieldsDisabled} className="md:col-span-2" onChange={(terms) => setSettings({ ...settings, terms })} />
        </div>
        {canEdit && (
          <div className="mt-6 pt-5 border-t border-violet-100 dark:border-violet-400/15">
            <SaveButton onSave={onSave} isSaving={isSaving} label="Save Invoice Settings" />
          </div>
        )}
      </SectionCard>
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

      <SectionCard icon={Percent} title="GST Configuration" subtitle="Default tax rates and supply rules applied to new invoices.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Default GST Rate</label>
            <AppSelect
              value={String(settings.default_gst_rate)}
              onChange={(v) => setSettings({ ...settings, default_gst_rate: Number(v) })}
              disabled={!canEdit}
              options={[{ value: '0', label: '0%' }, { value: '5', label: '5%' }, { value: '12', label: '12%' }, { value: '18', label: '18%' }, { value: '28', label: '28%' }]}
              className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
          <SettingsInput label="Default Place of Supply" value={settings.default_place_of_supply} disabled={!canEdit} placeholder="e.g. Karnataka" onChange={(default_place_of_supply) => setSettings({ ...settings, default_place_of_supply })} />
          <label className={`md:col-span-2 flex items-center gap-3 px-4 py-3 rounded-lg border ${settings.enable_reverse_charge ? 'border-violet-500 bg-violet-50/60 dark:bg-violet-500/10' : 'border-violet-200 dark:border-violet-400/25 bg-card'} ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}>
            <input
              type="checkbox"
              checked={settings.enable_reverse_charge}
              onChange={(event) => setSettings({ ...settings, enable_reverse_charge: event.target.checked })}
              disabled={!canEdit}
              className="w-4 h-4 rounded accent-violet-500"
            />
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold text-foreground">Enable Reverse Charge Mechanism</div>
              <div className="text-[11.5px] text-muted-foreground mt-0.5">
                When on, RCM rules apply to invoices marked with reverse charge.
              </div>
            </div>
          </label>
        </div>
        {canEdit && (
          <div className="mt-6 pt-5 border-t border-violet-100 dark:border-violet-400/15">
            <SaveButton onSave={onSave} isSaving={isSaving} label="Save Tax Settings" />
          </div>
        )}
      </SectionCard>
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
      <SectionCard icon={Shield} title="Password &amp; Authentication" subtitle="Change the password used to sign in to your account.">
        <div className="space-y-4">
          <SettingsInput label="Current Password" type="password" value={passwordData.currentPassword} onChange={(currentPassword) => setPasswordData({ ...passwordData, currentPassword })} />
          <SettingsInput label="New Password" type="password" value={passwordData.newPassword} onChange={(newPassword) => setPasswordData({ ...passwordData, newPassword })} />
          <SettingsInput label="Confirm New Password" type="password" value={passwordData.confirmPassword} onChange={(confirmPassword) => setPasswordData({ ...passwordData, confirmPassword })} />
        </div>
        <div className="mt-6 pt-5 border-t border-violet-100 dark:border-violet-400/15">
          <SaveButton onSave={updatePassword} isSaving={isSaving} label="Update Password" />
        </div>
      </SectionCard>
    </div>
  );
}

function ViewOnlyNotice() {
  return (
    <div className="bg-violet-50/60 dark:bg-violet-500/[0.06] border border-violet-200 dark:border-violet-400/25 rounded-xl p-4 text-sm text-foreground/85 flex items-start gap-3">
      <div className="h-8 w-8 rounded-full bg-violet-500 flex items-center justify-center flex-shrink-0">
        <Shield className="w-4 h-4 text-white" />
      </div>
      <p className="leading-relaxed pt-1">
        You can view these settings. Only the owner can make changes.
      </p>
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
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  type?: string;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className={`w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition disabled:opacity-60 disabled:cursor-not-allowed ${inputClassName}`}
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
      <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">{label}</label>
      <textarea
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="w-full px-3.5 py-2.5 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition resize-none disabled:opacity-60 disabled:cursor-not-allowed"
      />
    </div>
  );
}

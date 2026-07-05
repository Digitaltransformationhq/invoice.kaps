import { useEffect, useMemo, useState } from 'react';
import { Mail, Phone, MapPin, Save, Camera, Building2, Upload, ShieldCheck, Edit3 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { AppSelect } from '../common/AppSelect';

interface ProfileFormData {
  name: string;
  email: string;
  phone: string;
  designation: string;
  company: string;
  gstin: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  companyLogo: string;
}

const emptyProfile: ProfileFormData = {
  name: '',
  email: '',
  phone: '',
  designation: '',
  company: '',
  gstin: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  companyLogo: '',
};

const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman & Nicobar Islands', 'Chandigarh', 'Dadra & Nagar Haveli and Daman & Diu',
  'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

export function MyProfile() {
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<ProfileFormData>(emptyProfile);
  const [savedData, setSavedData] = useState<ProfileFormData>(emptyProfile);

  const isOwner = user?.role === 'owner';
  const initials = useMemo(() => {
    const source = formData.name || formData.email || 'User';
    return source
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }, [formData.name, formData.email]);

  const applyProfile = (profile: ProfileFormData) => {
    setFormData(profile);
    setSavedData(profile);
  };

  const buildProfileFromRows = (profile: any, company: any): ProfileFormData => ({
    name: profile?.full_name || user?.full_name || '',
    email: profile?.email || user?.email || '',
    phone: company?.phone || '',
    designation: profile?.role === 'auditor' ? 'Auditor' : 'Owner',
    company: company?.company_name || user?.company_name || '',
    gstin: company?.gstin || user?.company_gstin || '',
    address: company?.address || '',
    city: company?.city || '',
    state: company?.state || '',
    pincode: company?.pin_code || '',
    companyLogo: company?.company_logo || user?.company_logo || '',
  });

  const loadProfile = async () => {
    if (!user?.id || !user.company_id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      if (user.role === 'auditor') {
        const { data, error } = await supabase.rpc('get_auditor_profile', {
          p_auditor_id: user.id,
        });

        if (error || !data?.success) {
          throw new Error(data?.error || error?.message || 'Could not load profile');
        }

        applyProfile(buildProfileFromRows(data.profile, data.company));
        return;
      }

      const [profileResponse, companyResponse] = await Promise.all([
        supabase
          .from('app_users')
          .select('id, email, full_name, role')
          .eq('id', user.id)
          .single(),
        supabase
          .from('companies')
          .select('id, company_name, gstin, phone, address, city, state, pin_code, company_logo')
          .eq('id', user.company_id)
          .single(),
      ]);

      if (profileResponse.error) throw profileResponse.error;
      if (companyResponse.error) throw companyResponse.error;

      applyProfile(buildProfileFromRows(profileResponse.data, companyResponse.data));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load profile');
      applyProfile({
        ...emptyProfile,
        name: user.full_name || '',
        email: user.email || '',
        designation: isOwner ? 'Owner' : 'Auditor',
        company: user.company_name || '',
        gstin: user.company_gstin || '',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, [user?.id, user?.company_id]);

  const syncStoredUser = (nextProfile: ProfileFormData) => {
    try {
      const storedUser = localStorage.getItem('user');
      if (!storedUser) return;

      const parsedUser = JSON.parse(storedUser);
      const nextUser = {
        ...parsedUser,
        email: nextProfile.email,
        full_name: nextProfile.name,
        company_name: nextProfile.company,
        company_gstin: nextProfile.gstin,
        company_logo: nextProfile.companyLogo,
      };

      localStorage.setItem('user', JSON.stringify(nextUser));
      window.dispatchEvent(new Event('company-profile-updated'));
    } catch (error) {
      console.warn('Could not sync stored profile:', error);
    }
  };

  const validateProfile = () => {
    if (!formData.name.trim() || !formData.email.trim()) {
      toast.error('Name and email are required');
      return false;
    }

    if (isOwner && !formData.company.trim()) {
      toast.error('Company name is required');
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (!user?.id || !validateProfile()) return;

    setIsSaving(true);

    try {
      if (user.role === 'auditor') {
        const { data, error } = await supabase.rpc('update_auditor_profile', {
          p_auditor_id: user.id,
          p_full_name: formData.name.trim(),
          p_email: formData.email.trim(),
        });

        if (error || !data?.success) {
          throw new Error(data?.error || error?.message || 'Could not save profile');
        }
      } else {
        const profileUpdate = supabase
          .from('app_users')
          .update({
            full_name: formData.name.trim(),
            email: formData.email.trim().toLowerCase(),
          })
          .eq('id', user.id);

        const companyUpdate = supabase
          .from('companies')
          .update({
            company_name: formData.company.trim(),
            gstin: formData.gstin.trim().toUpperCase() || null,
            phone: formData.phone.trim() || null,
            address: formData.address.trim() || null,
            city: formData.city.trim() || null,
            state: formData.state.trim() || null,
            pin_code: formData.pincode.trim() || null,
            company_logo: formData.companyLogo || null,
          })
          .eq('id', user.company_id);

        const [{ error: profileError }, { error: companyError }] = await Promise.all([
          profileUpdate,
          companyUpdate,
        ]);

        if (profileError) throw profileError;
        if (companyError) throw companyError;

        if (formData.email.trim().toLowerCase() !== savedData.email.trim().toLowerCase()) {
          const { error: authError } = await supabase.auth.updateUser({
            email: formData.email.trim().toLowerCase(),
          });

          if (authError) {
            toast.warning('Profile saved, but auth email update needs attention', {
              description: authError.message,
            });
          }
        }
      }

      const nextProfile = {
        ...formData,
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        gstin: formData.gstin.trim().toUpperCase(),
        companyLogo: formData.companyLogo,
      };

      applyProfile(nextProfile);
      syncStoredUser(nextProfile);
      setIsEditing(false);
      toast.success('Profile updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData(savedData);
    setIsEditing(false);
  };

  const handleCompanyLogoUpload = (file?: File) => {
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
    reader.onload = () => setFormData({ ...formData, companyLogo: String(reader.result || '') });
    reader.onerror = () => toast.error('Could not read company logo');
    reader.readAsDataURL(file);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Loading profile…</p>
        </div>
      </div>
    );
  }

  const locationLabel = [formData.city, formData.state].filter(Boolean).join(', ');

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="text-[10.5px] font-semibold tracking-[0.16em] uppercase text-violet-600 dark:text-violet-300">
            Account
          </div>
          <h1 className="text-[22px] sm:text-[24px] font-semibold text-foreground tracking-tight leading-tight">
            My Profile
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your personal and company information.</p>
        </div>
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-full bg-violet-500 hover:bg-violet-400 text-white text-[14px] font-semibold shadow-[0_4px_18px_-4px_rgba(139,92,246,0.6)] transition-all"
          >
            <Edit3 className="w-4 h-4" />
            Edit Profile
          </button>
        ) : (
          <div className="flex items-stretch gap-2">
            <button
              onClick={handleCancel}
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-full border border-violet-200 dark:border-violet-400/25 bg-card text-foreground text-[14px] font-medium hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-all disabled:opacity-60 flex-1 sm:flex-initial"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-full bg-violet-500 hover:bg-violet-400 text-white text-[14px] font-semibold shadow-[0_4px_18px_-4px_rgba(139,92,246,0.6)] transition-all disabled:opacity-60 disabled:cursor-wait flex-1 sm:flex-initial"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sidebar — Profile Card */}
        <div className="bg-card border border-violet-200 dark:border-violet-400/25 rounded-xl p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
          <div className="flex flex-col items-center">
            <div className="relative">
              <div className="w-32 h-32 bg-gradient-to-br from-violet-500 to-violet-600 rounded-full flex items-center justify-center shadow-[0_8px_24px_-8px_rgba(139,92,246,0.5)]">
                <span className="text-[40px] text-white font-semibold">{initials}</span>
              </div>
              {isEditing && (
                <button
                  disabled
                  title="Profile photo upload is coming soon"
                  className="absolute bottom-0 right-0 w-10 h-10 bg-violet-300/60 text-white rounded-full flex items-center justify-center cursor-not-allowed border-2 border-card"
                >
                  <Camera className="w-5 h-5" />
                </button>
              )}
            </div>
            <h3 className="text-[18px] font-semibold text-foreground tracking-tight mt-4">{formData.name || 'User'}</h3>
            <span className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 text-[11px] font-semibold tracking-wider uppercase">
              <ShieldCheck className="w-3 h-3" />
              {formData.designation || (isOwner ? 'Owner' : 'Auditor')}
            </span>
            {formData.company && (
              <p className="text-[13.5px] text-muted-foreground mt-2 text-center">{formData.company}</p>
            )}
          </div>

          <div className="mt-6 pt-6 border-t border-violet-100 dark:border-violet-400/15 space-y-3.5">
            <div className="flex items-center gap-3 text-sm">
              <div className="h-8 w-8 rounded-lg bg-violet-100 dark:bg-violet-500/15 flex items-center justify-center text-violet-700 dark:text-violet-300 flex-shrink-0">
                <Mail className="w-4 h-4" />
              </div>
              <span className="text-foreground break-all">{formData.email || 'Not set'}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="h-8 w-8 rounded-lg bg-violet-100 dark:bg-violet-500/15 flex items-center justify-center text-violet-700 dark:text-violet-300 flex-shrink-0">
                <Phone className="w-4 h-4" />
              </div>
              <span className="text-foreground tabular-nums">{formData.phone || 'Not set'}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="h-8 w-8 rounded-lg bg-violet-100 dark:bg-violet-500/15 flex items-center justify-center text-violet-700 dark:text-violet-300 flex-shrink-0">
                <MapPin className="w-4 h-4" />
              </div>
              <span className="text-foreground">{locationLabel || 'Not set'}</span>
            </div>
          </div>
        </div>

        {/* Main column — Personal + Company Information */}
        <div className="lg:col-span-2 space-y-6">
          {/* Personal Information */}
          <div className="bg-card border border-violet-200 dark:border-violet-400/25 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
            <div className="flex items-center gap-2 mb-5">
              <div className="h-6 w-6 rounded-full bg-violet-500 text-white text-[11px] font-bold flex items-center justify-center">1</div>
              <h3 className="text-[16px] font-semibold text-foreground tracking-tight">Personal Information</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ProfileInput label="Full Name" value={formData.name} disabled={!isEditing} onChange={(name) => setFormData({ ...formData, name })} />
              <ProfileInput label="Email Address" type="email" value={formData.email} disabled={!isEditing} onChange={(email) => setFormData({ ...formData, email })} />
              <ProfileInput label="Phone Number" type="tel" value={formData.phone} disabled={!isEditing || !isOwner} onChange={(phone) => setFormData({ ...formData, phone })} />
              <ProfileInput label="Designation" value={formData.designation} disabled onChange={() => {}} />
            </div>
          </div>

          {/* Company Information */}
          <div className="bg-card border border-violet-200 dark:border-violet-400/25 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-violet-500 text-white text-[11px] font-bold flex items-center justify-center">2</div>
                <h3 className="text-[16px] font-semibold text-foreground tracking-tight">Company Information</h3>
              </div>
              {!isOwner && (
                <span className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground bg-muted px-2 py-1 rounded-md">
                  View only
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Company Logo */}
              <div className="md:col-span-2">
                <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Company Logo</label>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="w-20 h-20 rounded-lg border border-violet-200 dark:border-violet-400/25 bg-violet-50/40 dark:bg-violet-500/[0.05] flex items-center justify-center overflow-hidden">
                    {formData.companyLogo ? (
                      <img src={formData.companyLogo} alt="Company logo" className="w-full h-full object-contain" />
                    ) : (
                      <Building2 className="w-7 h-7 text-violet-600 dark:text-violet-300" />
                    )}
                  </div>
                  {isEditing && isOwner && (
                    <>
                      <label className="inline-flex items-center gap-2 px-4 h-10 border border-violet-200 dark:border-violet-400/25 bg-card text-foreground rounded-lg text-[13px] font-medium hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors cursor-pointer">
                        <Upload className="w-4 h-4" />
                        <span>Upload Logo</span>
                        <input type="file" accept="image/*" className="hidden" onChange={(event) => handleCompanyLogoUpload(event.target.files?.[0])} />
                      </label>
                      {formData.companyLogo && (
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, companyLogo: '' })}
                          className="text-[12.5px] text-muted-foreground hover:text-destructive transition-colors"
                        >
                          Remove
                        </button>
                      )}
                    </>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">Square PNG/JPG under 1 MB looks best on invoices.</p>
              </div>

              <div className="md:col-span-2">
                <ProfileInput label="Company Name" value={formData.company} disabled={!isEditing || !isOwner} onChange={(company) => setFormData({ ...formData, company })} />
              </div>
              <ProfileInput label="GSTIN" value={formData.gstin} disabled={!isEditing || !isOwner} inputClassName="font-mono uppercase" onChange={(gstin) => setFormData({ ...formData, gstin })} placeholder="29ABCDE1234F1Z5" />
              <ProfileInput label="Pincode" value={formData.pincode} disabled={!isEditing || !isOwner} onChange={(pincode) => setFormData({ ...formData, pincode })} placeholder="560001" />
              <div className="md:col-span-2">
                <ProfileInput label="Address" value={formData.address} disabled={!isEditing || !isOwner} onChange={(address) => setFormData({ ...formData, address })} />
              </div>
              <ProfileInput label="City" value={formData.city} disabled={!isEditing || !isOwner} onChange={(city) => setFormData({ ...formData, city })} />
              <div>
                <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">State</label>
                <AppSelect
                  value={formData.state}
                  onChange={(v) => setFormData({ ...formData, state: v })}
                  disabled={!isEditing || !isOwner}
                  placeholder="Select state"
                  options={STATES}
                  className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileInput({
  label,
  value,
  onChange,
  disabled = false,
  type = 'text',
  placeholder,
  inputClassName = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  type?: string;
  placeholder?: string;
  inputClassName?: string;
}) {
  return (
    <div>
      <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition disabled:opacity-60 disabled:cursor-not-allowed ${inputClassName}`}
      />
    </div>
  );
}

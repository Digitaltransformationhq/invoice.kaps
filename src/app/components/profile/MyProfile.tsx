import { useEffect, useMemo, useState } from 'react';
import { Mail, Phone, MapPin, Save, Camera, Building2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';

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

const states = [
  'Maharashtra',
  'Karnataka',
  'Tamil Nadu',
  'Gujarat',
  'Delhi',
  'Rajasthan',
  'Uttar Pradesh',
  'West Bengal',
  'Telangana',
  'Kerala',
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
        <div className="text-sm text-muted-foreground">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">My Profile</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your personal information</p>
        </div>
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors"
          >
            Edit Profile
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              className="px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-border rounded-lg p-6">
          <div className="flex flex-col items-center">
            <div className="relative">
              <div className="w-32 h-32 bg-accent rounded-full flex items-center justify-center">
                <span className="text-4xl text-white font-semibold">{initials}</span>
              </div>
              {isEditing && (
                <button
                  disabled
                  title="Profile photo upload is not enabled yet"
                  className="absolute bottom-0 right-0 w-10 h-10 bg-primary/60 text-white rounded-full flex items-center justify-center cursor-not-allowed"
                >
                  <Camera className="w-5 h-5" />
                </button>
              )}
            </div>
            <h3 className="text-lg font-semibold text-foreground mt-4">{formData.name || 'User'}</h3>
            <p className="text-sm text-muted-foreground">{formData.designation}</p>
            <p className="text-sm text-muted-foreground mt-1">{formData.company}</p>
          </div>

          <div className="mt-6 pt-6 border-t border-border space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <span className="text-foreground break-all">{formData.email}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Phone className="w-4 h-4 text-muted-foreground" />
              <span className="text-foreground">{formData.phone || 'Not set'}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <span className="text-foreground">{[formData.city, formData.state].filter(Boolean).join(', ') || 'Not set'}</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-border rounded-lg p-6">
            <h3 className="font-semibold text-foreground mb-4">Personal Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ProfileInput label="Full Name" value={formData.name} disabled={!isEditing} onChange={(name) => setFormData({ ...formData, name })} />
              <ProfileInput label="Email Address" type="email" value={formData.email} disabled={!isEditing} onChange={(email) => setFormData({ ...formData, email })} />
              <ProfileInput label="Phone Number" type="tel" value={formData.phone} disabled={!isEditing || !isOwner} onChange={(phone) => setFormData({ ...formData, phone })} />
              <ProfileInput label="Designation" value={formData.designation} disabled onChange={() => {}} />
            </div>
          </div>

          <div className="bg-white border border-border rounded-lg p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <h3 className="font-semibold text-foreground">Company Information</h3>
              {!isOwner && (
                <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">View only</span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-foreground mb-2">Company Logo</label>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="w-20 h-20 rounded border border-border bg-muted flex items-center justify-center overflow-hidden">
                    {formData.companyLogo ? (
                      <img src={formData.companyLogo} alt="Company logo" className="w-full h-full object-contain" />
                    ) : (
                      <Building2 className="w-7 h-7 text-muted-foreground" />
                    )}
                  </div>
                  {isEditing && isOwner && (
                    <>
                      <label className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded hover:bg-muted transition-colors cursor-pointer">
                        <Upload className="w-4 h-4" />
                        <span className="text-sm">Upload Logo</span>
                        <input type="file" accept="image/*" className="hidden" onChange={(event) => handleCompanyLogoUpload(event.target.files?.[0])} />
                      </label>
                      {formData.companyLogo && (
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, companyLogo: '' })}
                          className="text-sm text-muted-foreground hover:text-foreground"
                        >
                          Remove
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="md:col-span-2">
                <ProfileInput label="Company Name" value={formData.company} disabled={!isEditing || !isOwner} onChange={(company) => setFormData({ ...formData, company })} />
              </div>
              <ProfileInput label="GSTIN" value={formData.gstin} disabled={!isEditing || !isOwner} inputClassName="font-mono" onChange={(gstin) => setFormData({ ...formData, gstin })} />
              <ProfileInput label="Pincode" value={formData.pincode} disabled={!isEditing || !isOwner} onChange={(pincode) => setFormData({ ...formData, pincode })} />
              <div className="md:col-span-2">
                <ProfileInput label="Address" value={formData.address} disabled={!isEditing || !isOwner} onChange={(address) => setFormData({ ...formData, address })} />
              </div>
              <ProfileInput label="City" value={formData.city} disabled={!isEditing || !isOwner} onChange={(city) => setFormData({ ...formData, city })} />
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">State</label>
                <select
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  disabled={!isEditing || !isOwner}
                  className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                >
                  <option value="">Select state</option>
                  {states.map((state) => (
                    <option key={state}>{state}</option>
                  ))}
                </select>
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
      <label className="block text-sm font-medium text-foreground mb-2">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 ${inputClassName}`}
      />
    </div>
  );
}

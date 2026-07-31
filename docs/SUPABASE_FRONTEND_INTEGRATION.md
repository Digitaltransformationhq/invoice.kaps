# Frontend Integration with Supabase

## Installation

First, install the Supabase client:
```bash
pnpm add @supabase/supabase-js
```

## Files to Update

### 1. Replace AuthContext

Replace `/src/contexts/AuthContext.tsx` with `/src/contexts/AuthContext.SUPABASE.tsx`:

```bash
# Backup current file
mv src/contexts/AuthContext.tsx src/contexts/AuthContext.BACKUP.tsx

# Rename Supabase version
mv src/contexts/AuthContext.SUPABASE.tsx src/contexts/AuthContext.tsx
```

### 2. Update LandingPage Signup Handler

In `/src/app/components/LandingPage.tsx`, update the `handleSignup` function:

```typescript
import { supabase } from '../../contexts/AuthContext';

const handleSignup = async (e: React.FormEvent) => {
  e.preventDefault();

  // Validate required fields
  if (!signupData.fullName || !signupData.email || !signupData.password ||
      !signupData.phone || !signupData.companyName || !signupData.gstin ||
      !signupData.address || !signupData.city || !signupData.state || !signupData.pinCode) {
    toast.error('Please fill in all required fields');
    return;
  }

  if (signupData.password.length < 8) {
    toast.error('Password must be at least 8 characters');
    return;
  }

  if (signupData.gstin.length !== 15) {
    toast.error('GSTIN must be 15 characters');
    return;
  }

  if (signupData.pinCode.length !== 6 || !/^\d+$/.test(signupData.pinCode)) {
    toast.error('PIN Code must be 6 digits');
    return;
  }

  const phoneDigits = signupData.phone.replace(/\D/g, '');
  if (phoneDigits.length !== 10) {
    toast.error('Phone number must be 10 digits');
    return;
  }

  try {
    // Call Supabase function to create account
    const { data, error } = await supabase.rpc('handle_new_user_signup', {
      p_email: signupData.email,
      p_password: signupData.password,
      p_full_name: signupData.fullName,
      p_phone: signupData.phone,
      p_company_name: signupData.companyName,
      p_gstin: signupData.gstin,
      p_address: signupData.address,
      p_city: signupData.city,
      p_state: signupData.state,
      p_pin_code: signupData.pinCode
    });

    if (error) {
      toast.error('Signup failed: ' + error.message);
      return;
    }

    if (!data.success) {
      toast.error(data.error || 'Signup failed');
      return;
    }

    toast.success('Account created successfully! Please login to continue.');
    setShowSignupModal(false);
    setShowLoginModal(true);

    // Reset form
    setSignupData({
      fullName: '',
      email: '',
      password: '',
      phone: '',
      companyName: '',
      gstin: '',
      address: '',
      city: '',
      state: '',
      pinCode: ''
    });

  } catch (error) {
    console.error('Signup error:', error);
    toast.error('An error occurred during signup');
  }
};
```

### 3. Update Login Handler

The login is already handled by AuthContext. Just make sure to pass the role:

```typescript
const handleLogin = async (e: React.FormEvent) => {
  e.preventDefault();

  try {
    const success = await login(loginEmail, loginPassword, loginRole);
    if (success) {
      toast.success('Login successful!');
      setShowLoginModal(false);
      navigate('/app');
    } else {
      toast.error('Invalid email or password');
    }
  } catch (error) {
    toast.error('Login failed. Please try again.');
  }
};
```

### 4. Update AuditorManagement Component

In `/src/app/components/auditor/AuditorManagement.tsx`, replace localStorage operations with Supabase:

```typescript
import { supabase } from '../../../contexts/AuthContext';
import { useAuth } from '../../../contexts/AuthContext';

export function AuditorManagement() {
  const { user } = useAuth();
  const [auditors, setAuditors] = useState<Auditor[]>([]);
  const [loading, setLoading] = useState(true);

  // Load auditors from Supabase
  useEffect(() => {
    loadAuditors();
  }, []);

  const loadAuditors = async () => {
    try {
      if (!user?.company_id) return;

      const { data, error } = await supabase
        .from('auditors')
        .select('*')
        .eq('company_id', user.company_id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading auditors:', error);
        toast.error('Failed to load auditors');
        return;
      }

      setAuditors(data || []);
    } catch (error) {
      console.error('Error:', error);
      toast.error('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAuditor = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !email || !password) {
      toast.error('Please fill in all fields');
      return;
    }

    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    if (selectedPermissions.length === 0) {
      toast.error('Please select at least one permission');
      return;
    }

    try {
      const { data, error } = await supabase.rpc('create_auditor', {
        p_company_id: user?.company_id,
        p_name: name,
        p_email: email,
        p_password: password,
        p_permissions: selectedPermissions
      });

      if (error) {
        toast.error('Failed to create auditor: ' + error.message);
        return;
      }

      if (!data.success) {
        toast.error(data.error || 'Failed to create auditor');
        return;
      }

      toast.success('Auditor created successfully');

      // Reload auditors
      await loadAuditors();

      // Reset form
      setName('');
      setEmail('');
      setPassword('');
      setSelectedPermissions([]);
      setShowCreateModal(false);

    } catch (error) {
      console.error('Error:', error);
      toast.error('An error occurred');
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedAuditor) return;

    try {
      const { data, error } = await supabase.rpc('update_auditor', {
        p_auditor_id: selectedAuditor.id,
        p_name: name,
        p_email: email,
        p_password: password,
        p_permissions: selectedPermissions
      });

      if (error) {
        toast.error('Failed to update auditor: ' + error.message);
        return;
      }

      if (!data.success) {
        toast.error(data.error || 'Failed to update auditor');
        return;
      }

      toast.success('Auditor updated successfully');

      // Reload auditors
      await loadAuditors();

      // Reset form
      setName('');
      setEmail('');
      setPassword('');
      setSelectedPermissions([]);
      setShowEditModal(false);
      setSelectedAuditor(null);

    } catch (error) {
      console.error('Error:', error);
      toast.error('An error occurred');
    }
  };

  const handleDeleteAuditor = async (id: string) => {
    if (!confirm('Are you sure you want to delete this auditor?')) {
      return;
    }

    try {
      const { data, error } = await supabase.rpc('delete_auditor', {
        p_auditor_id: id
      });

      if (error) {
        toast.error('Failed to delete auditor: ' + error.message);
        return;
      }

      if (!data.success) {
        toast.error(data.error || 'Failed to delete auditor');
        return;
      }

      toast.success('Auditor deleted successfully');

      // Reload auditors
      await loadAuditors();

    } catch (error) {
      console.error('Error:', error);
      toast.error('An error occurred');
    }
  };

  // Remove password visibility toggle - passwords are now hashed
  // Just show "••••••••" for all passwords
  
  // Rest of the component...
}
```

### 5. Update Password Display

Since passwords are now hashed in the database, you should NOT show them. Update the password column:

```typescript
<td className="px-6 py-4">
  <span className="text-sm text-muted-foreground font-mono">
    {'••••••••'}
  </span>
</td>
```

Remove the password visibility toggle feature entirely since hashed passwords cannot be reversed.

## Environment Setup

Create `.env.local` in your project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**Important**: Add `.env.local` to `.gitignore` to keep credentials secure!

## Testing

### Test Owner Signup
1. Fill out the signup form with all details
2. Check Supabase dashboard > Authentication > Users
3. Check Database > companies table

### Test Owner Login
1. Use the email and password from signup
2. Should redirect to /app dashboard

### Test Auditor Creation
1. Login as owner
2. Go to Auditor Management
3. Create a new auditor with permissions
4. Check Database > auditors table

### Test Auditor Login
1. Click "Auditor Login" in footer
2. Use auditor credentials
3. Should see only permitted sections in sidebar

## Migration from localStorage

If you have existing data in localStorage that you want to migrate:

1. Create a migration script to read localStorage data
2. Format it for Supabase
3. Insert via Supabase client
4. Clear localStorage after successful migration

## Security Checklist

- ✅ Passwords are hashed with bcrypt
- ✅ RLS policies protect data access
- ✅ Auth tokens stored securely
- ✅ Environment variables not in git
- ✅ Owner and auditor separated by authentication method
- ✅ Auditor permissions stored as JSONB array

## Next Steps

1. Add customer management with Supabase
2. Add invoice management with Supabase
3. Implement real-time updates with Supabase subscriptions
4. Add file upload for invoice attachments

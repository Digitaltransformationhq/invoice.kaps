# Fixed Supabase Integration

## What Changed

The previous SQL had issues with directly creating users in `auth.users` table. This is the **CORRECT** approach:

1. **Signup uses Supabase Auth** with user metadata
2. **Trigger automatically creates company record** when user signs up
3. **No custom signup function** needed

## Step 1: Run the Fixed SQL

1. Delete the old setup if you ran it:
   - Go to Supabase SQL Editor
   - Run: `DROP TABLE IF EXISTS invoices, items, customers, auditors, companies CASCADE;`
   
2. Run the new fixed SQL:
   - Copy content from `supabase_setup_fixed.sql`
   - Paste into Supabase SQL Editor
   - Click "Run"

## Step 2: Update Frontend Signup Code

In `/src/app/components/LandingPage.tsx`, replace the `handleSignup` function:

```typescript
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
    // Sign up using Supabase Auth with metadata
    const { data, error } = await supabase.auth.signUp({
      email: signupData.email,
      password: signupData.password,
      options: {
        data: {
          full_name: signupData.fullName,
          phone: signupData.phone,
          company_name: signupData.companyName,
          gstin: signupData.gstin,
          address: signupData.address,
          city: signupData.city,
          state: signupData.state,
          pin_code: signupData.pinCode
        }
      }
    });

    if (error) {
      toast.error('Signup failed: ' + error.message);
      return;
    }

    if (!data.user) {
      toast.error('Signup failed');
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

## Step 3: Add Supabase Import

At the top of `/src/app/components/LandingPage.tsx`, add:

```typescript
import { supabase } from '../../contexts/AuthContext';
```

## How It Works Now

### Owner Signup Flow:
1. User fills signup form
2. Frontend calls `supabase.auth.signUp()` with metadata
3. Supabase creates user in `auth.users` table
4. **Trigger automatically runs** and creates record in `companies` table
5. User can now login

### Owner Login Flow:
1. User enters email/password
2. Frontend calls `supabase.auth.signInWithPassword()`
3. AuthContext fetches company details
4. User is logged in

### Auditor Creation Flow:
1. Owner calls `create_auditor()` function
2. Password is hashed and stored
3. Auditor record created

### Auditor Login Flow:
1. Auditor enters email/password
2. Frontend calls `verify_auditor_login()` function
3. Function verifies hashed password
4. Returns auditor data with permissions

## Key Differences

| Old (Broken) | New (Fixed) |
|--------------|-------------|
| Custom function to create auth user | Supabase Auth API |
| Manual insert into auth.users | Trigger auto-creates company |
| Complex error handling | Simple and clean |

## Testing

### Test Owner Signup:
```
1. Click "Get Started"
2. Fill all fields
3. Submit
4. Check Supabase Dashboard > Authentication > Users
5. Check Database > companies table
6. Both should have new record
```

### Test Owner Login:
```
1. Click "Login"
2. Use signup email/password
3. Should redirect to /app
```

### Test Auditor:
```
1. Login as owner
2. Go to Auditor Management
3. Create auditor
4. Logout
5. Click "Auditor Login" in footer
6. Use auditor credentials
7. Should see limited sidebar
```

## Troubleshooting

### "Email already registered"
- User already exists in auth.users
- Use different email or reset password

### "Company not found" after login
- Trigger might not have run
- Check companies table for auth_user_id

### Trigger not working
- Verify trigger exists: `SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';`
- Check trigger function: `\df handle_new_user`

### RLS blocking access
- Make sure user is authenticated
- Check RLS policies are correct

## Complete Setup Checklist

- [ ] Run `supabase_setup_fixed.sql`
- [ ] Update LandingPage.tsx handleSignup
- [ ] Add supabase import to LandingPage.tsx
- [ ] Test owner signup
- [ ] Test owner login
- [ ] Test auditor creation
- [ ] Test auditor login
- [ ] Verify permissions work

## Email Confirmation (Optional)

By default, Supabase requires email confirmation. To disable for testing:

1. Go to Supabase Dashboard
2. Authentication > Settings
3. Disable "Enable email confirmations"
4. Save

For production, keep email confirmations enabled!

# Setup Checklist - Fix Signup Issue

## The Problem
Your signup wasn't saving to Supabase because the frontend was using placeholder code instead of actually calling Supabase.

## ✅ What I Fixed
- Added Supabase client import to LandingPage.tsx
- Updated `handleSignup` to call `supabase.auth.signUp()` with user metadata
- The trigger will now auto-create the company record

## 🔧 Steps to Complete Setup

### Step 1: Install Supabase Client (if not already installed)
```bash
pnpm add @supabase/supabase-js
```

### Step 2: Create Environment File
Create a file named `.env.local` in your project root:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Get these values from:**
- Go to Supabase Dashboard
- Click on your project
- Go to Settings → API
- Copy "Project URL" → Use as `VITE_SUPABASE_URL`
- Copy "anon public" key → Use as `VITE_SUPABASE_ANON_KEY`

### Step 3: Run the Database Setup
1. Go to Supabase Dashboard → SQL Editor
2. Copy **ALL** content from `supabase_setup_v2.sql`
3. Paste into SQL Editor
4. Click **Run**

### Step 4: Disable Email Confirmation (For Testing)
1. Go to Supabase Dashboard
2. Authentication → Settings
3. Find "Enable email confirmations"
4. **Toggle it OFF** (disable it)
5. Click Save

**Important:** This is for testing only. In production, you should enable email confirmation!

### Step 5: Restart Your Dev Server
```bash
# Stop the current server (Ctrl+C)
# Then restart
pnpm run dev
```

Environment variables are only loaded when the server starts!

### Step 6: Test Signup
1. Go to your landing page
2. Click "Get Started"
3. Fill in ALL fields:
   - Full Name: John Doe
   - Phone: +91 9876543210
   - Email: test@example.com
   - Password: password123
   - Company Name: Test Company Pvt Ltd
   - GSTIN: 27AAAAA0000A1Z5 (must be exactly 15 characters)
   - Address: 123 Test Street
   - City: Mumbai
   - State: Maharashtra
   - PIN Code: 400001 (must be exactly 6 digits)
4. Click "Create Account"

### Step 7: Verify in Supabase
After signup, check Supabase Dashboard:

**1. Check Authentication:**
- Go to Authentication → Users
- You should see the new user with their email

**2. Check Database:**
- Go to Table Editor → companies
- You should see a new row with all the company details
- The `auth_user_id` should match the user ID from Authentication

## 🐛 Troubleshooting

### "Invalid Supabase URL"
- Check your `.env.local` file exists
- Make sure it's in the project root (same folder as `package.json`)
- Restart dev server after creating `.env.local`

### "User already registered"
- Email is already in the database
- Try a different email OR
- Delete the user from Supabase Dashboard → Authentication → Users

### No company record created
- The trigger might not have run
- Check Supabase SQL Editor logs for errors
- Make sure you ran `supabase_setup_v2.sql` completely
- Check the trigger exists:
  ```sql
  SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
  ```

### "Email not confirmed"
- Make sure you disabled "Enable email confirmations" in Auth settings
- Or check your email for confirmation link

### Environment variables not working
- File must be named exactly `.env.local` (not `.env`)
- Must be in project root directory
- Must restart dev server after creating/editing
- Check console for `undefined` values

## ✅ Success Indicators

When everything works correctly:

1. ✅ Signup form submits without errors
2. ✅ Toast shows "Account created successfully!"
3. ✅ Login modal opens automatically
4. ✅ User appears in Supabase → Authentication → Users
5. ✅ Company record appears in Supabase → Database → companies table
6. ✅ You can login with the email/password you just created

## 🔄 Next Test: Login

After successful signup, test login:

1. Use the email and password from signup
2. Click "Login" button
3. Enter credentials
4. Should redirect to `/app/dashboard`
5. Should see your company name in the sidebar

## 📝 Notes

- **First signup might take 2-3 seconds** - that's normal
- **Check browser console** for any error messages
- **Check Supabase logs** in Dashboard → Logs
- **Environment file changes** require server restart
- **SQL changes** take effect immediately

Try signing up again now - it should work! 🎉

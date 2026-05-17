# 🚀 Quick Setup - Get Started in 5 Minutes

## Current Status
✅ Supabase package installed  
✅ .env.local file created  
⚠️ **You need to add your Supabase credentials**

## Step-by-Step Setup

### 1️⃣ Create Supabase Project (2 minutes)

1. Go to **https://app.supabase.com**
2. Click **"New Project"**
3. Fill in:
   - **Name**: GST Invoice Pro (or any name)
   - **Database Password**: Save this somewhere safe
   - **Region**: Choose closest to you
4. Click **"Create new project"**
5. Wait 1-2 minutes for project to be ready

### 2️⃣ Get Your Credentials (1 minute)

1. In your Supabase project dashboard
2. Click **Settings** (gear icon in left sidebar)
3. Click **API** in the settings menu
4. You'll see two important values:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon public** key (under "Project API keys")

### 3️⃣ Update .env.local (1 minute)

1. Open the file `.env.local` in your project root
2. Replace the placeholder values:

```env
# Replace this ↓
VITE_SUPABASE_URL=https://your-project-id.supabase.co
# With your actual Project URL ↓
VITE_SUPABASE_URL=https://abcdefghijklmnop.supabase.co

# Replace this ↓
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your-anon-key-here
# With your actual anon public key ↓
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZi...
```

3. **Save the file**

### 4️⃣ Run Database Setup (1 minute)

1. In Supabase Dashboard, click **SQL Editor** (in left sidebar)
2. Click **"New query"**
3. Open the file `supabase_setup_v2.sql` from your project
4. **Copy ALL the content** (Ctrl+A, Ctrl+C)
5. **Paste** into the SQL Editor
6. Click **"Run"** (or press Ctrl+Enter)
7. Wait for "Success. No rows returned" message

### 5️⃣ Disable Email Confirmation (30 seconds)

**For testing only - skip email verification:**

1. In Supabase Dashboard
2. Click **Authentication** → **Settings**
3. Scroll to "Email Auth"
4. Find **"Enable email confirmations"**
5. **Toggle it OFF** (disable)
6. Click **Save**

### 6️⃣ Restart Dev Server (10 seconds)

```bash
# Stop the current server
# Press Ctrl+C

# Start it again
pnpm run dev
```

## ✅ Test It Works

### Try Signup:
1. Go to your app landing page
2. Click **"Get Started"**
3. Fill in the signup form
4. Submit

### Check Supabase:
1. Go to Supabase Dashboard
2. Click **Authentication** → **Users**
3. You should see your new user!
4. Click **Table Editor** → **companies**
5. You should see your company data!

## 🐛 Troubleshooting

### "Database not configured" error
- Check your `.env.local` file has real values (not placeholders)
- Make sure you saved the file
- Restart dev server

### "User already registered"
- Email is already in database
- Use a different email OR
- Delete user from Supabase → Authentication → Users

### Can't login after signup
- Check you disabled email confirmations
- Check Supabase logs for errors

### Environment variables not working
- File must be exactly `.env.local` (not `.env`)
- Must be in project root (same folder as `package.json`)
- Must restart dev server after editing

## 📞 Need Help?

If stuck, check:
- `SETUP_CHECKLIST.md` - Detailed troubleshooting
- `SUPABASE_FIXED_INTEGRATION.md` - Complete integration guide
- Browser console for error messages
- Supabase Dashboard → Logs for database errors

---

**Once you complete these steps, your signup will save to Supabase!** 🎉

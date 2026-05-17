# Supabase Quick Start Guide

## 🚀 Setup Steps (5 minutes)

### 1. Create Supabase Project
- Go to https://app.supabase.com
- Click "New Project"
- Save your credentials

### 2. Enable pgcrypto Extension
In Supabase SQL Editor:
```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

### 3. Run Setup SQL
- Copy content from `supabase_setup.sql`
- Paste into Supabase SQL Editor
- Click "Run"
- Wait for completion

### 4. Install Dependencies
```bash
pnpm add @supabase/supabase-js
```

### 5. Create Environment File
Create `.env.local`:
```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

### 6. Update Code Files

**Replace AuthContext:**
```bash
mv src/contexts/AuthContext.tsx src/contexts/AuthContext.BACKUP.tsx
mv src/contexts/AuthContext.SUPABASE.tsx src/contexts/AuthContext.tsx
```

**Update LandingPage.tsx** - See `SUPABASE_FRONTEND_INTEGRATION.md` section 2

**Update AuditorManagement.tsx** - See `SUPABASE_FRONTEND_INTEGRATION.md` section 4

### 7. Test the Application

**Owner Signup:**
```
1. Click "Get Started"
2. Fill all fields
3. Submit
4. Login with new credentials
```

**Owner Login:**
```
Email: owner@company.com
Password: owner123
```

**Create Auditor:**
```
1. Login as owner
2. Go to "Auditor Management"
3. Click "Create Auditor"
4. Fill details and select permissions
5. Submit
```

**Auditor Login:**
```
1. Click "Auditor Login" in footer
2. Use credentials created by owner
3. See limited sidebar based on permissions
```

## 📋 What Was Created

### Database Tables
- **companies** - Stores owner/business accounts
- **auditors** - Stores auditor accounts with permissions
- **customers** - Customer records
- **items** - Product/service items
- **invoices** - Invoice records

### Security Functions
- `handle_new_user_signup()` - Owner signup
- `verify_auditor_login()` - Auditor authentication
- `create_auditor()` - Create new auditor
- `update_auditor()` - Update auditor details
- `delete_auditor()` - Remove auditor
- `get_company_by_auth_user()` - Get company details

### Security Features
- ✅ Row Level Security (RLS) on all tables
- ✅ Password hashing with bcrypt
- ✅ Supabase Auth for owners
- ✅ Custom auth function for auditors
- ✅ Permission-based access control

## 🔑 Key Differences from localStorage

| Feature | localStorage | Supabase |
|---------|-------------|----------|
| Data Storage | Browser only | Database (persistent) |
| Password Security | Plain text | Bcrypt hashed |
| Multi-device | No | Yes |
| Scalability | Limited | Unlimited |
| Real-time | No | Yes (optional) |
| Backup | Manual | Automatic |

## 🐛 Troubleshooting

### "Function not found" error
- Make sure you ran the setup SQL completely
- Check Supabase logs for errors

### "Invalid credentials" error
- Check .env.local has correct URL and key
- Verify environment variables are loaded

### RLS policy error
- Confirm you're logged in
- Check user has permission for the action

### Cannot see auditors
- Make sure owner is logged in
- Check company_id matches

## 📚 API Reference

### Owner Signup
```typescript
await supabase.rpc('handle_new_user_signup', {
  p_email: string,
  p_password: string,
  p_full_name: string,
  p_phone: string,
  p_company_name: string,
  p_gstin: string,
  p_address: string,
  p_city: string,
  p_state: string,
  p_pin_code: string
});
```

### Owner Login
```typescript
await supabase.auth.signInWithPassword({
  email: string,
  password: string
});
```

### Auditor Login
```typescript
await supabase.rpc('verify_auditor_login', {
  p_email: string,
  p_password: string
});
```

### Create Auditor
```typescript
await supabase.rpc('create_auditor', {
  p_company_id: uuid,
  p_name: string,
  p_email: string,
  p_password: string,
  p_permissions: jsonb
});
```

### Update Auditor
```typescript
await supabase.rpc('update_auditor', {
  p_auditor_id: uuid,
  p_name: string,
  p_email: string,
  p_password: string, // empty string to keep existing
  p_permissions: jsonb
});
```

### Delete Auditor
```typescript
await supabase.rpc('delete_auditor', {
  p_auditor_id: uuid
});
```

## 🎯 Next Steps

1. ✅ Complete setup steps above
2. ✅ Test owner signup and login
3. ✅ Test auditor creation and login
4. 🔄 Migrate customers to Supabase
5. 🔄 Migrate invoices to Supabase
6. 🔄 Add real-time subscriptions
7. 🔄 Deploy to production

## 📞 Support

For issues with:
- **Supabase**: Check [Supabase Docs](https://supabase.com/docs)
- **SQL Errors**: Review the setup SQL file
- **Integration**: Check SUPABASE_FRONTEND_INTEGRATION.md

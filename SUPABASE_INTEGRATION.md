# Supabase Integration Guide

## Step 1: Setup Supabase

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Create a new project
3. Get your project credentials:
   - `SUPABASE_URL`: Found in Settings > API
   - `SUPABASE_ANON_KEY`: Found in Settings > API

## Step 2: Enable pgcrypto Extension

In Supabase SQL Editor, run:
```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

## Step 3: Run the Setup SQL

1. Copy all content from `supabase_setup.sql`
2. Paste into Supabase SQL Editor
3. Run the query

## Step 4: Update AuthContext

Replace `/src/contexts/AuthContext.tsx` with the Supabase-integrated version.

## Step 5: Update Environment Variables

Create a `.env.local` file:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## API Usage Examples

### Signup (Owner)
```typescript
const { data, error } = await supabase.rpc('handle_new_user_signup', {
  p_email: 'user@example.com',
  p_password: 'password123',
  p_full_name: 'John Doe',
  p_phone: '+91 9876543210',
  p_company_name: 'My Company Pvt Ltd',
  p_gstin: '22AAAAA0000A1Z5',
  p_address: '123 Street',
  p_city: 'Mumbai',
  p_state: 'Maharashtra',
  p_pin_code: '400001'
});
```

### Login (Owner)
```typescript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password123'
});
```

### Login (Auditor)
```typescript
const { data, error } = await supabase.rpc('verify_auditor_login', {
  p_email: 'auditor@example.com',
  p_password: 'password123'
});
```

### Create Auditor
```typescript
const { data, error } = await supabase.rpc('create_auditor', {
  p_company_id: 'company-uuid',
  p_name: 'Auditor Name',
  p_email: 'auditor@example.com',
  p_password: 'password123',
  p_permissions: ['dashboard', 'invoices', 'customers']
});
```

### Update Auditor
```typescript
const { data, error } = await supabase.rpc('update_auditor', {
  p_auditor_id: 'auditor-uuid',
  p_name: 'Updated Name',
  p_email: 'newemail@example.com',
  p_password: 'newpassword', // Optional - leave empty to keep old password
  p_permissions: ['dashboard', 'invoices']
});
```

### Delete Auditor
```typescript
const { data, error } = await supabase.rpc('delete_auditor', {
  p_auditor_id: 'auditor-uuid'
});
```

### Get Current Company
```typescript
const { data, error } = await supabase.rpc('get_company_by_auth_user');
```

## Database Schema

### Tables
1. **companies** - Owner/User accounts
2. **auditors** - Auditor accounts with permissions
3. **customers** - Customer records
4. **items** - Product/Service items
5. **invoices** - Invoice records

### Key Features
- Row Level Security (RLS) enabled on all tables
- Automatic password hashing using pgcrypto
- Owner can only access their own data
- Auditors stored per company with permissions
- Automatic timestamps with triggers

## Security Notes

1. **Password Storage**: Passwords are hashed using bcrypt via pgcrypto
2. **RLS Policies**: Ensure users can only access their own data
3. **Auth Integration**: Owner login uses Supabase Auth, Auditor login uses custom function
4. **SECURITY DEFINER**: Functions run with elevated privileges but include authorization checks

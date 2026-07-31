-- =====================================================
-- SUPABASE SQL SETUP FOR GST INVOICE PRO (FIXED)
-- =====================================================
-- Run these queries in your Supabase SQL Editor
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================
-- 1. CREATE COMPANIES TABLE (For Owner/User Accounts)
-- =====================================================
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  company_name TEXT NOT NULL,
  gstin TEXT NOT NULL CHECK (length(gstin) = 15),
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pin_code TEXT NOT NULL CHECK (length(pin_code) = 6),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS companies_email_idx ON companies(email);
CREATE INDEX IF NOT EXISTS companies_auth_user_id_idx ON companies(auth_user_id);

-- =====================================================
-- 2. CREATE AUDITORS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS auditors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  permissions JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, email)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS auditors_company_id_idx ON auditors(company_id);
CREATE INDEX IF NOT EXISTS auditors_email_idx ON auditors(email);

-- =====================================================
-- 3. CREATE CUSTOMERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  company_name TEXT NOT NULL,
  gstin TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customers_company_id_idx ON customers(company_id);

-- =====================================================
-- 4. CREATE ITEMS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  item_name TEXT NOT NULL,
  description TEXT,
  hsn_sac TEXT,
  unit TEXT DEFAULT 'Nos',
  rate DECIMAL(10, 2) DEFAULT 0,
  gst_rate DECIMAL(5, 2) DEFAULT 18,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS items_company_id_idx ON items(company_id);

-- =====================================================
-- 5. CREATE INVOICES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  invoice_number TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  invoice_date DATE NOT NULL,
  due_date DATE,
  place_of_supply TEXT,
  reverse_charge BOOLEAN DEFAULT false,
  customer_type TEXT DEFAULT 'B2B',
  bill_type TEXT DEFAULT 'goods+service',
  line_items JSONB DEFAULT '[]'::jsonb,
  subtotal DECIMAL(12, 2) DEFAULT 0,
  total_gst DECIMAL(12, 2) DEFAULT 0,
  total_amount DECIMAL(12, 2) DEFAULT 0,
  remarks TEXT,
  status TEXT DEFAULT 'draft',
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS invoices_company_id_idx ON invoices(company_id);
CREATE INDEX IF NOT EXISTS invoices_customer_id_idx ON invoices(customer_id);

-- =====================================================
-- 6. ENABLE ROW LEVEL SECURITY (RLS)
-- =====================================================
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditors ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 7. DROP EXISTING POLICIES (if any)
-- =====================================================
DROP POLICY IF EXISTS "Companies can read own data" ON companies;
DROP POLICY IF EXISTS "Companies can update own data" ON companies;
DROP POLICY IF EXISTS "Anyone can signup" ON companies;
DROP POLICY IF EXISTS "Owners can manage auditors" ON auditors;
DROP POLICY IF EXISTS "Company can manage customers" ON customers;
DROP POLICY IF EXISTS "Company can manage items" ON items;
DROP POLICY IF EXISTS "Company can manage invoices" ON invoices;

-- =====================================================
-- 8. CREATE RLS POLICIES FOR COMPANIES
-- =====================================================
-- Companies can read their own data
CREATE POLICY "Companies can read own data"
  ON companies FOR SELECT
  USING (auth.uid() = auth_user_id);

-- Companies can update their own data
CREATE POLICY "Companies can update own data"
  ON companies FOR UPDATE
  USING (auth.uid() = auth_user_id);

-- Companies can insert (this is set by trigger after auth signup)
CREATE POLICY "Companies can insert own data"
  ON companies FOR INSERT
  WITH CHECK (auth.uid() = auth_user_id);

-- =====================================================
-- 9. CREATE RLS POLICIES FOR AUDITORS
-- =====================================================
-- Company owners can manage their auditors
CREATE POLICY "Owners can manage auditors"
  ON auditors FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM companies
      WHERE companies.id = auditors.company_id
      AND companies.auth_user_id = auth.uid()
    )
  );

-- =====================================================
-- 10. CREATE RLS POLICIES FOR CUSTOMERS
-- =====================================================
CREATE POLICY "Company can manage customers"
  ON customers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM companies
      WHERE companies.id = customers.company_id
      AND companies.auth_user_id = auth.uid()
    )
  );

-- =====================================================
-- 11. CREATE RLS POLICIES FOR ITEMS
-- =====================================================
CREATE POLICY "Company can manage items"
  ON items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM companies
      WHERE companies.id = items.company_id
      AND companies.auth_user_id = auth.uid()
    )
  );

-- =====================================================
-- 12. CREATE RLS POLICIES FOR INVOICES
-- =====================================================
CREATE POLICY "Company can manage invoices"
  ON invoices FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM companies
      WHERE companies.id = invoices.company_id
      AND companies.auth_user_id = auth.uid()
    )
  );

-- =====================================================
-- 13. CREATE TRIGGER FUNCTION FOR NEW USER SIGNUP
-- =====================================================
-- This function automatically creates a company record when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert into companies table using raw_user_meta_data from signup
  INSERT INTO public.companies (
    auth_user_id,
    full_name,
    email,
    phone,
    company_name,
    gstin,
    address,
    city,
    state,
    pin_code
  ) VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.email,
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'company_name',
    NEW.raw_user_meta_data->>'gstin',
    NEW.raw_user_meta_data->>'address',
    NEW.raw_user_meta_data->>'city',
    NEW.raw_user_meta_data->>'state',
    NEW.raw_user_meta_data->>'pin_code'
  );

  RETURN NEW;
END;
$$;

-- Create trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- 14. CREATE FUNCTION TO VERIFY AUDITOR LOGIN
-- =====================================================
CREATE OR REPLACE FUNCTION verify_auditor_login(
  p_email TEXT,
  p_password TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_auditor RECORD;
  v_company RECORD;
  v_result JSON;
BEGIN
  -- Find auditor by email
  SELECT * INTO v_auditor
  FROM auditors
  WHERE email = p_email
    AND is_active = true;

  -- Check if auditor exists
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Invalid email or password'
    );
  END IF;

  -- Verify password (comparing plain text password with hashed)
  IF v_auditor.password_hash != crypt(p_password, v_auditor.password_hash) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Invalid email or password'
    );
  END IF;

  -- Get company details
  SELECT * INTO v_company
  FROM companies
  WHERE id = v_auditor.company_id;

  -- Return success with auditor data
  v_result := json_build_object(
    'success', true,
    'auditor', json_build_object(
      'id', v_auditor.id,
      'name', v_auditor.name,
      'email', v_auditor.email,
      'permissions', v_auditor.permissions,
      'company_id', v_auditor.company_id,
      'company_name', v_company.company_name
    )
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- =====================================================
-- 15. CREATE FUNCTION TO CREATE AUDITOR
-- =====================================================
CREATE OR REPLACE FUNCTION create_auditor(
  p_company_id UUID,
  p_name TEXT,
  p_email TEXT,
  p_password TEXT,
  p_permissions JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_auditor_id UUID;
  v_result JSON;
BEGIN
  -- Verify caller is the company owner
  IF NOT EXISTS (
    SELECT 1 FROM companies
    WHERE id = p_company_id
      AND auth_user_id = auth.uid()
  ) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Unauthorized'
    );
  END IF;

  -- Create auditor with hashed password
  INSERT INTO auditors (
    company_id,
    name,
    email,
    password_hash,
    permissions
  )
  VALUES (
    p_company_id,
    p_name,
    p_email,
    crypt(p_password, gen_salt('bf')),
    p_permissions
  )
  RETURNING id INTO v_auditor_id;

  -- Return success
  v_result := json_build_object(
    'success', true,
    'auditor_id', v_auditor_id
  );

  RETURN v_result;

EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Auditor with this email already exists'
    );
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- =====================================================
-- 16. CREATE FUNCTION TO UPDATE AUDITOR
-- =====================================================
CREATE OR REPLACE FUNCTION update_auditor(
  p_auditor_id UUID,
  p_name TEXT,
  p_email TEXT,
  p_password TEXT,
  p_permissions JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id UUID;
  v_result JSON;
BEGIN
  -- Get company_id for this auditor
  SELECT company_id INTO v_company_id
  FROM auditors
  WHERE id = p_auditor_id;

  -- Verify caller is the company owner
  IF NOT EXISTS (
    SELECT 1 FROM companies
    WHERE id = v_company_id
      AND auth_user_id = auth.uid()
  ) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Unauthorized'
    );
  END IF;

  -- Update auditor
  UPDATE auditors
  SET
    name = p_name,
    email = p_email,
    password_hash = CASE
      WHEN p_password IS NOT NULL AND p_password != '' THEN crypt(p_password, gen_salt('bf'))
      ELSE password_hash
    END,
    permissions = p_permissions,
    updated_at = NOW()
  WHERE id = p_auditor_id;

  -- Return success
  v_result := json_build_object(
    'success', true,
    'message', 'Auditor updated successfully'
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- =====================================================
-- 17. CREATE FUNCTION TO DELETE AUDITOR
-- =====================================================
CREATE OR REPLACE FUNCTION delete_auditor(p_auditor_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id UUID;
  v_result JSON;
BEGIN
  -- Get company_id for this auditor
  SELECT company_id INTO v_company_id
  FROM auditors
  WHERE id = p_auditor_id;

  -- Verify caller is the company owner
  IF NOT EXISTS (
    SELECT 1 FROM companies
    WHERE id = v_company_id
      AND auth_user_id = auth.uid()
  ) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Unauthorized'
    );
  END IF;

  -- Delete auditor
  DELETE FROM auditors
  WHERE id = p_auditor_id;

  -- Return success
  v_result := json_build_object(
    'success', true,
    'message', 'Auditor deleted successfully'
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- =====================================================
-- 18. CREATE FUNCTION TO GET COMPANY BY AUTH USER ID
-- =====================================================
CREATE OR REPLACE FUNCTION get_company_by_auth_user()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company RECORD;
  v_result JSON;
BEGIN
  SELECT * INTO v_company
  FROM companies
  WHERE auth_user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Company not found'
    );
  END IF;

  v_result := json_build_object(
    'success', true,
    'company', row_to_json(v_company)
  );

  RETURN v_result;
END;
$$;

-- =====================================================
-- 19. CREATE TRIGGERS FOR UPDATED_AT
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_companies_updated_at ON companies;
CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_auditors_updated_at ON auditors;
CREATE TRIGGER update_auditors_updated_at
  BEFORE UPDATE ON auditors
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_items_updated_at ON items;
CREATE TRIGGER update_items_updated_at
  BEFORE UPDATE ON items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;
CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SETUP COMPLETE!
-- =====================================================
-- Next steps:
-- 1. Signup uses Supabase Auth with metadata
-- 2. Update your frontend signup to pass metadata
-- 3. Auditor functions work as before
-- =====================================================

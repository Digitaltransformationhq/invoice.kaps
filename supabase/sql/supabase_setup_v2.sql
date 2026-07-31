-- =====================================================
-- SUPABASE SQL SETUP FOR GST INVOICE PRO (V2 - FIXED)
-- =====================================================
-- Run these queries in your Supabase SQL Editor
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================
-- DROP EXISTING TABLES (Clean Start)
-- =====================================================
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS items CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS auditors CASCADE;
DROP TABLE IF EXISTS companies CASCADE;

DROP FUNCTION IF EXISTS handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS verify_auditor_login(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS create_auditor(UUID, TEXT, TEXT, TEXT, JSONB) CASCADE;
DROP FUNCTION IF EXISTS update_auditor(UUID, TEXT, TEXT, TEXT, JSONB) CASCADE;
DROP FUNCTION IF EXISTS delete_auditor(UUID) CASCADE;
DROP FUNCTION IF EXISTS get_company_by_auth_user() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- =====================================================
-- CREATE TABLES
-- =====================================================

-- 1. COMPANIES TABLE
CREATE TABLE companies (
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

CREATE INDEX companies_email_idx ON companies(email);
CREATE INDEX companies_auth_user_id_idx ON companies(auth_user_id);

-- 2. AUDITORS TABLE
CREATE TABLE auditors (
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

CREATE INDEX auditors_company_id_idx ON auditors(company_id);
CREATE INDEX auditors_email_idx ON auditors(email);

-- 3. CUSTOMERS TABLE
CREATE TABLE customers (
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

CREATE INDEX customers_company_id_idx ON customers(company_id);

-- 4. ITEMS TABLE
CREATE TABLE items (
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

CREATE INDEX items_company_id_idx ON items(company_id);

-- 5. INVOICES TABLE
CREATE TABLE invoices (
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

CREATE INDEX invoices_company_id_idx ON invoices(company_id);
CREATE INDEX invoices_customer_id_idx ON invoices(customer_id);

-- =====================================================
-- ENABLE ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditors ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- CREATE RLS POLICIES
-- =====================================================

-- COMPANIES POLICIES
CREATE POLICY companies_select_policy ON companies
  FOR SELECT
  USING (auth.uid() = auth_user_id);

CREATE POLICY companies_update_policy ON companies
  FOR UPDATE
  USING (auth.uid() = auth_user_id);

CREATE POLICY companies_insert_policy ON companies
  FOR INSERT
  WITH CHECK (auth.uid() = auth_user_id);

-- AUDITORS POLICIES
CREATE POLICY auditors_select_policy ON auditors
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM companies WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY auditors_insert_policy ON auditors
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT id FROM companies WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY auditors_update_policy ON auditors
  FOR UPDATE
  USING (
    company_id IN (
      SELECT id FROM companies WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY auditors_delete_policy ON auditors
  FOR DELETE
  USING (
    company_id IN (
      SELECT id FROM companies WHERE auth_user_id = auth.uid()
    )
  );

-- CUSTOMERS POLICIES
CREATE POLICY customers_select_policy ON customers
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM companies WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY customers_insert_policy ON customers
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT id FROM companies WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY customers_update_policy ON customers
  FOR UPDATE
  USING (
    company_id IN (
      SELECT id FROM companies WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY customers_delete_policy ON customers
  FOR DELETE
  USING (
    company_id IN (
      SELECT id FROM companies WHERE auth_user_id = auth.uid()
    )
  );

-- ITEMS POLICIES
CREATE POLICY items_select_policy ON items
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM companies WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY items_insert_policy ON items
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT id FROM companies WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY items_update_policy ON items
  FOR UPDATE
  USING (
    company_id IN (
      SELECT id FROM companies WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY items_delete_policy ON items
  FOR DELETE
  USING (
    company_id IN (
      SELECT id FROM companies WHERE auth_user_id = auth.uid()
    )
  );

-- INVOICES POLICIES
CREATE POLICY invoices_select_policy ON invoices
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM companies WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY invoices_insert_policy ON invoices
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT id FROM companies WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY invoices_update_policy ON invoices
  FOR UPDATE
  USING (
    company_id IN (
      SELECT id FROM companies WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY invoices_delete_policy ON invoices
  FOR DELETE
  USING (
    company_id IN (
      SELECT id FROM companies WHERE auth_user_id = auth.uid()
    )
  );

-- =====================================================
-- CREATE FUNCTIONS
-- =====================================================

-- Function to auto-create company when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
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
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'company_name', 'Company'),
    COALESCE(NEW.raw_user_meta_data->>'gstin', '000000000000000'),
    COALESCE(NEW.raw_user_meta_data->>'address', ''),
    COALESCE(NEW.raw_user_meta_data->>'city', ''),
    COALESCE(NEW.raw_user_meta_data->>'state', ''),
    COALESCE(NEW.raw_user_meta_data->>'pin_code', '000000')
  );
  RETURN NEW;
END;
$$;

-- Trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to verify auditor login
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
BEGIN
  SELECT * INTO v_auditor
  FROM auditors
  WHERE email = p_email AND is_active = true;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invalid credentials');
  END IF;

  IF v_auditor.password_hash != crypt(p_password, v_auditor.password_hash) THEN
    RETURN json_build_object('success', false, 'error', 'Invalid credentials');
  END IF;

  SELECT * INTO v_company FROM companies WHERE id = v_auditor.company_id;

  RETURN json_build_object(
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
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Function to create auditor
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
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM companies WHERE id = p_company_id AND auth_user_id = auth.uid()
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  INSERT INTO auditors (company_id, name, email, password_hash, permissions)
  VALUES (p_company_id, p_name, p_email, crypt(p_password, gen_salt('bf')), p_permissions)
  RETURNING id INTO v_auditor_id;

  RETURN json_build_object('success', true, 'auditor_id', v_auditor_id);
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'error', 'Email already exists');
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Function to update auditor
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
BEGIN
  SELECT company_id INTO v_company_id FROM auditors WHERE id = p_auditor_id;

  IF NOT EXISTS (
    SELECT 1 FROM companies WHERE id = v_company_id AND auth_user_id = auth.uid()
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

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

  RETURN json_build_object('success', true, 'message', 'Auditor updated');
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Function to delete auditor
CREATE OR REPLACE FUNCTION delete_auditor(p_auditor_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id UUID;
BEGIN
  SELECT company_id INTO v_company_id FROM auditors WHERE id = p_auditor_id;

  IF NOT EXISTS (
    SELECT 1 FROM companies WHERE id = v_company_id AND auth_user_id = auth.uid()
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  DELETE FROM auditors WHERE id = p_auditor_id;

  RETURN json_build_object('success', true, 'message', 'Auditor deleted');
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Function to get company by auth user
CREATE OR REPLACE FUNCTION get_company_by_auth_user()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company RECORD;
BEGIN
  SELECT * INTO v_company FROM companies WHERE auth_user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Company not found');
  END IF;

  RETURN json_build_object('success', true, 'company', row_to_json(v_company));
END;
$$;

-- Function for updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_auditors_updated_at BEFORE UPDATE ON auditors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_items_updated_at BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SETUP COMPLETE!
-- =====================================================

-- =====================================================
-- SUPABASE SQL SETUP FOR GST INVOICE PRO
-- =====================================================
-- Run these queries in your Supabase SQL Editor
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

-- Create index for faster email lookups
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

-- Create index for faster lookups
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
-- 7. CREATE RLS POLICIES FOR COMPANIES
-- =====================================================
-- Companies can read their own data
CREATE POLICY "Companies can read own data"
  ON companies FOR SELECT
  USING (auth.uid() = auth_user_id);

-- Companies can update their own data
CREATE POLICY "Companies can update own data"
  ON companies FOR UPDATE
  USING (auth.uid() = auth_user_id);

-- Anyone can insert (for signup)
CREATE POLICY "Anyone can signup"
  ON companies FOR INSERT
  WITH CHECK (true);

-- =====================================================
-- 8. CREATE RLS POLICIES FOR AUDITORS
-- =====================================================
-- Company owners can manage their auditors
CREATE POLICY "Owners can manage auditors"
  ON auditors FOR ALL
  USING (
    company_id IN (
      SELECT id FROM companies WHERE auth_user_id = auth.uid()
    )
  );

-- =====================================================
-- 9. CREATE RLS POLICIES FOR CUSTOMERS
-- =====================================================
CREATE POLICY "Company can manage customers"
  ON customers FOR ALL
  USING (
    company_id IN (
      SELECT id FROM companies WHERE auth_user_id = auth.uid()
    )
  );

-- =====================================================
-- 10. CREATE RLS POLICIES FOR ITEMS
-- =====================================================
CREATE POLICY "Company can manage items"
  ON items FOR ALL
  USING (
    company_id IN (
      SELECT id FROM companies WHERE auth_user_id = auth.uid()
    )
  );

-- =====================================================
-- 11. CREATE RLS POLICIES FOR INVOICES
-- =====================================================
CREATE POLICY "Company can manage invoices"
  ON invoices FOR ALL
  USING (
    company_id IN (
      SELECT id FROM companies WHERE auth_user_id = auth.uid()
    )
  );

-- =====================================================
-- 12. CREATE FUNCTION TO HANDLE USER SIGNUP
-- =====================================================
CREATE OR REPLACE FUNCTION handle_new_user_signup(
  p_email TEXT,
  p_password TEXT,
  p_full_name TEXT,
  p_phone TEXT,
  p_company_name TEXT,
  p_gstin TEXT,
  p_address TEXT,
  p_city TEXT,
  p_state TEXT,
  p_pin_code TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_company_id UUID;
  v_result JSON;
BEGIN
  -- Create auth user
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    p_email,
    crypt(p_password, gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  )
  RETURNING id INTO v_user_id;

  -- Create company record
  INSERT INTO companies (
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
  )
  VALUES (
    v_user_id,
    p_full_name,
    p_email,
    p_phone,
    p_company_name,
    p_gstin,
    p_address,
    p_city,
    p_state,
    p_pin_code
  )
  RETURNING id INTO v_company_id;

  -- Return success with user data
  v_result := json_build_object(
    'success', true,
    'user_id', v_user_id,
    'company_id', v_company_id,
    'email', p_email
  );

  RETURN v_result;

EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Email already exists'
    );
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- =====================================================
-- 13. CREATE FUNCTION TO VERIFY AUDITOR LOGIN
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

  -- Verify password
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
-- 14. CREATE FUNCTION TO CREATE AUDITOR
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

  -- Create auditor
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
-- 15. CREATE FUNCTION TO UPDATE AUDITOR
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
-- 16. CREATE FUNCTION TO DELETE AUDITOR
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
-- 17. CREATE FUNCTION TO GET COMPANY BY AUTH USER ID
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
-- 18. CREATE TRIGGERS FOR UPDATED_AT
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_auditors_updated_at
  BEFORE UPDATE ON auditors
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_items_updated_at
  BEFORE UPDATE ON items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SETUP COMPLETE!
-- =====================================================
-- Next steps:
-- 1. Enable the pgcrypto extension if not already enabled
-- 2. Update your React frontend to use these functions
-- 3. Configure Supabase Auth settings
-- =====================================================

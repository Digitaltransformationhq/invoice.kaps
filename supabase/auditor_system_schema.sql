-- Auditor Role-Based Access Control System
-- Run this in Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: users
-- Stores user accounts and their roles
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'auditor', -- 'owner' or 'auditor'
  created_by UUID REFERENCES users(id) ON DELETE SET NULL, -- Who created this user (for auditors)
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE
);

-- Table: auditor_permissions
-- Stores what permissions each auditor has
CREATE TABLE IF NOT EXISTS auditor_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auditor_id UUID REFERENCES users(id) ON DELETE CASCADE,
  permission_name TEXT NOT NULL,
  can_view BOOLEAN DEFAULT FALSE,
  can_create BOOLEAN DEFAULT FALSE,
  can_edit BOOLEAN DEFAULT FALSE,
  can_delete BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(auditor_id, permission_name)
);

-- Table: audit_log
-- Tracks all actions performed by users and auditors
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_email TEXT,
  user_role TEXT,
  action TEXT NOT NULL, -- 'create', 'update', 'delete', 'view'
  resource_type TEXT NOT NULL, -- 'invoice', 'customer', 'item', etc.
  resource_id UUID,
  resource_name TEXT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_auditor_permissions_auditor ON auditor_permissions(auditor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);

-- Create updated_at trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_auditor_permissions_updated_at ON auditor_permissions;
CREATE TRIGGER update_auditor_permissions_updated_at BEFORE UPDATE ON auditor_permissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default owner account
-- Password: "Admin@123" (you should change this immediately after first login)
-- This is a bcrypt hash - you'll need to implement password hashing in your server
INSERT INTO users (email, password_hash, full_name, role, is_active) VALUES
('owner@company.com', '$2a$10$placeholder_hash_change_this', 'Business Owner', 'owner', true)
ON CONFLICT (email) DO NOTHING;

-- Sample permissions that can be assigned to auditors
-- These will be managed through the UI, this is just reference
-- Permission names: 'customers', 'items', 'invoices', 'receipts', 'payment_vouchers', 'credit_notes', 'reports'

-- Success message
SELECT 'Auditor system schema created successfully! Users, permissions, and audit log tables are ready.' as status;

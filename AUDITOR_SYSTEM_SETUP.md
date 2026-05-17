# 🔐 Auditor Role-Based Access Control System

Complete multi-user system with owner and auditor roles, permission management, and audit logging.

## ✅ Features Implemented

### 1. **User Roles**
   - **Owner**: Full access to all features, can create/manage auditors
   - **Auditor**: Limited access based on assigned permissions

### 2. **Permission System**
   Granular permissions for each module:
   - **View**: Can see the data
   - **Create**: Can add new records
   - **Edit**: Can modify existing records
   - **Delete**: Can remove records

   **Available Modules:**
   - Customers
   - Items & Services
   - Tax Invoices
   - Receipts
   - Payment Vouchers
   - Credit/Debit Notes
   - Reports

### 3. **Audit Logging**
   - Tracks all user actions (create, update, delete, view)
   - Records who did what, when, and on which resource
   - Viewable by owner for compliance and monitoring

### 4. **Authentication**
   - Secure login with email/password
   - Password hashing using SHA-256
   - Session management with localStorage
   - Auto-logout on session expiry

---

## 🚀 Setup Instructions

### Step 1: Run the Database Schema

1. **Open Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project

2. **Run the Schema**
   - Go to SQL Editor
   - Click "New Query"
   - Copy ALL contents from `/supabase/auditor_system_schema.sql`
   - Paste and click "Run"

3. **Verify Tables Created:**
   - `users` - User accounts (owner and auditors)
   - `auditor_permissions` - Permissions for each auditor
   - `audit_log` - Activity log for all users

### Step 2: Update Default Owner Password

The schema creates a default owner account:
- **Email**: `owner@company.com`
- **Password**: `Admin@123` (TEMPORARY - MUST CHANGE!)

**To change the password:**

1. Generate a new password hash:
```javascript
// In browser console:
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Hash your new password:
hashPassword("YourNewPassword123!").then(console.log);
```

2. Update the database:
```sql
UPDATE users
SET password_hash = 'your-generated-hash-here'
WHERE email = 'owner@company.com';
```

### Step 3: Deploy Server Functions

The server code has been updated with authentication endpoints:

```bash
cd /workspaces/default/code
supabase functions deploy server
```

### Step 4: Update App Routes

Make sure your main App component includes the AuthProvider and login route (see code updates below).

---

## 📖 How to Use

### For Owners:

#### 1. **Login**
   - Go to `/login`
   - Email: `owner@company.com`
   - Password: `Admin@123` (or your changed password)

#### 2. **Create an Auditor**
   - Go to Settings → Auditor Management
   - Click "Add Auditor"
   - Fill in:
     - Full Name (e.g., "John Doe")
     - Email (e.g., "auditor@company.com")
     - Password (minimum 8 characters)
   - Click "Create Auditor"

#### 3. **Assign Permissions**
   - In Auditor Management table, click "Permissions" for an auditor
   - For each module, select:
     - ☑️ **View** - Can see the list/details
     - ☑️ **Create** - Can add new records
     - ☑️ **Edit** - Can modify existing records
     - ☑️ **Delete** - Can remove records
   - Click "Save Permissions"

#### 4. **Example Permission Setup:**

**For a Junior Auditor:**
- Customers: View only
- Invoices: View, Create
- Items: View only
- Reports: View only

**For a Senior Auditor:**
- Customers: View, Create, Edit
- Invoices: View, Create, Edit
- Items: View, Create, Edit
- Payment Vouchers: View, Create
- Reports: View

### For Auditors:

#### 1. **Login**
   - Go to `/login`
   - Use credentials provided by owner

#### 2. **Restricted Access**
   - Can only access modules with "View" permission
   - Create/Edit/Delete buttons appear only if permitted
   - Attempting unauthorized action shows error message

#### 3. **Actions Are Logged**
   - All actions are recorded in audit log
   - Owner can review what auditor did and when

---

## 🔄 User Flow Examples

### Example 1: Create Auditor for Invoice Entry

**Owner's Steps:**
1. Login as owner
2. Go to Settings → Auditor Management
3. Create auditor: `invoices@company.com`
4. Assign permissions:
   - Customers: View only
   - Items: View only
   - Invoices: View, Create
5. Share credentials with auditor

**Auditor's Experience:**
1. Login with provided credentials
2. Can view customers (for selecting in invoice)
3. Can view items (for adding to invoice)
4. Can create new invoices
5. Cannot edit or delete invoices
6. Cannot access payment vouchers, receipts, etc.

### Example 2: Read-Only Auditor for Reports

**Owner's Steps:**
1. Create auditor: `reports@company.com`
2. Assign permissions:
   - Customers: View
   - Invoices: View
   - Reports: View
   - All others: No access

**Auditor's Experience:**
1. Login
2. Can view customer list and details
3. Can view invoices
4. Can generate reports
5. Cannot create, edit, or delete anything
6. Perfect for accountant doing month-end review

---

## 🔐 Security Features

### Password Security
- Passwords hashed using SHA-256
- Never stored in plain text
- Hash stored in database

### Session Management
- User data stored in localStorage
- Cleared on logout
- Auto-logout on session expiry

### Permission Checks
- Server-side validation for all operations
- Frontend hides unauthorized UI elements
- Backend rejects unauthorized API calls

### Audit Trail
- Every action logged with:
  - Who (user ID and email)
  - What (action type: create/update/delete/view)
  - When (timestamp)
  - Where (resource type and ID)
  - Details (JSON payload)

---

## 📊 Database Schema

### `users` Table
```sql
- id (UUID, primary key)
- email (TEXT, unique)
- password_hash (TEXT)
- full_name (TEXT)
- role (TEXT: 'owner' or 'auditor')
- created_by (UUID, references users)
- is_active (BOOLEAN)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
- last_login (TIMESTAMP)
```

### `auditor_permissions` Table
```sql
- id (UUID, primary key)
- auditor_id (UUID, references users)
- permission_name (TEXT: 'customers', 'invoices', etc.)
- can_view (BOOLEAN)
- can_create (BOOLEAN)
- can_edit (BOOLEAN)
- can_delete (BOOLEAN)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

### `audit_log` Table
```sql
- id (UUID, primary key)
- user_id (UUID, references users)
- user_email (TEXT)
- user_role (TEXT)
- action (TEXT: 'create', 'update', 'delete', 'view')
- resource_type (TEXT: 'invoice', 'customer', etc.)
- resource_id (UUID)
- resource_name (TEXT)
- details (JSONB)
- ip_address (TEXT)
- created_at (TIMESTAMP)
```

---

## 🛠️ API Endpoints

### Authentication
- `POST /auth/login` - Login with email/password
- `POST /auth/create-auditor` - Create new auditor (owner only)
- `GET /auth/auditors` - List all auditors (owner only)
- `DELETE /auth/auditor/:id` - Delete auditor (owner only)

### Permissions
- `GET /auth/auditor/:id/permissions` - Get auditor permissions
- `POST /auth/auditor/:id/permissions` - Update auditor permissions

### Audit Logs
- `GET /auth/audit-logs` - Get audit log (owner only)

---

## 🎯 Usage Scenarios

### Scenario 1: Part-Time Bookkeeper
**Role**: Auditor
**Permissions**:
- Invoices: View, Create
- Customers: View
- Items: View

**Use Case**: Can create invoices for business owner but cannot delete or modify existing records.

### Scenario 2: Junior Accountant
**Role**: Auditor
**Permissions**:
- All modules: View only
- Reports: View

**Use Case**: Can review all data and generate reports for month-end closing, but cannot make any changes.

### Scenario 3: Senior Manager
**Role**: Auditor
**Permissions**:
- Customers: View, Create, Edit
- Invoices: View, Create, Edit
- Receipts: View, Create, Edit
- Reports: View

**Use Case**: Can manage day-to-day operations except deleting critical records.

### Scenario 4: Compliance Officer
**Role**: Auditor (or Owner reviewing logs)
**Permissions**:
- Audit Logs: View

**Use Case**: Reviews all user activities for compliance, fraud detection, and security monitoring.

---

## 🐛 Troubleshooting

### Cannot Login
- **Check**: Email and password correct
- **Check**: User is_active = true in database
- **Check**: Server function is deployed
- **Fix**: Reset password via SQL query

### Permissions Not Working
- **Check**: Permissions saved in database
- **Check**: User role is 'auditor' (owner has all permissions)
- **Fix**: Re-assign permissions from Auditor Management

### Audit Log Empty
- **Check**: Actions performed after system setup
- **Check**: Server function deployed with audit logging code
- **Fix**: Trigger some actions (create invoice, etc.)

---

## 📝 Next Steps (Optional Enhancements)

1. **Password Reset Flow** - Email-based password reset
2. **Two-Factor Authentication** - Add 2FA for enhanced security
3. **IP Whitelisting** - Restrict access by IP address
4. **Session Timeout** - Auto-logout after inactivity
5. **Permission Templates** - Pre-defined permission sets
6. **Bulk Permission Assignment** - Assign same permissions to multiple auditors
7. **Email Notifications** - Notify owner when auditor performs certain actions
8. **Advanced Audit Filters** - Filter logs by date, user, action type

---

## ✨ Summary

**Before:**
- ❌ Single user system
- ❌ No access control
- ❌ No delegation possible

**Now:**
- ✅ Multi-user with roles (owner + auditors)
- ✅ Granular permissions (view/create/edit/delete)
- ✅ Complete audit trail
- ✅ Secure authentication
- ✅ Easy permission management UI
- ✅ Production-ready RBAC system

---

**Your auditor system is ready!** Run the SQL schema, deploy the server, and start creating auditors! 🚀

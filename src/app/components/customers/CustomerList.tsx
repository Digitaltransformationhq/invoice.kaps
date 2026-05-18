import { Plus, Search, Filter, Mail, Phone, Building2, MapPin, TrendingUp, X, Edit2, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { deleteForUser, insertForUser, selectForUser, updateForUser } from '../../../lib/auditorData';
import { extractPanFromGstin, normalizeGstin } from '../../../lib/gstin';

interface Customer {
  id: string;
  name: string;
  customerType: string;
  gstin: string;
  pan: string;
  contact: string;
  email: string;
  phone: string;
  revenue: number;
  invoices: number;
  outstanding: number;
  city: string;
  address: string;
}

export function CustomerList() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);

  const mapCustomersWithStats = (customerRows: any[], invoiceRows: any[]): Customer[] => {
    const statsByCustomer = new Map<string, { revenue: number; invoices: number; outstanding: number }>();

    invoiceRows.forEach((invoice) => {
      if (!invoice.customer_id) return;
      const existing = statsByCustomer.get(invoice.customer_id) || { revenue: 0, invoices: 0, outstanding: 0 };
      const totalAmount = Number(invoice.total_amount || 0);
      const paidAmount = Number(invoice.paid_amount || 0);

      existing.revenue += totalAmount;
      existing.invoices += 1;
      if (!['paid', 'cancelled', 'draft'].includes(invoice.status || '')) {
        existing.outstanding += Math.max(totalAmount - paidAmount, 0);
      }
      statsByCustomer.set(invoice.customer_id, existing);
    });

    return customerRows.map((customer) => {
      const stats = statsByCustomer.get(customer.id) || { revenue: 0, invoices: 0, outstanding: 0 };

      return {
        id: customer.id,
        name: customer.name || '',
        customerType: customer.customer_type || 'B2B',
        gstin: customer.gstin || '',
        pan: customer.pan || '',
        contact: customer.contact_name || '',
        email: customer.email || '',
        phone: customer.phone || '',
        city: customer.city || '',
        address: customer.address || '',
        revenue: stats.revenue,
        invoices: stats.invoices,
        outstanding: stats.outstanding,
      };
    });
  };

  const loadCustomers = async () => {
    if (!user?.company_id) {
      setCustomers([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const [customerResponse, invoiceResponse] = await Promise.all([
      selectForUser<any[]>(user, 'customers', 'customers', () =>
        supabase
          .from('customers')
          .select('id, name, customer_type, gstin, pan, contact_name, email, phone, city, address')
          .eq('company_id', user.company_id)
          .eq('is_active', true)
          .order('name', { ascending: true })
      ),
      selectForUser<any[]>(user, 'customers', 'invoices', () =>
        supabase
          .from('invoices')
          .select('customer_id, total_amount, paid_amount, status')
          .eq('company_id', user.company_id),
        { summary: true }
      ),
    ]);

    if (customerResponse.error) {
      toast.error(`Could not load customers: ${customerResponse.error.message}`);
      setCustomers([]);
    } else if (invoiceResponse.error) {
      toast.error(`Could not load customer invoice stats: ${invoiceResponse.error.message}`);
      setCustomers(mapCustomersWithStats(customerResponse.data || [], []));
    } else {
      setCustomers(mapCustomersWithStats(customerResponse.data || [], invoiceResponse.data || []));
    }

    setIsLoading(false);
  };

  useEffect(() => {
    loadCustomers();
  }, [user?.company_id]);

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    customer.gstin.toLowerCase().includes(searchQuery.toLowerCase()) ||
    customer.pan.toLowerCase().includes(searchQuery.toLowerCase()) ||
    customer.contact.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatCurrency = (value: number) => `₹${value.toLocaleString('en-IN')}`;
  const totalRevenue = customers.reduce((sum, c) => sum + c.revenue, 0);
  const totalOutstanding = customers.reduce((sum, c) => sum + c.outstanding, 0);

  const handleAddCustomer = async (newCustomer: any) => {
    if (!user?.company_id) {
      toast.error('Company profile is not ready. Please refresh and try again.');
      return;
    }

    const record = {
        company_id: user.company_id,
        name: newCustomer.name.trim(),
        customer_type: newCustomer.customerType,
        gstin: newCustomer.gstin.trim().toUpperCase(),
        pan: newCustomer.pan.trim().toUpperCase() || extractPanFromGstin(newCustomer.gstin),
        contact_name: newCustomer.contact.trim(),
        email: newCustomer.email.trim(),
        phone: newCustomer.phone.trim(),
        city: newCustomer.city.trim(),
        address: newCustomer.address.trim(),
      };

    const { error } = await insertForUser(user, 'customers', 'customers', () =>
      supabase
        .from('customers')
        .insert(record),
      record,
      record.name
    );

    if (error) {
      toast.error(`Could not add customer: ${error.message}`);
      return;
    }

    toast.success('Customer added');
    setShowAddModal(false);
    loadCustomers();
  };

  const handleUpdateCustomer = async (updatedCustomer: any) => {
    const values = {
        name: updatedCustomer.name.trim(),
        customer_type: updatedCustomer.customerType,
        gstin: updatedCustomer.gstin.trim().toUpperCase(),
        pan: updatedCustomer.pan.trim().toUpperCase() || extractPanFromGstin(updatedCustomer.gstin),
        contact_name: updatedCustomer.contact.trim(),
        email: updatedCustomer.email.trim(),
        phone: updatedCustomer.phone.trim(),
        city: updatedCustomer.city.trim(),
        address: updatedCustomer.address.trim(),
      };

    const { error } = await updateForUser(user, 'customers', 'customers', () =>
      supabase
        .from('customers')
        .update(values)
        .eq('id', updatedCustomer.id),
      values,
      { id: updatedCustomer.id },
      values.name
    );

    if (error) {
      toast.error(`Could not update customer: ${error.message}`);
      return;
    }

    toast.success('Customer updated');
    setEditingCustomer(null);
    loadCustomers();
  };

  const handleDeleteCustomer = async () => {
    if (!deletingCustomer) return;

    const { error } = await deleteForUser(user, 'customers', 'customers', () =>
      supabase
        .from('customers')
        .delete()
        .eq('id', deletingCustomer.id),
      { id: deletingCustomer.id },
      deletingCustomer.name
    );

    if (error) {
      toast.error(`Could not delete customer: ${error.message}`);
      return;
    }

    toast.success('Customer deleted');
    setDeletingCustomer(null);
    setCustomers((currentCustomers) => currentCustomers.filter((customer) => customer.id !== deletingCustomer.id));
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Customers</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your customer database</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Customer
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-border rounded-lg p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="text-sm text-muted-foreground">Total Customers</div>
            <div className="w-10 h-10 bg-accent/10 rounded flex items-center justify-center">
              <Building2 className="w-5 h-5 text-accent" />
            </div>
          </div>
          <div className="text-4xl font-bold text-foreground">{customers.length}</div>
        </div>
        <div className="bg-white border border-border rounded-lg p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="text-sm text-muted-foreground">Total Revenue</div>
            <div className="w-10 h-10 bg-success/10 rounded flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-success" />
            </div>
          </div>
          <div className="text-4xl font-bold text-foreground">
            {formatCurrency(totalRevenue)}
          </div>
        </div>
        <div className="bg-white border border-border rounded-lg p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="text-sm text-muted-foreground">Outstanding</div>
            <div className="w-10 h-10 bg-warning/10 rounded flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-warning" />
            </div>
          </div>
          <div className="text-4xl font-bold text-foreground">
            {formatCurrency(totalOutstanding)}
          </div>
        </div>
      </div>

      {/* Customers Grid */}
      <div className="bg-white border border-border rounded-lg">
        {/* Toolbar */}
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, GSTIN, or contact person..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button className="inline-flex items-center gap-2 px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors">
            <Filter className="w-4 h-4" />
            <span className="text-sm">Filter</span>
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Contact</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">GSTIN</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Location</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground">Revenue</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground">Outstanding</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-muted-foreground">Invoices</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-sm text-muted-foreground">
                    Loading customers...
                  </td>
                </tr>
              )}
              {!isLoading && filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-sm text-muted-foreground">
                    No customers found.
                  </td>
                </tr>
              )}
              {!isLoading && filteredCustomers.map((customer) => (
                <tr key={customer.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">{customer.name}</div>
                        <div className="text-xs text-muted-foreground">{customer.contact}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Mail className="w-3 h-3" />
                        <span className="text-xs">{customer.email}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="w-3 h-3" />
                        <span className="text-xs">{customer.phone}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-mono text-muted-foreground">{customer.gstin}</div>
                    {customer.pan && (
                      <div className="text-xs font-mono text-muted-foreground mt-1">PAN {customer.pan}</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium bg-muted text-foreground">
                      {customer.customerType}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="w-3 h-3" />
                      <span>{customer.city}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="text-sm font-medium text-foreground">
                      ₹{customer.revenue.toLocaleString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {customer.outstanding > 0 ? (
                      <div className="text-sm font-medium text-warning">
                        ₹{customer.outstanding.toLocaleString()}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">-</div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="inline-flex items-center justify-center px-2.5 py-1 bg-muted rounded text-sm font-medium text-foreground">
                      {customer.invoices}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setEditingCustomer(customer)}
                        className="p-2 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-accent"
                        title="Edit customer"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeletingCustomer(customer)}
                        className="p-2 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-destructive"
                        title="Delete customer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Customer Modal */}
      {showAddModal && (
        <AddCustomerModal
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddCustomer}
        />
      )}

      {/* Edit Customer Modal */}
      {editingCustomer && (
        <EditCustomerModal
          customer={editingCustomer}
          onClose={() => setEditingCustomer(null)}
          onSave={handleUpdateCustomer}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingCustomer && (
        <DeleteConfirmationModal
          customer={deletingCustomer}
          onClose={() => setDeletingCustomer(null)}
          onConfirm={handleDeleteCustomer}
        />
      )}
    </div>
  );
}

function AddCustomerModal({ onClose, onAdd }: { onClose: () => void; onAdd: (customer: any) => void }) {
  const [formData, setFormData] = useState({
    name: '',
    customerType: 'B2B',
    gstin: '',
    pan: '',
    contact: '',
    email: '',
    phone: '',
    city: '',
    address: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd(formData);
  };

  const handleChange = (field: string, value: string) => {
    if (field === 'gstin') {
      const gstin = normalizeGstin(value);
      setFormData({ ...formData, gstin, pan: extractPanFromGstin(gstin) });
      return;
    }

    setFormData({ ...formData, [field]: field === 'pan' ? value.toUpperCase().slice(0, 10) : value });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-white">
          <h2 className="text-lg font-semibold text-foreground">Add New Customer</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Company Details */}
          <div>
            <h3 className="font-semibold text-foreground mb-4">Company Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Company Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="Enter company name"
                  className="w-full px-3 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  GSTIN <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.gstin}
                  onChange={(e) => handleChange('gstin', e.target.value)}
                  placeholder="Enter GSTIN"
                  maxLength={15}
                  className="w-full px-3 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  PAN Number
                </label>
                <input
                  type="text"
                  value={formData.pan}
                  onChange={(e) => handleChange('pan', e.target.value)}
                  placeholder="Auto from GSTIN"
                  maxLength={10}
                  className="w-full px-3 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Customer Type <span className="text-destructive">*</span>
                </label>
                <select
                  required
                  value={formData.customerType}
                  onChange={(e) => handleChange('customerType', e.target.value)}
                  className="w-full px-3 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="B2B">B2B</option>
                  <option value="B2C">B2C</option>
                  <option value="SEZ">SEZ</option>
                  <option value="Export">Export</option>
                  <option value="Composition">Composition</option>
                  <option value="Nil Rated">Nil Rated</option>
                  <option value="Exempt Supply">Exempt Supply</option>
                </select>
              </div>
            </div>
          </div>

          {/* Contact Person */}
          <div>
            <h3 className="font-semibold text-foreground mb-4">Contact Person</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Contact Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.contact}
                  onChange={(e) => handleChange('contact', e.target.value)}
                  placeholder="Enter contact name"
                  className="w-full px-3 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Email <span className="text-destructive">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="Enter email address"
                  className="w-full px-3 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Phone <span className="text-destructive">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="Enter phone number"
                  className="w-full px-3 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  City <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.city}
                  onChange={(e) => handleChange('city', e.target.value)}
                  placeholder="Enter city"
                  className="w-full px-3 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Address <span className="text-destructive">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={formData.address}
              onChange={(e) => handleChange('address', e.target.value)}
              placeholder="Enter complete address"
              className="w-full px-3 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
            >
              Add Customer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditCustomerModal({ customer, onClose, onSave }: { customer: any; onClose: () => void; onSave: (customer: any) => void }) {
  const [formData, setFormData] = useState({
    id: customer.id,
    name: customer.name,
    customerType: customer.customerType || 'B2B',
    gstin: customer.gstin,
    pan: customer.pan || '',
    contact: customer.contact,
    email: customer.email,
    phone: customer.phone,
    city: customer.city,
    address: customer.address,
    revenue: customer.revenue,
    invoices: customer.invoices,
    outstanding: customer.outstanding,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const handleChange = (field: string, value: string) => {
    if (field === 'gstin') {
      const gstin = normalizeGstin(value);
      setFormData({ ...formData, gstin, pan: extractPanFromGstin(gstin) });
      return;
    }

    setFormData({ ...formData, [field]: field === 'pan' ? value.toUpperCase().slice(0, 10) : value });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-white">
          <h2 className="text-lg font-semibold text-foreground">Edit Customer</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Company Details */}
          <div>
            <h3 className="font-semibold text-foreground mb-4">Company Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Company Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="Enter company name"
                  className="w-full px-3 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  GSTIN <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.gstin}
                  onChange={(e) => handleChange('gstin', e.target.value)}
                  placeholder="Enter GSTIN"
                  maxLength={15}
                  className="w-full px-3 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  PAN Number
                </label>
                <input
                  type="text"
                  value={formData.pan}
                  onChange={(e) => handleChange('pan', e.target.value)}
                  placeholder="Auto from GSTIN"
                  maxLength={10}
                  className="w-full px-3 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Customer Type <span className="text-destructive">*</span>
                </label>
                <select
                  required
                  value={formData.customerType}
                  onChange={(e) => handleChange('customerType', e.target.value)}
                  className="w-full px-3 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="B2B">B2B</option>
                  <option value="B2C">B2C</option>
                  <option value="SEZ">SEZ</option>
                  <option value="Export">Export</option>
                  <option value="Composition">Composition</option>
                  <option value="Nil Rated">Nil Rated</option>
                  <option value="Exempt Supply">Exempt Supply</option>
                </select>
              </div>
            </div>
          </div>

          {/* Contact Person */}
          <div>
            <h3 className="font-semibold text-foreground mb-4">Contact Person</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Contact Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.contact}
                  onChange={(e) => handleChange('contact', e.target.value)}
                  placeholder="Enter contact name"
                  className="w-full px-3 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Email <span className="text-destructive">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="Enter email address"
                  className="w-full px-3 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Phone <span className="text-destructive">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="Enter phone number"
                  className="w-full px-3 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  City <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.city}
                  onChange={(e) => handleChange('city', e.target.value)}
                  placeholder="Enter city"
                  className="w-full px-3 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Address <span className="text-destructive">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={formData.address}
              onChange={(e) => handleChange('address', e.target.value)}
              placeholder="Enter complete address"
              className="w-full px-3 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteConfirmationModal({ customer, onClose, onConfirm }: { customer: any; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Delete Customer</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center flex-shrink-0">
              <Trash2 className="w-6 h-6 text-destructive" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-foreground mb-2">
                Are you sure you want to delete <span className="font-semibold">{customer.name}</span>?
              </p>
              <p className="text-sm text-muted-foreground">
                This action cannot be undone. All data associated with this customer will be permanently removed.
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-destructive text-white rounded hover:bg-destructive/90 transition-colors"
          >
            Delete Customer
          </button>
        </div>
      </div>
    </div>
  );
}

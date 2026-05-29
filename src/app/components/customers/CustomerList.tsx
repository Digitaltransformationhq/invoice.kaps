import { Plus, Search, Filter, Mail, Phone, Building2, MapPin, TrendingUp, X, Edit2, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { deleteForUser, insertForUser, selectForUser, updateForUser } from '../../../lib/auditorData';
import { extractPanFromGstin, getGstinStateName, normalizeGstin } from '../../../lib/gstin';

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
  state: string;
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
        state: customer.state || getGstinStateName(customer.gstin) || '',
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
          .select('id, name, customer_type, gstin, pan, contact_name, email, phone, city, state, address')
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
        state: newCustomer.state.trim() || getGstinStateName(newCustomer.gstin) || null,
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
        state: updatedCustomer.state.trim() || getGstinStateName(updatedCustomer.gstin) || null,
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
        <div className="bg-card border border-violet-300 dark:border-violet-400/30 rounded-xl p-5 shadow-[0_1px_2px_rgba(139,92,246,0.08)] hover:shadow-[0_8px_24px_-8px_rgba(139,92,246,0.25)] hover:border-violet-400 dark:hover:border-violet-400/50 transition-all">
          <div className="flex items-start justify-between mb-4">
            <div className="text-sm text-muted-foreground">Total Customers</div>
            <div className="w-10 h-10 bg-accent/10 rounded flex items-center justify-center">
              <Building2 className="w-5 h-5 text-accent" />
            </div>
          </div>
          <div className="text-4xl font-bold text-foreground">{customers.length}</div>
        </div>
        <div className="bg-card border border-violet-300 dark:border-violet-400/30 rounded-xl p-5 shadow-[0_1px_2px_rgba(139,92,246,0.08)] hover:shadow-[0_8px_24px_-8px_rgba(139,92,246,0.25)] hover:border-violet-400 dark:hover:border-violet-400/50 transition-all">
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
        <div className="bg-card border border-violet-300 dark:border-violet-400/30 rounded-xl p-5 shadow-[0_1px_2px_rgba(139,92,246,0.08)] hover:shadow-[0_8px_24px_-8px_rgba(139,92,246,0.25)] hover:border-violet-400 dark:hover:border-violet-400/50 transition-all">
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
      <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl shadow-[0_1px_2px_rgba(139,92,246,0.06)] overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-violet-100 dark:border-violet-400/10 flex flex-col sm:flex-row gap-4">
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
            <thead className="bg-violet-100 dark:bg-violet-500/15">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Contact</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">GSTIN</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Type</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Location</th>
                <th className="px-6 py-3 text-right text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Revenue</th>
                <th className="px-6 py-3 text-right text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Outstanding</th>
                <th className="px-6 py-3 text-center text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Invoices</th>
                <th className="px-6 py-3 text-right text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-violet-100 dark:divide-violet-400/10">
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
                <tr key={customer.id} className="bg-violet-50/60 dark:bg-violet-500/[0.04] hover:bg-violet-100/70 dark:hover:bg-violet-500/[0.10] transition-colors">
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
    state: '',
    address: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd(formData);
  };

  const handleChange = (field: string, value: string) => {
    if (field === 'gstin') {
      const gstin = normalizeGstin(value);
      setFormData({ ...formData, gstin, pan: extractPanFromGstin(gstin), state: getGstinStateName(gstin) });
      return;
    }

    setFormData({ ...formData, [field]: field === 'pan' ? value.toUpperCase().slice(0, 10) : value });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-white">
          <h2 className="text-lg font-semibold text-violet-600 dark:text-violet-300">Add New Customer</h2>
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
            <h3 className="font-semibold text-violet-600 dark:text-violet-300 mb-4">Company Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-violet-600 dark:text-violet-300 mb-2">
                  Company Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="Enter company name"
                  className="w-full px-3 py-2 border border-violet-300 dark:border-violet-400/30 bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-violet-600 dark:text-violet-300 mb-2">
                  GSTIN <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.gstin}
                  onChange={(e) => handleChange('gstin', e.target.value)}
                  placeholder="Enter GSTIN"
                  maxLength={15}
                  className="w-full px-3 py-2 border border-violet-300 dark:border-violet-400/30 bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-violet-600 dark:text-violet-300 mb-2">
                  PAN Number
                </label>
                <input
                  type="text"
                  value={formData.pan}
                  onChange={(e) => handleChange('pan', e.target.value)}
                  placeholder="Auto from GSTIN"
                  maxLength={10}
                  className="w-full px-3 py-2 border border-violet-300 dark:border-violet-400/30 bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-violet-600 dark:text-violet-300 mb-2">
                  Customer Type <span className="text-destructive">*</span>
                </label>
                <select
                  required
                  value={formData.customerType}
                  onChange={(e) => handleChange('customerType', e.target.value)}
                  className="w-full px-3 py-2 border border-violet-300 dark:border-violet-400/30 bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
            <h3 className="font-semibold text-violet-600 dark:text-violet-300 mb-4">Contact Person</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-violet-600 dark:text-violet-300 mb-2">
                  Contact Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.contact}
                  onChange={(e) => handleChange('contact', e.target.value)}
                  placeholder="Enter contact name"
                  className="w-full px-3 py-2 border border-violet-300 dark:border-violet-400/30 bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-violet-600 dark:text-violet-300 mb-2">
                  Email <span className="text-destructive">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="Enter email address"
                  className="w-full px-3 py-2 border border-violet-300 dark:border-violet-400/30 bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-violet-600 dark:text-violet-300 mb-2">
                  Phone <span className="text-destructive">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="Enter phone number"
                  className="w-full px-3 py-2 border border-violet-300 dark:border-violet-400/30 bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-violet-600 dark:text-violet-300 mb-2">
                  City <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.city}
                  onChange={(e) => handleChange('city', e.target.value)}
                  placeholder="Enter city"
                  className="w-full px-3 py-2 border border-violet-300 dark:border-violet-400/30 bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-violet-600 dark:text-violet-300 mb-2">
                  State <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.state}
                  onChange={(e) => handleChange('state', e.target.value)}
                  placeholder="Enter state"
                  className="w-full px-3 py-2 border border-violet-300 dark:border-violet-400/30 bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-violet-600 dark:text-violet-300 mb-2">
              Address <span className="text-destructive">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={formData.address}
              onChange={(e) => handleChange('address', e.target.value)}
              placeholder="Enter complete address"
              className="w-full px-3 py-2 border border-violet-300 dark:border-violet-400/30 bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
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
    state: customer.state || getGstinStateName(customer.gstin) || '',
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
      setFormData({ ...formData, gstin, pan: extractPanFromGstin(gstin), state: getGstinStateName(gstin) });
      return;
    }

    setFormData({ ...formData, [field]: field === 'pan' ? value.toUpperCase().slice(0, 10) : value });
  };

  const inputCls = "w-full px-3.5 h-10 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition";
  const inputMonoCls = `${inputCls} font-mono`;

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 dark:bg-black/65 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-2xl w-full max-h-[92vh] rounded-2xl p-[1px] bg-gradient-to-br from-violet-400/40 via-violet-200 dark:via-violet-400/15 to-violet-400/40"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-[15px] bg-card overflow-hidden flex flex-col max-h-[calc(92vh-2px)]">
          {/* Header */}
          <div className="relative px-6 pt-6 pb-5 border-b border-violet-100 dark:border-violet-400/15 flex-shrink-0">
            <button
              onClick={onClose}
              className="absolute right-5 top-5 h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center shadow-[0_0_18px_rgba(139,92,246,0.4)]">
                <Edit2 className="w-4 h-4 text-white" strokeWidth={2.25} />
              </div>
              <div>
                <div className="text-[10.5px] font-semibold tracking-[0.16em] uppercase text-violet-600 dark:text-violet-300">Edit Customer</div>
                <h2 className="text-[17px] font-semibold tracking-tight text-foreground leading-tight truncate max-w-[380px]">{customer.name || 'Customer'}</h2>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 kaps-modal-scroll">
            <div className="p-6 space-y-7">
              {/* Company Information */}
              <FormSection label="Company Information">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FieldRow label="Company Name" required>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => handleChange('name', e.target.value)}
                      placeholder="Enter company name"
                      className={inputCls}
                    />
                  </FieldRow>
                  <FieldRow label="Customer Type" required>
                    <select
                      required
                      value={formData.customerType}
                      onChange={(e) => handleChange('customerType', e.target.value)}
                      className={inputCls}
                    >
                      <option value="B2B">B2B</option>
                      <option value="B2C">B2C</option>
                      <option value="SEZ">SEZ</option>
                      <option value="Export">Export</option>
                      <option value="Composition">Composition</option>
                      <option value="Nil Rated">Nil Rated</option>
                      <option value="Exempt Supply">Exempt Supply</option>
                    </select>
                  </FieldRow>
                  <FieldRow label="GSTIN" required hint="15-character GST identification number">
                    <input
                      type="text"
                      required
                      value={formData.gstin}
                      onChange={(e) => handleChange('gstin', e.target.value)}
                      placeholder="22AAAAA0000A1Z5"
                      maxLength={15}
                      className={inputMonoCls}
                    />
                  </FieldRow>
                  <FieldRow label="PAN Number" hint="Auto-derived from GSTIN">
                    <input
                      type="text"
                      value={formData.pan}
                      onChange={(e) => handleChange('pan', e.target.value)}
                      placeholder="AAAAA0000A"
                      maxLength={10}
                      className={inputMonoCls}
                    />
                  </FieldRow>
                </div>
              </FormSection>

              {/* Contact Information */}
              <FormSection label="Contact Information">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FieldRow label="Contact Name" required>
                    <input
                      type="text"
                      required
                      value={formData.contact}
                      onChange={(e) => handleChange('contact', e.target.value)}
                      placeholder="Enter contact name"
                      className={inputCls}
                    />
                  </FieldRow>
                  <FieldRow label="Phone" required>
                    <input
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={(e) => handleChange('phone', e.target.value)}
                      placeholder="+91 98765 43210"
                      className={inputCls}
                    />
                  </FieldRow>
                  <FieldRow label="Email" required className="md:col-span-2">
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => handleChange('email', e.target.value)}
                      placeholder="you@company.com"
                      className={inputCls}
                    />
                  </FieldRow>
                </div>
              </FormSection>

              {/* Address */}
              <FormSection label="Business Address">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FieldRow label="Address" required className="md:col-span-2">
                    <textarea
                      required
                      rows={2}
                      value={formData.address}
                      onChange={(e) => handleChange('address', e.target.value)}
                      placeholder="Street address, building name, floor"
                      className={`${inputCls} h-auto py-2.5 resize-none`}
                    />
                  </FieldRow>
                  <FieldRow label="City" required>
                    <input
                      type="text"
                      required
                      value={formData.city}
                      onChange={(e) => handleChange('city', e.target.value)}
                      placeholder="Mumbai"
                      className={inputCls}
                    />
                  </FieldRow>
                  <FieldRow label="State" required>
                    <input
                      type="text"
                      required
                      value={formData.state}
                      onChange={(e) => handleChange('state', e.target.value)}
                      placeholder="Maharashtra"
                      className={inputCls}
                    />
                  </FieldRow>
                </div>
              </FormSection>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-violet-100 dark:border-violet-400/15 bg-violet-50/40 dark:bg-violet-500/[0.04] flex-shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="h-10 px-5 rounded-full text-[13px] font-medium text-foreground border border-violet-200 dark:border-violet-400/25 bg-card hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-10 px-5 rounded-full text-[13px] font-semibold text-white bg-violet-500 hover:bg-violet-400 shadow-[0_8px_24px_-8px_rgba(139,92,246,0.65)] transition-all"
              >
                Save changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function FormSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold tracking-[0.16em] uppercase text-violet-600 dark:text-violet-300 mb-3.5">{label}</h4>
      {children}
    </div>
  );
}

function FieldRow({
  label, required, children, className, hint
}: { label: string; required?: boolean; children: React.ReactNode; className?: string; hint?: string }) {
  return (
    <div className={className}>
      <label className="block text-[12px] font-semibold text-foreground mb-1.5">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground mt-1.5">{hint}</p>}
    </div>
  );
}

function DeleteConfirmationModal({ customer, onClose, onConfirm }: { customer: any; onClose: () => void; onConfirm: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-slate-900/50 dark:bg-black/65 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-md w-full rounded-2xl bg-card border border-rose-300 dark:border-rose-400/30 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative px-6 pt-6 pb-5 border-b border-rose-100 dark:border-rose-400/15">
          <button
            onClick={onClose}
            className="absolute right-5 top-5 h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-rose-500 flex items-center justify-center">
              <Trash2 className="w-4 h-4 text-white" strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <div className="text-[10.5px] font-semibold tracking-[0.16em] uppercase text-rose-600 dark:text-rose-300">Delete Customer</div>
              <h2 className="text-[17px] font-semibold tracking-tight text-foreground leading-tight truncate">Are you sure?</h2>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-[13px] leading-relaxed text-foreground">
            You're about to permanently delete <span className="font-semibold">{customer.name}</span>.
          </p>
          <div className="rounded-lg border border-rose-200 dark:border-rose-400/25 bg-rose-50 dark:bg-rose-500/[0.08] px-3.5 py-3 flex items-start gap-2.5">
            <div className="h-5 w-5 rounded-full bg-rose-500/15 dark:bg-rose-400/20 flex items-center justify-center flex-shrink-0 mt-px">
              <Trash2 className="w-2.5 h-2.5 text-rose-600 dark:text-rose-300" strokeWidth={2.5} />
            </div>
            <p className="text-[12px] leading-relaxed text-rose-700 dark:text-rose-200/95">
              This action <span className="font-semibold">cannot be undone</span>. All invoices, receipts, and history linked to this customer will be lost.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-rose-100 dark:border-rose-400/15 bg-rose-50/40 dark:bg-rose-500/[0.04]">
          <button
            onClick={onClose}
            className="h-10 px-5 rounded-full text-[13px] font-medium text-foreground border border-violet-200 dark:border-violet-400/25 bg-card hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="h-10 px-5 rounded-full text-[13px] font-semibold text-white bg-rose-500 hover:bg-rose-400 transition-colors"
          >
            Delete customer
          </button>
        </div>
      </div>
    </div>
  );
}

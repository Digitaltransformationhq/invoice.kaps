import { Outlet, Link, useLocation, useNavigate } from 'react-router';
import { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard,
  FileText,
  Users,
  Package,
  CreditCard,
  Receipt,
  BarChart3,
  Menu,
  X,
  Search,
  ChevronDown,
  Building2,
  FileEdit,
  TrendingUp,
  Wallet,
  Settings,
  LogOut,
  User,
  HelpCircle,
  UserCog
} from 'lucide-react';
import { Toaster } from 'sonner';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { selectForUser } from '../../../lib/auditorData';

interface SearchInvoiceResult {
  id: string;
  invoiceNumber: string;
  customer: string;
  customerGstin: string;
  amount: number;
}

interface SearchCustomerResult {
  id: string;
  name: string;
  gstin: string;
  contact: string;
  email: string;
  phone: string;
}

export function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchInvoices, setSearchInvoices] = useState<SearchInvoiceResult[]>([]);
  const [searchCustomers, setSearchCustomers] = useState<SearchCustomerResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const searchRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { user, hasPermission, logout, isAuthenticated } = useAuth();
  const [companyBranding, setCompanyBranding] = useState({
    name: user?.company_name || 'Your Company',
    gstin: user?.company_gstin || 'GSTIN not set',
    logo: user?.company_logo || '',
  });
  const companyName = companyBranding.name || user?.company_name || 'Your Company';
  const companyGstin = companyBranding.gstin || user?.company_gstin || 'GSTIN not set';
  const companyLogo = companyBranding.logo || user?.company_logo || '';
  const userInitials = user?.full_name
    ?.split(' ')
    .filter(Boolean)
    .map((name) => name[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U';

  const matchesSearch = (value: unknown, query: string) =>
    String(value || '').toLowerCase().includes(query.toLowerCase());

  // Redirect to landing page if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    const loadCompanyBranding = async () => {
      if (!user?.company_id) return;

      try {
        const { data, error } = await supabase
          .from('companies')
          .select('company_name, gstin, company_logo')
          .eq('id', user.company_id)
          .single();

        if (error) throw error;

        setCompanyBranding({
          name: data?.company_name || user.company_name || 'Your Company',
          gstin: data?.gstin || user.company_gstin || 'GSTIN not set',
          logo: data?.company_logo || user.company_logo || '',
        });
      } catch (error) {
        setCompanyBranding({
          name: user.company_name || 'Your Company',
          gstin: user.company_gstin || 'GSTIN not set',
          logo: user.company_logo || '',
        });
      }
    };

    loadCompanyBranding();
    window.addEventListener('company-profile-updated', loadCompanyBranding);
    return () => window.removeEventListener('company-profile-updated', loadCompanyBranding);
  }, [user?.company_id, user?.company_name, user?.company_gstin, user?.company_logo]);

  const allNavigation = [
    { name: 'Dashboard', href: '/app', icon: LayoutDashboard, permission: 'dashboard' },
    { name: 'Customers', href: '/app/customers', icon: Users, permission: 'customers' },
    { name: 'Items & Services', href: '/app/items', icon: Package, permission: 'items' },
    { name: 'Tax Invoices', href: '/app/invoices', icon: FileText, permission: 'invoices' },
    { name: 'Credit / Debit Notes', href: '/app/credit-notes', icon: FileEdit, permission: 'credit-notes' },
    { name: 'Receipts', href: '/app/receipts', icon: Receipt, permission: 'receipts' },
    { name: 'Outstanding', href: '/app/outstanding', icon: TrendingUp, permission: 'outstanding' },
    { name: 'Payment Vouchers', href: '/app/payment-vouchers', icon: Wallet, permission: 'payment-vouchers' },
    { name: 'Reports & GSTR-1', href: '/app/reports', icon: BarChart3, permission: 'reports' },
    { name: 'Auditor Management', href: '/app/auditor-management', icon: UserCog, permission: 'auditor-management', ownerOnly: true },
  ];

  // Filter navigation based on user permissions
  const navigation = allNavigation.filter(item => {
    // Owner-only items
    if (item.ownerOnly && user?.role !== 'owner') {
      return false;
    }
    // For owner, show all
    if (user?.role === 'owner') {
      return true;
    }
    // For auditors, check permissions
    return hasPermission(item.permission);
  });

  const isActive = (href: string) => {
    if (href === '/app') {
      return location.pathname === '/app';
    }
    return location.pathname.startsWith(href);
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchResults(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const trimmedQuery = searchQuery.trim();

    if (!trimmedQuery || !user?.company_id) {
      setSearchInvoices([]);
      setSearchCustomers([]);
      setIsSearching(false);
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      setIsSearching(true);

      const [invoiceResponse, customerResponse] = await Promise.all([
        selectForUser<any[]>(user, 'invoices', 'invoices', () =>
          supabase
            .from('invoices')
            .select('id, invoice_number, total_amount, customers(name, gstin, contact_name, email, phone)')
            .eq('company_id', user.company_id)
            .order('invoice_date', { ascending: false })
        ),
        selectForUser<any[]>(user, 'customers', 'customers', () =>
          supabase
            .from('customers')
            .select('id, name, gstin, contact_name, email, phone')
            .eq('company_id', user.company_id)
            .eq('is_active', true)
            .order('name', { ascending: true })
        ),
      ]);

      if (invoiceResponse.error) {
        console.error('Invoice search failed:', invoiceResponse.error);
        setSearchInvoices([]);
      } else {
        setSearchInvoices((invoiceResponse.data || [])
          .filter((invoice: any) => {
            const customer = Array.isArray(invoice.customers) ? invoice.customers[0] : invoice.customers;
            return matchesSearch(invoice.invoice_number, trimmedQuery)
              || matchesSearch(customer?.name, trimmedQuery)
              || matchesSearch(customer?.gstin, trimmedQuery)
              || matchesSearch(customer?.contact_name, trimmedQuery)
              || matchesSearch(customer?.email, trimmedQuery)
              || matchesSearch(customer?.phone, trimmedQuery);
          })
          .slice(0, 5)
          .map((invoice: any) => {
          const customer = Array.isArray(invoice.customers) ? invoice.customers[0] : invoice.customers;
          return {
            id: invoice.id,
            invoiceNumber: invoice.invoice_number,
            customer: customer?.name || 'Customer not selected',
            customerGstin: customer?.gstin || '',
            amount: Number(invoice.total_amount || 0),
          };
        }));
      }

      if (customerResponse.error) {
        console.error('Customer search failed:', customerResponse.error);
        setSearchCustomers([]);
      } else {
        setSearchCustomers((customerResponse.data || [])
          .filter((customer: any) =>
            matchesSearch(customer.name, trimmedQuery) ||
            matchesSearch(customer.gstin, trimmedQuery) ||
            matchesSearch(customer.contact_name, trimmedQuery) ||
            matchesSearch(customer.email, trimmedQuery) ||
            matchesSearch(customer.phone, trimmedQuery)
          )
          .slice(0, 5)
          .map((customer: any) => ({
          id: customer.id,
          name: customer.name || '',
          gstin: customer.gstin || '',
          contact: customer.contact_name || '',
          email: customer.email || '',
          phone: customer.phone || '',
        })));
      }

      setIsSearching(false);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [searchQuery, user?.company_id]);

  const searchResults = {
    invoices: searchInvoices,
    customers: searchCustomers,
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <>
      <Toaster position="top-right" richColors />
      <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-primary transform transition-transform duration-200 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-6 border-b border-white/10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white/10 rounded flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <span className="font-semibold text-white">GSTInvoice Pro</span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 hover:bg-white/10 rounded"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Company Info */}
          <div className="px-4 py-4 border-b border-white/10">
            <div className="w-full flex items-center gap-3 px-3 py-2 bg-white/5 rounded">
              <div className="w-8 h-8 bg-white/10 rounded flex items-center justify-center flex-shrink-0">
                {companyLogo ? (
                  <img src={companyLogo} alt={`${companyName} logo`} className="w-full h-full object-contain rounded" />
                ) : (
                  <Building2 className="w-4 h-4 text-white" />
                )}
              </div>
              <div className="flex-1 text-left overflow-hidden">
                <div className="text-sm font-medium text-white truncate">{companyName}</div>
                <div className="text-xs text-white/60 truncate">{companyGstin}</div>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 overflow-y-auto">
            <ul className="space-y-1">
              {navigation.map((item) => (
                <li key={item.name}>
                  <Link
                    to={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded transition-colors ${
                      isActive(item.href)
                        ? 'bg-accent text-white'
                        : 'text-white/80 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="text-sm">{item.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* User Profile */}
          <div className="px-4 py-4 border-t border-white/10">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-sm text-white font-medium">
                  {userInitials}
                </span>
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="text-sm font-medium text-white truncate">{user?.full_name || 'User'}</div>
                <div className="text-xs text-white/60 truncate">{user?.email || ''}</div>
                {user?.role === 'auditor' && (
                  <div className="text-xs text-white/80 bg-white/10 px-2 py-0.5 rounded mt-1 inline-block">
                    Auditor
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="lg:pl-64">
        {/* Top Navigation */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-border">
          <div className="flex items-center justify-between h-full px-4 sm:px-6">
            <div className="flex items-center gap-4 flex-1">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 hover:bg-muted rounded"
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* Search */}
              <div className="hidden sm:flex items-center flex-1 w-full max-w-3xl" ref={searchRef}>
                <div className="relative w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search invoices, company, contact, phone, email, GSTIN..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowSearchResults(e.target.value.length > 0);
                    }}
                    onFocus={() => searchQuery.length > 0 && setShowSearchResults(true)}
                    className="w-full pl-10 pr-4 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />

                  {/* Search Results Dropdown */}
                  {showSearchResults && (isSearching || searchResults.invoices.length > 0 || searchResults.customers.length > 0) && (
                    <div className="absolute top-full mt-2 w-full bg-white border border-border rounded-lg shadow-lg max-h-96 overflow-y-auto z-50">
                      {isSearching && (
                        <div className="p-4 text-sm text-muted-foreground text-center">Searching...</div>
                      )}
                      {searchResults.invoices.length > 0 && (
                        <div className="p-2">
                          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Invoices</div>
                          {searchResults.invoices.map((invoice) => (
                            <Link
                              key={invoice.id}
                              to="/app/invoices"
                              onClick={() => {
                                setShowSearchResults(false);
                                setSearchQuery('');
                              }}
                              className="flex items-center justify-between px-3 py-2 hover:bg-muted rounded transition-colors"
                            >
                              <div>
                                <div className="text-sm font-medium text-foreground">{invoice.invoiceNumber}</div>
                                <div className="text-xs text-muted-foreground">{invoice.customer}</div>
                                {invoice.customerGstin && (
                                  <div className="text-xs text-muted-foreground font-mono">{invoice.customerGstin}</div>
                                )}
                              </div>
                              <div className="text-sm font-medium text-foreground">
                                ₹{invoice.amount.toLocaleString('en-IN')}
                              </div>
                            </Link>
                          ))}
                        </div>
                      )}
                      {searchResults.customers.length > 0 && (
                        <div className="p-2 border-t border-border">
                          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Customers</div>
                          {searchResults.customers.map((customer) => (
                            <Link
                              key={customer.id}
                              to="/app/customers"
                              onClick={() => {
                                setShowSearchResults(false);
                                setSearchQuery('');
                              }}
                              className="flex items-center justify-between px-3 py-2 hover:bg-muted rounded transition-colors"
                            >
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-foreground">{customer.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {[customer.contact, customer.phone, customer.email].filter(Boolean).join(' • ')}
                                </div>
                                <div className="text-xs text-muted-foreground font-mono">{customer.gstin}</div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {showSearchResults && searchQuery.length > 0 && !isSearching && searchResults.invoices.length === 0 && searchResults.customers.length === 0 && (
                    <div className="absolute top-full mt-2 w-full bg-white border border-border rounded-lg shadow-lg p-4 z-50">
                      <p className="text-sm text-muted-foreground text-center">No results found for "{searchQuery}"</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* User Menu */}
              <div className="relative" ref={userMenuRef}>
                {/* Desktop User Menu Button */}
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="hidden sm:flex items-center gap-2 px-3 py-2 hover:bg-muted rounded transition-colors"
                >
                  <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center">
                    <span className="text-sm text-white font-medium">{userInitials}</span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </button>

                {/* Mobile User Menu Button */}
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="sm:hidden p-2 hover:bg-muted rounded transition-colors"
                >
                  <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center">
                    <span className="text-sm text-white font-medium">{userInitials}</span>
                  </div>
                </button>

                {/* User Dropdown Menu */}
                {showUserMenu && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-border rounded-lg shadow-lg z-50">
                    <div className="p-4 border-b border-border">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-accent rounded-full flex items-center justify-center">
                          <span className="text-sm text-white font-medium">{userInitials}</span>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-foreground">{user?.full_name || 'User'}</div>
                          <div className="text-xs text-muted-foreground">{user?.email || ''}</div>
                        </div>
                      </div>
                    </div>
                    <div className="p-2">
                      <Link
                        to="/app/profile"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-muted rounded transition-colors"
                      >
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-foreground">My Profile</span>
                      </Link>
                      <Link
                        to="/app/settings"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-muted rounded transition-colors"
                      >
                        <Settings className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-foreground">Settings</span>
                      </Link>
                      <Link
                        to="/app/help"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-muted rounded transition-colors"
                      >
                        <HelpCircle className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-foreground">Help & Support</span>
                      </Link>
                    </div>
                    <div className="p-2 border-t border-border">
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-destructive/10 text-destructive rounded transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        <span className="text-sm">Logout</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
    </>
  );
}

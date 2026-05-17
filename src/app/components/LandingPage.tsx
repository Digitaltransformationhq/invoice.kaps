import { Link, useNavigate } from 'react-router';
import { CheckCircle2, FileText, Users, BarChart3, Shield, Smartphone, ArrowRight, Menu, X, Eye, EyeOff, Upload } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { toast, Toaster } from 'sonner';
import { supabase } from '../../lib/supabase';

export function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [loginRole, setLoginRole] = useState<'user' | 'auditor'>('user');

  // Signup form fields
  const [signupData, setSignupData] = useState({
    fullName: '',
    email: '',
    password: '',
    phone: '',
    companyName: '',
    gstin: '',
    address: '',
    city: '',
    state: '',
    pinCode: '',
    companyLogo: ''
  });

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const result = await login(loginEmail, loginPassword, loginRole === 'auditor' ? 'auditor' : 'owner');
      if (result.success) {
        toast.success('Login successful!');
        setShowLoginModal(false);
        navigate('/app');
      } else {
        toast.error(result.error || 'Invalid email or password');
      }
    } catch (error) {
      toast.error('Login failed. Please try again.');
    }
  };

  const openLoginModal = (role: 'user' | 'auditor' = 'user') => {
    setLoginRole(role);
    setShowLoginModal(true);
    setMobileMenuOpen(false);
  };

  const openSignupModal = () => {
    setShowSignupModal(true);
    setMobileMenuOpen(false);
  };

  const handleLogoUpload = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file for the company logo');
      return;
    }
    if (file.size > 1024 * 1024) {
      toast.error('Company logo must be under 1 MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSignupData((current) => ({ ...current, companyLogo: String(reader.result || '') }));
    };
    reader.onerror = () => toast.error('Could not read company logo');
    reader.readAsDataURL(file);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if (!signupData.fullName || !signupData.email || !signupData.password ||
        !signupData.phone || !signupData.companyName || !signupData.gstin ||
        !signupData.address || !signupData.city || !signupData.state || !signupData.pinCode) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (signupData.password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    // GSTIN validation (15 characters)
    if (signupData.gstin.length !== 15) {
      toast.error('GSTIN must be 15 characters');
      return;
    }

    // PIN Code validation (6 digits)
    if (signupData.pinCode.length !== 6 || !/^\d+$/.test(signupData.pinCode)) {
      toast.error('PIN Code must be 6 digits');
      return;
    }

    // Phone validation (10 digits)
    const phoneDigits = signupData.phone.replace(/\D/g, '');
    if (phoneDigits.length !== 10) {
      toast.error('Phone number must be 10 digits');
      return;
    }

    try {
      // Sign up using Supabase Auth with metadata
      const { data, error } = await supabase.auth.signUp({
        email: signupData.email,
        password: signupData.password,
        options: {
          data: {
            full_name: signupData.fullName,
            phone: signupData.phone,
            company_name: signupData.companyName,
            gstin: signupData.gstin,
            address: signupData.address,
            city: signupData.city,
            state: signupData.state,
            pin_code: signupData.pinCode,
            company_logo: signupData.companyLogo
          }
        }
      });

      if (error) {
        console.error('Signup error:', error);
        if (error.message.toLowerCase().includes('database error saving new user')) {
          toast.error('Signup trigger failed. Run supabase_signup_repair.sql in Supabase SQL Editor, then try again.');
          return;
        }
        toast.error('Signup failed: ' + error.message);
        return;
      }

      if (!data.user) {
        toast.error('Signup failed. Please try again.');
        return;
      }

      toast.success('Account created successfully! Please login to continue.');
      setShowSignupModal(false);
      setShowLoginModal(true);

      // Reset form
      setSignupData({
        fullName: '',
        email: '',
        password: '',
        phone: '',
        companyName: '',
        gstin: '',
        address: '',
        city: '',
        state: '',
        pinCode: '',
        companyLogo: ''
      });

    } catch (error) {
      console.error('Signup error:', error);
      toast.error('An error occurred during signup. Please try again.');
    }
  };

  return (
    <>
      <Toaster position="top-right" richColors />
      <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="border-b border-border bg-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-semibold text-foreground">GSTInvoice Pro</span>
            </div>

            <div className="hidden md:flex items-center gap-6">
              <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Features</a>
              <a href="#demo" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Demo</a>
              <div className="h-6 w-px bg-border"></div>
              <button
                onClick={() => openLoginModal('user')}
                className="text-sm font-semibold px-4 py-2 text-primary border-2 border-primary hover:bg-primary/5 rounded-lg transition-colors"
              >
                Login
              </button>
              <button
                onClick={openSignupModal}
                className="text-sm font-semibold px-5 py-2.5 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors shadow-sm"
              >
                Get Started
              </button>
            </div>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-white">
            <div className="px-4 py-3 space-y-3">
              <a href="#features" className="block text-sm font-medium text-muted-foreground">Features</a>
              <a href="#demo" className="block text-sm font-medium text-muted-foreground">Demo</a>
              <div className="h-px bg-border my-2"></div>
              <button
                onClick={() => openLoginModal('user')}
                className="block w-full text-sm font-semibold px-4 py-2 text-primary border-2 border-primary hover:bg-primary/5 rounded-lg transition-colors text-center"
              >
                Login
              </button>
              <button
                onClick={openSignupModal}
                className="block w-full text-sm font-semibold px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors text-center"
              >
                Get Started
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-block px-3 py-1 bg-accent/10 text-accent rounded-full text-sm mb-6">
                GST-Compliant Invoicing for Indian Businesses
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold text-foreground mb-6 leading-tight">
                Start Managing GST Invoices Professionally
              </h1>
              <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                Complete invoicing solution designed for Indian businesses. Create GST-compliant invoices,
                manage customers, track payments, and generate reports in minutes.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={openSignupModal}
                  className="inline-flex items-center justify-center px-6 py-3 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
                >
                  Start Free Trial
                  <ArrowRight className="w-4 h-4 ml-2" />
                </button>
                <a
                  href="#demo"
                  className="inline-flex items-center justify-center px-6 py-3 border border-border bg-white text-foreground rounded hover:bg-muted transition-colors"
                >
                  Watch Demo
                </a>
              </div>

              <div className="mt-8 flex items-center gap-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  <span>No credit card required</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  <span>14-day free trial</span>
                </div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-primary/5 to-accent/5 rounded-lg p-8 border border-border">
              <div className="bg-white rounded shadow-lg p-6">
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">INVOICE</div>
                    <div className="text-sm font-semibold">#INV-2026-001</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground mb-1">Date</div>
                    <div className="text-sm">12 May 2026</div>
                  </div>
                </div>
                <div className="space-y-3 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Product Design Services</span>
                    <span className="font-medium">₹50,000</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">CGST @ 9%</span>
                    <span className="font-medium">₹4,500</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">SGST @ 9%</span>
                    <span className="font-medium">₹4,500</span>
                  </div>
                </div>
                <div className="pt-3 border-t border-border flex justify-between items-center">
                  <span className="font-semibold">Total Amount</span>
                  <span className="text-xl font-semibold text-primary">₹59,000</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trusted By Section */}
      <section className="py-12 bg-white border-y border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-muted-foreground mb-8">Trusted by 10,000+ businesses across India</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 items-center justify-items-center opacity-60">
            <div className="text-2xl font-semibold text-muted-foreground">TechCorp</div>
            <div className="text-2xl font-semibold text-muted-foreground">Retail Plus</div>
            <div className="text-2xl font-semibold text-muted-foreground">Manufacture Co</div>
            <div className="text-2xl font-semibold text-muted-foreground">Services Ltd</div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-semibold text-foreground mb-4">
              Everything you need for GST invoicing
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Powerful features designed for Indian businesses to manage invoices, customers, and compliance effortlessly
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<FileText className="w-6 h-6 text-accent" />}
              title="GST-Compliant Invoices"
              description="Generate professional invoices with GSTIN, HSN/SAC codes, and automatic tax calculations"
            />
            <FeatureCard
              icon={<Users className="w-6 h-6 text-accent" />}
              title="Customer Management"
              description="Manage customer details, track outstanding payments, and view complete transaction history"
            />
            <FeatureCard
              icon={<BarChart3 className="w-6 h-6 text-accent" />}
              title="Analytics & Reports"
              description="Real-time dashboards, GST reports, sales analytics, and revenue tracking"
            />
            <FeatureCard
              icon={<Shield className="w-6 h-6 text-accent" />}
              title="Multi-Company Support"
              description="Manage multiple businesses from one account with separate GSTIN and branding"
            />
            <FeatureCard
              icon={<Smartphone className="w-6 h-6 text-accent" />}
              title="Mobile Friendly"
              description="Create invoices on-the-go from your mobile device or tablet"
            />
            <FeatureCard
              icon={<CheckCircle2 className="w-6 h-6 text-accent" />}
              title="Payment Tracking"
              description="Track payments, send reminders, and manage receipts efficiently"
            />
          </div>
        </div>
      </section>

      {/* Dashboard Preview */}
      <section className="py-20 bg-white px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-semibold text-foreground mb-4">
              Professional dashboard for your business
            </h2>
            <p className="text-lg text-muted-foreground">
              Enterprise-grade interface designed for efficiency and ease of use
            </p>
          </div>
          <div className="bg-gradient-to-br from-primary/10 to-accent/10 rounded-lg p-4 sm:p-8 border border-border">
            <div className="bg-white rounded shadow-2xl overflow-hidden">
              <div className="h-8 bg-primary flex items-center px-4 gap-2">
                <div className="w-2 h-2 rounded-full bg-white/30"></div>
                <div className="w-2 h-2 rounded-full bg-white/30"></div>
                <div className="w-2 h-2 rounded-full bg-white/30"></div>
              </div>
              <div className="p-6 sm:p-8">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-background p-4 rounded border border-border">
                    <div className="text-xs text-muted-foreground mb-1">Total Revenue</div>
                    <div className="text-xl font-semibold text-foreground">₹12.5L</div>
                    <div className="text-xs text-success mt-1">+12.5%</div>
                  </div>
                  <div className="bg-background p-4 rounded border border-border">
                    <div className="text-xs text-muted-foreground mb-1">Invoices</div>
                    <div className="text-xl font-semibold text-foreground">142</div>
                    <div className="text-xs text-success mt-1">+8</div>
                  </div>
                  <div className="bg-background p-4 rounded border border-border">
                    <div className="text-xs text-muted-foreground mb-1">Pending</div>
                    <div className="text-xl font-semibold text-foreground">₹2.8L</div>
                    <div className="text-xs text-warning mt-1">12 invoices</div>
                  </div>
                  <div className="bg-background p-4 rounded border border-border">
                    <div className="text-xs text-muted-foreground mb-1">Customers</div>
                    <div className="text-xl font-semibold text-foreground">89</div>
                    <div className="text-xs text-success mt-1">+5</div>
                  </div>
                </div>
                <div className="h-48 bg-background rounded border border-border flex items-center justify-center">
                  <div className="text-center">
                    <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                    <div className="text-sm text-muted-foreground">Revenue Analytics Chart</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing - Hidden for now */}
      {false && (
        <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-semibold text-foreground mb-4">
                Simple, transparent pricing
              </h2>
              <p className="text-lg text-muted-foreground">
                Choose the plan that fits your business needs
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              <PricingCard
                name="Starter"
                price="₹499"
                period="per month"
                features={[
                  'Up to 50 invoices/month',
                  '5 customers',
                  'Basic reports',
                  'Email support',
                  'GST compliance'
                ]}
                onGetStarted={openSignupModal}
              />
              <PricingCard
                name="Professional"
                price="₹999"
                period="per month"
                features={[
                  'Unlimited invoices',
                  'Unlimited customers',
                  'Advanced analytics',
                  'Priority support',
                  'Multi-company support',
                  'WhatsApp integration'
                ]}
                highlighted
                onGetStarted={openSignupModal}
              />
              <PricingCard
                name="Enterprise"
                price="₹2,499"
                period="per month"
                features={[
                  'Everything in Professional',
                  'Custom integrations',
                  'Dedicated account manager',
                  'Custom branding',
                  'API access',
                  'SLA guarantee'
                ]}
                onGetStarted={openSignupModal}
              />
            </div>
          </div>
        </section>
      )}

      {/* CTA Section */}
      <section className="py-20 bg-primary text-white px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-semibold mb-4">
            Ready to streamline your invoicing?
          </h2>
          <p className="text-lg opacity-90 mb-8">
            Join thousands of businesses managing their GST invoices professionally
          </p>
          <button
            onClick={openSignupModal}
            className="inline-flex items-center justify-center px-8 py-4 bg-accent text-white rounded hover:bg-accent/90 transition-colors text-lg"
          >
            Start Your Free Trial
            <ArrowRight className="w-5 h-5 ml-2" />
          </button>
          <p className="mt-4 text-sm opacity-75">No credit card required • 14-day free trial</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-border py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-primary rounded flex items-center justify-center">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-semibold">GSTInvoice Pro</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Professional GST invoicing for Indian businesses
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-foreground">Features</a></li>
                <li><a href="#demo" className="hover:text-foreground">Demo</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#about" className="hover:text-foreground">About</a></li>
                <li><a href="#contact" className="hover:text-foreground">Contact</a></li>
                <li><a href="#careers" className="hover:text-foreground">Careers</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#privacy" className="hover:text-foreground">Privacy</a></li>
                <li><a href="#terms" className="hover:text-foreground">Terms</a></li>
                <li><a href="#security" className="hover:text-foreground">Security</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-border">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">© 2026 GSTInvoice Pro. All rights reserved.</p>
              <button
                onClick={() => openLoginModal('auditor')}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm text-accent hover:text-accent/80 hover:underline transition-colors"
              >
                <Users className="w-4 h-4" />
                <span>Auditor Login</span>
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h3 className="text-xl font-semibold text-foreground">
                {loginRole === 'user' ? 'Login to Your Account' : 'Auditor Login'}
              </h3>
              <button
                onClick={() => {
                  setShowLoginModal(false);
                  setLoginEmail('');
                  setLoginPassword('');
                  setLoginRole('user');
                }}
                className="p-1 hover:bg-muted rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleLogin} className="p-6 space-y-4">
              {/* Credentials Hint */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs font-medium text-blue-900 mb-1">
                  {loginRole === 'user' ? 'Owner Login:' : 'Auditor Login:'}
                </p>
                <p className="text-xs text-blue-700">
                  {loginRole === 'user' ? (
                    <>Use the owner account created during signup.</>
                  ) : (
                    <>Use credentials created by the owner</>
                  )}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Email Address</label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full px-4 py-2.5 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full px-4 py-2.5 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-accent pr-12"
                    placeholder="Enter your password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full px-4 py-2.5 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors font-medium"
              >
                Sign in
              </button>

              <p className="text-xs text-center text-muted-foreground">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setShowLoginModal(false);
                    setShowSignupModal(true);
                  }}
                  className="text-accent hover:underline font-medium"
                >
                  Sign up
                </button>
              </p>
            </form>
          </div>
        </div>
      )}

      {/* Signup Modal */}
      {showSignupModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
              <h3 className="text-xl font-semibold text-foreground">Create Your Account</h3>
              <button
                onClick={() => {
                  setShowSignupModal(false);
                  setSignupData({
                    fullName: '',
                    email: '',
                    password: '',
                    phone: '',
                    companyName: '',
                    gstin: '',
                    address: '',
                    city: '',
                    state: '',
                    pinCode: '',
                    companyLogo: ''
                  });
                }}
                className="p-1 hover:bg-muted rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSignup} className="overflow-y-auto flex-1">
              <div className="p-6 space-y-6">
                {/* Personal Information */}
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-4">Personal Information</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Full Name <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="text"
                        value={signupData.fullName}
                        onChange={(e) => setSignupData({ ...signupData, fullName: e.target.value })}
                        className="w-full px-4 py-2.5 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                        placeholder="John Doe"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Phone Number <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="tel"
                        value={signupData.phone}
                        onChange={(e) => setSignupData({ ...signupData, phone: e.target.value })}
                        className="w-full px-4 py-2.5 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                        placeholder="+91 98765 43210"
                        required
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Email Address <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="email"
                        value={signupData.email}
                        onChange={(e) => setSignupData({ ...signupData, email: e.target.value })}
                        className="w-full px-4 py-2.5 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                        placeholder="you@example.com"
                        required
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Password <span className="text-destructive">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showSignupPassword ? 'text' : 'password'}
                          value={signupData.password}
                          onChange={(e) => setSignupData({ ...signupData, password: e.target.value })}
                          className="w-full px-4 py-2.5 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-accent pr-12"
                          placeholder="Minimum 8 characters"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowSignupPassword(!showSignupPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showSignupPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Company Information */}
                <div className="border-t border-border pt-6">
                  <h4 className="text-sm font-semibold text-foreground mb-4">Company Information</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Company Name <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="text"
                        value={signupData.companyName}
                        onChange={(e) => setSignupData({ ...signupData, companyName: e.target.value })}
                        className="w-full px-4 py-2.5 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                        placeholder="Your Company Pvt Ltd"
                        required
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-foreground mb-2">Company Logo</label>
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded border border-border bg-muted flex items-center justify-center overflow-hidden">
                          {signupData.companyLogo ? (
                            <img src={signupData.companyLogo} alt="Company logo preview" className="w-full h-full object-contain" />
                          ) : (
                            <FileText className="w-6 h-6 text-muted-foreground" />
                          )}
                        </div>
                        <label className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer">
                          <Upload className="w-4 h-4" />
                          <span className="text-sm">Upload Logo</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(event) => handleLogoUpload(event.target.files?.[0])}
                            className="hidden"
                          />
                        </label>
                        {signupData.companyLogo && (
                          <button
                            type="button"
                            onClick={() => setSignupData({ ...signupData, companyLogo: '' })}
                            className="text-sm text-muted-foreground hover:text-foreground"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">PNG, JPG, or SVG under 1 MB.</p>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-foreground mb-2">
                        GSTIN <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="text"
                        value={signupData.gstin}
                        onChange={(e) => setSignupData({ ...signupData, gstin: e.target.value.toUpperCase() })}
                        maxLength={15}
                        className="w-full px-4 py-2.5 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-accent font-mono"
                        placeholder="22AAAAA0000A1Z5"
                        required
                      />
                      <p className="text-xs text-muted-foreground mt-1">15 characters GST Identification Number</p>
                    </div>
                  </div>
                </div>

                {/* Address Information */}
                <div className="border-t border-border pt-6">
                  <h4 className="text-sm font-semibold text-foreground mb-4">Business Address</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Address <span className="text-destructive">*</span>
                      </label>
                      <textarea
                        rows={2}
                        value={signupData.address}
                        onChange={(e) => setSignupData({ ...signupData, address: e.target.value })}
                        className="w-full px-4 py-2.5 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                        placeholder="Street address, building name, floor"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        City <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="text"
                        value={signupData.city}
                        onChange={(e) => setSignupData({ ...signupData, city: e.target.value })}
                        className="w-full px-4 py-2.5 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                        placeholder="Mumbai"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        State <span className="text-destructive">*</span>
                      </label>
                      <select
                        value={signupData.state}
                        onChange={(e) => setSignupData({ ...signupData, state: e.target.value })}
                        className="w-full px-4 py-2.5 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                        required
                      >
                        <option value="">Select State</option>
                        <option value="Maharashtra">Maharashtra</option>
                        <option value="Karnataka">Karnataka</option>
                        <option value="Tamil Nadu">Tamil Nadu</option>
                        <option value="Gujarat">Gujarat</option>
                        <option value="Delhi">Delhi</option>
                        <option value="Uttar Pradesh">Uttar Pradesh</option>
                        <option value="West Bengal">West Bengal</option>
                        <option value="Rajasthan">Rajasthan</option>
                        <option value="Telangana">Telangana</option>
                        <option value="Andhra Pradesh">Andhra Pradesh</option>
                        <option value="Kerala">Kerala</option>
                        <option value="Punjab">Punjab</option>
                        <option value="Haryana">Haryana</option>
                        <option value="Madhya Pradesh">Madhya Pradesh</option>
                        <option value="Bihar">Bihar</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        PIN Code <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="text"
                        value={signupData.pinCode}
                        onChange={(e) => setSignupData({ ...signupData, pinCode: e.target.value })}
                        maxLength={6}
                        className="w-full px-4 py-2.5 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                        placeholder="400001"
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-border bg-muted/30 flex-shrink-0">
                <button
                  type="submit"
                  className="w-full px-4 py-2.5 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors font-medium"
                >
                  Create Account
                </button>

                <p className="text-xs text-center text-muted-foreground mt-3">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setShowSignupModal(false);
                      setShowLoginModal(true);
                    }}
                    className="text-accent hover:underline font-medium"
                  >
                    Sign in
                  </button>
                </p>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="bg-white p-6 rounded-lg border border-border hover:shadow-md transition-shadow">
      <div className="w-12 h-12 bg-accent/10 rounded flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function PricingCard({
  name,
  price,
  period,
  features,
  highlighted,
  onGetStarted
}: {
  name: string;
  price: string;
  period: string;
  features: string[];
  highlighted?: boolean;
  onGetStarted: () => void;
}) {
  return (
    <div className={`bg-white p-8 rounded-lg border-2 ${highlighted ? 'border-accent shadow-lg scale-105' : 'border-border'}`}>
      {highlighted && (
        <div className="bg-accent text-white text-xs px-3 py-1 rounded-full inline-block mb-4">
          Most Popular
        </div>
      )}
      <h3 className="text-xl font-semibold text-foreground mb-2">{name}</h3>
      <div className="mb-6">
        <span className="text-4xl font-semibold text-foreground">{price}</span>
        <span className="text-sm text-muted-foreground ml-2">{period}</span>
      </div>
      <ul className="space-y-3 mb-8">
        {features.map((feature, index) => (
          <li key={index} className="flex items-start gap-3 text-sm">
            <CheckCircle2 className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
            <span className="text-muted-foreground">{feature}</span>
          </li>
        ))}
      </ul>
      <button
        onClick={onGetStarted}
        className={`block w-full py-3 px-4 rounded text-center transition-colors ${
          highlighted
            ? 'bg-accent text-white hover:bg-accent/90'
            : 'bg-background border border-border text-foreground hover:bg-muted'
        }`}
      >
        Get Started
      </button>
    </div>
  );
}

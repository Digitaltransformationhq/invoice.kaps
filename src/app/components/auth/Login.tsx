import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router';
import { useAuth } from '../../../contexts/AuthContext';
import { Lock, Mail, FileText, Shield, Users } from 'lucide-react';
import { toast } from 'sonner';

export function Login() {
  const [searchParams] = useSearchParams();
  const role = searchParams.get('role') || 'user';
  const isAuditorLogin = role === 'auditor';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast.error('Please fill in all fields');
      return;
    }

    setLoading(true);

    const result = await login(email, password, isAuditorLogin ? 'auditor' : 'owner');

    if (result.success) {
      toast.success(isAuditorLogin ? 'Auditor login successful!' : 'Login successful!');
      navigate('/app');
    } else {
      toast.error(result.error || 'Login failed');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex bg-primary text-white p-12 flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-12">
            <div className="w-10 h-10 bg-white/10 rounded flex items-center justify-center">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-semibold">GSTInvoice Pro</span>
          </div>
          <h1 className="text-4xl font-semibold mb-6 leading-tight">
            Professional GST invoicing for Indian businesses
          </h1>
          <p className="text-lg opacity-90 leading-relaxed">
            Manage your invoices, customers, and compliance from one powerful platform.
            Trusted by 10,000+ businesses across India.
          </p>
        </div>
        <div className="space-y-4 opacity-75">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/10 rounded flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-medium">GST Compliant</div>
              <div className="text-xs opacity-75">100% compliance guaranteed</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/10 rounded flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-medium">Multi-User Access</div>
              <div className="text-xs opacity-75">Owner and auditor roles</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-primary rounded flex items-center justify-center">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-semibold">GSTInvoice Pro</span>
            </div>
          </div>

          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              {isAuditorLogin ? (
                <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center">
                  <Users className="w-6 h-6 text-accent" />
                </div>
              ) : (
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Shield className="w-6 h-6 text-primary" />
                </div>
              )}
              <div>
                <h2 className="text-3xl font-semibold text-foreground">
                  {isAuditorLogin ? 'Auditor Login' : 'User Login'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {isAuditorLogin ? 'Access with limited permissions' : 'Full system access'}
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Link
                to="/login?role=user"
                className={`flex-1 py-2 px-4 text-center text-sm rounded-lg border transition-colors ${
                  !isAuditorLogin
                    ? 'bg-primary text-white border-primary'
                    : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                User (Owner)
              </Link>
              <Link
                to="/login?role=auditor"
                className={`flex-1 py-2 px-4 text-center text-sm rounded-lg border transition-colors ${
                  isAuditorLogin
                    ? 'bg-accent text-white border-accent'
                    : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                Auditor
              </Link>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full pl-11 pr-4 py-2.5 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-11 pr-4 py-2.5 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                  disabled={loading}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="block w-full py-3 px-4 bg-accent text-white rounded hover:bg-accent/90 transition-colors text-center disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Signing in...
                </span>
              ) : (
                'Sign in'
              )}
            </button>

            {/* Login Info */}
            {isAuditorLogin ? (
              <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs font-semibold text-amber-900 mb-2">Auditor Login:</p>
                <p className="text-xs text-amber-700">
                  Use the email and password provided by the system owner.
                </p>
                <p className="text-xs text-amber-700 mt-2">
                  You will only have access to sections assigned to you.
                </p>
              </div>
            ) : (
              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs font-semibold text-blue-900 mb-2">Owner Login:</p>
                <p className="text-xs text-blue-700">
                  Use the owner email and password you created during signup.
                </p>
                <p className="text-xs text-blue-600 mt-2">
                  After logging in, you can create auditor accounts in Auditor Management.
                </p>
              </div>
            )}
          </form>

          <div className="mt-8 pt-6 border-t border-border">
            <p className="text-xs text-muted-foreground text-center">
              Contact your administrator for access
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

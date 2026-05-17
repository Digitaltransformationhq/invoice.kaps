import { Link } from 'react-router';
import { FileText, Mail, Lock, Building2, Phone, User } from 'lucide-react';

export function Signup() {
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
            Join 10,000+ businesses managing invoices professionally
          </h1>
          <p className="text-lg opacity-90 leading-relaxed mb-8">
            Get started with our 14-day free trial. No credit card required.
          </p>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-accent rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <div className="font-medium mb-1">GST-Compliant Invoicing</div>
                <div className="text-sm opacity-75">Create professional invoices with automatic tax calculations</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-accent rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <div className="font-medium mb-1">Multi-Company Support</div>
                <div className="text-sm opacity-75">Manage multiple businesses with separate GSTIN</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-accent rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <div className="font-medium mb-1">Real-time Analytics</div>
                <div className="text-sm opacity-75">Track revenue, payments, and business insights</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Signup Form */}
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
            <h2 className="text-3xl font-semibold text-foreground mb-2">Create your account</h2>
            <p className="text-muted-foreground">Start your 14-day free trial today</p>
          </div>

          <form className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  First name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="John"
                    className="w-full pl-11 pr-4 py-2.5 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Last name
                </label>
                <input
                  type="text"
                  placeholder="Doe"
                  className="w-full px-4 py-2.5 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Company name
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Your Company Pvt Ltd"
                  className="w-full pl-11 pr-4 py-2.5 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                GSTIN (Optional)
              </label>
              <input
                type="text"
                placeholder="22AAAAA0000A1Z5"
                className="w-full px-4 py-2.5 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring uppercase"
                maxLength={15}
              />
              <p className="mt-1 text-xs text-muted-foreground">You can add this later</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="email"
                  placeholder="you@company.com"
                  className="w-full pl-11 pr-4 py-2.5 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Phone number
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="tel"
                  placeholder="+91 98765 43210"
                  className="w-full pl-11 pr-4 py-2.5 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
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
                  placeholder="Create a strong password"
                  className="w-full pl-11 pr-4 py-2.5 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Must be at least 8 characters</p>
            </div>

            <div className="flex items-start">
              <input
                type="checkbox"
                id="terms"
                className="w-4 h-4 mt-0.5 border-input rounded text-accent focus:ring-accent"
              />
              <label htmlFor="terms" className="ml-2 text-sm text-muted-foreground">
                I agree to the{' '}
                <a href="#terms" className="text-accent hover:text-accent/90">Terms of Service</a>
                {' '}and{' '}
                <a href="#privacy" className="text-accent hover:text-accent/90">Privacy Policy</a>
              </label>
            </div>

            <Link
              to="/app"
              className="block w-full py-3 px-4 bg-accent text-white rounded hover:bg-accent/90 transition-colors text-center"
            >
              Create account
            </Link>

            <div className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link to="/login" className="text-accent hover:text-accent/90 font-medium">
                Sign in
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

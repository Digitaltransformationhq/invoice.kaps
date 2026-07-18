import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { Toaster } from 'sonner';
import { AuthProvider } from '../contexts/AuthContext';
import { LandingPage } from './components/LandingPage';
import { DashboardLayout } from './components/dashboard/DashboardLayout';
import { Dashboard } from './components/dashboard/Dashboard';
import { InvoiceList } from './components/invoices/InvoiceList';
import { InvoiceCreate } from './components/invoices/InvoiceCreate';
import { CustomerList } from './components/customers/CustomerList';
import { ItemsList } from './components/items/ItemsList';
import { CreditNotesList } from './components/credit-notes/CreditNotesList';
import { CreditNoteCreate } from './components/credit-notes/CreditNoteCreate';
import { ReceiptsList } from './components/receipts/ReceiptsList';
import { ReceiptCreate } from './components/receipts/ReceiptCreate';
import { OutstandingList } from './components/outstanding/OutstandingList';
import { ReportsDashboard } from './components/reports/ReportsDashboard';
import { MyProfile } from './components/profile/MyProfile';
import { Settings } from './components/settings/Settings';
import { HelpSupport } from './components/support/HelpSupport';
import { AuditorManagement } from './components/auditor/AuditorManagement';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { AppErrorBoundary } from './components/common/AppErrorBoundary';
import { InstallPrompt } from './components/common/InstallPrompt';

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/app" element={<DashboardLayout />}>
              <Route index element={<ProtectedRoute permission="dashboard"><Dashboard /></ProtectedRoute>} />
              <Route path="dashboard" element={<ProtectedRoute permission="dashboard"><Dashboard /></ProtectedRoute>} />
              <Route path="invoices" element={<ProtectedRoute permission="invoices"><InvoiceList /></ProtectedRoute>} />
              <Route path="invoices/new" element={<ProtectedRoute permission="invoices"><InvoiceCreate /></ProtectedRoute>} />
              <Route path="customers" element={<ProtectedRoute permission="customers"><CustomerList /></ProtectedRoute>} />
              <Route path="items" element={<ProtectedRoute permission="items"><ItemsList /></ProtectedRoute>} />
              {/* TODO delivery-challans: routes land with the screens — see
                * docs/delivery-challans-plan.md §8. The permission, nav entry,
                * tables, RPC branches and rule logic are already in place. */}
              <Route path="credit-notes" element={<ProtectedRoute permission="credit-notes"><CreditNotesList /></ProtectedRoute>} />
              <Route path="credit-notes/new" element={<ProtectedRoute permission="credit-notes"><CreditNoteCreate /></ProtectedRoute>} />
              <Route path="receipts" element={<ProtectedRoute permission="receipts"><ReceiptsList /></ProtectedRoute>} />
              <Route path="receipts/new" element={<ProtectedRoute permission="receipts"><ReceiptCreate /></ProtectedRoute>} />
              <Route path="outstanding" element={<ProtectedRoute permission="outstanding"><OutstandingList /></ProtectedRoute>} />
              <Route path="payment-vouchers/*" element={<Navigate to="/app" replace />} />
              <Route path="reports" element={<ProtectedRoute permission="reports"><ReportsDashboard /></ProtectedRoute>} />
              <Route path="auditor-management" element={<ProtectedRoute ownerOnly><AuditorManagement /></ProtectedRoute>} />
              <Route path="profile" element={<MyProfile />} />
              <Route path="settings" element={<Settings />} />
              <Route path="help" element={<HelpSupport />} />
            </Route>
          </Routes>
          <InstallPrompt />
          <Toaster position="top-right" richColors />
        </BrowserRouter>
      </AuthProvider>
    </AppErrorBoundary>
  );
}

import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from '../contexts/AuthContext';

// The company defaults a NEW invoice starts from: how many days until it falls
// due, and the Terms & Conditions to print on it.
//
// Read at mount rather than at save time (unlike the invoice-number sequence in
// InvoiceCreate, which must read the live next number the moment it saves)
// because these only seed the form — once the invoice exists it carries its own
// copy. Editing the company terms must never rewrite the terms on an invoice
// that has already gone out; see supabase_invoice_terms.sql.
//
// Mirrors useTaxpayerType: same RPC, same auditor branch (auditors have no
// current_company_id(), so they must pass their id), same refresh event.

export type InvoiceDefaults = {
  dueDays: number;
  terms: string;
};

export const INVOICE_DEFAULTS_FALLBACK: InvoiceDefaults = { dueDays: 15, terms: '' };

export function useInvoiceDefaults() {
  const { user } = useAuth();
  const [defaults, setDefaults] = useState<InvoiceDefaults>(INVOICE_DEFAULTS_FALLBACK);
  // The form must not seed itself from the fallback and then jump when the real
  // settings land, so callers wait on this before deriving anything.
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!user?.company_id) return;
    let cancelled = false;

    const fetchDefaults = () => {
      supabase
        .rpc('get_company_settings', {
          p_auditor_id: user.role === 'auditor' ? user.id : null,
        })
        .then(({ data }) => {
          if (cancelled) return;
          if (data?.success) {
            const s = data.settings || {};
            setDefaults({
              dueDays: Number(s.default_due_days) || INVOICE_DEFAULTS_FALLBACK.dueDays,
              terms: (s.terms ?? '').toString(),
            });
          }
          setIsLoaded(true);
        });
    };

    fetchDefaults();
    // Saving on the Settings page should reach an invoice form already open.
    window.addEventListener('company-settings-updated', fetchDefaults);

    return () => {
      cancelled = true;
      window.removeEventListener('company-settings-updated', fetchDefaults);
    };
  }, [user?.company_id, user?.role, user?.id]);

  return { ...defaults, isLoaded };
}

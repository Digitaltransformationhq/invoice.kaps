import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from '../contexts/AuthContext';
import { DEFAULT_INVOICE_TEMPLATE_ID } from './invoiceTemplates';

// The company's DEFAULT invoice format — the layout a new invoice starts in.
//
// It is only ever a starting point. The invoice stores the format it was issued
// with (invoices.invoice_template), and that is what a reprint reads, so
// changing this setting never restyles an invoice that has already gone out.
// Same reasoning as the terms snapshot in `useInvoiceDefaults`.
//
// Mirrors useTaxpayerType: same RPC, same auditor branch (auditors have no
// current_company_id(), so they must pass their id), same refresh event.

export function useInvoiceTemplate() {
  const { user } = useAuth();
  const [templateId, setTemplateId] = useState<string>(DEFAULT_INVOICE_TEMPLATE_ID);
  // The create form must not stamp an invoice with the fallback and then have
  // the real setting land a moment later, so callers wait on this before saving.
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!user?.company_id) return;
    let cancelled = false;

    const fetchTemplate = () => {
      supabase
        .rpc('get_company_settings', {
          p_auditor_id: user.role === 'auditor' ? user.id : null,
        })
        .then(({ data }) => {
          if (cancelled) return;
          if (data?.success) {
            setTemplateId(
              (data.settings?.invoice_template || '').toString().trim() || DEFAULT_INVOICE_TEMPLATE_ID,
            );
          }
          setIsLoaded(true);
        });
    };

    fetchTemplate();
    // Saving on the Settings page should reach an invoice form already open.
    window.addEventListener('company-settings-updated', fetchTemplate);

    return () => {
      cancelled = true;
      window.removeEventListener('company-settings-updated', fetchTemplate);
    };
  }, [user?.company_id, user?.role, user?.id]);

  return { templateId, isLoaded };
}

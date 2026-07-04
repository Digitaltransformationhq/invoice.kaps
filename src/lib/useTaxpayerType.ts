import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from '../contexts/AuthContext';

// Company-level GST registration type. Composition dealers issue a "Bill of
// Supply" and cannot collect tax, so the UI relabels/omits tax throughout.
// Centralised here so the sidebar, invoice create page and preview stay in sync
// without each duplicating the get_company_settings fetch.
export function useTaxpayerType() {
  const { user } = useAuth();
  const [taxpayerType, setTaxpayerType] = useState<string>('regular');

  useEffect(() => {
    if (!user?.company_id) return;
    let cancelled = false;

    const fetchType = () => {
      supabase
        .rpc('get_company_settings', {
          p_auditor_id: user.role === 'auditor' ? user.id : null,
        })
        .then(({ data }) => {
          if (!cancelled && data?.success) {
            setTaxpayerType(data.settings?.taxpayer_type || 'regular');
          }
        });
    };

    fetchType();
    // Refetch when settings are saved elsewhere (e.g. Settings page) so the
    // sidebar/labels update without a full page reload.
    window.addEventListener('company-settings-updated', fetchType);

    return () => {
      cancelled = true;
      window.removeEventListener('company-settings-updated', fetchType);
    };
  }, [user?.company_id, user?.role, user?.id]);

  return { taxpayerType, isComposition: taxpayerType === 'composition' };
}

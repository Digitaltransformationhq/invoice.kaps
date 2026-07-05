import { supabase } from './supabase';

/** One extracted line item from a scanned bill (all fields best-effort). */
export interface ExtractedLineItem {
  item?: string;
  description?: string;
  hsn?: string;
  qty?: number;
  unit?: string;
  rate?: number;
  discount?: number;
  gst?: number;
}

/** The structured fields the `extract-bill` function returns, mirroring the
 * Create Invoice form. Every field is best-effort — blank/0 when unreadable. */
export interface ExtractedBill {
  customerName?: string;
  customerGstin?: string;
  customerAddress?: string;
  customerPhone?: string;
  customerEmail?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  placeOfSupply?: string;
  poNumber?: string;
  poDate?: string;
  transportMode?: string;
  vehicleNo?: string;
  remarks?: string;
  lineItems?: ExtractedLineItem[];
}

export interface ExtractBillResult {
  success: boolean;
  data?: ExtractedBill;
  error?: string;
}

interface ExtractBillFnResponse {
  success: boolean;
  data?: ExtractedBill;
  error?: string;
}

/**
 * Extract structured invoice fields from an uploaded bill photo/PDF via the
 * `extract-bill` Edge Function (which calls the Claude API server-side — the
 * ANTHROPIC_API_KEY lives as a Supabase secret and is never exposed to the
 * frontend). Pass the raw base64 (no `data:` prefix) and the file's MIME type.
 */
export async function extractBillFromFile(
  base64: string,
  mediaType: string,
): Promise<ExtractBillResult> {
  try {
    const { data, error } = await supabase.functions.invoke<ExtractBillFnResponse>(
      'extract-bill',
      { body: { base64, mediaType } },
    );

    if (error) {
      // FunctionsHttpError exposes `context` as the original Response.
      let serverError: string | undefined;
      const context: any = (error as any).context;
      if (context && typeof context.clone === 'function') {
        try {
          const parsed = await context.clone().json();
          serverError = parsed?.error || parsed?.message;
        } catch {
          try {
            const text = await context.clone().text();
            if (text) serverError = text;
          } catch {
            /* fall through */
          }
        }
      }
      if (!serverError && (data as any)?.error) {
        serverError = (data as any).error;
      }

      const message = (error.message || '').toLowerCase();
      if (message.includes('not found') || message.includes('404')) {
        return {
          success: false,
          error: 'Bill-scanning function is not deployed yet. Run: npx supabase functions deploy extract-bill --no-verify-jwt',
        };
      }
      if (message.includes('failed to fetch') || message.includes('network')) {
        return {
          success: false,
          error: 'Network error reaching the bill-scanning service. Check your connection and that the function is deployed.',
        };
      }

      return { success: false, error: serverError || error.message || 'Could not scan the bill.' };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'The bill-scanning service returned an unexpected response.' };
    }

    return { success: true, data: data.data };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Network error while scanning the bill.' };
  }
}

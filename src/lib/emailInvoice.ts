import { supabase } from './supabase';

export interface SendInvoiceEmailPayload {
  /** Recipient email address (required). */
  to: string;
  /** Invoice number shown in subject + body. */
  invoiceNumber: string;
  /** Customer/buyer display name. */
  customerName?: string;
  /** Pre-formatted amount string e.g. "1,77,000.00" (no currency symbol). */
  amount?: string;
  /** Currency prefix (defaults to ₹). */
  currency?: string;
  /** "From" display name (e.g. the seller's company name). */
  fromName?: string;
  /** Optional override for the From email; defaults to the server's INVOICE_FROM_EMAIL secret. */
  fromEmail?: string;
  /** Optional Reply-To address (typically the seller's email). */
  replyTo?: string;
  /** Optional named template registered in the Edge Function. Defaults to "default". */
  template?: string;
  /** Optional extra data forwarded to the chosen template. */
  templateData?: Record<string, unknown>;
  /** Optional fully-formed HTML body (overrides the template). */
  htmlBody?: string;
  /** Optional Resend-style attachments. */
  attachments?: Array<{ filename: string; content: string }>;
}

export interface SendInvoiceEmailResult {
  success: boolean;
  /** Resend message id when success === true. */
  id?: string;
  /** Human-readable error message when success === false. */
  error?: string;
}

/**
 * Sends an invoice email via the `send-invoice-email` Edge Function. The Resend
 * API key lives server-side as a Supabase secret (RESEND_API_KEY) — never expose
 * it to the frontend.
 *
 * Uses `supabase.functions.invoke()`, which handles CORS and auth headers
 * automatically. Returns `{ success: true, id }` on success and
 * `{ success: false, error }` on any failure.
 */
export async function sendInvoiceEmail(
  payload: SendInvoiceEmailPayload,
): Promise<SendInvoiceEmailResult> {
  try {
    const { data, error } = await supabase.functions.invoke<SendInvoiceEmailResult>(
      'send-invoice-email',
      { body: payload },
    );

    if (error) {
      // FunctionsHttpError exposes `context` as the original `Response`.
      // We have to await .json() / .text() on it to see the server's payload.
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
      if (!serverError && data && (data as any)?.error) {
        serverError = (data as any).error;
      }

      const message = (error.message || '').toLowerCase();
      if (message.includes('not found') || message.includes('404')) {
        return {
          success: false,
          error:
            'Email function is not deployed yet. Run: npx supabase functions deploy send-invoice-email',
        };
      }
      if (message.includes('failed to fetch') || message.includes('network')) {
        return {
          success: false,
          error:
            'Network error reaching the email service. Check your internet connection and that the Edge Function is deployed.',
        };
      }

      return {
        success: false,
        error: serverError || error.message || 'Failed to send invoice email',
      };
    }

    if (!data?.success) {
      return {
        success: false,
        error: data?.error || 'Email service returned an unexpected response',
      };
    }

    return { success: true, id: data.id };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Network error while sending the invoice email',
    };
  }
}

// @ts-nocheck — this is a Deno Edge Function; the `Deno` global resolves at
// deploy time, not in VSCode's Node-flavoured TS checker.
//
// Owner password reset — delivered through AWS SES instead of Supabase's
// built-in mailer.
//
// Why: Supabase's default SMTP only delivers to email addresses that are members
// of the Supabase organisation (and is capped at ~2 emails/hour). Real users'
// reset emails were accepted by Supabase and then silently never sent. This
// function mints the recovery token itself with the admin API (which sends no
// email) and mails the link through the same SES account the invoice emails use.
//
// Flow:  { email, redirectTo }
//   1. password_reset_gate(email)  → does the account exist? cooldown left?
//   2. POST /auth/v1/admin/generate_link { type: 'recovery' } → hashed_token
//   3. SES SendEmail with  <redirectTo>?token_hash=…&type=recovery
// ResetPassword.tsx holds that token and spends it via verifyOtp() only when
// the user submits the new password (so link scanners can't burn it).
//
// Deploy:
//   npx supabase functions deploy send-password-reset --no-verify-jwt
//
// Prerequisite: run supabase/sql/supabase_password_reset_gate.sql once.
//
// Secrets (already set for send-invoice-email):
//   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, INVOICE_FROM_EMAIL
// Optional:
//   PASSWORD_RESET_FROM_EMAIL — sender for reset mail (verified SES identity);
//                               falls back to INVOICE_FROM_EMAIL
//   PASSWORD_RESET_FROM_NAME  — display name, default "GSTInvoice Pro"
//   APP_ALLOWED_ORIGINS       — comma-separated extra origins allowed as redirect
//                               targets (production + localhost are built in)
//
// Responses (always HTTP 200 unless the request itself is malformed):
//   { success: true }                              — sent, or no such account
//   { success: false, rateLimited: true, retryAfter, error }
//   { success: false, notConfigured: true, error } — SES secrets missing; the
//                                                    client falls back to Supabase
//   { success: false, error }                      — SES / Supabase failure

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const JSON_HEADERS = { ...CORS_HEADERS, 'Content-Type': 'application/json' };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

const PRODUCTION_ORIGIN = 'https://invoice.kapsca.in';
const RESET_PATH = '/reset-password';
const LINK_LIFETIME_MINUTES = 15; // keep in sync with Auth → Email OTP Expiration (900 s)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Redirect target — only our own origins, always the /reset-password page.
// ---------------------------------------------------------------------------

function resolveRedirect(requested) {
  const extra = (Deno.env.get('APP_ALLOWED_ORIGINS') || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const allowed = new Set([PRODUCTION_ORIGIN, 'https://www.invoice.kapsca.in', ...extra]);

  try {
    const url = new URL(requested);
    const isLocal =
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
      (url.protocol === 'http:' || url.protocol === 'https:');
    if (allowed.has(url.origin) || isLocal) {
      return `${url.origin}${RESET_PATH}`;
    }
  } catch {
    // fall through to production
  }
  return `${PRODUCTION_ORIGIN}${RESET_PATH}`;
}

// ---------------------------------------------------------------------------
// AWS SigV4 — minimal implementation for SES v2 SendEmail (same as
// send-invoice-email; Edge Functions are deployed as single files).
// ---------------------------------------------------------------------------

const enc = new TextEncoder();

async function sha256Hex(input) {
  const data = typeof input === 'string' ? enc.encode(input) : input;
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(key, data) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key instanceof Uint8Array ? key : new Uint8Array(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
}

async function signSesRequest({ region, body, accessKeyId, secretAccessKey }) {
  const host = `email.${region}.amazonaws.com`;
  const path = '/v2/email/outbound-emails';
  const service = 'ses';

  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const signedHeaders = 'content-type;host;x-amz-date';
  const canonicalRequest = [
    'POST',
    path,
    '',
    `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`,
    signedHeaders,
    await sha256Hex(body),
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  let key = await hmacSha256(enc.encode('AWS4' + secretAccessKey), dateStamp);
  key = await hmacSha256(key, region);
  key = await hmacSha256(key, service);
  key = await hmacSha256(key, 'aws4_request');
  const signature = [...new Uint8Array(await hmacSha256(key, stringToSign))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return {
    url: `https://${host}${path}`,
    headers: {
      'Content-Type': 'application/json',
      'X-Amz-Date': amzDate,
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

// ---------------------------------------------------------------------------
// Email content
// ---------------------------------------------------------------------------

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderHtml(link) {
  const href = escapeHtml(link);
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Arial,sans-serif";
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reset your password</title></head>
<body style="margin:0;padding:0;background:#f4f3fb;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f3fb;margin:0;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:14px;border:1px solid #e6e3f5;font-family:${font};">
      <tr><td style="padding:28px 32px 0 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="width:34px;height:34px;background:#7c3aed;border-radius:9px;text-align:center;vertical-align:middle;font-size:17px;line-height:34px;color:#ffffff;">&#8377;</td>
          <td style="padding-left:11px;font-size:17px;font-weight:600;color:#0f172a;">GSTInvoice&nbsp;Pro</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:26px 32px 0 32px;">
        <h1 style="margin:0;font-size:21px;line-height:1.35;font-weight:600;color:#0f172a;">Reset your password</h1>
        <p style="margin:14px 0 0;font-size:14.5px;line-height:1.65;color:#475569;">We received a request to set a new password for your account. Click the button below to choose one.</p>
      </td></tr>
      <tr><td style="padding:26px 32px 0 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="background:#7c3aed;border-radius:999px;">
            <a href="${href}" style="display:inline-block;padding:13px 30px;font-size:14.5px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">Choose a new password</a>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:22px 32px 0 32px;">
        <p style="margin:0;font-size:13px;line-height:1.65;color:#64748b;">This link expires in <strong style="color:#475569;">${LINK_LIFETIME_MINUTES} minutes</strong> and can only be used once. If it has already expired, just request another reset from the sign-in screen.</p>
      </td></tr>
      <tr><td style="padding:20px 32px 0 32px;">
        <p style="margin:0 0 6px;font-size:12px;color:#94a3b8;">Button not working? Paste this into your browser:</p>
        <p style="margin:0;font-size:11.5px;line-height:1.55;color:#7c3aed;word-break:break-all;">${href}</p>
      </td></tr>
      <tr><td style="padding:24px 32px 28px 32px;">
        <div style="height:1px;background:#eceafa;margin-bottom:18px;"></div>
        <p style="margin:0;font-size:12.5px;line-height:1.65;color:#94a3b8;">Didn't ask for this? You can safely ignore this email — your password stays unchanged until someone opens the link above.</p>
      </td></tr>
    </table>
    <p style="max-width:560px;margin:16px auto 0;font-size:11.5px;line-height:1.6;color:#a3a3b5;font-family:${font};">GSTInvoice Pro &middot; This is an automated message, please don't reply.</p>
  </td></tr>
</table>
</body></html>`;
}

function renderText(link) {
  return [
    'Reset your GSTInvoice Pro password',
    '',
    'We received a request to set a new password for your account.',
    'Open this link to choose one:',
    '',
    link,
    '',
    `The link expires in ${LINK_LIFETIME_MINUTES} minutes and can only be used once.`,
    "Didn't ask for this? Ignore this email — your password stays unchanged.",
  ].join('\n');
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405);
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const email = String(payload?.email || '').trim().toLowerCase();
  if (!email || email.length > 320 || !EMAIL_RE.test(email)) {
    return json({ success: false, error: 'Enter a valid email address' }, 400);
  }
  const redirectTo = resolveRedirect(String(payload?.redirectTo || ''));

  // ---- Configuration ----------------------------------------------------
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY');
  const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
  const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
  const region = Deno.env.get('AWS_REGION') || 'ap-south-1';
  const senderEmail =
    Deno.env.get('PASSWORD_RESET_FROM_EMAIL') || Deno.env.get('INVOICE_FROM_EMAIL');
  const senderName = Deno.env.get('PASSWORD_RESET_FROM_NAME') || 'GSTInvoice Pro';

  if (!supabaseUrl || !serviceKey || !accessKeyId || !secretAccessKey || !senderEmail) {
    console.error('send-password-reset: missing configuration', {
      supabaseUrl: !!supabaseUrl,
      serviceKey: !!serviceKey,
      accessKeyId: !!accessKeyId,
      secretAccessKey: !!secretAccessKey,
      senderEmail: !!senderEmail,
    });
    return json({
      success: false,
      notConfigured: true,
      error: 'Password reset email is not configured on the server.',
    });
  }

  const adminHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  // ---- 1. Account lookup + cooldown --------------------------------------
  let targetEmail = email;
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/password_reset_gate`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ p_email: email }),
    });

    if (response.ok) {
      const rows = await response.json();
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row?.user_id) {
        // No such account — same answer as a real send, nothing is mailed.
        return json({ success: true });
      }
      targetEmail = row.email || email;
      if (row.wait_seconds > 0) {
        return json({
          success: false,
          rateLimited: true,
          retryAfter: row.wait_seconds,
          error: `A reset link was just sent. Wait ${row.wait_seconds} seconds before requesting another.`,
        });
      }
    } else {
      // Gate SQL not installed yet: carry on — generate_link below still
      // rejects unknown emails, we just lose the cooldown.
      console.warn('password_reset_gate unavailable:', response.status, await response.text());
    }
  } catch (error) {
    console.warn('password_reset_gate threw:', error);
  }

  // ---- 2. Mint the recovery token (sends no email) ------------------------
  let tokenHash;
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ type: 'recovery', email: targetEmail, redirect_to: redirectTo }),
    });
    const body = await response.text();

    if (!response.ok) {
      let parsed = null;
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = null;
      }
      const code = parsed?.error_code || parsed?.code;
      if (response.status === 404 || code === 'user_not_found') {
        return json({ success: true });
      }
      if (response.status === 429) {
        return json({
          success: false,
          rateLimited: true,
          error: 'Too many reset requests. Wait a minute before trying again.',
        });
      }
      console.error('generate_link failed:', response.status, body);
      return json({ success: false, error: 'Could not create a reset link. Try again shortly.' });
    }

    const parsed = body ? JSON.parse(body) : {};
    tokenHash = parsed?.hashed_token || parsed?.properties?.hashed_token;
    if (!tokenHash) {
      console.error('generate_link returned no hashed_token');
      return json({ success: false, error: 'Could not create a reset link. Try again shortly.' });
    }
  } catch (error) {
    console.error('generate_link threw:', error);
    return json({ success: false, error: 'Could not create a reset link. Try again shortly.' });
  }

  // ---- 3. Send through SES -------------------------------------------------
  const link =
    `${redirectTo}?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`;

  const sesBody = JSON.stringify({
    FromEmailAddress: `${senderName} <${senderEmail}>`,
    Destination: { ToAddresses: [targetEmail] },
    Content: {
      Simple: {
        Subject: { Data: 'Reset your GSTInvoice Pro password', Charset: 'UTF-8' },
        Body: {
          Html: { Data: renderHtml(link), Charset: 'UTF-8' },
          Text: { Data: renderText(link), Charset: 'UTF-8' },
        },
      },
    },
  });

  try {
    const signed = await signSesRequest({ region, body: sesBody, accessKeyId, secretAccessKey });
    const response = await fetch(signed.url, {
      method: 'POST',
      headers: signed.headers,
      body: sesBody,
    });

    if (!response.ok) {
      let result = null;
      try {
        result = await response.json();
      } catch {
        result = null;
      }
      const code = result?.__type || result?.code || `HTTP ${response.status}`;
      const message = result?.message || result?.Message || '';
      // Visible in Supabase → Edge Functions → send-password-reset → Logs.
      // "Email address is not verified" here means SES is still in sandbox.
      console.error('SES SendEmail failed:', code, message);
      return json({
        success: false,
        error: 'We could not send the reset email right now. Try again in a few minutes.',
      });
    }

    return json({ success: true });
  } catch (error) {
    console.error('SES SendEmail threw:', error);
    return json({
      success: false,
      error: 'We could not send the reset email right now. Try again in a few minutes.',
    });
  }
});

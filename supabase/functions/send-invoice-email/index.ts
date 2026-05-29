// @ts-nocheck — this is a Deno Edge Function; the `Deno` global resolves at
// deploy time, not in VSCode's Node-flavoured TS checker.
//
// Dedicated single-file Edge Function for sending invoice emails via AWS SES.
//
// Deploy:
//   npx supabase functions deploy send-invoice-email --no-verify-jwt
//
// Required secrets (set once in Supabase Dashboard → Edge Functions → Secrets):
//   AWS_ACCESS_KEY_ID       — IAM user access key with `ses:SendEmail` permission
//   AWS_SECRET_ACCESS_KEY   — matching secret key
//   AWS_REGION              — e.g. `us-east-1`, `ap-south-1`, `eu-west-1`
//   INVOICE_FROM_EMAIL      — default From address (must be a verified SES identity)
//
// SES rules to remember:
//  • While the AWS account is in the SES "sandbox", emails can only be sent to
//    verified recipients. Request production access in the SES console to lift this.
//  • The FROM address (or its domain) must be a verified SES identity, otherwise
//    SES rejects with `MessageRejected`.
//  • Sending from a free mailbox (gmail.com, outlook.com) generally fails DMARC at
//    the recipient's mail server. Use an address on a domain you control for prod.
//
// The function speaks the SES v2 SendEmail HTTP API directly, signed with SigV4 via
// the Web Crypto API. No npm SDK is bundled — cold start stays under 100 ms.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const JSON_HEADERS = {
  ...CORS_HEADERS,
  'Content-Type': 'application/json',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// ---------------------------------------------------------------------------
// AWS SigV4 signing — minimal implementation for SES v2 SendEmail.
// ---------------------------------------------------------------------------

const enc = new TextEncoder();

async function sha256Hex(input) {
  const data = typeof input === 'string' ? enc.encode(input) : input;
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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

async function getSigningKey(secretKey, dateStamp, region, service) {
  const kDate = await hmacSha256(enc.encode('AWS4' + secretKey), dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, 'aws4_request');
}

async function signSesRequest({
  region,
  body,
  accessKeyId,
  secretAccessKey,
}) {
  const host = `email.${region}.amazonaws.com`;
  const path = '/v2/email/outbound-emails';
  const service = 'ses';

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // 20250529T123456Z
  const dateStamp = amzDate.slice(0, 8); // 20250529

  const payloadHash = await sha256Hex(body);
  const signedHeaders = 'content-type;host;x-amz-date';
  const canonicalHeaders =
    `content-type:application/json\n` +
    `host:${host}\n` +
    `x-amz-date:${amzDate}\n`;

  const canonicalRequest = [
    'POST',
    path,
    '', // empty query string
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = await getSigningKey(
    secretAccessKey,
    dateStamp,
    region,
    service,
  );
  const signatureBuf = await hmacSha256(signingKey, stringToSign);
  const signature = [...new Uint8Array(signatureBuf)]
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
// Template registry — add new templates here.
// ---------------------------------------------------------------------------

function defaultTemplate(ctx) {
  const {
    invoiceNumber,
    customerName,
    amount,
    currency = '₹',
    fromName,
  } = ctx;
  const amountLine = amount
    ? ` for a total of <strong>${currency}${amount}</strong>`
    : '';
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; color: #0f172a; background: #ffffff;">
      <div style="border-left: 4px solid #8b5cf6; padding-left: 16px; margin-bottom: 24px;">
        <div style="font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #8b5cf6; font-weight: 600;">Tax Invoice</div>
        <h2 style="margin: 4px 0 0; font-size: 22px; color: #0f172a;">${invoiceNumber}</h2>
      </div>
      <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6;">Hello ${customerName || 'there'},</p>
      <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6;">
        Please find your invoice ${invoiceNumber}${amountLine} attached for your records.
      </p>
      <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6;">
        If you have any questions about this invoice, just reply to this email.
      </p>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="margin: 0; font-size: 13px; color: #64748b;">Thank you for your business.${fromName ? `<br/>${fromName}` : ''}</p>
    </div>
  `;
}

const TEMPLATES = {
  default: defaultTemplate,
};

function renderTemplate(name, ctx) {
  const renderer = TEMPLATES[name || 'default'] || TEMPLATES.default;
  return renderer(ctx);
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

  const {
    to,
    invoiceNumber,
    customerName,
    amount,
    currency = '₹',
    fromName,
    fromEmail,
    replyTo,
    template,
    templateData,
    htmlBody,
    attachments,
  } = payload || {};

  if (!to || !invoiceNumber) {
    return json(
      { success: false, error: 'Missing recipient email or invoice number' },
      400,
    );
  }

  if (Array.isArray(attachments) && attachments.length > 0) {
    return json(
      {
        success: false,
        error:
          'Attachments are not yet supported by the SES backend. Remove the attachments field and try again.',
      },
      400,
    );
  }

  const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
  const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
  const region = Deno.env.get('AWS_REGION') || 'us-east-1';

  if (!accessKeyId || !secretAccessKey) {
    return json(
      {
        success: false,
        error:
          'AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set in Supabase Dashboard → Edge Functions → Secrets.',
      },
      500,
    );
  }

  const defaultFrom = Deno.env.get('INVOICE_FROM_EMAIL');
  const senderEmail = fromEmail || defaultFrom;
  if (!senderEmail) {
    return json(
      {
        success: false,
        error:
          'No sender address configured. Set INVOICE_FROM_EMAIL (a verified SES identity) as a Supabase secret.',
      },
      500,
    );
  }

  const fromHeader = fromName ? `${fromName} <${senderEmail}>` : senderEmail;
  const subject = `Invoice ${invoiceNumber}${
    customerName ? ` for ${customerName}` : ''
  }`;

  const html =
    htmlBody ||
    renderTemplate(template, {
      to,
      invoiceNumber,
      customerName,
      amount,
      currency,
      fromName,
      ...(templateData || {}),
    });

  const toAddresses = Array.isArray(to) ? to : [to];

  const sesBody = JSON.stringify({
    FromEmailAddress: fromHeader,
    Destination: { ToAddresses: toAddresses },
    ...(replyTo ? { ReplyToAddresses: [replyTo] } : {}),
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: html, Charset: 'UTF-8' },
        },
      },
    },
  });

  try {
    const signed = await signSesRequest({
      region,
      body: sesBody,
      accessKeyId,
      secretAccessKey,
    });

    const response = await fetch(signed.url, {
      method: 'POST',
      headers: signed.headers,
      body: sesBody,
    });

    let result = null;
    try {
      result = await response.json();
    } catch {
      result = null;
    }

    if (!response.ok) {
      console.log('SES error:', response.status, result);
      const code = result?.__type || result?.code || 'SESError';
      const message =
        result?.message ||
        result?.Message ||
        `SES returned ${response.status}`;
      return json(
        { success: false, error: `${code}: ${message}` },
        response.status,
      );
    }

    return json({ success: true, id: result?.MessageId });
  } catch (error) {
    console.log('send-invoice-email error:', error);
    return json(
      {
        success: false,
        error: error?.message || 'Unknown error sending email',
      },
      500,
    );
  }
});

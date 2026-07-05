// @ts-nocheck
// Supabase Edge Function: extract-bill
// -----------------------------------------------------------------------------
// Takes an uploaded bill/invoice (image or PDF, base64) and uses a vision LLM to
// extract structured invoice fields, which the client uses to pre-fill the
// Create Invoice form for review.
//
// Provider is switched by which secret is set (no code changes needed):
//   OPENROUTER_API_KEY  -> OpenRouter (open-source models, e.g. Qwen2.5-VL 72B).
//                          Optional OPENROUTER_MODEL (default below). Images only
//                          — open VLMs don't read PDFs; use a photo, or Claude.
//   ANTHROPIC_API_KEY   -> Claude (Opus 4.8). Handles images AND PDFs natively.
// If both are set, OpenRouter wins.
//
// Set a secret:  npx supabase secrets set OPENROUTER_API_KEY=sk-or-...
// Deploy:        npx supabase functions deploy extract-bill --no-verify-jwt
// -----------------------------------------------------------------------------

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const JSON_HEADERS = { ...CORS_HEADERS, 'Content-Type': 'application/json' };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// The shape the model must return — mirrors the Create Invoice form fields.
const BILL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    customerName: { type: 'string', description: 'Buyer / customer company name' },
    customerGstin: { type: 'string', description: "Buyer's GSTIN, if present" },
    customerAddress: { type: 'string' },
    customerPhone: { type: 'string' },
    customerEmail: { type: 'string' },
    invoiceNumber: { type: 'string' },
    invoiceDate: { type: 'string', description: 'Invoice date in YYYY-MM-DD' },
    placeOfSupply: { type: 'string', description: 'State / place of supply' },
    poNumber: { type: 'string' },
    poDate: { type: 'string', description: 'PO date in YYYY-MM-DD' },
    transportMode: { type: 'string' },
    vehicleNo: { type: 'string' },
    remarks: { type: 'string' },
    lineItems: {
      type: 'array',
      description: 'Every line item / row on the bill',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          item: { type: 'string', description: 'Item / product / service name' },
          description: { type: 'string' },
          hsn: { type: 'string', description: 'HSN / SAC code' },
          qty: { type: 'number' },
          unit: { type: 'string' },
          rate: { type: 'number', description: 'Unit rate / price' },
          discount: { type: 'number', description: 'Discount percentage (0 if none)' },
          gst: { type: 'number', description: 'GST rate percentage e.g. 18 (0 if none)' },
        },
        required: ['item', 'description', 'hsn', 'qty', 'unit', 'rate', 'discount', 'gst'],
      },
    },
  },
  required: [
    'customerName', 'customerGstin', 'customerAddress', 'customerPhone', 'customerEmail',
    'invoiceNumber', 'invoiceDate', 'placeOfSupply', 'poNumber', 'poDate',
    'transportMode', 'vehicleNo', 'remarks', 'lineItems',
  ],
};

// Exact JSON shape for models that don't support tool/schema enforcement.
const JSON_SHAPE = `{
  "customerName": "", "customerGstin": "", "customerAddress": "", "customerPhone": "", "customerEmail": "",
  "invoiceNumber": "", "invoiceDate": "", "placeOfSupply": "", "poNumber": "", "poDate": "",
  "transportMode": "", "vehicleNo": "", "remarks": "",
  "lineItems": [ { "item": "", "description": "", "hsn": "", "qty": 0, "unit": "", "rate": 0, "discount": 0, "gst": 0 } ]
}`;

const INSTRUCTION = [
  "The attached image is a supplier's bill or invoice. It may be printed or handwritten.",
  'Read it carefully and extract the details.',
  '',
  'Rules:',
  '- Use an empty string "" for any text field you cannot read, and 0 for any numeric field you cannot read. Never guess or invent values.',
  '- invoiceDate and poDate must be YYYY-MM-DD. Convert from whatever format the bill uses. If the year is not visible, leave the date empty.',
  '- gst is the GST rate as a percentage number (e.g. 18, not 0.18). If the bill shows no tax, use 0.',
  '- qty, rate and discount are plain numbers; discount is a percentage (0 if none).',
  '- Extract every line item you can see. Put the product/service name in "item" and any extra detail in "description".',
  '- customerName / customerGstin refer to the BUYER (the party the bill is addressed to), not the seller.',
].join('\n');

// Pull the first balanced JSON object out of a model's text response.
function parseJsonLoose(text: string): any {
  if (!text) return null;
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ---- Provider: OpenRouter (OpenAI-compatible; open-source vision models) -----
async function extractViaOpenRouter(apiKey: string, base64: string, mediaType: string) {
  if (mediaType === 'application/pdf') {
    return {
      error: 'This open model reads photos, not PDFs. Upload a photo of the bill, or switch the server to the Claude provider for PDF support.',
      status: 400,
    };
  }

  const model = Deno.env.get('OPENROUTER_MODEL') || 'qwen/qwen2.5-vl-72b-instruct';
  const prompt = `${INSTRUCTION}\n\nRespond with ONLY a single JSON object in exactly this shape (no markdown, no commentary):\n${JSON_SHAPE}`;

  let resp: Response;
  try {
    resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Optional attribution headers recommended by OpenRouter.
        'HTTP-Referer': 'https://invoice.kaps',
        'X-Title': 'Invoice Kaps — Bill Scan',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        temperature: 0,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } },
          ],
        }],
      }),
    });
  } catch (err) {
    return { error: `Could not reach OpenRouter: ${String(err)}`, status: 502 };
  }

  const result = await resp.json().catch(() => null);
  if (!resp.ok) {
    return { error: result?.error?.message || `Extraction failed (HTTP ${resp.status}).`, status: 502 };
  }

  const content = result?.choices?.[0]?.message?.content;
  const text = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map((c: any) => c?.text || '').join('')
      : '';
  const data = parseJsonLoose(text);
  if (!data) {
    return { error: 'Could not read any details from this bill. Try a clearer photo.', status: 422 };
  }
  return { data, status: 200 };
}

// ---- Provider: Claude (native image + PDF) -----------------------------------
async function extractViaClaude(apiKey: string, base64: string, mediaType: string) {
  let mediaBlock: unknown;
  if (mediaType.startsWith('image/')) {
    mediaBlock = { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };
  } else if (mediaType === 'application/pdf') {
    mediaBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } };
  } else {
    return { error: 'Unsupported file type. Upload a JPG, PNG or PDF bill.', status: 400 };
  }

  let resp: Response;
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 4096,
        tools: [{
          name: 'record_bill',
          description: 'Record the structured fields extracted from the bill/invoice.',
          input_schema: BILL_SCHEMA,
        }],
        tool_choice: { type: 'tool', name: 'record_bill' },
        messages: [{ role: 'user', content: [mediaBlock, { type: 'text', text: INSTRUCTION }] }],
      }),
    });
  } catch (err) {
    return { error: `Could not reach the extraction service: ${String(err)}`, status: 502 };
  }

  const result = await resp.json().catch(() => null);
  if (!resp.ok) {
    return { error: result?.error?.message || `Extraction failed (HTTP ${resp.status}).`, status: 502 };
  }
  const toolUse = Array.isArray(result?.content)
    ? result.content.find((b: any) => b?.type === 'tool_use')
    : null;
  if (!toolUse?.input) {
    return { error: 'Could not read any details from this bill. Try a clearer photo.', status: 422 };
  }
  return { data: toolUse.input, status: 200 };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY');
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!openrouterKey && !anthropicKey) {
    return json({ success: false, error: 'No extraction provider is configured. Set OPENROUTER_API_KEY or ANTHROPIC_API_KEY.' }, 500);
  }

  let payload: { base64?: string; mediaType?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const base64 = (payload.base64 || '').trim();
  const mediaType = (payload.mediaType || '').trim().toLowerCase();
  if (!base64) return json({ success: false, error: 'No file data provided.' }, 400);
  if (base64.length > 10_000_000) {
    return json({ success: false, error: 'File is too large. Please upload a bill under ~7 MB.' }, 400);
  }

  const outcome = openrouterKey
    ? await extractViaOpenRouter(openrouterKey, base64, mediaType)
    : await extractViaClaude(anthropicKey as string, base64, mediaType);

  if (outcome.error) return json({ success: false, error: outcome.error }, outcome.status || 502);
  return json({ success: true, data: outcome.data });
});

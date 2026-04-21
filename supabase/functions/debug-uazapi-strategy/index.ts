// One-shot debug function to test UAZAPI cache warm-up hypothesis.
// Tests: chat/check warm-up + chat/details retrieval pattern.
// Public (no auth) so we can curl it directly during debugging.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function ensureCountryCode(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  if (clean.length >= 12) return clean;
  if (clean.length >= 10 && clean.length <= 11) return `55${clean}`;
  return clean;
}

async function fetchWithTimeout(url: string, options: RequestInit, ms = 10000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function callEndpoint(url: string, token: string, body: unknown) {
  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token },
      body: JSON.stringify(body),
    }, 10000);
    const text = await res.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { /* not json */ }
    return {
      status: res.status,
      ok: res.ok,
      bodyPreview: text.slice(0, 800),
      parsed,
    };
  } catch (e) {
    return { status: 0, ok: false, error: String(e).slice(0, 200) };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const baseUrl = Deno.env.get('UAZAPI_BASE_URL');
  const adminToken = Deno.env.get('UAZAPI_ADMIN_TOKEN');
  const respond = (body: unknown) =>
    new Response(JSON.stringify(body, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (!baseUrl) return respond({ error: 'UAZAPI_BASE_URL not set' });

  // Token comes from request body (instance token), since that's what edge fns use
  let instanceToken = '';
  let phones: string[] = ['5511983568625', '553184703199', '5513998070248', '556791643111', '5527998895435'];
  try {
    const body = await req.json();
    if (body?.token) instanceToken = body.token;
    if (Array.isArray(body?.phones) && body.phones.length) phones = body.phones;
  } catch { /* no body */ }

  if (!instanceToken) return respond({ error: 'pass {"token":"...","phones":[...]} in body' });

  const formattedPhones = phones.map(ensureCountryCode);
  const result: Record<string, unknown> = {
    baseUrl,
    hasAdminToken: !!adminToken,
    formattedPhones,
    steps: {} as Record<string, unknown>,
  };

  // STEP 1 — baseline /chat/details for each phone
  const baseline: Record<string, unknown> = {};
  for (const p of formattedPhones) {
    const r = await callEndpoint(`${baseUrl}/chat/details`, instanceToken, { number: p, preview: false });
    const root: any = (r as any).parsed?.chat || (r as any).parsed?.contact || (r as any).parsed;
    baseline[p] = {
      status: r.status,
      ok: r.ok,
      hasImage: !!(root?.image || root?.imagePreview),
      image: root?.image || root?.imagePreview || null,
      name: root?.name || root?.lead_name || null,
      preview: r.ok ? null : (r as any).bodyPreview?.slice(0, 200),
    };
  }
  result.steps['1_baseline_details'] = baseline;

  // STEP 2 — try chat/check to warm up cache (multiple body shapes)
  const checkVariants = [
    { url: `${baseUrl}/chat/check`, body: { numbers: formattedPhones } },
    { url: `${baseUrl}/chat/check`, body: { number: formattedPhones[0] } },
    { url: `${baseUrl}/contact/check`, body: { numbers: formattedPhones } },
  ];
  const checkResults: unknown[] = [];
  for (const v of checkVariants) {
    const r = await callEndpoint(v.url, instanceToken, v.body);
    checkResults.push({
      url: v.url,
      bodyShape: Object.keys(v.body),
      status: r.status,
      ok: r.ok,
      preview: r.bodyPreview?.slice(0, 400),
    });
  }
  result.steps['2_warmup_attempts'] = checkResults;

  // STEP 3 — wait, then re-test /chat/details
  await new Promise((r) => setTimeout(r, 5000));
  const after: Record<string, unknown> = {};
  for (const p of formattedPhones) {
    const r = await callEndpoint(`${baseUrl}/chat/details`, instanceToken, { number: p, preview: false });
    const root: any = (r as any).parsed?.chat || (r as any).parsed?.contact || (r as any).parsed;
    after[p] = {
      hasImage: !!(root?.image || root?.imagePreview),
      image: root?.image || root?.imagePreview || null,
      name: root?.name || root?.lead_name || null,
    };
  }
  result.steps['3_after_warmup_details'] = after;

  // STEP 4 — test alternative endpoints that might force live fetch
  const altEndpoints = [
    { url: `${baseUrl}/chat/find`, body: { number: formattedPhones[0] } },
    { url: `${baseUrl}/chat/getProfilePicUrl`, body: { number: formattedPhones[0] } },
    { url: `${baseUrl}/contact/getProfilePicture`, body: { number: formattedPhones[0] } },
    { url: `${baseUrl}/group/info`, body: { number: formattedPhones[0] } },
    { url: `${baseUrl}/contacts/${formattedPhones[0]}`, body: {} },
    { url: `${baseUrl}/instance/info`, body: {} },
  ];
  const altResults: unknown[] = [];
  for (const v of altEndpoints) {
    const r = await callEndpoint(v.url, instanceToken, v.body);
    altResults.push({
      url: v.url,
      status: r.status,
      ok: r.ok,
      preview: r.bodyPreview?.slice(0, 300),
    });
  }
  result.steps['4_alternative_endpoints'] = altResults;

  // STEP 5 — try GET variants
  const getEndpoints = [
    `${baseUrl}/chat/details?number=${formattedPhones[0]}`,
    `${baseUrl}/contacts/${formattedPhones[0]}`,
    `${baseUrl}/profile-pic-url?number=${formattedPhones[0]}`,
  ];
  const getResults: unknown[] = [];
  for (const url of getEndpoints) {
    try {
      const r = await fetchWithTimeout(url, {
        method: 'GET',
        headers: { token: instanceToken },
      }, 8000);
      const text = await r.text();
      getResults.push({ url, status: r.status, preview: text.slice(0, 300) });
    } catch (e) {
      getResults.push({ url, error: String(e).slice(0, 100) });
    }
  }
  result.steps['5_get_endpoints'] = getResults;

  return respond(result);
});

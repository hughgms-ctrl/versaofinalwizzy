// v2 - Test more UAZAPI endpoint variants to find one that forces a live profile picture fetch
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function fetchWithTimeout(url: string, options: RequestInit, ms = 12000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function tryEndpoint(url: string, method: string, token: string, body?: unknown) {
  try {
    const init: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json', token },
    };
    if (body && method !== 'GET') init.body = JSON.stringify(body);
    const res = await fetchWithTimeout(url, init, 10000);
    const text = await res.text();
    return {
      url, method,
      bodyShape: body ? Object.keys(body) : [],
      status: res.status,
      ok: res.ok,
      preview: text.slice(0, 500),
    };
  } catch (e) {
    return { url, method, error: String(e).slice(0, 150) };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const baseUrl = Deno.env.get('UAZAPI_BASE_URL');
  if (!baseUrl) return new Response(JSON.stringify({ error: 'UAZAPI_BASE_URL not set' }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

  let token = '';
  let phone = '5511983568625'; // sabemos que tem foto
  try {
    const b = await req.json();
    if (b?.token) token = b.token;
    if (b?.phone) phone = b.phone;
  } catch { /* */ }

  if (!token) return new Response(JSON.stringify({ error: 'pass {"token":"..."} in body' }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

  const results: unknown[] = [];

  // === Profile-picture variants ===
  const pp = [
    { url: `${baseUrl}/instance/profile-pic`, m: 'POST', b: { number: phone } },
    { url: `${baseUrl}/instance/profilePic`, m: 'POST', b: { number: phone } },
    { url: `${baseUrl}/sendPresence`, m: 'POST', b: { number: phone, presence: 'available' } },
    { url: `${baseUrl}/getProfilePicUrl`, m: 'POST', b: { number: phone } },
    { url: `${baseUrl}/chat/profile-picture`, m: 'POST', b: { number: phone } },
    { url: `${baseUrl}/chat/picture`, m: 'POST', b: { number: phone } },
    { url: `${baseUrl}/picture`, m: 'POST', b: { number: phone } },
    { url: `${baseUrl}/profile/pic`, m: 'POST', b: { number: phone } },
    { url: `${baseUrl}/profile`, m: 'POST', b: { number: phone } },
    // try GET versions
    { url: `${baseUrl}/instance/profile-pic?number=${phone}`, m: 'GET' },
    { url: `${baseUrl}/profile-pic?number=${phone}`, m: 'GET' },
    { url: `${baseUrl}/picture?number=${phone}`, m: 'GET' },
    { url: `${baseUrl}/instance/info`, m: 'GET' },
    { url: `${baseUrl}/status`, m: 'GET' },
    // Force a chat update that may pull profile data
    { url: `${baseUrl}/chat/find`, m: 'POST', b: { operator: 'AND', filters: [{ field: 'wa_chatid', operator: '==', value: `${phone}@s.whatsapp.net` }] } },
    { url: `${baseUrl}/chat/find`, m: 'POST', b: { search: phone } },
    { url: `${baseUrl}/chat/find`, m: 'POST', b: { number: phone } },
    // Maybe pull contact with full detail flag
    { url: `${baseUrl}/chat/details`, m: 'POST', b: { number: phone, preview: false, includeImage: true } },
    { url: `${baseUrl}/chat/details`, m: 'POST', b: { number: phone, preview: true } },
    // Force-update contact metadata
    { url: `${baseUrl}/contact/update`, m: 'POST', b: { number: phone } },
    { url: `${baseUrl}/contact/refresh`, m: 'POST', b: { number: phone } },
    { url: `${baseUrl}/contact`, m: 'POST', b: { number: phone } },
    { url: `${baseUrl}/sync`, m: 'POST', b: { number: phone } },
  ];

  for (const e of pp) {
    results.push(await tryEndpoint(e.url, e.m, token, e.b));
  }

  return new Response(JSON.stringify({ baseUrl, phone, results }, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

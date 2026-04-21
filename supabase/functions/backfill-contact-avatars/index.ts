// v3 - multiple endpoint variants + GET fallback for UAZAPI 405 errors
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

async function fetchWithTimeout(url: string, options: RequestInit, ms = 8000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Try multiple UAZAPI endpoint variants to fetch profile picture URL.
 * Different UAZAPI versions/deployments expose different endpoints.
 * Returns the first successful URL (or null).
 */
async function fetchAvatarFromUazapi(
  baseUrl: string,
  token: string,
  formattedPhone: string,
  isLid: boolean,
  collectSample: (s: string) => void,
): Promise<string | null> {
  const phoneBody = isLid ? { phone: formattedPhone } : { number: formattedPhone };
  const numberBody = { number: formattedPhone };
  const baseHeaders = { 'Content-Type': 'application/json', token };

  type Attempt = { url: string; method: 'GET' | 'POST'; body?: unknown; pickUrl: (d: any) => string | null };
  const attempts: Attempt[] = [
    // POST variants (legacy)
    { url: `${baseUrl}/contact/info`, method: 'POST', body: phoneBody,
      pickUrl: (d) => d?.profilePicture || d?.profileThumbnail || d?.imgUrl || d?.profilePictureUrl || d?.profilePicUrl || null },
    { url: `${baseUrl}/contact/profile-picture`, method: 'POST', body: phoneBody,
      pickUrl: (d) => d?.profilePictureUrl || d?.profilePicture || d?.imgUrl || d?.url || null },
    // POST chat/* variants (UAZAPI v2)
    { url: `${baseUrl}/chat/getProfilePicUrl`, method: 'POST', body: numberBody,
      pickUrl: (d) => d?.profilePicUrl || d?.url || d?.imgUrl || (typeof d === 'string' ? d : null) },
    { url: `${baseUrl}/chat/check`, method: 'POST', body: { numbers: [formattedPhone] },
      pickUrl: (d) => Array.isArray(d) ? (d[0]?.profilePicUrl || d[0]?.imgUrl || null) : (d?.profilePicUrl || null) },
    // GET variants with query param
    { url: `${baseUrl}/contact/info?number=${encodeURIComponent(formattedPhone)}`, method: 'GET',
      pickUrl: (d) => d?.profilePicture || d?.profileThumbnail || d?.imgUrl || d?.profilePictureUrl || d?.profilePicUrl || null },
    { url: `${baseUrl}/chat/getProfilePicUrl?number=${encodeURIComponent(formattedPhone)}`, method: 'GET',
      pickUrl: (d) => d?.profilePicUrl || d?.url || d?.imgUrl || (typeof d === 'string' ? d : null) },
  ];

  let firstStatusSample: string | null = null;
  for (const a of attempts) {
    try {
      const init: RequestInit = { method: a.method, headers: baseHeaders };
      if (a.method === 'POST' && a.body !== undefined) init.body = JSON.stringify(a.body);
      const res = await fetchWithTimeout(a.url, init, 6000);
      if (res.ok) {
        let d: any = null;
        try { d = await res.json(); } catch { /* not json */ }
        const url = a.pickUrl(d);
        if (url) {
          collectSample(`OK ${a.method} ${a.url.replace(baseUrl, '')} -> ${String(url).slice(0, 80)}`);
          return url;
        } else if (!firstStatusSample) {
          firstStatusSample = `200 ${a.method} ${a.url.replace(baseUrl, '')} no-url body=${JSON.stringify(d).slice(0, 120)}`;
        }
      } else if (!firstStatusSample) {
        const txt = await res.text();
        firstStatusSample = `${res.status} ${a.method} ${a.url.replace(baseUrl, '')} body=${txt.slice(0, 100)}`;
      } else {
        await res.text(); // drain
      }
    } catch (e) {
      if (!firstStatusSample) firstStatusSample = `ERR ${a.method} ${a.url.replace(baseUrl, '')}: ${String(e).slice(0, 60)}`;
    }
  }
  if (firstStatusSample) collectSample(firstStatusSample);
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const startTime = Date.now();
  const respond = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return respond(200, { success: false, error: 'Unauthorized' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const uazapiBaseUrl = Deno.env.get('UAZAPI_BASE_URL');
    if (!uazapiBaseUrl) {
      console.error('[backfill] UAZAPI_BASE_URL missing');
      return respond(200, { success: false, error: 'UAZAPI_BASE_URL not configured' });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: userData, error: authError } = await userClient.auth.getUser();
    if (authError || !userData?.user) {
      console.error('[backfill] auth error:', authError);
      return respond(200, { success: false, error: `Unauthorized: ${authError?.message || 'no user'}` });
    }
    const userId = userData.user.id;

    const { data: profile } = await supabase
      .from('profiles').select('organization_id').eq('user_id', userId).single();
    if (!profile?.organization_id) return respond(200, { success: false, error: 'No organization' });

    let batchSize = 40;
    let skipMissing = false;
    let probeOnly = false;
    try {
      const body = await req.json();
      if (body?.batchSize && typeof body.batchSize === 'number') batchSize = Math.min(Math.max(body.batchSize, 1), 200);
      if (body?.skipMissing) skipMissing = true;
      if (body?.probeOnly) probeOnly = true;
    } catch { /* no body */ }

    const orgId = profile.organization_id;
    console.log(`[backfill] Starting org=${orgId} batchSize=${batchSize} probeOnly=${probeOnly}`);

    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('id, zapi_token')
      .eq('organization_id', orgId)
      .eq('status', 'connected')
      .limit(1).maybeSingle();

    if (!instance?.zapi_token) {
      return respond(200, { success: false, error: 'No connected WhatsApp instance' });
    }

    // Get contacts that need an avatar refresh:
    // - missing avatar OR
    // - using a temporary WhatsApp CDN URL (pps.whatsapp.net etc.)
    const { data: allTargets } = await supabase
      .from('contacts')
      .select('id, phone, avatar_url')
      .eq('organization_id', orgId)
      .or('avatar_url.is.null,avatar_url.like.%whatsapp.net%')
      .limit(2000);

    const targets = (allTargets || []).filter((c) => c.phone && c.phone.length >= 10);
    if (!targets.length) return respond(200, { success: true, message: 'No targets', processed: 0 });

    console.log(`[backfill] ${targets.length} candidates, processing ${Math.min(batchSize, targets.length)}`);

    const samples: string[] = [];
    const collectSample = (s: string) => { if (samples.length < 6) samples.push(s); };
    let processed = 0, persisted = 0, failed = 0, noPicture = 0;

    const work = targets.slice(0, batchSize);
    const concurrency = probeOnly ? 1 : 5;

    for (let i = 0; i < work.length; i += concurrency) {
      const batch = work.slice(i, i + concurrency);
      await Promise.all(batch.map(async (c) => {
        processed++;
        try {
          const rawPhone = c.phone;
          const isLid = rawPhone.includes('@lid') || rawPhone.length > 20;
          const formattedPhone = isLid ? rawPhone : ensureCountryCode(rawPhone);
          if (!formattedPhone) { noPicture++; return; }

          const remoteAvatarUrl = await fetchAvatarFromUazapi(
            uazapiBaseUrl, instance.zapi_token, formattedPhone, isLid, collectSample,
          );
          if (!remoteAvatarUrl) { noPicture++; return; }
          if (probeOnly) { persisted++; return; }

          const imgRes = await fetchWithTimeout(remoteAvatarUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
          }, 8000);
          if (!imgRes.ok) { failed++; return; }
          const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
          const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
          const bytes = new Uint8Array(await imgRes.arrayBuffer());
          const path = `${c.id}/${Date.now()}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from('contact-avatars')
            .upload(path, bytes, { contentType, upsert: true, cacheControl: '604800' });
          if (upErr) {
            console.warn(`[backfill] upload failed ${c.id}:`, upErr.message);
            failed++; return;
          }
          const { data: pub } = supabase.storage.from('contact-avatars').getPublicUrl(path);
          await supabase.from('contacts').update({ avatar_url: pub.publicUrl }).eq('id', c.id);
          persisted++;
        } catch (e) {
          console.warn(`[backfill] contact ${c.id} failed:`, String(e).slice(0, 100));
          failed++;
        }
      }));
      // Stop early in probe mode after first batch
      if (probeOnly && samples.length >= 4) break;
    }

    const remaining = Math.max(targets.length - processed, 0);
    console.log(`[backfill] Done processed=${processed} persisted=${persisted} failed=${failed} noPicture=${noPicture} remaining=${remaining}`);
    if (samples.length) console.log('[backfill] samples:', samples.join(' | '));

    return respond(200, {
      success: true,
      total_candidates: targets.length,
      processed,
      persisted,
      failed,
      noPicture,
      remaining,
      hasMore: remaining > 0,
      samples,
      duration_ms: Date.now() - startTime,
    });
  } catch (e) {
    console.error('[backfill] fatal error:', e);
    return respond(200, { success: false, error: String(e), duration_ms: Date.now() - startTime });
  }
});

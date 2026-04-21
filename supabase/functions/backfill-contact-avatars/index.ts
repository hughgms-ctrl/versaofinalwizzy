// v6 - Cache warm-up + chat/details strategy
// 1) POST /chat/check  -> forces UAZAPI to validate the number on WhatsApp servers (warms cache & avatar)
// 2) POST /chat/details -> reads the (now hopefully populated) chat record with image/imagePreview
// 3) Optional /contact/profile-picture and /contact/info as last resort (some instances reject with 405)
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

type Sample = (s: string) => void;

/**
 * Strategy 1: POST /contact/profile-picture (dedicated avatar endpoint)
 * Returns: { profilePictureUrl?, profilePicture?, imgUrl?, url? }
 */
async function tryProfilePictureEndpoint(
  baseUrl: string, token: string, body: Record<string, string>, sample: Sample,
): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/contact/profile-picture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token },
      body: JSON.stringify(body),
    }, 8000);
    if (!res.ok) {
      sample(`pp:${res.status}`);
      return null;
    }
    const d: any = await res.json();
    return d?.profilePictureUrl || d?.profilePicture || d?.imgUrl || d?.url || d?.image || null;
  } catch (e) {
    sample(`pp-err:${String(e).slice(0, 40)}`);
    return null;
  }
}

/**
 * Strategy 2: POST /contact/info (returns name + sometimes avatar)
 */
async function tryContactInfoEndpoint(
  baseUrl: string, token: string, body: Record<string, string>, sample: Sample,
): Promise<{ url: string | null; name: string | null }> {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/contact/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token },
      body: JSON.stringify(body),
    }, 8000);
    if (!res.ok) {
      sample(`ci:${res.status}`);
      return { url: null, name: null };
    }
    const d: any = await res.json();
    const url = d?.profilePicture || d?.profileThumbnail || d?.profilePicUrl || d?.profilePictureUrl || d?.imgUrl || null;
    const name = d?.name || d?.pushname || d?.verifiedName || d?.notify || null;
    return { url, name };
  } catch (e) {
    sample(`ci-err:${String(e).slice(0, 40)}`);
    return { url: null, name: null };
  }
}

/**
 * Strategy 3: POST /chat/details (cached chat record - last resort)
 */
async function tryChatDetailsEndpoint(
  baseUrl: string, token: string, body: Record<string, unknown>, sample: Sample,
): Promise<{ url: string | null; name: string | null }> {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/chat/details`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token },
      body: JSON.stringify({ ...body, preview: false }),
    }, 8000);
    if (!res.ok) {
      sample(`cd:${res.status}`);
      return { url: null, name: null };
    }
    const d: any = await res.json();
    const root = d?.chat || d?.contact || d;
    const url = root?.image || root?.imagePreview || null;
    const name = root?.name || root?.lead_name || root?.lead_fullName || null;
    return { url, name };
  } catch (e) {
    sample(`cd-err:${String(e).slice(0, 40)}`);
    return { url: null, name: null };
  }
}

/**
 * Run all 3 strategies for a single contact and return first hit.
 */
async function fetchAvatarMultiStrategy(
  baseUrl: string,
  token: string,
  rawPhone: string,
  sample: Sample,
): Promise<{ url: string | null; name: string | null; strategyUsed: string }> {
  // Detect LID (WhatsApp linked-id format)
  const isLid = rawPhone.includes('@lid') || rawPhone.length > 20;
  const formattedPhone = isLid ? rawPhone : ensureCountryCode(rawPhone);
  // Some UAZAPI versions accept 'phone', others 'number' - matches zapi-contact-profile pattern
  const body = isLid ? { phone: formattedPhone } : { number: formattedPhone };

  // Strategy 1: dedicated profile-picture endpoint (most reliable for live fetch)
  const ppUrl = await tryProfilePictureEndpoint(baseUrl, token, body, sample);
  if (ppUrl) return { url: ppUrl, name: null, strategyUsed: 'profile-picture' };

  // Strategy 2: contact/info (also returns name)
  const ci = await tryContactInfoEndpoint(baseUrl, token, body, sample);
  if (ci.url) return { url: ci.url, name: ci.name, strategyUsed: 'contact-info' };

  // Strategy 3: chat/details fallback (cache-only)
  const cd = await tryChatDetailsEndpoint(baseUrl, token, body, sample);
  if (cd.url) return { url: cd.url, name: cd.name || ci.name, strategyUsed: 'chat-details' };

  return { url: null, name: ci.name || cd.name, strategyUsed: 'none' };
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
      return respond(200, { success: false, error: 'UAZAPI_BASE_URL not configured' });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: userData, error: authError } = await userClient.auth.getUser();
    if (authError || !userData?.user) {
      return respond(200, { success: false, error: `Unauthorized: ${authError?.message || 'no user'}` });
    }
    const userId = userData.user.id;

    const { data: profile } = await supabase
      .from('profiles').select('organization_id').eq('user_id', userId).single();
    if (!profile?.organization_id) return respond(200, { success: false, error: 'No organization' });

    let batchSize = 40;
    let probeOnly = false;
    let resetUnavailable = false;
    try {
      const body = await req.json();
      if (body?.batchSize && typeof body.batchSize === 'number') {
        batchSize = Math.min(Math.max(body.batchSize, 1), 200);
      }
      if (body?.probeOnly) probeOnly = true;
      // Allow client to retry contacts previously marked as having no avatar
      if (body?.retryUnavailable === true) resetUnavailable = true;
    } catch { /* no body */ }

    const orgId = profile.organization_id;
    console.log(`[backfill v5] Starting org=${orgId} batchSize=${batchSize} probeOnly=${probeOnly} retryUnavailable=${resetUnavailable}`);

    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('id, zapi_token')
      .eq('organization_id', orgId)
      .eq('status', 'connected')
      .limit(1).maybeSingle();

    if (!instance?.zapi_token) {
      return respond(200, { success: false, error: 'No connected WhatsApp instance' });
    }

    // Build candidate list
    const { data: allTargets } = await supabase
      .from('contacts')
      .select('id, phone, avatar_url, metadata')
      .eq('organization_id', orgId)
      .or('avatar_url.is.null,avatar_url.like.%whatsapp.net%')
      .limit(2000);

    const targets = (allTargets || []).filter((c) => {
      if (!c.phone || c.phone.length < 10) return false;
      if (!resetUnavailable) {
        const meta = (c.metadata as any) || {};
        if (meta.avatar_unavailable === true) return false;
      }
      return true;
    });

    if (!targets.length) {
      return respond(200, {
        success: true, message: 'No targets',
        processed: 0, persisted: 0, failed: 0, noPicture: 0,
        remaining: 0, hasMore: false, total_candidates: 0,
      });
    }

    console.log(`[backfill v5] ${targets.length} candidates, processing ${Math.min(batchSize, targets.length)}`);

    const samples: string[] = [];
    const collectSample = (s: string) => { if (samples.length < 10) samples.push(s); };
    const strategyStats: Record<string, number> = {
      'profile-picture': 0, 'contact-info': 0, 'chat-details': 0, 'none': 0,
    };
    let processed = 0, persisted = 0, failed = 0, noPicture = 0;

    const work = targets.slice(0, batchSize);
    const concurrency = probeOnly ? 1 : 4;

    for (let i = 0; i < work.length; i += concurrency) {
      const batch = work.slice(i, i + concurrency);
      await Promise.all(batch.map(async (c) => {
        processed++;
        try {
          const { url: remoteAvatarUrl, strategyUsed } = await fetchAvatarMultiStrategy(
            uazapiBaseUrl, instance.zapi_token, c.phone, collectSample,
          );
          strategyStats[strategyUsed] = (strategyStats[strategyUsed] || 0) + 1;

          if (!remoteAvatarUrl) {
            // Mark with timestamp - allows future retry via retryUnavailable flag
            const meta = ((c.metadata as any) || {}) as Record<string, unknown>;
            meta.avatar_unavailable = true;
            meta.avatar_checked_at = new Date().toISOString();
            await supabase.from('contacts').update({ metadata: meta }).eq('id', c.id);
            noPicture++;
            return;
          }
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
          if (upErr) { failed++; return; }
          const { data: pub } = supabase.storage.from('contact-avatars').getPublicUrl(path);

          // Clear avatar_unavailable flag if it was set previously
          const cleanMeta = { ...((c.metadata as any) || {}) };
          delete cleanMeta.avatar_unavailable;
          delete cleanMeta.avatar_checked_at;

          await supabase.from('contacts').update({
            avatar_url: pub.publicUrl,
            metadata: cleanMeta,
          }).eq('id', c.id);
          persisted++;
        } catch (e) {
          console.warn(`[backfill v5] contact ${c.id} failed:`, String(e).slice(0, 100));
          failed++;
        }
      }));
    }

    const remainingRaw = Math.max(targets.length - processed, 0);
    const hasMore = persisted > 0 && remainingRaw > 0;

    console.log(`[backfill v5] Done processed=${processed} persisted=${persisted} failed=${failed} noPicture=${noPicture} remaining=${remainingRaw} hasMore=${hasMore}`);
    console.log(`[backfill v5] Strategy hits: profile-picture=${strategyStats['profile-picture']} contact-info=${strategyStats['contact-info']} chat-details=${strategyStats['chat-details']} none=${strategyStats['none']}`);
    if (samples.length) console.log('[backfill v5] samples:', samples.join(' | '));

    return respond(200, {
      success: true,
      total_candidates: targets.length,
      processed, persisted, failed, noPicture,
      remaining: remainingRaw, hasMore,
      strategyStats,
      samples,
      duration_ms: Date.now() - startTime,
    });
  } catch (e) {
    console.error('[backfill v5] fatal error:', e);
    return respond(200, { success: false, error: String(e), duration_ms: Date.now() - startTime });
  }
});

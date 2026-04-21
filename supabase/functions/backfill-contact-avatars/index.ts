// v4 - UAZAPI v2 endpoint: POST /chat/details (correct endpoint per official n8n-nodes-uazapi)
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
 * UAZAPI v2 - POST /chat/details
 * Body: { number: "5511999999999", preview: false }
 * Returns: object with image/imagePreview/name/etc.
 */
async function fetchAvatarFromUazapi(
  baseUrl: string,
  token: string,
  formattedPhone: string,
  collectSample: (s: string) => void,
): Promise<{ url: string | null; name: string | null }> {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/chat/details`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token },
      body: JSON.stringify({ number: formattedPhone, preview: false }),
    }, 8000);

    if (!res.ok) {
      const txt = await res.text();
      collectSample(`${res.status} /chat/details body=${txt.slice(0, 100)}`);
      return { url: null, name: null };
    }

    const d: any = await res.json();
    // UAZAPI v2 returns: { image, imagePreview, name, wa_name, wa_contactName, ... }
    // Sometimes nested under 'chat' or 'contact'
    const root = d?.chat || d?.contact || d;
    const url = root?.image
      || root?.imagePreview
      || root?.profilePicture
      || root?.profilePictureUrl
      || root?.profilePicUrl
      || root?.imgUrl
      || null;
    const name = root?.name
      || root?.wa_name
      || root?.wa_contactName
      || root?.pushname
      || null;

    if (!url) {
      // Sample once when we get 200 but no image (helps debug response shape)
      collectSample(`200 no-image keys=${Object.keys(d || {}).slice(0, 8).join(',')}`);
    }
    return { url, name };
  } catch (e) {
    collectSample(`ERR /chat/details: ${String(e).slice(0, 80)}`);
    return { url: null, name: null };
  }
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
    let probeOnly = false;
    try {
      const body = await req.json();
      if (body?.batchSize && typeof body.batchSize === 'number') batchSize = Math.min(Math.max(body.batchSize, 1), 200);
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

    // Mark contacts already attempted (no picture available) by metadata flag
    // so we don't reprocess them on every batch run.
    // Targets: missing avatar OR using temp WhatsApp CDN URL,
    // AND not yet flagged as 'avatar_unavailable'
    const { data: allTargets } = await supabase
      .from('contacts')
      .select('id, phone, avatar_url, metadata')
      .eq('organization_id', orgId)
      .or('avatar_url.is.null,avatar_url.like.%whatsapp.net%')
      .limit(2000);

    const targets = (allTargets || []).filter((c) => {
      if (!c.phone || c.phone.length < 10) return false;
      // Skip contacts already marked as having no avatar
      const meta = (c.metadata as any) || {};
      if (meta.avatar_unavailable === true) return false;
      return true;
    });

    if (!targets.length) {
      return respond(200, {
        success: true,
        message: 'No targets',
        processed: 0,
        persisted: 0,
        failed: 0,
        noPicture: 0,
        remaining: 0,
        hasMore: false,
        total_candidates: 0,
      });
    }

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
          const formattedPhone = ensureCountryCode(rawPhone);
          if (!formattedPhone) { noPicture++; return; }

          const { url: remoteAvatarUrl, name } = await fetchAvatarFromUazapi(
            uazapiBaseUrl, instance.zapi_token, formattedPhone, collectSample,
          );

          if (!remoteAvatarUrl) {
            // Mark contact so we don't keep reprocessing it
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
          if (upErr) {
            console.warn(`[backfill] upload failed ${c.id}:`, upErr.message);
            failed++; return;
          }
          const { data: pub } = supabase.storage.from('contact-avatars').getPublicUrl(path);
          const updatePayload: Record<string, unknown> = { avatar_url: pub.publicUrl };
          if (name && (!c.metadata || (c.metadata as any).preserve_name !== true)) {
            // Don't overwrite name if it was manually set; only update on contacts that have no real name
            // (handled at the application layer normally; here we just set avatar)
          }
          await supabase.from('contacts').update(updatePayload).eq('id', c.id);
          persisted++;
        } catch (e) {
          console.warn(`[backfill] contact ${c.id} failed:`, String(e).slice(0, 100));
          failed++;
        }
      }));
    }

    // Recalculate "remaining" based on what's still actually pending after this run
    // (contacts marked as avatar_unavailable shouldn't be counted)
    const { data: stillPending } = await supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .or('avatar_url.is.null,avatar_url.like.%whatsapp.net%');

    const remainingRaw = Math.max(targets.length - processed, 0);
    const hasMore = persisted > 0 && remainingRaw > 0; // only continue if we made progress

    console.log(`[backfill] Done processed=${processed} persisted=${persisted} failed=${failed} noPicture=${noPicture} remaining=${remainingRaw} hasMore=${hasMore}`);
    if (samples.length) console.log('[backfill] samples:', samples.join(' | '));

    return respond(200, {
      success: true,
      total_candidates: targets.length,
      processed,
      persisted,
      failed,
      noPicture,
      remaining: remainingRaw,
      hasMore,
      samples,
      duration_ms: Date.now() - startTime,
    });
  } catch (e) {
    console.error('[backfill] fatal error:', e);
    return respond(200, { success: false, error: String(e), duration_ms: Date.now() - startTime });
  }
});

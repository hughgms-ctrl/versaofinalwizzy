// v7 - Reality-based strategy after extensive endpoint probing.
// FINDINGS (verified with debug-uazapi-strategy):
//   - /chat/details is the ONLY endpoint this UAZAPI instance accepts for contact data
//   - It returns image="" / imagePreview="" for contacts not in the cache
//   - /chat/check warms only the JID/LID mapping, NOT the profile picture
//   - All other endpoints (profile-picture, contact/info, etc.) return 405
//   - There is NO known UAZAPI endpoint to force a live profile-pic fetch on this instance
//
// STRATEGY:
//   1. Call /chat/details once per contact (POST, body { number, preview: false })
//   2. If image present -> download + persist to storage + clear avatar_unavailable
//   3. If image empty but name present -> persist name and mark avatar_unavailable
//   4. If both empty -> mark avatar_unavailable (will not be retried unless retryUnavailable=true)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function ensureCountryCode(phone: string): string {
  const clean = phone.replace(/\D/g, '');
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

async function fetchChatDetails(
  baseUrl: string, token: string, rawPhone: string,
): Promise<{ url: string | null; name: string | null; status: number }> {
  const isLid = rawPhone.includes('@lid') || rawPhone.length > 20;
  const formattedPhone = isLid ? rawPhone : ensureCountryCode(rawPhone);
  const body = isLid ? { phone: formattedPhone, preview: false } : { number: formattedPhone, preview: false };

  try {
    const res = await fetchWithTimeout(`${baseUrl}/chat/details`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token },
      body: JSON.stringify(body),
    }, 8000);
    if (!res.ok) return { url: null, name: null, status: res.status };
    const d: any = await res.json();
    const root = d?.chat || d?.contact || d;
    const url = (root?.image && String(root.image).trim()) || (root?.imagePreview && String(root.imagePreview).trim()) || null;
    const name = root?.name || root?.lead_name || root?.lead_fullName || root?.wa_name || root?.wa_contactName || null;
    return { url, name, status: 200 };
  } catch (e) {
    return { url: null, name: null, status: 0 };
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
    if (!uazapiBaseUrl) return respond(200, { success: false, error: 'UAZAPI_BASE_URL not configured' });

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: userData, error: authError } = await userClient.auth.getUser();
    if (authError || !userData?.user) return respond(200, { success: false, error: `Unauthorized: ${authError?.message || 'no user'}` });

    const { data: profile } = await supabase
      .from('profiles').select('organization_id').eq('user_id', userData.user.id).single();
    if (!profile?.organization_id) return respond(200, { success: false, error: 'No organization' });

    let batchSize = 60;
    let resetUnavailable = false;
    try {
      const body = await req.json();
      if (body?.batchSize && typeof body.batchSize === 'number') {
        batchSize = Math.min(Math.max(body.batchSize, 1), 200);
      }
      if (body?.retryUnavailable === true) resetUnavailable = true;
    } catch { /* */ }

    const orgId = profile.organization_id;
    console.log(`[backfill v7] Starting org=${orgId} batchSize=${batchSize} retryUnavailable=${resetUnavailable}`);

    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('id, zapi_token')
      .eq('organization_id', orgId)
      .eq('status', 'connected')
      .limit(1).maybeSingle();

    if (!instance?.zapi_token) return respond(200, { success: false, error: 'No connected WhatsApp instance' });

    const { data: allTargets } = await supabase
      .from('contacts')
      .select('id, phone, name, avatar_url, metadata')
      .eq('organization_id', orgId)
      .or('avatar_url.is.null,avatar_url.like.%whatsapp.net%')
      .limit(2000);

    const targets = (allTargets || []).filter((c) => {
      if (!c.phone || c.phone.length < 8 || c.phone.length > 15) return false;
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
        nameOnly: 0, remaining: 0, hasMore: false, total_candidates: 0,
      });
    }

    console.log(`[backfill v7] ${targets.length} candidates, processing ${Math.min(batchSize, targets.length)}`);

    let processed = 0, persisted = 0, failed = 0, noPicture = 0, nameOnly = 0;
    const work = targets.slice(0, batchSize);
    const concurrency = 5;

    for (let i = 0; i < work.length; i += concurrency) {
      const batch = work.slice(i, i + concurrency);
      await Promise.all(batch.map(async (c) => {
        processed++;
        try {
          const { url: remoteAvatarUrl, name: remoteName } = await fetchChatDetails(
            uazapiBaseUrl, instance.zapi_token, c.phone,
          );

          // Always update name if we got one and contact has none
          const updates: Record<string, unknown> = {};
          if (remoteName && !c.name) updates.name = remoteName;

          if (!remoteAvatarUrl) {
            const meta = ((c.metadata as any) || {}) as Record<string, unknown>;
            meta.avatar_unavailable = true;
            meta.avatar_checked_at = new Date().toISOString();
            updates.metadata = meta;
            await supabase.from('contacts').update(updates).eq('id', c.id);
            if (remoteName) nameOnly++;
            else noPicture++;
            return;
          }

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

          const cleanMeta = { ...((c.metadata as any) || {}) };
          delete cleanMeta.avatar_unavailable;
          delete cleanMeta.avatar_checked_at;

          updates.avatar_url = pub.publicUrl;
          updates.metadata = cleanMeta;
          await supabase.from('contacts').update(updates).eq('id', c.id);
          persisted++;
        } catch (e) {
          console.warn(`[backfill v7] contact ${c.id} failed:`, String(e).slice(0, 100));
          failed++;
        }
      }));
    }

    const remainingRaw = Math.max(targets.length - processed, 0);
    const hasMore = persisted > 0 && remainingRaw > 0;

    console.log(`[backfill v7] Done processed=${processed} persisted=${persisted} nameOnly=${nameOnly} noPicture=${noPicture} failed=${failed} remaining=${remainingRaw} hasMore=${hasMore}`);

    return respond(200, {
      success: true,
      total_candidates: targets.length,
      processed, persisted, failed, noPicture, nameOnly,
      remaining: remainingRaw, hasMore,
      duration_ms: Date.now() - startTime,
    });
  } catch (e) {
    console.error('[backfill v7] fatal error:', e);
    return respond(200, { success: false, error: String(e), duration_ms: Date.now() - startTime });
  }
});

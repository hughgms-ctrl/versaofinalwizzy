import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TEMPORARY_HOSTS = ['pps.whatsapp.net', 'mmg.whatsapp.net', 'media.whatsapp.net'];
function isTemporaryUrl(url: string | null | undefined) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return TEMPORARY_HOSTS.some((h) => u.hostname.endsWith(h));
  } catch {
    return false;
  }
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
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const uazapiBaseUrl = Deno.env.get('UAZAPI_BASE_URL');
    if (!uazapiBaseUrl) {
      console.error('[backfill] UAZAPI_BASE_URL missing');
      return respond(200, { success: false, error: 'UAZAPI_BASE_URL not configured' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return respond(200, { success: false, error: 'Unauthorized' });

    const { data: profile } = await supabase
      .from('profiles').select('organization_id').eq('user_id', user.id).single();
    if (!profile?.organization_id) return respond(200, { success: false, error: 'No organization' });

    // Parse optional batch size from request body
    let batchSize = 60;
    try {
      const body = await req.json();
      if (body?.batchSize && typeof body.batchSize === 'number') {
        batchSize = Math.min(Math.max(body.batchSize, 10), 150);
      }
    } catch {/* no body */}

    // Get active connected instance for this org
    const { data: instances } = await supabase.from('whatsapp_instances')
      .select('*').eq('organization_id', profile.organization_id)
      .eq('status', 'connected').limit(1);
    const instance = instances?.[0];
    if (!instance?.zapi_token) {
      return respond(200, { success: false, error: 'No connected WhatsApp instance' });
    }

    console.log(`[backfill] Starting for org ${profile.organization_id}, batchSize=${batchSize}`);

    // Get candidate contacts (temp URLs or no avatar)
    const { data: contacts, error: contactsErr } = await supabase
      .from('contacts')
      .select('id, phone, avatar_url')
      .eq('organization_id', profile.organization_id)
      .limit(2000);

    if (contactsErr) {
      console.error('[backfill] contacts query error:', contactsErr);
      return respond(200, { success: false, error: contactsErr.message });
    }

    const allTargets = (contacts || []).filter((c) => isTemporaryUrl(c.avatar_url) || !c.avatar_url);
    const targets = allTargets.slice(0, batchSize);

    console.log(`[backfill] ${allTargets.length} candidates total, processing ${targets.length} this run`);

    let processed = 0;
    let persisted = 0;
    let failed = 0;
    let noPicture = 0;

    const concurrency = 3;
    for (let i = 0; i < targets.length; i += concurrency) {
      // Stop if approaching CPU limit (~50s)
      if (Date.now() - startTime > 45000) {
        console.log('[backfill] Time limit approaching, stopping');
        break;
      }

      const batch = targets.slice(i, i + concurrency);
      await Promise.all(batch.map(async (c) => {
        processed++;
        try {
          const phone = c.phone;
          const isLid = phone.includes('@lid') || phone.length > 20;
          const phoneBody = isLid ? { phone } : { number: phone };

          let remoteAvatarUrl: string | null = null;
          try {
            const picRes = await fetchWithTimeout(`${uazapiBaseUrl}/contact/profile-picture`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'token': instance.zapi_token },
              body: JSON.stringify(phoneBody),
            }, 6000);
            if (picRes.ok) {
              const d = await picRes.json();
              remoteAvatarUrl = d.profilePictureUrl || d.profilePicture || d.imgUrl || d.url || null;
            }
          } catch (e) {
            console.warn(`[backfill] picture fetch failed ${c.id}:`, String(e).slice(0, 80));
          }

          if (!remoteAvatarUrl) { noPicture++; return; }

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
    }

    const remaining = Math.max(allTargets.length - processed, 0);
    console.log(`[backfill] Done: processed=${processed}, persisted=${persisted}, failed=${failed}, noPicture=${noPicture}, remaining=${remaining}`);

    return respond(200, {
      success: true,
      total_candidates: allTargets.length,
      processed,
      persisted,
      failed,
      noPicture,
      remaining,
      hasMore: remaining > 0,
      duration_ms: Date.now() - startTime,
    });
  } catch (e) {
    console.error('[backfill] fatal error:', e);
    return respond(200, { success: false, error: String(e), duration_ms: Date.now() - startTime });
  }
});

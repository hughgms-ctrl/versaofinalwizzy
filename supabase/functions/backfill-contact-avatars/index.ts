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
    try {
      const body = await req.json();
      if (body?.batchSize && typeof body.batchSize === 'number') {
        batchSize = Math.min(Math.max(body.batchSize, 5), 100);
      }
      // After a full pass, the client can request to skip contacts known to have no picture
      if (body?.skipMissing === true) skipMissing = true;
    } catch {/* no body */}

    const { data: instances } = await supabase.from('whatsapp_instances')
      .select('*').eq('organization_id', profile.organization_id)
      .eq('status', 'connected').limit(1);
    const instance = instances?.[0];
    if (!instance?.zapi_token) {
      return respond(200, { success: false, error: 'No connected WhatsApp instance' });
    }

    console.log(`[backfill] Starting org=${profile.organization_id} batchSize=${batchSize}`);

    // Only target contacts with conversations (active) — exclude broadcast lists
    const { data: contacts, error: contactsErr } = await supabase
      .from('contacts')
      .select('id, phone, avatar_url')
      .eq('organization_id', profile.organization_id)
      .not('phone', 'like', '%@broadcast')
      .limit(2000);

    if (contactsErr) {
      console.error('[backfill] contacts query error:', contactsErr);
      return respond(200, { success: false, error: contactsErr.message });
    }

    const allTargets = (contacts || []).filter((c) =>
      c.phone && (isTemporaryUrl(c.avatar_url) || !c.avatar_url)
    );
    const targets = allTargets.slice(0, batchSize);

    console.log(`[backfill] ${allTargets.length} candidates, processing ${targets.length}`);

    let processed = 0;
    let persisted = 0;
    let failed = 0;
    let noPicture = 0;
    const samples: string[] = [];

    const concurrency = 3;
    for (let i = 0; i < targets.length; i += concurrency) {
      if (Date.now() - startTime > 45000) {
        console.log('[backfill] Time limit approaching, stopping');
        break;
      }

      const batch = targets.slice(i, i + concurrency);
      await Promise.all(batch.map(async (c) => {
        processed++;
        try {
          const rawPhone = c.phone;
          const isLid = rawPhone.includes('@lid') || rawPhone.length > 20;
          const formattedPhone = isLid ? rawPhone : ensureCountryCode(rawPhone);
          if (!formattedPhone) { noPicture++; return; }

          const phoneBody = isLid ? { phone: formattedPhone } : { number: formattedPhone };

          // 1) Try /contact/info first (matches working zapi-contact-profile)
          let remoteAvatarUrl: string | null = null;
          try {
            const infoRes = await fetchWithTimeout(`${uazapiBaseUrl}/contact/info`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'token': instance.zapi_token },
              body: JSON.stringify(phoneBody),
            }, 6000);
            if (infoRes.ok) {
              const d = await infoRes.json();
              remoteAvatarUrl = d.profilePicture || d.profileThumbnail || d.imgUrl || d.profilePictureUrl || null;
              if (samples.length < 3) {
                samples.push(`info(${formattedPhone}): ${JSON.stringify(d).slice(0, 200)}`);
              }
            } else if (samples.length < 3) {
              const txt = await infoRes.text();
              samples.push(`info(${formattedPhone}) status=${infoRes.status}: ${txt.slice(0, 150)}`);
            }
          } catch (e) {
            if (samples.length < 3) samples.push(`info err: ${String(e).slice(0, 100)}`);
          }

          // 2) Fallback to /contact/profile-picture
          if (!remoteAvatarUrl) {
            try {
              const picRes = await fetchWithTimeout(`${uazapiBaseUrl}/contact/profile-picture`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'token': instance.zapi_token },
                body: JSON.stringify(phoneBody),
              }, 6000);
              if (picRes.ok) {
                const d = await picRes.json();
                remoteAvatarUrl = d.profilePictureUrl || d.profilePicture || d.imgUrl || d.url || null;
                if (samples.length < 3) {
                  samples.push(`pic(${formattedPhone}): ${JSON.stringify(d).slice(0, 200)}`);
                }
              }
            } catch {/* ignore */}
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
    console.log(`[backfill] Done processed=${processed} persisted=${persisted} failed=${failed} noPicture=${noPicture} remaining=${remaining}`);
    if (samples.length) console.log('[backfill] samples:', samples.join(' | '));

    return respond(200, {
      success: true,
      total_candidates: allTargets.length,
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

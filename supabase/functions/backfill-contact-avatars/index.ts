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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const uazapiBaseUrl = Deno.env.get('UAZAPI_BASE_URL')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabase
      .from('profiles').select('organization_id').eq('user_id', user.id).single();
    if (!profile?.organization_id) {
      return new Response(JSON.stringify({ error: 'No organization' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get active connected instance for this org
    const { data: instances } = await supabase.from('whatsapp_instances')
      .select('*').eq('organization_id', profile.organization_id)
      .eq('status', 'connected').limit(1);
    const instance = instances?.[0];
    if (!instance?.zapi_token) {
      return new Response(JSON.stringify({ error: 'No connected WhatsApp instance' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get contacts with temporary WhatsApp avatar URLs OR no avatar at all,
    // restricted to those with at least one conversation (active contacts)
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, phone, avatar_url')
      .eq('organization_id', profile.organization_id)
      .limit(2000);

    const targets = (contacts || []).filter((c) => isTemporaryUrl(c.avatar_url) || !c.avatar_url);

    let processed = 0;
    let persisted = 0;
    let failed = 0;

    // Process in small concurrent batches
    const concurrency = 4;
    for (let i = 0; i < targets.length; i += concurrency) {
      const batch = targets.slice(i, i + concurrency);
      await Promise.all(batch.map(async (c) => {
        processed++;
        try {
          const phone = c.phone;
          const isLid = phone.includes('@lid') || phone.length > 20;
          const phoneBody = isLid ? { phone } : { number: phone };

          // Fetch avatar URL from UAZAPI
          let remoteAvatarUrl: string | null = null;
          try {
            const picRes = await fetch(`${uazapiBaseUrl}/contact/profile-picture`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'token': instance.zapi_token },
              body: JSON.stringify(phoneBody),
            });
            if (picRes.ok) {
              const d = await picRes.json();
              remoteAvatarUrl = d.profilePictureUrl || d.profilePicture || d.imgUrl || d.url || null;
            }
          } catch {/* ignore */}

          if (!remoteAvatarUrl) {
            // Try /contact/info as fallback
            const infoRes = await fetch(`${uazapiBaseUrl}/contact/info`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'token': instance.zapi_token },
              body: JSON.stringify(phoneBody),
            });
            if (infoRes.ok) {
              const d = await infoRes.json();
              remoteAvatarUrl = d.profilePicture || d.profileThumbnail || d.imgUrl || null;
            }
          }

          if (!remoteAvatarUrl) return;

          // Download and persist
          const imgRes = await fetch(remoteAvatarUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
          });
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
          await supabase.from('contacts').update({ avatar_url: pub.publicUrl }).eq('id', c.id);
          persisted++;
        } catch {
          failed++;
        }
      }));
    }

    return new Response(JSON.stringify({
      success: true,
      total_candidates: targets.length,
      processed,
      persisted,
      failed,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

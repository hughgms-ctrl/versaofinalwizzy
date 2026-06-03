import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Ensure phone has country code (default Brazil 55)
function ensureCountryCode(phone: string): string {
    const clean = phone.replace(/\D/g, '');
    // Already has country code (12+ digits for BR = 55 + DDD(2) + number(8-9))
    if (clean.length >= 12) return clean;
    // Has DDD + number (10-11 digits) - add 55
    if (clean.length >= 10 && clean.length <= 11) return `55${clean}`;
    // Too short - not a valid phone number
    return '';
}

function isValidPhoneNumber(phone: string): boolean {
    if (!phone) return false;
    const clean = phone.replace(/\D/g, '');
    if (clean.length < 12 || clean.length > 15) return false;
    if (!/^\d+$/.test(clean)) return false;
    // Validate Brazilian DDD (11-99)
    if (clean.startsWith('55')) {
        const ddd = parseInt(clean.substring(2, 4));
        if (ddd < 11 || ddd > 99) return false;
    }
    return true;
}

async function fetchWithTimeout(url: string, options: RequestInit, ms = 8000): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
        return await fetch(url, { ...options, signal: ctrl.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function fetchChatDetails(
    baseUrl: string,
    token: string,
    rawPhone: string,
): Promise<{ name: string | null; avatarUrl: string | null; raw: any; status: number }> {
    const isLid = rawPhone.includes('@lid') || rawPhone.length > 20;
    const formattedPhone = isLid ? rawPhone : ensureCountryCode(rawPhone);
    const body = isLid
        ? { phone: formattedPhone, preview: false }
        : { number: formattedPhone, preview: false };

    const response = await fetchWithTimeout(`${baseUrl}/chat/details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'token': token },
        body: JSON.stringify(body),
    }, 8000);

    if (!response.ok) {
        return { name: null, avatarUrl: null, raw: null, status: response.status };
    }

    const data: any = await response.json();
    const root = data?.chat || data?.contact || data;
    const avatarUrl =
        (root?.image && String(root.image).trim()) ||
        (root?.imagePreview && String(root.imagePreview).trim()) ||
        (root?.profilePicture && String(root.profilePicture).trim()) ||
        (root?.profilePictureUrl && String(root.profilePictureUrl).trim()) ||
        (root?.imgUrl && String(root.imgUrl).trim()) ||
        null;
    const name =
        root?.name ||
        root?.lead_name ||
        root?.lead_fullName ||
        root?.wa_name ||
        root?.wa_contactName ||
        root?.pushname ||
        null;

    return { name, avatarUrl, raw: data, status: 200 };
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

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
            return new Response(JSON.stringify({ error: 'Unauthorized', details: authError?.message }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('organization_id')
            .eq('user_id', user.id)
            .single();

        if (!profile?.organization_id) {
            return new Response(JSON.stringify({ error: 'No organization' }), {
                status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const { contactId, phone: rawPhone, instanceId } = await req.json();

        if (!contactId && !rawPhone) {
            return new Response(JSON.stringify({ error: 'contactId or phone is required' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Resolve instance
        let instance;
        if (instanceId) {
            const { data } = await supabase
                .from('whatsapp_instances')
                .select('*')
                .eq('id', instanceId)
                .eq('organization_id', profile.organization_id)
                .single();
            instance = data;
        } else {
            const { data: instances } = await supabase
                .from('whatsapp_instances')
                .select('*')
                .eq('organization_id', profile.organization_id)
                .eq('status', 'connected')
                .eq('provider', 'uazapi')
                .limit(1);
            instance = instances?.[0];
        }

        if (!instance) {
            return new Response(JSON.stringify({ error: 'No connected instance found' }), {
                status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const provider = instance.provider === 'evolution' ? 'evolution' : 'uazapi';
        if (provider !== 'uazapi') {
            console.warn(`[CONTACT_PROFILE] Skipping UAZAPI profile fetch for ${provider} instance ${instance.id}`);
            return new Response(JSON.stringify({
                success: true,
                skipped: true,
                provider,
                name: null,
                avatarUrl: null,
                message: 'Busca de perfil ainda não implementada para Evolution; evitando chamada UAZAPI indevida.',
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        if (!instance.zapi_token) {
            return new Response(JSON.stringify({ error: 'No connected instance found' }), {
                status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        let phone = rawPhone;
        if (contactId && !phone) {
            const { data: contact } = await supabase.from('contacts').select('phone').eq('id', contactId).single();
            phone = contact?.phone;
        }

        if (!phone) throw new Error('Phone not found');

        const profileResult = await fetchChatDetails(uazapiBaseUrl, instance.zapi_token, phone);
        const profileData = profileResult.raw || {};
        if (profileResult.status !== 200) {
            console.warn('chat/details failed:', profileResult.status);
        }

        const name = profileResult.name;
        const remoteAvatarUrl = profileResult.avatarUrl;

        // Download the WhatsApp avatar (URLs expire) and persist to our Storage for a permanent URL
        let persistedAvatarUrl: string | null = null;
        if (remoteAvatarUrl && contactId) {
            try {
                const imgRes = await fetch(remoteAvatarUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                });
                if (imgRes.ok) {
                    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
                    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
                    const bytes = new Uint8Array(await imgRes.arrayBuffer());
                    // Cache-bust path so old CDN cache for the same contact doesn't stick
                    const path = `${contactId}/${Date.now()}.${ext}`;
                    const { error: upErr } = await supabase.storage
                        .from('contact-avatars')
                        .upload(path, bytes, { contentType, upsert: true, cacheControl: '604800' });
                    if (!upErr) {
                        const { data: pub } = supabase.storage.from('contact-avatars').getPublicUrl(path);
                        persistedAvatarUrl = pub.publicUrl;
                        console.log('Avatar persisted to storage:', persistedAvatarUrl);
                    } else {
                        console.warn('Avatar upload failed:', upErr.message);
                    }
                } else {
                    console.warn('Avatar download failed:', imgRes.status);
                }
            } catch (e) {
                console.warn('Avatar persist exception:', String(e));
            }
        }

        const finalAvatarUrl = persistedAvatarUrl || remoteAvatarUrl;

        if (contactId && (name || finalAvatarUrl)) {
            const updateData: any = {};
            if (name) updateData.name = name;
            if (finalAvatarUrl) updateData.avatar_url = finalAvatarUrl;
            await supabase.from('contacts').update(updateData).eq('id', contactId);
        }

        return new Response(JSON.stringify({ success: true, name, avatarUrl: finalAvatarUrl, raw: profileData }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error:', error);
        return new Response(JSON.stringify({ error: String(error) }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});

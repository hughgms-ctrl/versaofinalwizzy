import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Accept global WhatsApp/E.164-style numbers without assuming a country.
function ensureCountryCode(phone: string): string {
    const clean = phone.replace(/\D/g, '');
    return isValidPhoneNumber(clean) ? clean : '';
}

function isValidPhoneNumber(phone: string): boolean {
    if (!phone) return false;
    const clean = phone.replace(/\D/g, '');
    return /^\d{8,15}$/.test(clean);
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

        const { contactId, phone: rawPhone, instanceId } = await req.json();

        if (!contactId && !rawPhone) {
            return new Response(JSON.stringify({ error: 'contactId or phone is required' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Resolve instance
        let instance;
        if (instanceId) {
            const { data } = await supabase.from('whatsapp_instances').select('*').eq('id', instanceId).single();
            instance = data;
        } else {
            const { data: instances } = await supabase.from('whatsapp_instances').select('*').eq('status', 'connected').limit(1);
            instance = instances?.[0];
        }

        if (!instance || !instance.zapi_token) {
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

        // If it's a LID, the UAZAPI might not like 'number' field
        // Some UAZAPI versions prefer 'phone' or 'jid'
        const isLid = phone.includes('@lid') || phone.length > 20; // Heuristic for LID
        const formattedPhone = isLid ? phone : ensureCountryCode(phone);

        console.log(`Fetching profile for ${formattedPhone} (isLid: ${isLid})...`);

        const phoneBody = isLid ? { phone: formattedPhone } : { number: formattedPhone };

        // Try /contact/info first
        const response = await fetch(`${uazapiBaseUrl}/contact/info`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'token': instance.zapi_token },
            body: JSON.stringify(phoneBody),
        });

        let profileData: any = {};
        if (response.ok) {
            profileData = await response.json();
            console.log('Profile info data:', JSON.stringify(profileData));
        } else {
            console.warn('contact/info failed:', await response.text());
        }

        // Also try /contact/profile-picture for avatar
        let avatarFromPicEndpoint: string | null = null;
        try {
            const picResponse = await fetch(`${uazapiBaseUrl}/contact/profile-picture`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'token': instance.zapi_token },
                body: JSON.stringify(phoneBody),
            });
            if (picResponse.ok) {
                const picData = await picResponse.json();
                console.log('Profile picture data:', JSON.stringify(picData));
                avatarFromPicEndpoint = picData.profilePictureUrl || picData.profilePicture || picData.imgUrl || picData.url || null;
            }
        } catch (e) {
            console.warn('profile-picture endpoint failed:', e);
        }

        const name = profileData.name || profileData.pushname || profileData.verifiedName || null;
        const remoteAvatarUrl = avatarFromPicEndpoint || profileData.profilePicture || profileData.profileThumbnail || profileData.imgUrl || null;

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

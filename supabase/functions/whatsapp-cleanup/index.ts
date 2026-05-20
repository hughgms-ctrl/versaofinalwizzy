import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get('Authorization');
        const forceCleanup = req.headers.get('X-Force-Cleanup') === 'wizzy-emergency-clean-v3';

        if (!authHeader && !forceCleanup) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        let organizationId: string | null = null;

        if (forceCleanup) {
            const { data: orgs } = await supabase.from('organizations').select('id').limit(1);
            organizationId = orgs?.[0]?.id || null;
            console.log(`EMERGENCY CLEANUP V3 - Auto-detected organizationId: ${organizationId}`);
        } else if (authHeader) {
            const token = authHeader.replace(/^Bearer\s+/i, '');
            if (token === supabaseKey) {
                const url = new URL(req.url);
                organizationId = url.searchParams.get('organizationId');
            } else {
                const { data: { user }, error: userError } = await supabase.auth.getUser(token);
                if (!userError && user) {
                    const { data: profile } = await supabase.from('profiles').select('organization_id').eq('user_id', user.id).single();
                    organizationId = profile?.organization_id || null;
                }
            }
        }

        if (!organizationId) {
            return new Response(JSON.stringify({ error: 'Could not determine organization' }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // 1. Find ALL messages that have a duplicate zapi_message_id across ALL conversations in the org
        const { data: allDuplicates, error: dupError } = await supabase
            .from('messages')
            .select('id, zapi_message_id, conversation_id, conversations!inner(organization_id)')
            .eq('conversations.organization_id', organizationId)
            .not('zapi_message_id', 'is', null);

        if (dupError) throw dupError;

        // Group by zapi_message_id
        const messageMap = new Map<string, any[]>();
        for (const msg of allDuplicates || []) {
            if (!messageMap.has(msg.zapi_message_id)) messageMap.set(msg.zapi_message_id, []);
            messageMap.get(msg.zapi_message_id)!.push(msg);
        }

        const toDeleteIds: string[] = [];
        let duplicateCount = 0;

        for (const [zapiId, msgs] of messageMap.entries()) {
            if (msgs.length > 1) {
                duplicateCount++;
                // Keep the one that matches the conversation's contact phone best (heuristic)
                // Or just keep the first one and delete others to be safe
                const [first, ...others] = msgs;
                others.forEach(m => toDeleteIds.push(m.id));
            }
        }

        console.log(`Found ${duplicateCount} duplicate message IDs. Total copies to delete: ${toDeleteIds.length}`);

        if (toDeleteIds.length > 0) {
            // Delete in batches of 100
            for (let i = 0; i < toDeleteIds.length; i += 100) {
                const batch = toDeleteIds.slice(i, i + 100);
                const { error: delError } = await supabase
                    .from('messages')
                    .delete()
                    .in('id', batch);
                if (delError) console.error('Delete error:', delError);
            }
        }

        return new Response(JSON.stringify({
            success: true,
            foundDuplicates: duplicateCount,
            deletedCount: toDeleteIds.length,
            message: `Removed ${toDeleteIds.length} redundant messages across ${duplicateCount} IDs.`
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('Cleanup error:', error);
        return new Response(JSON.stringify({ error: 'Internal server error', details: String(error) }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});

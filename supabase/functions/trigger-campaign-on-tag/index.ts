import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function resolveCampaignInstance(supabase: any, organizationId: string, workspaceId?: string | null) {
    if (workspaceId) {
        const { data: workspace } = await supabase
            .from('workspaces')
            .select('whatsapp_instance_id')
            .eq('id', workspaceId)
            .eq('organization_id', organizationId)
            .maybeSingle();
        if (workspace?.whatsapp_instance_id) {
            const { data: instance } = await supabase
                .from('whatsapp_instances')
                .select('id, phone_number, logical_phone')
                .eq('id', workspace.whatsapp_instance_id)
                .eq('organization_id', organizationId)
                .maybeSingle();
            if (instance?.id) return instance;
        }
    }

    const { data: instance } = await supabase
        .from('whatsapp_instances')
        .select('id, phone_number, logical_phone')
        .eq('organization_id', organizationId)
        .eq('status', 'connected')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    return instance || null;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { record } = await req.json();
        
        if (!record || !record.contact_id || !record.tag_id) {
            return new Response(JSON.stringify({ error: 'Missing record data' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const contactId = record.contact_id;
        const tagId = record.tag_id;

        // 1. Get contact's organization
        const { data: contact } = await supabase
            .from('contacts')
            .select('organization_id, phone')
            .eq('id', contactId)
            .single();

        if (!contact) throw new Error('Contact not found');
        const organizationId = contact.organization_id;

        // 2. Find campaigns matching this tag
        const { data: campaigns, error: campaignsError } = await supabase
            .from('campaigns')
            .select('id, name, flow_id, start_time, end_time, workspace_id')
            .eq('organization_id', organizationId)
            .eq('is_active', true)
            .eq('match_type', 'tag_added')
            .eq('trigger_keyword', tagId);

        if (campaignsError) throw campaignsError;

        if (!campaigns || campaigns.length === 0) {
            console.log('No matching tag_added campaigns found for tag:', tagId);
            return new Response(JSON.stringify({ processed: 0 }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        let processed = 0;

        for (const campaign of campaigns) {
            const campaignInstance = await resolveCampaignInstance(supabase, organizationId, campaign.workspace_id);

            // Get or create conversation for contact
            let conversationQuery = supabase
                .from('conversations')
                .select('id')
                .eq('contact_id', contactId)
                .eq('organization_id', organizationId);

            conversationQuery = campaignInstance?.id
                ? conversationQuery.eq('whatsapp_instance_id', campaignInstance.id)
                : conversationQuery.is('whatsapp_instance_id', null);

            let { data: conversation } = await conversationQuery
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (!conversation) {
                const { data: newConv } = await supabase
                    .from('conversations')
                    .insert({
                        contact_id: contactId,
                        organization_id: organizationId,
                        workspace_id: campaign.workspace_id || null,
                        whatsapp_instance_id: campaignInstance?.id || null,
                        source_phone: campaignInstance?.phone_number || campaignInstance?.logical_phone || null,
                        status: 'open'
                    })
                    .select('id')
                    .single();
                conversation = newConv;
            }

            if (!conversation) continue;

            // Increment campaign trigger count
            await supabase.rpc('increment_campaign_count', { campaign_id: campaign.id });

            // Since tag added is mostly internal, we can just trigger the flow directly
            // No strict business hours check for internal tags unless requested, 
            // but let's just trigger it directly via flow-execute
            
            console.log(`Triggering campaign ${campaign.id} (Flow ${campaign.flow_id}) for conversation ${conversation.id}`);

            const flowExecPromise = fetch(`${supabaseUrl}/functions/v1/flow-execute`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${supabaseKey}` 
                },
                body: JSON.stringify({
                    flowId: campaign.flow_id,
                    conversationId: conversation.id,
                    organizationId: organizationId,
                    variables: { campaign_id: campaign.id, campaign_name: campaign.name },
                }),
            });

            // Run in background without waiting for completion to not block the trigger
            flowExecPromise.catch(err => console.error('Flow exec error:', err));
            processed++;
        }

        return new Response(JSON.stringify({ processed, success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('Error in trigger-campaign-on-tag:', error);
        return new Response(JSON.stringify({ error: String(error) }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});

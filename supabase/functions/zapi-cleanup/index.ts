import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function onlyDigits(value?: string | null): string {
    return (value || '').replace(/\D/g, '');
}

function phoneMatchKey(rawPhone?: string | null): string {
    const digits = onlyDigits(rawPhone);
    if (!digits) return '';
    const local = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
    if (local.length === 11 && local[2] === '9') {
        return `${local.slice(0, 2)}${local.slice(3)}`;
    }
    return local;
}

function isPreferredContact(contact: any): number {
    const phone = onlyDigits(contact.phone);
    let score = 0;
    if (phone.startsWith('55')) score += 100;
    if (contact.name && !/^\+?\d/.test(contact.name)) score += 10;
    if (contact.avatar_url) score += 5;
    return score;
}

async function safeUpdateContactRef(supabase: any, table: string, duplicateContactId: string, keeperContactId: string) {
    const { error } = await supabase
        .from(table)
        .update({ contact_id: keeperContactId })
        .eq('contact_id', duplicateContactId);
    if (error) console.error(`[CONTACT_MERGE] Failed updating ${table}:`, error);
}

async function mergeUniqueContactTags(supabase: any, duplicateContactId: string, keeperContactId: string) {
    const { data: duplicateTags } = await supabase
        .from('contact_tags')
        .select('*')
        .eq('contact_id', duplicateContactId);

    for (const tag of duplicateTags || []) {
        const { data: existing } = await supabase
            .from('contact_tags')
            .select('id')
            .eq('contact_id', keeperContactId)
            .eq('tag_id', tag.tag_id)
            .maybeSingle();

        if (existing) {
            await supabase.from('contact_tags').delete().eq('id', tag.id);
        } else {
            await supabase.from('contact_tags').update({ contact_id: keeperContactId }).eq('id', tag.id);
        }
    }
}

async function mergeScheduledMessageContacts(supabase: any, duplicateContactId: string, keeperContactId: string) {
    const { data: rows } = await supabase
        .from('scheduled_message_contacts')
        .select('*')
        .eq('contact_id', duplicateContactId);

    for (const row of rows || []) {
        const { data: existing } = await supabase
            .from('scheduled_message_contacts')
            .select('id')
            .eq('contact_id', keeperContactId)
            .eq('scheduled_message_id', row.scheduled_message_id)
            .maybeSingle();

        if (existing) {
            await supabase.from('scheduled_message_contacts').delete().eq('id', row.id);
        } else {
            await supabase.from('scheduled_message_contacts').update({ contact_id: keeperContactId }).eq('id', row.id);
        }
    }
}

async function mergePresence(supabase: any, duplicateContactId: string, keeperContactId: string) {
    const { data: existing } = await supabase
        .from('contact_presence')
        .select('id')
        .eq('contact_id', keeperContactId)
        .maybeSingle();

    if (existing) {
        await supabase.from('contact_presence').delete().eq('contact_id', duplicateContactId);
    } else {
        await supabase.from('contact_presence').update({ contact_id: keeperContactId }).eq('contact_id', duplicateContactId);
    }
}

async function mergeConversationRefs(supabase: any, duplicateConversationId: string, targetConversationId: string) {
    await supabase.from('messages').update({ conversation_id: targetConversationId }).eq('conversation_id', duplicateConversationId);
    await supabase.from('flow_executions').update({ conversation_id: targetConversationId }).eq('conversation_id', duplicateConversationId);
    await supabase.from('campaign_queue').update({ conversation_id: targetConversationId }).eq('conversation_id', duplicateConversationId);
    await supabase.from('calendar_bookings').update({ conversation_id: targetConversationId }).eq('conversation_id', duplicateConversationId);
    await supabase.from('cases').update({ conversation_id: targetConversationId }).eq('conversation_id', duplicateConversationId);
}

async function cleanupDuplicateContacts(supabase: any, organizationId: string) {
    const { data: contacts, error: contactsError } = await supabase
        .from('contacts')
        .select('*')
        .eq('organization_id', organizationId);

    if (contactsError) throw contactsError;

    const groups = new Map<string, any[]>();
    for (const contact of contacts || []) {
        const key = phoneMatchKey(contact.phone);
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(contact);
    }

    const merged: any[] = [];

    for (const [key, group] of groups.entries()) {
        if (group.length < 2) continue;

        const sorted = [...group].sort((a, b) => {
            const scoreDiff = isPreferredContact(b) - isPreferredContact(a);
            if (scoreDiff !== 0) return scoreDiff;
            return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime();
        });
        const keeper = sorted[0];
        const duplicates = sorted.slice(1);

        const { data: keeperConversation } = await supabase
            .from('conversations')
            .select('*')
            .eq('organization_id', organizationId)
            .eq('contact_id', keeper.id)
            .order('last_message_at', { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle();

        let targetConversation = keeperConversation;

        for (const duplicate of duplicates) {
            const { data: duplicateConversations } = await supabase
                .from('conversations')
                .select('*')
                .eq('organization_id', organizationId)
                .eq('contact_id', duplicate.id)
                .order('last_message_at', { ascending: false, nullsFirst: false });

            for (const duplicateConversation of duplicateConversations || []) {
                if (!targetConversation) {
                    const { data: movedConversation, error: moveError } = await supabase
                        .from('conversations')
                        .update({
                            contact_id: keeper.id,
                            metadata: {
                                ...(duplicateConversation.metadata || {}),
                                merged_from_contact_ids: [duplicate.id],
                            },
                        })
                        .eq('id', duplicateConversation.id)
                        .select()
                        .maybeSingle();
                    if (moveError) console.error('[CONTACT_MERGE] Failed moving first conversation:', moveError);
                    if (movedConversation) targetConversation = movedConversation;
                    continue;
                }

                if (duplicateConversation.id === targetConversation.id) continue;

                await mergeConversationRefs(supabase, duplicateConversation.id, targetConversation.id);

                const newestLastMessage =
                    new Date(duplicateConversation.last_message_at || 0).getTime() >
                    new Date(targetConversation.last_message_at || 0).getTime()
                        ? duplicateConversation.last_message_at
                        : targetConversation.last_message_at;

                const mergedConversationIds = Array.from(new Set([
                    ...((targetConversation.metadata || {}).merged_conversation_ids || []),
                    duplicateConversation.id,
                ]));

                await supabase
                    .from('conversations')
                    .update({
                        last_message_at: newestLastMessage || new Date().toISOString(),
                        unread_count: (targetConversation.unread_count || 0) + (duplicateConversation.unread_count || 0),
                        metadata: {
                            ...(targetConversation.metadata || {}),
                            merged_conversation_ids: mergedConversationIds,
                        },
                    })
                    .eq('id', targetConversation.id);

                await supabase.from('conversations').delete().eq('id', duplicateConversation.id);
            }

            await mergeUniqueContactTags(supabase, duplicate.id, keeper.id);
            await mergeScheduledMessageContacts(supabase, duplicate.id, keeper.id);
            await mergePresence(supabase, duplicate.id, keeper.id);

            await safeUpdateContactRef(supabase, 'contact_notes', duplicate.id, keeper.id);
            await safeUpdateContactRef(supabase, 'contact_folders', duplicate.id, keeper.id);
            await safeUpdateContactRef(supabase, 'contact_files', duplicate.id, keeper.id);
            await safeUpdateContactRef(supabase, 'scheduled_messages', duplicate.id, keeper.id);
            await safeUpdateContactRef(supabase, 'campaign_queue', duplicate.id, keeper.id);
            await safeUpdateContactRef(supabase, 'calendar_bookings', duplicate.id, keeper.id);
            await safeUpdateContactRef(supabase, 'cases', duplicate.id, keeper.id);
            await safeUpdateContactRef(supabase, 'widget_submissions', duplicate.id, keeper.id);
            await safeUpdateContactRef(supabase, 'quiz_submissions', duplicate.id, keeper.id);

            const keeperMetadata = { ...(keeper.metadata || {}) };
            const duplicateAliases = Array.isArray(duplicate.metadata?.phone_aliases) ? duplicate.metadata.phone_aliases : [];
            const aliases = Array.from(new Set([
                ...(Array.isArray(keeperMetadata.phone_aliases) ? keeperMetadata.phone_aliases : []),
                keeper.phone,
                duplicate.phone,
                ...duplicateAliases,
            ].filter(Boolean)));

            await supabase
                .from('contacts')
                .update({
                    name: keeper.name || duplicate.name,
                    email: keeper.email || duplicate.email,
                    avatar_url: keeper.avatar_url || duplicate.avatar_url,
                    metadata: {
                        ...keeperMetadata,
                        phone_aliases: aliases,
                        canonical_phone: onlyDigits(keeper.phone),
                        merged_contact_ids: Array.from(new Set([
                            ...(Array.isArray(keeperMetadata.merged_contact_ids) ? keeperMetadata.merged_contact_ids : []),
                            duplicate.id,
                        ])),
                    },
                    updated_at: new Date().toISOString(),
                })
                .eq('id', keeper.id);

            const { error: deleteError } = await supabase.from('contacts').delete().eq('id', duplicate.id);
            if (deleteError) {
                console.error('[CONTACT_MERGE] Failed deleting duplicate contact:', deleteError);
            } else {
                merged.push({ phoneKey: key, keeper: keeper.id, removed: duplicate.id, removedPhone: duplicate.phone });
            }
        }
    }

    return { mergedCount: merged.length, merged };
}

async function diagnoseWhatsApp(supabase: any, organizationIds: string[], queryText?: string | null) {
    const { data: settingsRow } = await supabase
        .from('platform_settings')
        .select('value')
        .eq('key', 'whatsapp_connection_settings')
        .maybeSingle();
    const connectionSettings = settingsRow?.value || {};
    const evolutionBaseUrl = String(connectionSettings.evolution_base_url || Deno.env.get('EVOLUTION_BASE_URL') || '').replace(/\/$/, '');
    const evolutionApiKey = connectionSettings.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY') || '';

    async function readEvolution(path: string, apiKey: string) {
        if (!evolutionBaseUrl || !apiKey) return { ok: false, skipped: true, reason: 'Evolution settings missing' };
        try {
            const response = await fetch(`${evolutionBaseUrl}${path}`, {
                headers: { apikey: apiKey },
            });
            const raw = await response.text();
            let json: any = null;
            try { json = raw ? JSON.parse(raw) : null; } catch (_) {}
            return { ok: response.ok, status: response.status, json, raw: json ? undefined : raw };
        } catch (error) {
            return { ok: false, error: String(error) };
        }
    }

    const diagnostics = [];

    for (const organizationId of organizationIds) {
        const { data: instances } = await supabase
            .from('whatsapp_instances')
            .select('id, label, provider, status, is_active, phone_number, zapi_instance_id, evolution_instance_name, evolution_instance_id, connected_at, disconnected_at, updated_at')
            .eq('organization_id', organizationId)
            .order('updated_at', { ascending: false });

        const evolutionProbes = [];
        for (const instance of instances || []) {
            if (instance.provider !== 'evolution') continue;
            const instanceName = instance.evolution_instance_name || instance.zapi_instance_id;
            const apiKey = instance.evolution_api_key || evolutionApiKey;
            evolutionProbes.push({
                instanceId: instance.id,
                instanceName,
                connectionState: await readEvolution(`/instance/connectionState/${instanceName}`, apiKey),
                webhook: await readEvolution(`/webhook/find/${instanceName}`, apiKey),
            });
        }

        const { data: recentConversations } = await supabase
            .from('conversations')
            .select('id, status, last_message_at, unread_count, whatsapp_instance_id, contact:contacts(id, name, phone, metadata), last_message:messages(id, content, direction, created_at, zapi_message_id)')
            .eq('organization_id', organizationId)
            .order('last_message_at', { ascending: false, nullsFirst: false })
            .limit(10)
            .order('created_at', { referencedTable: 'messages', ascending: false })
            .limit(1, { referencedTable: 'messages' });

        const { data: recentWebhookLogs } = await supabase
            .from('whatsapp_connection_logs')
            .select('id, instance_id, event_type, phone_number, details, created_at')
            .eq('organization_id', organizationId)
            .in('event_type', ['webhook_received', 'connected', 'pairsuccess', 'connection_update'])
            .order('created_at', { ascending: false })
            .limit(20);

        const { data: recentOutboundMessages } = await supabase
            .from('messages')
            .select('id, conversation_id, content, direction, created_at, zapi_message_id, delivered_at, read_at, metadata, conversations!inner(organization_id, contact:contacts(id, name, phone))')
            .eq('conversations.organization_id', organizationId)
            .eq('direction', 'outbound')
            .order('created_at', { ascending: false })
            .limit(30);

        const { data: recentPresence } = await supabase
            .from('contact_presence')
            .select('id, contact_id, presence_type, started_at, expires_at, contacts!inner(organization_id, name, phone)')
            .eq('contacts.organization_id', organizationId)
            .order('started_at', { ascending: false })
            .limit(30);

        let matchedMessages: any[] = [];
        if (queryText) {
            const { data } = await supabase
                .from('messages')
                .select('id, conversation_id, content, direction, created_at, zapi_message_id, delivered_at, read_at, metadata, conversations!inner(organization_id, whatsapp_instance_id, contact:contacts(id, name, phone, metadata))')
                .eq('conversations.organization_id', organizationId)
                .ilike('content', `%${queryText}%`)
                .order('created_at', { ascending: false })
                .limit(20);
            matchedMessages = data || [];
        }

        const duplicateGroups = new Map<string, any[]>();
        const { data: contacts } = await supabase
            .from('contacts')
            .select('id, phone, name, metadata, updated_at')
            .eq('organization_id', organizationId);
        for (const contact of contacts || []) {
            const key = phoneMatchKey(contact.phone);
            if (!key) continue;
            if (!duplicateGroups.has(key)) duplicateGroups.set(key, []);
            duplicateGroups.get(key)!.push(contact);
        }

        diagnostics.push({
            organizationId,
            instances: instances || [],
            evolutionProbes,
            recentWebhookLogs: recentWebhookLogs || [],
            recentOutboundMessages: recentOutboundMessages || [],
            recentPresence: recentPresence || [],
            recentConversations: recentConversations || [],
            matchedMessages,
            duplicateContactGroups: Array.from(duplicateGroups.entries())
                .filter(([, group]) => group.length > 1)
                .map(([phoneKey, group]) => ({ phoneKey, contacts: group })),
        });
    }

    return diagnostics;
}

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
        let organizationIds: string[] = [];

        if (forceCleanup) {
            const url = new URL(req.url);
            const requestedOrgId = url.searchParams.get('organizationId');
            const { data: orgs } = requestedOrgId
                ? await supabase.from('organizations').select('id').eq('id', requestedOrgId).limit(1)
                : await supabase.from('organizations').select('id');
            organizationIds = (orgs || []).map((org: any) => org.id);
            organizationId = organizationIds[0] || null;
            console.log(`EMERGENCY CLEANUP V4 - Organizations: ${organizationIds.join(', ')}`);
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
                    organizationIds = organizationId ? [organizationId] : [];
                }
            }
        }

        if (!organizationIds.length && organizationId) organizationIds = [organizationId];

        if (!organizationIds.length) {
            return new Response(JSON.stringify({ error: 'Could not determine organization' }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const cleanupResults = [];
        let totalDuplicateMessageIds = 0;
        let totalDeletedMessages = 0;
        let totalMergedContacts = 0;

        for (const currentOrganizationId of organizationIds) {
        const url = new URL(req.url);
        const action = url.searchParams.get('action') || 'cleanup';
        if (action === 'diagnose') {
            const queryText = url.searchParams.get('queryText');
            const diagnostics = await diagnoseWhatsApp(supabase, organizationIds, queryText);
            return new Response(JSON.stringify({ success: true, diagnostics }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // 1. Find ALL messages that have a duplicate zapi_message_id across ALL conversations in the org
            const { data: allDuplicates, error: dupError } = await supabase
                .from('messages')
                .select('id, zapi_message_id, conversation_id, conversations!inner(organization_id)')
                .eq('conversations.organization_id', currentOrganizationId)
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

            for (const [_zapiId, msgs] of messageMap.entries()) {
                if (msgs.length > 1) {
                    duplicateCount++;
                    // Keep the first one and delete the redundant copies.
                    const [_first, ...others] = msgs;
                    others.forEach(m => toDeleteIds.push(m.id));
                }
            }

            console.log(`Org ${currentOrganizationId}: found ${duplicateCount} duplicate message IDs. Total copies to delete: ${toDeleteIds.length}`);

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

            const contactCleanup = await cleanupDuplicateContacts(supabase, currentOrganizationId);
            totalDuplicateMessageIds += duplicateCount;
            totalDeletedMessages += toDeleteIds.length;
            totalMergedContacts += contactCleanup.mergedCount;
            cleanupResults.push({
                organizationId: currentOrganizationId,
                foundDuplicates: duplicateCount,
                deletedCount: toDeleteIds.length,
                contactCleanup,
            });
        }

        return new Response(JSON.stringify({
            success: true,
            foundDuplicates: totalDuplicateMessageIds,
            deletedCount: totalDeletedMessages,
            mergedContacts: totalMergedContacts,
            results: cleanupResults,
            message: `Removed ${totalDeletedMessages} redundant messages across ${totalDuplicateMessageIds} IDs and merged ${totalMergedContacts} duplicate contacts.`
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

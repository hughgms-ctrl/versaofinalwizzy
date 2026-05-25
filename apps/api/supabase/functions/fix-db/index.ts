import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        let count = 0;

        // Fix integration configs
        const { data: configs } = await supabaseClient.from('integration_configs').select('*');
        if (configs) {
            for (const config of configs) {
                const updatePayload: any = {};
                let needsUpdate = false;

                const checkAndUpdate = (field: string) => {
                    const val = config[field];
                    if (typeof val === 'string') {
                        if (val.includes('3.1-pro') || val.includes('3-pro')) {
                            updatePayload[field] = val.includes('gemini') ? 'gemini-1.5-pro' : 'google/gemini-1.5-pro-latest';
                            if (val.startsWith('google/')) updatePayload[field] = 'google/gemini-1.5-pro-latest';
                            needsUpdate = true;
                        } else if (val.includes('3-flash') || val.includes('2.5-flash')) {
                            updatePayload[field] = val.includes('gemini') ? 'gemini-2.0-flash' : 'google/gemini-2.0-flash';
                            if (val.startsWith('google/')) updatePayload[field] = 'google/gemini-2.0-flash';
                            needsUpdate = true;
                        }
                    }
                };

                checkAndUpdate('default_model');
                checkAndUpdate('agents_model');
                checkAndUpdate('conversation_summary_model');
                checkAndUpdate('prompt_generation_model');
                checkAndUpdate('flow_generation_model');
                checkAndUpdate('transcription_model');

                if (needsUpdate) {
                    await supabaseClient.from('integration_configs').update(updatePayload).eq('id', config.id);
                    count++;
                }
            }
        }

        // Fix AI Agents
        const { data: agents } = await supabaseClient.from('ai_agents').select('*');
        if (agents) {
            for (const agent of agents) {
                if (agent.model) {
                    let updatedModel = null;
                    if (agent.model.includes('3.1-pro') || agent.model.includes('3-pro')) {
                        updatedModel = agent.model.startsWith('google/') ? 'google/gemini-1.5-pro-latest' : 'gemini-1.5-pro';
                    } else if (agent.model.includes('3-flash') || agent.model.includes('2.5-flash')) {
                        updatedModel = agent.model.startsWith('google/') ? 'google/gemini-2.0-flash' : 'gemini-2.0-flash';
                    }
                    if (updatedModel) {
                        await supabaseClient.from('ai_agents').update({ model: updatedModel }).eq('id', agent.id);
                        count++;
                    }
                }
            }
        }

        // Fix Master Prompts
        const { data: masters } = await supabaseClient.from('master_prompts').select('*');
        if (masters) {
            for (const master of masters) {
                if (master.model) {
                    let updatedModel = null;
                    if (master.model.includes('3.1-pro') || master.model.includes('3-pro')) {
                        updatedModel = master.model.startsWith('google/') ? 'google/gemini-1.5-pro-latest' : 'gemini-1.5-pro';
                    } else if (master.model.includes('3-flash') || master.model.includes('2.5-flash')) {
                        updatedModel = master.model.startsWith('google/') ? 'google/gemini-2.0-flash' : 'gemini-2.0-flash';
                    }
                    if (updatedModel) {
                        await supabaseClient.from('master_prompts').update({ model: updatedModel }).eq('id', master.id);
                        count++;
                    }
                }
            }
        }

        return new Response(JSON.stringify({ success: true, updated: count }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});

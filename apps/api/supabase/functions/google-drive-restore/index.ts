import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: userData } = await supabase.auth.getUser(token);
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('user_id', userData.user.id)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const organizationId = profile.organization_id;

    const { data: driveConfig } = await supabase
      .from('drive_configs')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    if (!driveConfig?.is_connected || !driveConfig.google_refresh_token) {
      return new Response(JSON.stringify({ error: 'Google Drive not connected' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const accessToken = await refreshAccessToken(driveConfig.google_refresh_token);
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'list';

    if (action === 'list') {
      // List backup folders in Drive
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${driveConfig.folder_id}'+in+parents+and+name+contains+'backup-'&orderBy=createdTime+desc&pageSize=10&fields=files(id,name,createdTime)`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const data = await res.json();

      return new Response(JSON.stringify({ backups: data.files || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'restore' && body.backup_folder_id) {
      // List files in the backup folder
      const listRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${body.backup_folder_id}'+in+parents&fields=files(id,name)`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const files = await listRes.json();

      let restored = 0;

      for (const file of files.files || []) {
        const contentRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const content = await contentRes.json();

        // Smart merge: upsert by id to avoid duplicates
        if (file.name === 'conversations.json' && Array.isArray(content)) {
          for (const conv of content) {
            const { messages, ...convData } = conv;
            await supabase.from('conversations').upsert(convData, { onConflict: 'id' });
            if (messages?.length) {
              for (const msg of messages) {
                await supabase.from('messages').upsert(msg, { onConflict: 'id' });
              }
            }
          }
          restored++;
        }

        if (file.name === 'contacts-tags.json' && Array.isArray(content)) {
          for (const contact of content) {
            const { contact_tags, ...contactData } = contact;
            await supabase.from('contacts').upsert(contactData, { onConflict: 'id' });
            if (contact_tags?.length) {
              for (const ct of contact_tags) {
                const { tags, ...tagData } = ct;
                await supabase.from('contact_tags').upsert(tagData, { onConflict: 'id' });
              }
            }
          }
          restored++;
        }

        if (file.name === 'notes.json' && Array.isArray(content)) {
          for (const note of content) {
            await supabase.from('contact_notes').upsert(note, { onConflict: 'id' });
          }
          restored++;
        }

        if (file.name === 'pipeline.json' && content.pipelines) {
          for (const pipeline of content.pipelines) {
            const { pipeline_columns, ...pipelineData } = pipeline;
            await supabase.from('pipelines').upsert(pipelineData, { onConflict: 'id' });
            if (pipeline_columns?.length) {
              for (const col of pipeline_columns) {
                await supabase.from('pipeline_columns').upsert(col, { onConflict: 'id' });
              }
            }
          }
          if (content.positions?.length) {
            for (const pos of content.positions) {
              await supabase.from('conversation_pipeline_positions').upsert(pos, { onConflict: 'id' });
            }
          }
          restored++;
        }
      }

      return new Response(JSON.stringify({ success: true, restored_files: restored }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Restore error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

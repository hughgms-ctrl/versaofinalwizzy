import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveCaller, assertCallerCanAccessOrg, AccessError } from '../_shared/access.ts';


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return data.access_token;
}

async function uploadToDrive(accessToken: string, folderId: string, fileName: string, content: string) {
  const metadata = {
    name: fileName,
    parents: [folderId],
    mimeType: 'application/json',
  };

  const boundary = 'backup_boundary';
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  return await res.json();
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
    // Get auth context to find org
    const authHeader = req.headers.get('Authorization');
    let organizationId: string | null = null;

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: userData } = await supabase.auth.getUser(token);
      if (userData?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('user_id', userData.user.id)
          .single();
        organizationId = profile?.organization_id;
      }
    }

    // Also accept from body (for cron)
    if (!organizationId && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      organizationId = body.organization_id;
    }

    if (!organizationId) {
      return new Response(JSON.stringify({ error: 'Organization not found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get drive config
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

    // Create backup log
    const { data: logEntry } = await supabase
      .from('drive_backup_logs')
      .insert({ organization_id: organizationId, status: 'running' })
      .select()
      .single();

    const accessToken = await refreshAccessToken(driveConfig.google_refresh_token);
    const includes = driveConfig.backup_includes || {};
    let fileCount = 0;
    let totalSize = 0;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Backup conversations + messages
    if (includes.conversations !== false) {
      const { data: conversations } = await supabase
        .from('conversations')
        .select('*, messages(*)')
        .eq('organization_id', organizationId);

      const content = JSON.stringify(conversations || []);
      totalSize += content.length;
      await uploadToDrive(accessToken, driveConfig.folder_id!, `backup-${timestamp}/conversations.json`, content);
      fileCount++;
    }

    // Backup contacts + tags
    if (includes.tags !== false) {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('*, contact_tags(*, tags:tag_id(*))')
        .eq('organization_id', organizationId);

      const content = JSON.stringify(contacts || []);
      totalSize += content.length;
      await uploadToDrive(accessToken, driveConfig.folder_id!, `backup-${timestamp}/contacts-tags.json`, content);
      fileCount++;
    }

    // Backup notes
    if (includes.notes !== false) {
      const { data: notes } = await supabase
        .from('contact_notes')
        .select('*')
        .eq('organization_id', organizationId);

      const content = JSON.stringify(notes || []);
      totalSize += content.length;
      await uploadToDrive(accessToken, driveConfig.folder_id!, `backup-${timestamp}/notes.json`, content);
      fileCount++;
    }

    // Backup pipeline positions
    if (includes.pipeline !== false) {
      const { data: pipelines } = await supabase
        .from('pipelines')
        .select('*, pipeline_columns(*)')
        .eq('organization_id', organizationId);

      const { data: positions } = await supabase
        .from('conversation_pipeline_positions')
        .select('*');

      const content = JSON.stringify({ pipelines: pipelines || [], positions: positions || [] });
      totalSize += content.length;
      await uploadToDrive(accessToken, driveConfig.folder_id!, `backup-${timestamp}/pipeline.json`, content);
      fileCount++;
    }

    // Backup file references
    if (includes.files !== false) {
      const { data: files } = await supabase
        .from('contact_files')
        .select('*')
        .eq('organization_id', organizationId);

      const content = JSON.stringify(files || []);
      totalSize += content.length;
      await uploadToDrive(accessToken, driveConfig.folder_id!, `backup-${timestamp}/files.json`, content);
      fileCount++;
    }

    // Update log
    await supabase
      .from('drive_backup_logs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        file_count: fileCount,
        data_size_bytes: totalSize,
      })
      .eq('id', logEntry!.id);

    // Update last backup timestamp
    await supabase
      .from('drive_configs')
      .update({ last_backup_at: new Date().toISOString() })
      .eq('organization_id', organizationId);

    return new Response(JSON.stringify({ success: true, file_count: fileCount, data_size_bytes: totalSize }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Backup error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string): Promise<string> {
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { organization_id, assigned_user_id, starts_at, duration_minutes, client_name, client_phone, client_email, internal_summary, contact_id, conversation_id } = await req.json();

    if (!organization_id || !starts_at) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Find the calendar config for the assigned user or random
    let query = supabase.from('calendar_configs').select('*').eq('organization_id', organization_id).eq('is_connected', true);
    
    if (assigned_user_id && assigned_user_id !== 'random') {
      query = query.eq('user_id', assigned_user_id);
    }

    const { data: configs, error: configError } = await query;
    if (configError) throw configError;
    if (!configs || configs.length === 0) throw new Error('No connected calendar found');

    // Pick random if multiple or specific
    const config = assigned_user_id === 'random' 
      ? configs[Math.floor(Math.random() * configs.length)]
      : configs[0];

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

    // Refresh access token
    const accessToken = await refreshAccessToken(config.google_refresh_token, clientId, clientSecret);

    // Update stored access token
    await supabase.from('calendar_configs').update({ google_access_token: accessToken }).eq('id', config.id);

    const durationMin = duration_minutes || config.meeting_duration_minutes || 30;
    const startDate = new Date(starts_at);
    const endDate = new Date(startDate.getTime() + durationMin * 60 * 1000);

    const summary = client_name ? `Reunião com ${client_name}` : 'Reunião agendada';

    // Create Google Calendar event with Meet
    const eventRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${config.calendar_id || 'primary'}/events?conferenceDataVersion=1`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary,
        description: internal_summary || `Cliente: ${client_name || 'N/A'}\nTelefone: ${client_phone || 'N/A'}\nEmail: ${client_email || 'N/A'}`,
        start: { dateTime: startDate.toISOString(), timeZone: 'America/Sao_Paulo' },
        end: { dateTime: endDate.toISOString(), timeZone: 'America/Sao_Paulo' },
        conferenceData: {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
        attendees: client_email ? [{ email: client_email }] : [],
      }),
    });

    const event = await eventRes.json();
    if (event.error) throw new Error(event.error.message || JSON.stringify(event.error));

    const meetLink = event.hangoutLink || event.conferenceData?.entryPoints?.[0]?.uri || null;

    // Save booking
    const { data: booking, error: bookingError } = await supabase.from('calendar_bookings').insert({
      organization_id,
      assigned_user_id: config.user_id,
      contact_id: contact_id || null,
      conversation_id: conversation_id || null,
      google_event_id: event.id,
      starts_at: startDate.toISOString(),
      ends_at: endDate.toISOString(),
      client_name: client_name || null,
      client_phone: client_phone || null,
      client_email: client_email || null,
      internal_summary: internal_summary || null,
      meet_link: meetLink,
      status: 'confirmed',
    }).select().single();

    if (bookingError) throw bookingError;

    return new Response(JSON.stringify({ booking, meet_link: meetLink, google_event_id: event.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Calendar book error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

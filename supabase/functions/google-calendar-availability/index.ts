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

interface AvailabilityRule {
  day: number; // 0=Sun, 1=Mon, ..., 6=Sat
  start: string; // "09:00"
  end: string;   // "18:00"
}

function generateSlots(date: string, rules: AvailabilityRule[], durationMin: number): { start: string; end: string }[] {
  const d = new Date(date + 'T00:00:00');
  const dayOfWeek = d.getDay();
  const rule = rules.find(r => r.day === dayOfWeek);
  if (!rule) return [];

  const slots: { start: string; end: string }[] = [];
  const [startH, startM] = rule.start.split(':').map(Number);
  const [endH, endM] = rule.end.split(':').map(Number);

  let current = new Date(d);
  current.setHours(startH, startM, 0, 0);
  const endTime = new Date(d);
  endTime.setHours(endH, endM, 0, 0);

  while (current.getTime() + durationMin * 60 * 1000 <= endTime.getTime()) {
    const slotEnd = new Date(current.getTime() + durationMin * 60 * 1000);
    slots.push({
      start: current.toISOString(),
      end: slotEnd.toISOString(),
    });
    current = slotEnd;
  }

  return slots;
}

function isOverlapping(slot: { start: string; end: string }, events: { start: string; end: string }[]): boolean {
  const s = new Date(slot.start).getTime();
  const e = new Date(slot.end).getTime();
  return events.some(ev => {
    const evS = new Date(ev.start).getTime();
    const evE = new Date(ev.end).getTime();
    return s < evE && e > evS;
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { organization_id, user_ids, date } = await req.json();

    if (!organization_id || !date) {
      return new Response(JSON.stringify({ error: 'Missing organization_id or date' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let query = supabase.from('calendar_configs').select('*').eq('organization_id', organization_id).eq('is_connected', true);
    if (user_ids && user_ids.length > 0) {
      query = query.in('user_id', user_ids);
    }

    const { data: configs, error } = await query;
    if (error) throw error;
    if (!configs || configs.length === 0) {
      return new Response(JSON.stringify({ slots: [], members: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

    const results = [];

    for (const config of configs) {
      try {
        const accessToken = await refreshAccessToken(config.google_refresh_token, clientId, clientSecret);

        // Get events for the day
        const dayStart = new Date(date + 'T00:00:00-03:00');
        const dayEnd = new Date(date + 'T23:59:59-03:00');

        const eventsRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${config.calendar_id || 'primary'}/events?timeMin=${dayStart.toISOString()}&timeMax=${dayEnd.toISOString()}&singleEvents=true&orderBy=startTime`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const eventsData = await eventsRes.json();

        const busySlots = (eventsData.items || [])
          .filter((e: any) => e.status !== 'cancelled' && e.start?.dateTime)
          .map((e: any) => ({
            start: e.start.dateTime,
            end: e.end.dateTime,
          }));

        const rules = (config.availability_rules || []) as AvailabilityRule[];
        const duration = config.meeting_duration_minutes || 30;
        const allSlots = generateSlots(date, rules, duration);
        const freeSlots = allSlots.filter(s => !isOverlapping(s, busySlots));

        results.push({
          user_id: config.user_id,
          display_name: config.display_name || config.google_email,
          google_email: config.google_email,
          free_slots: freeSlots,
        });
      } catch (err) {
        console.error(`Error checking availability for ${config.google_email}:`, err);
        results.push({
          user_id: config.user_id,
          display_name: config.display_name || config.google_email,
          google_email: config.google_email,
          free_slots: [],
          error: err.message,
        });
      }
    }

    return new Response(JSON.stringify({ members: results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Availability error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

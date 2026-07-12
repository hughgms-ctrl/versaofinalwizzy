import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Public, unauthenticated redirect: GET /instagram-link-redirect?id=<trackingId>
// Records the first click on a tracked link (used by Wizzy Engage's DM button
// + delayed follow-up feature) and 302s to the real destination. Safe to hit
// repeatedly — only the first click sets `clicked_at`.
Deno.serve(async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  const fallbackRedirect = (destination: string) =>
    new Response(null, { status: 302, headers: { Location: destination } });

  if (!id) {
    return new Response('Missing link id', { status: 400 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: link, error } = await supabase
    .from('instagram_tracked_links')
    .select('id, destination_url, clicked_at')
    .eq('id', id)
    .maybeSingle();

  if (error || !link) {
    return new Response('Link not found', { status: 404 });
  }

  if (!link.clicked_at) {
    await supabase
      .from('instagram_tracked_links')
      .update({ clicked_at: new Date().toISOString() })
      .eq('id', id);
  }

  return fallbackRedirect(link.destination_url);
});

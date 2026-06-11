alter table public.user_permissions
add column if not exists can_access_contacts boolean not null default false,
add column if not exists can_access_groups boolean not null default false,
add column if not exists can_access_campaigns boolean not null default false,
add column if not exists can_access_integrations boolean not null default false;

update public.user_permissions
set
  can_access_contacts = can_access_conversations,
  can_access_groups = can_access_conversations,
  can_access_campaigns = can_access_flows,
  can_access_integrations = can_access_settings
where
  can_access_contacts is distinct from can_access_conversations
  or can_access_groups is distinct from can_access_conversations
  or can_access_campaigns is distinct from can_access_flows
  or can_access_integrations is distinct from can_access_settings;

create or replace function public.user_can_access_module(_user_id uuid, _module text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.has_role(_user_id, 'admin'::app_role) then true
    when _module = 'dashboard' then coalesce((select can_access_dashboard from public.user_permissions where user_id = _user_id limit 1), false)
    when _module = 'conversations' then coalesce((select can_access_conversations from public.user_permissions where user_id = _user_id limit 1), false)
    when _module = 'contacts' then coalesce((select can_access_contacts from public.user_permissions where user_id = _user_id limit 1), false)
    when _module = 'groups' then coalesce((select can_access_groups from public.user_permissions where user_id = _user_id limit 1), false)
    when _module = 'pipeline' then coalesce((select can_access_pipeline from public.user_permissions where user_id = _user_id limit 1), false)
    when _module = 'flows' then coalesce((select can_access_flows from public.user_permissions where user_id = _user_id limit 1), false)
    when _module = 'campaigns' then coalesce((select can_access_campaigns from public.user_permissions where user_id = _user_id limit 1), false)
    when _module = 'reports' then coalesce((select can_access_reports from public.user_permissions where user_id = _user_id limit 1), false)
    when _module = 'agents' then coalesce((select can_access_agents from public.user_permissions where user_id = _user_id limit 1), false)
    when _module = 'settings' then coalesce((select can_access_settings from public.user_permissions where user_id = _user_id limit 1), false)
    when _module = 'integrations' then coalesce((select can_access_integrations from public.user_permissions where user_id = _user_id limit 1), false)
    when _module = 'team' then coalesce((select can_access_team from public.user_permissions where user_id = _user_id limit 1), false)
    when _module = 'scheduled' then coalesce((select can_access_scheduled from public.user_permissions where user_id = _user_id limit 1), false)
    when _module = 'calendar' then coalesce((select can_access_calendar from public.user_permissions where user_id = _user_id limit 1), false)
    when _module = 'tools' then coalesce((select can_access_tools from public.user_permissions where user_id = _user_id limit 1), false)
    when _module = 'tool_widgets' then coalesce((select can_access_tool_widgets from public.user_permissions where user_id = _user_id limit 1), false)
    when _module = 'tool_documents' then coalesce((select can_access_tool_documents from public.user_permissions where user_id = _user_id limit 1), false)
    when _module = 'tool_quiz' then coalesce((select can_access_tool_quiz from public.user_permissions where user_id = _user_id limit 1), false)
    when _module = 'tool_wizzy_flow' then coalesce((select can_access_tool_wizzy_flow from public.user_permissions where user_id = _user_id limit 1), false)
    when _module = 'tool_carousel' then coalesce((select can_access_tool_carousel from public.user_permissions where user_id = _user_id limit 1), false)
    when _module = 'tool_cnis' then coalesce((select can_access_tool_cnis from public.user_permissions where user_id = _user_id limit 1), false)
    else false
  end;
$$;

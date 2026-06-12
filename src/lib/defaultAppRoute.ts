type PermissionBag = Record<string, unknown> | null | undefined;

type DefaultRouteItem = {
  path: string;
  permissionModule?: string;
  planModule?: string;
};

const defaultRouteOrder: DefaultRouteItem[] = [
  { path: '/dashboard', permissionModule: 'dashboard', planModule: 'dashboard' },
  { path: '/conversations', permissionModule: 'conversations', planModule: 'conversations' },
  { path: '/contacts', permissionModule: 'contacts', planModule: 'contacts' },
  { path: '/groups', permissionModule: 'groups', planModule: 'groups' },
  { path: '/calendar', permissionModule: 'calendar', planModule: 'calendar' },
  { path: '/pipeline', permissionModule: 'pipeline', planModule: 'pipeline' },
  { path: '/flows', permissionModule: 'flows', planModule: 'flows' },
  { path: '/campaigns', permissionModule: 'campaigns', planModule: 'campaigns' },
  { path: '/tools', permissionModule: 'tools', planModule: 'tools' },
  { path: '/scheduled', permissionModule: 'scheduled', planModule: 'scheduled' },
  { path: '/agents', permissionModule: 'agents', planModule: 'agents' },
  { path: '/team', permissionModule: 'team', planModule: 'team' },
  { path: '/reports', permissionModule: 'reports', planModule: 'reports' },
  { path: '/integrations', permissionModule: 'integrations', planModule: 'integrations' },
  { path: '/settings', permissionModule: 'settings', planModule: 'settings' },
];

const permissionFieldByModule: Record<string, string> = {
  dashboard: 'can_access_dashboard',
  conversations: 'can_access_conversations',
  contacts: 'can_access_contacts',
  groups: 'can_access_groups',
  pipeline: 'can_access_pipeline',
  flows: 'can_access_flows',
  campaigns: 'can_access_campaigns',
  reports: 'can_access_reports',
  agents: 'can_access_agents',
  settings: 'can_access_settings',
  integrations: 'can_access_integrations',
  team: 'can_access_team',
  scheduled: 'can_access_scheduled',
  calendar: 'can_access_calendar',
  tools: 'can_access_tools',
  tool_widgets: 'can_access_tool_widgets',
  tool_documents: 'can_access_tool_documents',
  tool_quiz: 'can_access_tool_quiz',
  tool_wizzy_flow: 'can_access_tool_wizzy_flow',
  tool_carousel: 'can_access_tool_carousel',
  tool_cnis: 'can_access_tool_cnis',
};

export function isManagerRole(role?: string | null) {
  return role === 'owner' || role === 'admin' || role === 'platform_admin';
}

export function getDefaultAppRoute({
  role,
  permissions,
  canAccessPlanModule,
}: {
  role?: string | null;
  permissions?: PermissionBag;
  canAccessPlanModule?: (module: string) => boolean;
}) {
  const isManager = isManagerRole(role);

  for (const item of defaultRouteOrder) {
    if (item.planModule && canAccessPlanModule && !canAccessPlanModule(item.planModule)) {
      continue;
    }

    if (!item.permissionModule || isManager) {
      return item.path;
    }

    const permissionField = permissionFieldByModule[item.permissionModule];
    if (permissionField && Boolean(permissions?.[permissionField])) {
      return item.path;
    }
  }

  return '/profile';
}

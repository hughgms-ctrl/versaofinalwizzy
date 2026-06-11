type PermissionBag = Record<string, unknown> | null | undefined;

type DefaultRouteItem = {
  path: string;
  permissionModule?: string;
  planModule?: string;
};

const defaultRouteOrder: DefaultRouteItem[] = [
  { path: '/dashboard', permissionModule: 'dashboard', planModule: 'dashboard' },
  { path: '/conversations', permissionModule: 'conversations', planModule: 'conversations' },
  { path: '/contacts', permissionModule: 'conversations', planModule: 'contacts' },
  { path: '/groups', permissionModule: 'conversations', planModule: 'conversations' },
  { path: '/calendar', permissionModule: 'calendar', planModule: 'calendar' },
  { path: '/pipeline', permissionModule: 'pipeline', planModule: 'pipeline' },
  { path: '/flows', permissionModule: 'flows', planModule: 'flows' },
  { path: '/campaigns', permissionModule: 'flows', planModule: 'campaigns' },
  { path: '/tools', permissionModule: 'flows', planModule: 'tools' },
  { path: '/scheduled', permissionModule: 'scheduled', planModule: 'scheduled' },
  { path: '/agents', permissionModule: 'agents', planModule: 'agents' },
  { path: '/team', permissionModule: 'team', planModule: 'team' },
  { path: '/reports', permissionModule: 'reports', planModule: 'reports' },
  { path: '/integrations', permissionModule: 'settings', planModule: 'integrations' },
  { path: '/settings', permissionModule: 'settings', planModule: 'settings' },
];

const permissionFieldByModule: Record<string, string> = {
  dashboard: 'can_access_dashboard',
  conversations: 'can_access_conversations',
  pipeline: 'can_access_pipeline',
  flows: 'can_access_flows',
  reports: 'can_access_reports',
  agents: 'can_access_agents',
  settings: 'can_access_settings',
  team: 'can_access_team',
  scheduled: 'can_access_scheduled',
  calendar: 'can_access_calendar',
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

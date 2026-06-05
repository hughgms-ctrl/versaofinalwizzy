import { createContext, useContext, type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaceContext as useWizzyWorkspaceContext } from '@/contexts/WorkspaceContext';

type Role = 'admin' | 'gestor' | 'membro';

interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: Role;
  invited_by: string | null;
  created_at: string;
}

interface Workspace {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  isAdminView?: boolean;
}

interface UserPermissions {
  can_view_projects: boolean;
  can_view_tasks: boolean;
  can_view_positions: boolean;
  can_view_analytics: boolean;
  can_view_briefings: boolean;
  can_view_culture: boolean;
  can_view_vision: boolean;
  can_view_processes: boolean;
  can_view_inventory: boolean;
  can_view_ai: boolean;
  can_view_workload: boolean;
  can_view_flows: boolean;
  can_view_notes: boolean;
  can_edit_projects: boolean;
  can_edit_tasks: boolean;
  can_edit_positions: boolean;
  can_edit_analytics: boolean;
  can_edit_briefings: boolean;
  can_edit_culture: boolean;
  can_edit_vision: boolean;
  can_edit_processes: boolean;
  can_edit_inventory: boolean;
  can_edit_flows: boolean;
  can_edit_notes: boolean;
  projects_only_assigned: boolean;
}

interface WorkspaceContextType {
  workspace: Workspace | null;
  workspaceMember: WorkspaceMember | null;
  workspaces: Workspace[];
  loading: boolean;
  isAdmin: boolean;
  isGestor: boolean;
  isMembro: boolean;
  canManageMembers: boolean;
  canCreateTasks: boolean;
  permissions: UserPermissions;
  isAdminViewMode: boolean;
  adminViewWorkspaces: Workspace[];
  refetchWorkspace: () => Promise<void>;
  changeWorkspace: (workspaceId: string) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

const allPermissions: UserPermissions = {
  can_view_projects: true,
  can_view_tasks: true,
  can_view_positions: true,
  can_view_analytics: true,
  can_view_briefings: true,
  can_view_culture: true,
  can_view_vision: true,
  can_view_processes: true,
  can_view_inventory: true,
  can_view_ai: true,
  can_view_workload: true,
  can_view_flows: false,
  can_view_notes: true,
  can_edit_projects: true,
  can_edit_tasks: true,
  can_edit_positions: true,
  can_edit_analytics: true,
  can_edit_briefings: true,
  can_edit_culture: true,
  can_edit_vision: true,
  can_edit_processes: true,
  can_edit_inventory: true,
  can_edit_flows: false,
  can_edit_notes: true,
  projects_only_assigned: false,
};

export const WorkspaceProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const wizzyWorkspace = useWizzyWorkspaceContext();
  const role: Role = wizzyWorkspace.isAdmin ? 'admin' : 'membro';

  const workspace = wizzyWorkspace.selectedWorkspace
    ? ({
        id: wizzyWorkspace.selectedWorkspace.id,
        name: wizzyWorkspace.selectedWorkspace.name,
        created_at: wizzyWorkspace.selectedWorkspace.created_at,
        updated_at: wizzyWorkspace.selectedWorkspace.updated_at,
        created_by: null,
      } as Workspace)
    : null;

  const workspaces = wizzyWorkspace.availableWorkspaces.map((item) => ({
    id: item.id,
    name: item.name,
    created_at: item.created_at,
    updated_at: item.updated_at,
    created_by: null,
  })) as Workspace[];

  const workspaceMember =
    workspace && user
      ? {
          id: `wizzy-${workspace.id}-${user.id}`,
          workspace_id: workspace.id,
          user_id: user.id,
          role,
          invited_by: null,
          created_at: new Date().toISOString(),
        }
      : null;

  const value: WorkspaceContextType = {
    workspace,
    workspaceMember,
    workspaces,
    loading: wizzyWorkspace.loading,
    isAdmin: role === 'admin',
    isGestor: (role as Role) === 'gestor',
    isMembro: role === 'membro',
    canManageMembers: role === 'admin' || (role as Role) === 'gestor',
    canCreateTasks: true,
    permissions: allPermissions,
    isAdminViewMode: false,
    adminViewWorkspaces: [],
    refetchWorkspace: async () => undefined,
    changeWorkspace: async (workspaceId: string) => {
      wizzyWorkspace.setWorkspace(workspaceId);
    },
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used within a WorkspaceProvider');
  return context;
};

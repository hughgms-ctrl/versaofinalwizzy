import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useWorkspaces, useUserWorkspaces, Workspace } from '@/hooks/useWorkspaces';
import { useCurrentUserRole } from '@/hooks/useUserPermissions';

interface WorkspaceContextType {
  selectedWorkspaceId: string | null;
  selectedWorkspace: Workspace | null;
  workspaces: Workspace[];
  availableWorkspaces: Workspace[];
  setWorkspace: (id: string | null) => void;
  isAdmin: boolean;
  loading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { data: allWorkspaces = [], isLoading: loadingWorkspaces } = useWorkspaces();
  const { data: userWorkspaceIds = [], isLoading: loadingMembership } = useUserWorkspaces();
  const { data: userRole } = useCurrentUserRole();

  const isAdmin = userRole === 'owner' || userRole === 'admin';

  const availableWorkspaces = isAdmin
    ? allWorkspaces
    : allWorkspaces.filter(w => userWorkspaceIds.includes(w.id));

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(() => {
    const saved = localStorage.getItem('selectedWorkspaceId');
    return saved || null;
  });

  // Auto-select first workspace for non-admins if none selected
  useEffect(() => {
    if (!isAdmin && availableWorkspaces.length > 0 && !selectedWorkspaceId) {
      setSelectedWorkspaceId(availableWorkspaces[0].id);
    }
  }, [isAdmin, availableWorkspaces, selectedWorkspaceId]);

  // Clear selection if workspace no longer available
  useEffect(() => {
    if (selectedWorkspaceId && availableWorkspaces.length > 0) {
      const stillAvailable = availableWorkspaces.some(w => w.id === selectedWorkspaceId);
      if (!stillAvailable && !isAdmin) {
        setSelectedWorkspaceId(availableWorkspaces[0]?.id || null);
      }
    }
  }, [selectedWorkspaceId, availableWorkspaces, isAdmin]);

  const setWorkspace = (id: string | null) => {
    setSelectedWorkspaceId(id);
    if (id) {
      localStorage.setItem('selectedWorkspaceId', id);
    } else {
      localStorage.removeItem('selectedWorkspaceId');
    }
  };

  const selectedWorkspace = allWorkspaces.find(w => w.id === selectedWorkspaceId) || null;

  return (
    <WorkspaceContext.Provider
      value={{
        selectedWorkspaceId,
        selectedWorkspace,
        workspaces: allWorkspaces,
        availableWorkspaces,
        setWorkspace,
        isAdmin,
        loading: loadingWorkspaces || loadingMembership,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaceContext() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    // Return safe defaults when provider is not yet mounted
    return {
      selectedWorkspaceId: null,
      selectedWorkspace: null,
      workspaces: [],
      availableWorkspaces: [],
      setWorkspace: () => {},
      isAdmin: false,
      loading: true,
    } as WorkspaceContextType;
  }
  return context;
}

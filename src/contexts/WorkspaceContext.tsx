import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useWorkspaces, useUserWorkspaces, useOrganizationMemberships, Workspace, OrganizationMembership, OrganizationRole } from '@/hooks/useWorkspaces';

interface WorkspaceContextType {
  selectedOrganizationId: string | null;
  selectedOrganization: OrganizationMembership['organization'] | null;
  organizationMemberships: OrganizationMembership[];
  currentOrganizationRole: OrganizationRole | null;
  selectedWorkspaceId: string | null;
  selectedWorkspace: Workspace | null;
  workspaces: Workspace[];
  availableWorkspaces: Workspace[];
  setOrganization: (id: string | null) => void;
  setWorkspace: (id: string | null) => void;
  isAdmin: boolean;
  canManageOrganization: boolean;
  loading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { data: organizationMemberships = [], isLoading: loadingOrganizations } = useOrganizationMemberships();
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(() => {
    const saved = localStorage.getItem('selectedOrganizationId');
    return saved || null;
  });
  const selectedMembership = organizationMemberships.find((membership) => membership.organization_id === selectedOrganizationId) || organizationMemberships[0] || null;
  const activeOrganizationId = selectedMembership?.organization_id || null;
  const { data: allWorkspaces = [], isLoading: loadingWorkspaces } = useWorkspaces(activeOrganizationId);
  const { data: userWorkspaceIds = [], isLoading: loadingMembership } = useUserWorkspaces();

  const currentOrganizationRole = selectedMembership?.role || null;
  const isAdmin = currentOrganizationRole === 'owner' || currentOrganizationRole === 'admin' || currentOrganizationRole === 'platform_admin';
  const canManageOrganization = isAdmin;

  const availableWorkspaces = isAdmin
    ? allWorkspaces
    : allWorkspaces.filter(w => userWorkspaceIds.includes(w.id));

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(() => {
    const saved = localStorage.getItem('selectedWorkspaceId');
    return saved || null;
  });

  useEffect(() => {
    if (!organizationMemberships.length) return;
    if (!selectedOrganizationId || !organizationMemberships.some((membership) => membership.organization_id === selectedOrganizationId)) {
      const nextOrganizationId = organizationMemberships[0].organization_id;
      setSelectedOrganizationId(nextOrganizationId);
      localStorage.setItem('selectedOrganizationId', nextOrganizationId);
    }
  }, [organizationMemberships, selectedOrganizationId]);

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

  const setOrganization = (id: string | null) => {
    setSelectedOrganizationId(id);
    setSelectedWorkspaceId(null);
    localStorage.removeItem('selectedWorkspaceId');
    if (id) {
      localStorage.setItem('selectedOrganizationId', id);
    } else {
      localStorage.removeItem('selectedOrganizationId');
    }
  };

  const selectedWorkspace = allWorkspaces.find(w => w.id === selectedWorkspaceId) || null;

  return (
    <WorkspaceContext.Provider
      value={{
        selectedOrganizationId: activeOrganizationId,
        selectedOrganization: selectedMembership?.organization || null,
        organizationMemberships,
        currentOrganizationRole,
        selectedWorkspaceId,
        selectedWorkspace,
        workspaces: allWorkspaces,
        availableWorkspaces,
        setOrganization,
        setWorkspace,
        isAdmin,
        canManageOrganization,
        loading: loadingOrganizations || loadingWorkspaces || loadingMembership,
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
      selectedOrganizationId: null,
      selectedOrganization: null,
      organizationMemberships: [],
      currentOrganizationRole: null,
      selectedWorkspace: null,
      workspaces: [],
      availableWorkspaces: [],
      setOrganization: () => {},
      setWorkspace: () => {},
      isAdmin: false,
      canManageOrganization: false,
      loading: true,
    } as WorkspaceContextType;
  }
  return context;
}

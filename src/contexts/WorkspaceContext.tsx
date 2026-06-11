import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useWorkspaces, useUserWorkspaces, useOrganizationMemberships, Workspace, OrganizationMembership, OrganizationRole } from '@/hooks/useWorkspaces';
import { useAuth } from '@/hooks/useAuth';

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

const getOrganizationStorageKey = (userId?: string | null) => userId ? `selectedOrganizationId:${userId}` : null;
const getWorkspaceStorageKey = (userId?: string | null) => userId ? `selectedWorkspaceId:${userId}` : null;

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id || null;
  const { data: organizationMemberships = [], isLoading: loadingOrganizations } = useOrganizationMemberships();
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
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

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setSelectedOrganizationId(null);
      setSelectedWorkspaceId(null);
      return;
    }

    setSelectedOrganizationId(localStorage.getItem(getOrganizationStorageKey(userId)!) || null);
    setSelectedWorkspaceId(localStorage.getItem(getWorkspaceStorageKey(userId)!) || null);
  }, [userId]);

  useEffect(() => {
    if (!userId || !organizationMemberships.length) return;
    if (!selectedOrganizationId || !organizationMemberships.some((membership) => membership.organization_id === selectedOrganizationId)) {
      const nextOrganizationId = organizationMemberships[0].organization_id;
      setSelectedOrganizationId(nextOrganizationId);
      localStorage.setItem(getOrganizationStorageKey(userId)!, nextOrganizationId);
    }
  }, [organizationMemberships, selectedOrganizationId, userId]);

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
      if (!stillAvailable) {
        const nextWorkspaceId = isAdmin ? null : availableWorkspaces[0]?.id || null;
        setSelectedWorkspaceId(nextWorkspaceId);
        const key = getWorkspaceStorageKey(userId);
        if (key) {
          if (nextWorkspaceId) localStorage.setItem(key, nextWorkspaceId);
          else localStorage.removeItem(key);
        }
      }
    }
  }, [selectedWorkspaceId, availableWorkspaces, isAdmin, userId]);

  const setWorkspace = (id: string | null) => {
    setSelectedWorkspaceId(id);
    const storageKey = getWorkspaceStorageKey(userId);
    if (!storageKey) return;
    if (id) {
      localStorage.setItem(storageKey, id);
    } else {
      localStorage.removeItem(storageKey);
    }
  };

  const setOrganization = (id: string | null) => {
    setSelectedOrganizationId(id);
    setSelectedWorkspaceId(null);
    const workspaceStorageKey = getWorkspaceStorageKey(userId);
    const organizationStorageKey = getOrganizationStorageKey(userId);
    if (workspaceStorageKey) localStorage.removeItem(workspaceStorageKey);
    if (!organizationStorageKey) return;
    if (id) {
      localStorage.setItem(organizationStorageKey, id);
    } else {
      localStorage.removeItem(organizationStorageKey);
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

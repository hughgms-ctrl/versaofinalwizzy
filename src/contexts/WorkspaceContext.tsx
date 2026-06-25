import React, { createContext, useContext, useState, useEffect, useMemo, useRef, ReactNode } from 'react';
import {
  useWorkspaces,
  useUserWorkspaceAccess,
  useVisibleWorkspaces,
  useOrganizationMemberships,
  Workspace,
  OrganizationMembership,
  OrganizationRole,
} from '@/hooks/useWorkspaces';
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
  allAvailableWorkspaces: Workspace[];
  setOrganization: (id: string | null) => void;
  setWorkspace: (id: string | null) => void;
  isAdmin: boolean;
  canManageOrganization: boolean;
  hasExternalOrganizationMembership: boolean;
  loading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

const getOrganizationStorageKey = (userId?: string | null) => userId ? `selectedOrganizationId:${userId}` : null;
const getWorkspaceStorageKey = (userId?: string | null) => userId ? `selectedWorkspaceId:${userId}` : null;

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const userId = user?.id || null;
  const { data: organizationMemberships = [], isLoading: loadingOrganizations } = useOrganizationMemberships();
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
  const selectedMembership = organizationMemberships.find((membership) => membership.organization_id === selectedOrganizationId) || organizationMemberships[0] || null;
  const activeOrganizationId = selectedMembership?.organization_id || null;
  const { data: allWorkspaces = [], isLoading: loadingWorkspaces } = useWorkspaces(activeOrganizationId);
  const { data: visibleWorkspaces = [], isLoading: loadingVisibleWorkspaces } = useVisibleWorkspaces();
  const { data: userWorkspaceAccess = [], isLoading: loadingMembership } = useUserWorkspaceAccess();
  const manualOrganizationSelectionRef = useRef(false);

  const currentOrganizationRole = selectedMembership?.role || null;
  const isAdmin = currentOrganizationRole === 'owner' || currentOrganizationRole === 'admin' || currentOrganizationRole === 'platform_admin';
  const canManageOrganization = isAdmin;

  const directWorkspaceIds = useMemo(
    () => userWorkspaceAccess.map((access) => access.workspace_id),
    [userWorkspaceAccess]
  );
  const directWorkspaceIdSet = useMemo(() => new Set(directWorkspaceIds), [directWorkspaceIds]);
  const roleByOrganization = useMemo(() => {
    const roles = new Map<string, OrganizationRole>();
    organizationMemberships.forEach((membership) => {
      roles.set(membership.organization_id, membership.role);
    });
    return roles;
  }, [organizationMemberships]);
  const isManagerRole = (role?: OrganizationRole | null) => (
    role === 'owner' || role === 'admin' || role === 'platform_admin'
  );

  const availableWorkspaces = isAdmin
    ? allWorkspaces
    : allWorkspaces.filter(w => directWorkspaceIdSet.has(w.id));

  const allAvailableWorkspaces = visibleWorkspaces.filter((workspace) => {
    const role = roleByOrganization.get(workspace.organization_id);
    return isManagerRole(role) || directWorkspaceIdSet.has(workspace.id);
  });
  const hasExternalOrganizationMembership = organizationMemberships.some(
    (membership) => membership.organization_id !== profile?.organization_id
  );

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setSelectedOrganizationId(null);
      setSelectedWorkspaceId(null);
      manualOrganizationSelectionRef.current = false;
      return;
    }

    manualOrganizationSelectionRef.current = false;
    setSelectedOrganizationId(localStorage.getItem(getOrganizationStorageKey(userId)!) || null);
    setSelectedWorkspaceId(localStorage.getItem(getWorkspaceStorageKey(userId)!) || null);
  }, [userId]);

  useEffect(() => {
    if (!userId || !organizationMemberships.length) return;
    const validOrganizationIds = new Set(organizationMemberships.map((membership) => membership.organization_id));
    const selectedOrganizationIsValid = selectedOrganizationId ? validOrganizationIds.has(selectedOrganizationId) : false;
    const organizationsWithDirectWorkspace = new Set(userWorkspaceAccess.map((access) => access.organization_id));
    const selectedOrganizationHasDirectWorkspace = selectedOrganizationId
      ? organizationsWithDirectWorkspace.has(selectedOrganizationId)
      : false;
    const selectedRole = selectedOrganizationId ? roleByOrganization.get(selectedOrganizationId) : null;
    const shouldPreferAssignedWorkspace = Boolean(
      !manualOrganizationSelectionRef.current
      && organizationsWithDirectWorkspace.size > 0
      && (!selectedOrganizationIsValid || (!selectedOrganizationHasDirectWorkspace && !isManagerRole(selectedRole)))
    );

    if (!selectedOrganizationIsValid || shouldPreferAssignedWorkspace) {
      const nextOrganizationId = Array.from(organizationsWithDirectWorkspace)
        .find((organizationId) => validOrganizationIds.has(organizationId))
        || organizationMemberships[0].organization_id;
      setSelectedOrganizationId(nextOrganizationId);
      localStorage.setItem(getOrganizationStorageKey(userId)!, nextOrganizationId);
    }
  }, [organizationMemberships, roleByOrganization, selectedOrganizationId, userId, userWorkspaceAccess]);

  // Auto-select first workspace for non-admins if none selected
  useEffect(() => {
    if (!isAdmin && availableWorkspaces.length > 0 && !selectedWorkspaceId) {
      const nextWorkspaceId = availableWorkspaces[0].id;
      setSelectedWorkspaceId(nextWorkspaceId);
      const key = getWorkspaceStorageKey(userId);
      if (key) localStorage.setItem(key, nextWorkspaceId);
    }
  }, [isAdmin, availableWorkspaces, selectedWorkspaceId, userId]);

  // Clear selection if workspace no longer available
  useEffect(() => {
    if (selectedWorkspaceId && selectedWorkspaceId !== 'unassigned' && availableWorkspaces.length > 0) {
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
    const targetWorkspace = id ? allAvailableWorkspaces.find((workspace) => workspace.id === id) : null;
    if (targetWorkspace && targetWorkspace.organization_id !== activeOrganizationId) {
      setSelectedOrganizationId(targetWorkspace.organization_id);
      const organizationStorageKey = getOrganizationStorageKey(userId);
      if (organizationStorageKey) localStorage.setItem(organizationStorageKey, targetWorkspace.organization_id);
    }
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
    manualOrganizationSelectionRef.current = true;
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
  const validOrganizationIds = new Set(organizationMemberships.map((membership) => membership.organization_id));
  const organizationsWithDirectWorkspace = new Set(userWorkspaceAccess.map((access) => access.organization_id));
  const selectedOrganizationIsValid = selectedOrganizationId ? validOrganizationIds.has(selectedOrganizationId) : false;
  const selectedOrganizationHasDirectWorkspace = selectedOrganizationId
    ? organizationsWithDirectWorkspace.has(selectedOrganizationId)
    : false;
  const organizationSelectionPending = Boolean(
    userId
    && organizationMemberships.length > 0
    && !manualOrganizationSelectionRef.current
    && organizationsWithDirectWorkspace.size > 0
    && (!selectedOrganizationIsValid || (!selectedOrganizationHasDirectWorkspace && !isManagerRole(currentOrganizationRole)))
  );

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
        allAvailableWorkspaces,
        setOrganization,
        setWorkspace,
        isAdmin,
        canManageOrganization,
        hasExternalOrganizationMembership,
        loading: loadingOrganizations || loadingWorkspaces || loadingVisibleWorkspaces || loadingMembership || organizationSelectionPending,
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
      allAvailableWorkspaces: [],
      setOrganization: () => {},
      setWorkspace: () => {},
      isAdmin: false,
      canManageOrganization: false,
      hasExternalOrganizationMembership: false,
      loading: true,
    } as WorkspaceContextType;
  }
  return context;
}

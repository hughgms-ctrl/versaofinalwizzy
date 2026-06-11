import React, { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import PlanUpgradePanel from "@/components/billing/PlanUpgradePanel";
import { trackEntryEvent } from "@/lib/entryFlow";
import { trackMetaEvent } from "@/lib/metaPixel";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useOrganizationPlan } from "@/hooks/useOrganizationPlan";
import { useCurrentUserRole, useUserPermissions } from "@/hooks/useUserPermissions";
import { getDefaultAppRoute } from "@/lib/defaultAppRoute";

const PlansPage = () => {
  const location = useLocation();
  const { profile } = useAuth();
  const { selectedOrganizationId } = useWorkspaceContext();
  const activeOrganizationId = selectedOrganizationId || profile?.organization_id || null;
  const { canAccessModule: canAccessPlanModule, isLoading: planLoading } = useOrganizationPlan(activeOrganizationId);
  const { data: userRole, isLoading: roleLoading } = useCurrentUserRole(activeOrganizationId);
  const { data: permissions, isLoading: permissionsLoading } = useUserPermissions();
  const params = new URLSearchParams(location.search);
  const isCreateOrganizationFlow =
    params.get('intent') === 'create-organization'
    || (location.state as { reason?: string } | null)?.reason === 'create_organization';
  const appBackRoute = planLoading || roleLoading || permissionsLoading
    ? '/dashboard'
    : getDefaultAppRoute({
      role: userRole,
      permissions,
      canAccessPlanModule,
    });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') {
      const purchaseKey = `meta_purchase_${params.get('plan_id') || 'unknown'}_${params.get('value') || '0'}_${params.get('billing_cycle') || 'monthly'}`;
      if (sessionStorage.getItem(purchaseKey) !== '1') {
        trackMetaEvent('Purchase', {
          content_ids: params.get('plan_id') || undefined,
          content_name: params.get('plan_slug') || undefined,
          content_type: 'subscription_plan',
          currency: params.get('currency') || 'BRL',
          value: Number(params.get('value') || 0),
          billing_cycle: params.get('billing_cycle') || undefined,
        });
        sessionStorage.setItem(purchaseKey, '1');
      }
      trackEntryEvent('payment_completed', { source: 'checkout_return' }).catch(() => undefined);
    }
  }, []);

  return (
    <MainLayout
      hideSidebar={isCreateOrganizationFlow}
      showSearch={!isCreateOrganizationFlow}
      backTo={isCreateOrganizationFlow ? appBackRoute : undefined}
      backLabel="Voltar ao workspace"
    >
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">
            {isCreateOrganizationFlow ? 'Assine o Wizzy' : 'Planos e Assinatura'}
          </h1>
          <p className="text-muted-foreground">
            {isCreateOrganizationFlow
              ? 'Crie sua propria organizacao para usar todos os recursos do Wizzy.'
              : 'Escolha ou altere o plano do workspace.'}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Carregamento dos planos ativo.</p>
        </div>
        <PlanUpgradePanel />
      </div>
    </MainLayout>
  );
};

export default PlansPage;

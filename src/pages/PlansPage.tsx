import React from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import PlanUpgradePanel from "@/components/billing/PlanUpgradePanel";

const PlansPage = () => {
  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Planos e Assinatura</h1>
          <p className="text-muted-foreground">Gerencie seu plano e faça upgrade para desbloquear mais recursos.</p>
        </div>
        <PlanUpgradePanel />
      </div>
    </MainLayout>
  );
};

export default PlansPage;

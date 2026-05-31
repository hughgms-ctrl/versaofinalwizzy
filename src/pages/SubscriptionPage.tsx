import { MainLayout } from "@/components/layout/MainLayout";
import { SubscriptionManagementPanel } from "@/components/billing/SubscriptionManagementPanel";

const SubscriptionPage = () => {
  return (
    <MainLayout title="Assinatura" subtitle="Gerencie plano, pagamentos e faturas do workspace">
      <div className="mx-auto max-w-6xl">
        <SubscriptionManagementPanel />
      </div>
    </MainLayout>
  );
};

export default SubscriptionPage;

import { AIChatPanel } from "@/fluzz/components/ai/AIChatPanel";
import { AppLayout } from "@/fluzz/components/layout/AppLayout";

export default function AIAssistant() {
  return (
    <AppLayout>
      <div className="h-[calc(100vh-4rem)]">
        <AIChatPanel className="h-full" />
      </div>
    </AppLayout>
  );
}

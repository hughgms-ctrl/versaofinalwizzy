import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOrganizationPlan } from '@/hooks/useOrganizationPlan';
import { useOpenAIUsageStatus } from '@/hooks/useOpenAIUsageStatus';

function formatBytes(bytes: number) {
  if (!bytes) return '0 GB';
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

export function PlanUsageAlert() {
  const navigate = useNavigate();
  const { usage, planName, isWizzyAI } = useOrganizationPlan();
  const { data: openAIUsage } = useOpenAIUsageStatus(!isWizzyAI);

  const isOpenAINearLimit = Boolean(openAIUsage?.usage?.is_near_limit);

  if (!usage?.requiresOpenAIKey && !usage?.isStorageNearLimit && !usage?.isTeamNearLimit && !usage?.isWorkspaceNearLimit && !usage?.isWhatsappNumberNearLimit && !usage?.isAINearLimit && !isOpenAINearLimit) return null;

  const messages = [
    usage.requiresOpenAIKey
      ? 'OpenAI: chave de API pendente'
      : null,
    usage.isTeamNearLimit && usage.teamLimit > 0
      ? `Membros: ${usage.teamCount}/${usage.teamLimit} (${usage.teamUsagePercent}%)`
      : null,
    usage.isWorkspaceNearLimit && usage.workspaceLimit > 0
      ? `Workspaces: ${usage.workspaceCount}/${usage.workspaceLimit} (${usage.workspaceUsagePercent}%)`
      : null,
    usage.isWhatsappNumberNearLimit && usage.whatsappNumberLimit > 0
      ? `Números: ${usage.whatsappNumberCount}/${usage.whatsappNumberLimit} (${usage.whatsappNumberUsagePercent}%)`
      : null,
    usage.isStorageNearLimit && usage.storageLimit > 0
      ? `Storage: ${formatBytes(usage.storageUsed)} de ${formatBytes(usage.storageLimit)} (${usage.storageUsagePercent}%)`
      : null,
    usage.isAINearLimit && usage.aiRequestLimit > 0
      ? `IA: ${usage.aiRequestsUsed}/${usage.aiRequestLimit} req. (${usage.aiUsagePercent}%)`
      : null,
    isOpenAINearLimit
      ? `OpenAI: US$ ${Number(openAIUsage?.usage?.used_usd || 0).toFixed(2)} usados (${openAIUsage?.usage?.usage_percent || 0}%)`
      : null,
  ].filter(Boolean);

  const isCritical = usage.isStorageAtLimit || usage.isTeamAtLimit || usage.isWorkspaceAtLimit || usage.isWhatsappNumberAtLimit || usage.isAIAtLimit || Boolean(openAIUsage?.usage?.is_at_limit);
  const primaryAction = usage.requiresOpenAIKey || isOpenAINearLimit ? 'Configurar IA' : 'Ver upgrade';
  const primaryRoute = usage.requiresOpenAIKey || isOpenAINearLimit ? '/integrations' : '/plans';
  const showAIBar = (usage.isAINearLimit && usage.aiRequestLimit > 0) || isOpenAINearLimit;
  const aiBarPercent = isOpenAINearLimit
    ? Math.min(Number(openAIUsage?.usage?.usage_percent || 0), 100)
    : Math.min(usage.aiUsagePercent, 100);

  return (
    <div className="border-b bg-amber-500/10 px-3 py-2 text-sm text-amber-900 md:px-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {isCritical ? 'Seu plano chegou ao limite de uso' : 'Seu plano esta perto do limite'}
            </p>
            <p className="text-xs text-amber-800">
              Plano {planName || 'atual'} - {messages.join(' - ')}
            </p>
            {showAIBar && (
              <div className="mt-2 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-amber-200/80">
                <div
                  className={usage.isAIAtLimit ? 'h-full rounded-full bg-red-500' : 'h-full rounded-full bg-amber-500'}
                  style={{ width: `${aiBarPercent}%` }}
                />
              </div>
            )}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate(primaryRoute)} className="w-fit gap-2 border-amber-500/40 bg-background">
          {primaryAction}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

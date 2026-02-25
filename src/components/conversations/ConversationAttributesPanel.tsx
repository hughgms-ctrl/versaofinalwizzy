import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, CheckSquare, Building2, Share2, User, Bot, Hand } from 'lucide-react';
import { DbConversation } from '@/hooks/useConversations';
import {
  useConversationStatuses,
  useDepartments,
  useLeadSources,
  useAIAgents,
  useUpdateConversationAttributes,
  useInterveneConversation,
} from '@/hooks/useCrmEntities';
import { useProfiles } from '@/hooks/useConversations';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface ConversationAttributesPanelProps {
  conversation: DbConversation & {
    service_mode?: 'ia' | 'ativo' | 'pendente' | 'arquivado';
    conversation_status_id?: string | null;
    department_id?: string | null;
    lead_source_id?: string | null;
    ai_agent_id?: string | null;
  };
  compact?: boolean;
}

const serviceModeLabels: Record<string, { label: string; color: string }> = {
  ia: { label: 'IA', color: 'bg-purple-500/10 text-purple-500' },
  ativo: { label: 'Ativo', color: 'bg-green-500/10 text-green-500' },
  pendente: { label: 'Pendente', color: 'bg-yellow-500/10 text-yellow-500' },
  arquivado: { label: 'Arquivado', color: 'bg-muted text-muted-foreground' },
};

export function ConversationAttributesPanel({ 
  conversation, 
  compact = false 
}: ConversationAttributesPanelProps) {
  const { profile } = useAuth();
  const { data: statuses = [], isLoading: loadingStatuses } = useConversationStatuses();
  const { data: departments = [], isLoading: loadingDepartments } = useDepartments();
  const { data: leadSources = [], isLoading: loadingLeadSources } = useLeadSources();
  const { data: aiAgents = [], isLoading: loadingAgents } = useAIAgents();
  const { data: profiles = [] } = useProfiles();
  
  const updateAttributes = useUpdateConversationAttributes();
  const intervene = useInterveneConversation();

  const [localValues, setLocalValues] = useState({
    statusId: conversation.conversation_status_id || '',
    departmentId: conversation.department_id || '',
    leadSourceId: conversation.lead_source_id || '',
    assignedTo: conversation.assigned_to || '',
  });

  // Sync local state when conversation changes
  useEffect(() => {
    setLocalValues({
      statusId: conversation.conversation_status_id || '',
      departmentId: conversation.department_id || '',
      leadSourceId: conversation.lead_source_id || '',
      assignedTo: conversation.assigned_to || '',
    });
  }, [conversation.id, conversation.conversation_status_id, conversation.department_id, conversation.lead_source_id, conversation.assigned_to]);

  const handleUpdate = (field: string, value: string | null) => {
    const fieldMap: Record<string, string> = {
      statusId: 'conversation_status_id',
      departmentId: 'department_id',
      leadSourceId: 'lead_source_id',
      assignedTo: 'assigned_to',
    };

    updateAttributes.mutate({
      conversationId: conversation.id,
      data: { [fieldMap[field]]: value || null },
    });
  };

  const currentServiceMode = (conversation as any).service_mode || 'pendente';
  const modeInfo = serviceModeLabels[currentServiceMode];

  const isLoading = loadingStatuses || loadingDepartments || loadingLeadSources || loadingAgents;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", compact && "space-y-3")}>
      {/* Service Mode Badge */}
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Modo de Atendimento</Label>
        <Badge className={cn("text-xs", modeInfo?.color)}>
          {currentServiceMode === 'ia' && <Bot className="h-3 w-3 mr-1" />}
          {currentServiceMode === 'ativo' && <User className="h-3 w-3 mr-1" />}
          {modeInfo?.label || currentServiceMode}
        </Badge>
      </div>

      {/* Intervene Button */}
      {currentServiceMode === 'ia' && (
        <Button
          onClick={() => intervene.mutate(conversation.id)}
          disabled={intervene.isPending}
          className="w-full"
          variant="outline"
        >
          {intervene.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Hand className="h-4 w-4 mr-2" />
          )}
          Intervir na Conversa
        </Button>
      )}

      <Separator />

      {/* Status */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
          <CheckSquare className="h-3.5 w-3.5" />
          Status
        </Label>
        <Select
          value={localValues.statusId || 'none'}
          onValueChange={(value) => {
            const newValue = value === 'none' ? '' : value;
            setLocalValues(prev => ({ ...prev, statusId: newValue }));
            handleUpdate('statusId', newValue || null);
          }}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Selecionar status..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              <span className="text-muted-foreground">Nenhum</span>
            </SelectItem>
            {statuses.map((status) => (
              <SelectItem key={status.id} value={status.id}>
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: status.color }} 
                  />
                  {status.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Department */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5" />
          Departamento
        </Label>
        <Select
          value={localValues.departmentId || 'none'}
          onValueChange={(value) => {
            const newValue = value === 'none' ? '' : value;
            setLocalValues(prev => ({ ...prev, departmentId: newValue }));
            handleUpdate('departmentId', newValue || null);
          }}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Selecionar departamento..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              <span className="text-muted-foreground">Nenhum</span>
            </SelectItem>
            {departments.map((dept) => (
              <SelectItem key={dept.id} value={dept.id}>
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: dept.color }} 
                  />
                  {dept.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Lead Source */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Share2 className="h-3.5 w-3.5" />
          Origem
        </Label>
        <Select
          value={localValues.leadSourceId || 'none'}
          onValueChange={(value) => {
            const newValue = value === 'none' ? '' : value;
            setLocalValues(prev => ({ ...prev, leadSourceId: newValue }));
            handleUpdate('leadSourceId', newValue || null);
          }}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Selecionar origem..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              <span className="text-muted-foreground">Nenhum</span>
            </SelectItem>
            {leadSources.map((source) => (
              <SelectItem key={source.id} value={source.id}>
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: source.color }} 
                  />
                  {source.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Assigned To */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
          <User className="h-3.5 w-3.5" />
          Responsável
        </Label>
        <Select
          value={localValues.assignedTo || 'none'}
          onValueChange={(value) => {
            const newValue = value === 'none' ? '' : value;
            setLocalValues(prev => ({ ...prev, assignedTo: newValue }));
            handleUpdate('assignedTo', newValue || null);
          }}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Selecionar responsável..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              <span className="text-muted-foreground">Não atribuído</span>
            </SelectItem>
            {/* Human agents */}
            {profiles.map((p) => (
              <SelectItem key={p.user_id} value={p.user_id}>
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  {p.full_name}
                  {p.user_id === profile?.user_id && (
                    <span className="text-xs text-muted-foreground">(você)</span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {updateAttributes.isPending && (
        <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Salvando...
        </div>
      )}
    </div>
  );
}

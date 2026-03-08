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
import { Loader2, Building2, Share2, User, Bot, Hand, Check, GitBranch } from 'lucide-react';
import { DbConversation } from '@/hooks/useConversations';
import {
  useDepartments,
  useLeadSources,
  useUpdateConversationAttributes,
  useInterveneConversation,
} from '@/hooks/useCrmEntities';
import { useProfiles } from '@/hooks/useConversations';
import { useAuth } from '@/hooks/useAuth';
import { usePipelines, usePipelineColumns, useConversationPositions, useMoveConversation } from '@/hooks/usePipelines';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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

const serviceModeLabels: Record<string, { label: string; color: string; icon: typeof Bot }> = {
  ia: { label: 'IA', color: 'bg-purple-500/10 text-purple-500 border-purple-500/20', icon: Bot },
  ativo: { label: 'Humano', color: 'bg-green-500/10 text-green-500 border-green-500/20', icon: User },
  pendente: { label: 'Pendente', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', icon: User },
  arquivado: { label: 'Arquivado', color: 'bg-muted text-muted-foreground border-border', icon: User },
};

export function ConversationAttributesPanel({ 
  conversation, 
  compact = false 
}: ConversationAttributesPanelProps) {
  const { profile, session } = useAuth();
  const { data: departments = [], isLoading: loadingDepartments } = useDepartments();
  const { data: leadSources = [], isLoading: loadingLeadSources } = useLeadSources();
  const { data: profiles = [] } = useProfiles();
  const { data: pipelines = [] } = usePipelines();
  
  const updateAttributes = useUpdateConversationAttributes();
  const intervene = useInterveneConversation();
  const moveConversation = useMoveConversation();

  // Find which pipeline this conversation is currently in
  const { data: allPositions = [] } = useQuery({
    queryKey: ['all-conversation-positions', conversation.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversation_pipeline_positions')
        .select('*')
        .eq('conversation_id', conversation.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!session && !!conversation.id,
  });

  // Determine active pipeline: the one where the conversation has a position, or first pipeline
  const positionPipelineId = allPositions.length > 0 ? allPositions[0].pipeline_id : null;
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);

  useEffect(() => {
    if (positionPipelineId) {
      setSelectedPipelineId(positionPipelineId);
    } else if (pipelines.length > 0) {
      setSelectedPipelineId(pipelines[0].id);
    }
  }, [positionPipelineId, pipelines]);

  const activePipeline = pipelines.find(p => p.id === selectedPipelineId) || null;
  const { data: columns = [] } = usePipelineColumns(activePipeline?.id || null);
  const { data: positions = [] } = useConversationPositions(activePipeline?.id || null);

  const currentPosition = positions.find(p => p.conversation_id === conversation.id);
  const currentColumnId = currentPosition?.column_id || null;

  const [localValues, setLocalValues] = useState({
    departmentId: conversation.department_id || '',
    leadSourceId: conversation.lead_source_id || '',
    assignedTo: conversation.assigned_to || '',
  });

  useEffect(() => {
    setLocalValues({
      departmentId: conversation.department_id || '',
      leadSourceId: conversation.lead_source_id || '',
      assignedTo: conversation.assigned_to || '',
    });
  }, [conversation.id, conversation.department_id, conversation.lead_source_id, conversation.assigned_to]);

  const handleUpdate = (field: string, value: string | null) => {
    const fieldMap: Record<string, string> = {
      departmentId: 'department_id',
      leadSourceId: 'lead_source_id',
      assignedTo: 'assigned_to',
    };

    updateAttributes.mutate({
      conversationId: conversation.id,
      data: { [fieldMap[field]]: value || null },
    });
  };

  const handleStageClick = (columnId: string) => {
    if (!activePipeline || columnId === currentColumnId) return;
    moveConversation.mutate({
      conversationId: conversation.id,
      pipelineId: activePipeline.id,
      columnId,
    });
  };

  const handlePipelineChange = (newPipelineId: string) => {
    if (newPipelineId === selectedPipelineId) return;
    setSelectedPipelineId(newPipelineId);
  };

  const currentServiceMode = (conversation as any).service_mode || 'pendente';
  const modeInfo = serviceModeLabels[currentServiceMode];

  const isLoading = loadingDepartments || loadingLeadSources;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", compact && "space-y-3")}>
      {/* Service Mode + Intervene */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge className={cn("text-xs border", modeInfo?.color)}>
            {currentServiceMode === 'ia' && <Bot className="h-3 w-3 mr-1" />}
            {currentServiceMode !== 'ia' && <User className="h-3 w-3 mr-1" />}
            {modeInfo?.label || currentServiceMode}
          </Badge>
        </div>
        {currentServiceMode === 'ia' && (
          <Button
            onClick={() => intervene.mutate(conversation.id)}
            disabled={intervene.isPending}
            size="sm"
            variant="outline"
            className="h-7 text-xs"
          >
            {intervene.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <Hand className="h-3 w-3 mr-1" />
                Intervir
              </>
            )}
          </Button>
        )}
      </div>

      {/* Pipeline Selector + Stage Stepper */}
      {pipelines.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <GitBranch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Select
              value={selectedPipelineId || ''}
              onValueChange={handlePipelineChange}
            >
              <SelectTrigger className="h-7 text-xs flex-1 border-none bg-muted/50 hover:bg-muted">
                <SelectValue placeholder="Pipeline..." />
              </SelectTrigger>
              <SelectContent>
                {pipelines.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {activePipeline && columns.length > 0 && (
            <TooltipProvider delayDuration={200}>
              <div className="flex items-center gap-0.5">
                {columns.map((col, idx) => {
                  const isActive = col.id === currentColumnId;
                  const isPast = currentColumnId 
                    ? columns.findIndex(c => c.id === currentColumnId) > idx
                    : false;

                  return (
                    <Tooltip key={col.id}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => handleStageClick(col.id)}
                          disabled={moveConversation.isPending}
                          className={cn(
                            "flex-1 h-7 relative flex items-center justify-center text-[10px] font-medium transition-all rounded-sm",
                            isActive 
                              ? "text-white shadow-sm" 
                              : isPast 
                                ? "text-white/80" 
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                          )}
                          style={isActive || isPast ? { backgroundColor: col.color } : undefined}
                        >
                          {isPast && !isActive && (
                            <Check className="h-3 w-3" />
                          )}
                          {isActive && (
                            <span className="truncate px-1">{col.name}</span>
                          )}
                          {!isActive && !isPast && (
                            <span className="truncate px-1 opacity-70">{col.name}</span>
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        {col.name}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>
          )}
        </div>
      )}

      {/* Compact Attributes Grid */}
      <div className="space-y-2.5">
        {/* Responsável */}
        <div className="flex items-center gap-2">
          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Select
            value={localValues.assignedTo || 'none'}
            onValueChange={(value) => {
              const newValue = value === 'none' ? '' : value;
              setLocalValues(prev => ({ ...prev, assignedTo: newValue }));
              handleUpdate('assignedTo', newValue || null);
            }}
          >
            <SelectTrigger className="h-7 text-xs flex-1 border-none bg-muted/50 hover:bg-muted">
              <SelectValue placeholder="Responsável..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <span className="text-muted-foreground">Não atribuído</span>
              </SelectItem>
              {profiles.map((p) => (
                <SelectItem key={p.user_id} value={p.user_id}>
                  {p.full_name}
                  {p.user_id === profile?.user_id ? ' (você)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Departamento */}
        <div className="flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Select
            value={localValues.departmentId || 'none'}
            onValueChange={(value) => {
              const newValue = value === 'none' ? '' : value;
              setLocalValues(prev => ({ ...prev, departmentId: newValue }));
              handleUpdate('departmentId', newValue || null);
            }}
          >
            <SelectTrigger className="h-7 text-xs flex-1 border-none bg-muted/50 hover:bg-muted">
              <SelectValue placeholder="Departamento..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <span className="text-muted-foreground">Nenhum</span>
              </SelectItem>
              {departments.map((dept) => (
                <SelectItem key={dept.id} value={dept.id}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: dept.color }} />
                    {dept.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Origem */}
        <div className="flex items-center gap-2">
          <Share2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Select
            value={localValues.leadSourceId || 'none'}
            onValueChange={(value) => {
              const newValue = value === 'none' ? '' : value;
              setLocalValues(prev => ({ ...prev, leadSourceId: newValue }));
              handleUpdate('leadSourceId', newValue || null);
            }}
          >
            <SelectTrigger className="h-7 text-xs flex-1 border-none bg-muted/50 hover:bg-muted">
              <SelectValue placeholder="Origem..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <span className="text-muted-foreground">Nenhum</span>
              </SelectItem>
              {leadSources.map((source) => (
                <SelectItem key={source.id} value={source.id}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: source.color }} />
                    {source.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {updateAttributes.isPending && (
        <div className="flex items-center justify-center py-1 text-[10px] text-muted-foreground">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Salvando...
        </div>
      )}
    </div>
  );
}

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Save, 
  Play, 
  Undo, 
  Redo, 
  ZoomIn, 
  ZoomOut, 
  ArrowLeft,
  Loader2,
  Settings2,
  Zap,
  Hand,
  MessageSquareText,
  UserPlus,
  Webhook
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { TriggerType } from './TriggerConfigDialog';
import { cn } from '@/lib/utils';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const triggerLabels: Record<TriggerType, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  manual: { label: 'Manual', icon: Hand },
  keyword: { label: 'Palavra-chave', icon: MessageSquareText },
  new_conversation: { label: 'Nova Conversa', icon: UserPlus },
  webhook: { label: 'Webhook', icon: Webhook },
};

interface FlowToolbarProps {
  flowName: string;
  onNameChange: (name: string) => void;
  isActive: boolean;
  onActiveChange: (active: boolean) => void;
  isSaving: boolean;
  onSave: () => void;
  onTest?: () => void;
  canTest?: boolean;
  hasUnsavedChanges?: boolean;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  triggerType?: TriggerType;
  onOpenTriggerConfig?: () => void;
  workspaceId?: string | null;
  onWorkspaceChange?: (id: string | null) => void;
}

export function FlowToolbar({
  flowName,
  onNameChange,
  isActive,
  onActiveChange,
  isSaving,
  onSave,
  onTest,
  canTest = true,
  hasUnsavedChanges = false,
  onZoomIn,
  onZoomOut,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  triggerType = 'manual',
  onOpenTriggerConfig,
  workspaceId,
  onWorkspaceChange,
}: FlowToolbarProps) {
  const navigate = useNavigate();
  const { availableWorkspaces, isAdmin } = useWorkspaceContext();
  const TriggerIcon = triggerLabels[triggerType]?.icon || Hand;

  return (
    <div className="flex items-center gap-2">
      <Button 
        size="sm" 
        variant="ghost" 
        onClick={() => navigate('/flows')}
        className="gap-1.5"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>

      <div className="w-px h-6 bg-border" />

      <Input
        value={flowName}
        onChange={(e) => onNameChange(e.target.value)}
        className="h-8 w-48 text-sm font-medium"
        placeholder="Nome do fluxo"
      />

      <div className="w-px h-6 bg-border" />

      <Button 
        size="sm" 
        variant="outline" 
        className="gap-1.5"
        onClick={onUndo}
        disabled={!canUndo}
      >
        <Undo className="h-4 w-4" />
      </Button>
      <Button 
        size="sm" 
        variant="outline" 
        className="gap-1.5"
        onClick={onRedo}
        disabled={!canRedo}
      >
        <Redo className="h-4 w-4" />
      </Button>
      <Button 
        size="sm" 
        variant="outline" 
        className="gap-1.5"
        onClick={onZoomIn}
      >
        <ZoomIn className="h-4 w-4" />
      </Button>
      <Button 
        size="sm" 
        variant="outline" 
        className="gap-1.5"
        onClick={onZoomOut}
      >
        <ZoomOut className="h-4 w-4" />
      </Button>

      <div className="w-px h-6 bg-border mx-1" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="gap-1.5">
            <Settings2 className="h-4 w-4" />
            Configurações
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Configurações do Fluxo</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="p-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="active-toggle" className="text-sm">
                Fluxo Ativo
              </Label>
              <Switch
                id="active-toggle"
                checked={isActive}
                onCheckedChange={onActiveChange}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {isActive ? 'O fluxo será executado quando acionado' : 'O fluxo está pausado'}
            </p>
          </div>
          <DropdownMenuSeparator />
          <div className="p-2">
            <Label className="text-sm mb-1.5 block">Workspace</Label>
            {isAdmin ? (
              <Select
                value={workspaceId || 'all'}
                onValueChange={(val) => onWorkspaceChange?.(val === 'all' ? null : val)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Workspaces</SelectItem>
                  {availableWorkspaces.map(ws => (
                    <SelectItem key={ws.id} value={ws.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: ws.color }}
                        />
                        {ws.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded border border-input bg-muted/50 text-xs">
                {(() => {
                  const ws = availableWorkspaces.find(w => w.id === workspaceId);
                  if (ws) {
                    return (
                      <>
                        <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: ws.color }} />
                        {ws.name}
                      </>
                    );
                  }
                  return <span className="text-muted-foreground">Todos os Workspaces</span>;
                })()}
              </div>
            )}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onOpenTriggerConfig}>
            <Zap className="h-4 w-4 mr-2" />
            Configurar Gatilho
          </DropdownMenuItem>
          <DropdownMenuItem>
            Variáveis
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Trigger Badge */}
      <Badge variant="outline" className="gap-1.5 px-2 py-1">
        <TriggerIcon className="h-3 w-3" />
        <span className="text-xs">{triggerLabels[triggerType]?.label}</span>
      </Badge>

      <Button 
        size="sm" 
        variant="outline" 
        className="gap-1.5"
        onClick={onTest}
        disabled={!canTest}
        title={!canTest ? 'Salve o fluxo para poder testar' : 'Testar fluxo'}
      >
        <Play className="h-4 w-4" />
        Testar
      </Button>

      <Button 
        size="sm" 
        className={cn(
          "gap-1.5",
          hasUnsavedChanges && !isSaving && "bg-amber-600 hover:bg-amber-700"
        )}
        onClick={onSave}
        disabled={isSaving}
      >
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {hasUnsavedChanges ? 'Salvar*' : 'Salvar'}
      </Button>
    </div>
  );
}

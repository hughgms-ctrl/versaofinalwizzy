import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  Hand,
  Map as MapIcon,
  MapPinned,
  Wand2,
  Sparkles,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
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
import { cn } from '@/lib/utils';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';

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
  showMinimap?: boolean;
  onMinimapToggle?: () => void;
  masterPrompt?: string;
  onMasterPromptChange?: (val: string) => void;
  isMasterActive?: boolean;
  onMasterActiveChange?: (val: boolean) => void;
  onOpenMasterPrompt?: () => void;
  onGenerateFromPrompt?: (prompt: string) => Promise<void>;
  isGenerating?: boolean;
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
  showMinimap = false,
  onMinimapToggle,
  masterPrompt = '',
  onMasterPromptChange,
  isMasterActive = false,
  onMasterActiveChange,
  onOpenMasterPrompt,
  onGenerateFromPrompt,
  isGenerating = false,
}: FlowToolbarProps) {
  const navigate = useNavigate();
  const { availableWorkspaces, isAdmin } = useWorkspaceContext();
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');

  const handleGenerate = async () => {
    if (!aiPrompt.trim() || !onGenerateFromPrompt) return;
    await onGenerateFromPrompt(aiPrompt.trim());
    setShowAIDialog(false);
    setAiPrompt('');
  };

  return (
    <>
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
        <Button
          size="sm"
          variant={showMinimap ? "default" : "outline"}
          className={cn("gap-1.5 transition-colors", showMinimap && "bg-indigo-600 hover:bg-indigo-700")}
          onClick={onMinimapToggle}
          title={showMinimap ? "Esconder Minimapa" : "Mostrar Minimapa"}
        >
          {showMinimap ? <MapPinned className="h-4 w-4" /> : <MapIcon className="h-4 w-4" />}
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        {/* AI Generate Button */}
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-900/30"
          onClick={() => setShowAIDialog(true)}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Gerar com IA
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
              <Label className="text-sm mb-1.5 block">Informações</Label>
              <p className="text-[10px] text-muted-foreground italic px-2">
                Utilize as Campanhas para definir os gatilhos de entrada deste fluxo.
              </p>
            </div>
            <DropdownMenuSeparator />
            <div className="p-2 space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="master-toggle" className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                  Prompt Mestre
                </Label>
                <Switch
                  id="master-toggle"
                  checked={isMasterActive}
                  onCheckedChange={onMasterActiveChange}
                />
              </div>
              <p className="text-[10px] text-muted-foreground leading-tight">
                Ativa regras globais de personalidade e comportamento para todos os agentes.
              </p>
              {isMasterActive && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-8 text-xs gap-1.5 border-indigo-200 bg-indigo-50/30 hover:bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-900/20 dark:text-indigo-400"
                  onClick={onOpenMasterPrompt}
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Editar Prompt Mestre
                </Button>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

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

      {/* AI Generate Dialog */}
      <Dialog open={showAIDialog} onOpenChange={setShowAIDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-600" />
              Gerar Fluxo com IA
            </DialogTitle>
            <DialogDescription>
              Descreva o fluxo que deseja criar e a IA montará a estrutura automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Ex: Crie um fluxo de qualificação de leads com 3 perguntas sobre orçamento, prazo e necessidade. Se qualificado, transfira para um agente humano. Se não, envie uma mensagem de agradecimento."
              className="min-h-[120px] resize-none"
            />
            <p className="text-xs text-muted-foreground">
              💡 Quanto mais detalhes você fornecer, melhor será o resultado. Mencione agentes, tags e pipelines existentes se quiser que sejam usados.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAIDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={!aiPrompt.trim() || isGenerating}
              className="gap-1.5 bg-violet-600 hover:bg-violet-700"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {isGenerating ? 'Gerando...' : 'Gerar Fluxo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

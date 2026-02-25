import { Save, ZoomIn, ZoomOut, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';

interface OrchestratorToolbarProps {
  name: string;
  onNameChange: (name: string) => void;
  isActive: boolean;
  onActiveChange: (active: boolean) => void;
  isSaving: boolean;
  onSave: () => void;
  hasUnsavedChanges: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

export function OrchestratorToolbar({
  name,
  onNameChange,
  isActive,
  onActiveChange,
  isSaving,
  onSave,
  hasUnsavedChanges,
  onZoomIn,
  onZoomOut,
}: OrchestratorToolbarProps) {
  return (
    <div className="flex items-center gap-2 bg-card/95 backdrop-blur-sm border border-border rounded-lg px-3 py-2 shadow-lg">
      <Input
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        className="h-8 w-48 text-sm font-medium"
        placeholder="Nome do orchestrador..."
      />

      <div className="h-6 w-px bg-border" />

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Ativo</span>
        <Switch checked={isActive} onCheckedChange={onActiveChange} />
      </div>

      <div className="h-6 w-px bg-border" />

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onZoomIn}>
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onZoomOut}>
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="h-6 w-px bg-border" />

      <Button size="sm" onClick={onSave} disabled={isSaving} className="h-8 gap-1.5">
        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        Salvar
      </Button>

      {hasUnsavedChanges && (
        <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30">
          Não salvo
        </Badge>
      )}
    </div>
  );
}

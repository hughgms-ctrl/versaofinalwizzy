import { useState, useRef } from 'react';
import { Plus, Trash2, Sparkles, Loader2, Clock, Moon, Image, Video, FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

const generateId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

interface RemarketingStepsEditorProps {
  localData: Record<string, unknown>;
  handleChange: (key: string, value: unknown) => void;
}

export function RemarketingStepsEditor({ localData, handleChange }: RemarketingStepsEditorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadingStepId, setUploadingStepId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { profile } = useAuth();
  const activeStepRef = useRef<string | null>(null);
  const steps = (localData.remarketingSteps as any[]) || [];

  const quietHoursEnabled = (localData.remarketingQuietHours as boolean) || false;
  const quietStart = (localData.remarketingQuietStart as string) || '22:00';
  const quietEnd = (localData.remarketingQuietEnd as string) || '08:00';

  const handleMediaUpload = async (stepId: string, file: File) => {
    // flow-media com WRITE escopado por org (migration 20260714130000): path começa com orgId.
    const orgId = profile?.organization_id;
    if (!orgId) {
      toast.error('Sessão sem organização. Recarregue a página e tente novamente.');
      return;
    }
    setUploadingStepId(stepId);
    try {
      const ext = file.name.split('.').pop() || 'bin';
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 8);
      const fileName = `${orgId}/followup-media/${timestamp}-${randomId}.${ext}`;

      const { data, error } = await supabase.storage
        .from('flow-media')
        .upload(fileName, file, { cacheControl: '3600', upsert: false });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('flow-media')
        .getPublicUrl(data.path);

      const mediaType = file.type.startsWith('image/') ? 'image'
        : file.type.startsWith('video/') ? 'video'
        : 'document';

      const newSteps = steps.map((s: any) =>
        s.id === stepId
          ? { ...s, mediaUrl: urlData.publicUrl, mediaType, mediaName: file.name }
          : s
      );
      handleChange('remarketingSteps', newSteps);
      toast.success('Mídia anexada!');
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Erro ao enviar mídia.');
    } finally {
      setUploadingStepId(null);
    }
  };

  const removeMedia = (stepId: string) => {
    const newSteps = steps.map((s: any) =>
      s.id === stepId
        ? { ...s, mediaUrl: undefined, mediaType: undefined, mediaName: undefined }
        : s
    );
    handleChange('remarketingSteps', newSteps);
  };

  return (
    <div className="space-y-2 pt-2 border-t border-border/50">
      <Label className="text-xs font-semibold">Sequência de Follow-up</Label>
      <p className="text-[10px] text-muted-foreground">
        Cada tentativa aguarda o tempo configurado após a anterior. Se o usuário não responder, segue pela saída vermelha.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,.pdf,.doc,.docx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && activeStepRef.current) {
            if (file.size > 16 * 1024 * 1024) {
              toast.error('Arquivo deve ter no máximo 16MB.');
              return;
            }
            handleMediaUpload(activeStepRef.current, file);
          }
          e.target.value = '';
        }}
      />

      {steps.map((step: any, idx: number) => (
        <div key={step.id} className="border border-border rounded-lg p-2 space-y-2 bg-muted/30">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-muted-foreground">Tentativa {idx + 1}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-destructive"
              onClick={() => {
                const newSteps = [...steps];
                newSteps.splice(idx, 1);
                handleChange('remarketingSteps', newSteps);
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          <Select
            value={String(step.delayMinutes)}
            onValueChange={(v) => {
              const newSteps = [...steps];
              newSteps[idx] = { ...newSteps[idx], delayMinutes: parseFloat(v) };
              handleChange('remarketingSteps', newSteps);
            }}
          >
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="4.55">4m33s</SelectItem>
              <SelectItem value="10">10 min</SelectItem>
              <SelectItem value="30">30 min</SelectItem>
              <SelectItem value="60">1 hora</SelectItem>
              <SelectItem value="120">2 horas</SelectItem>
              <SelectItem value="1440">1 dia</SelectItem>
              <SelectItem value="4320">3 dias</SelectItem>
              <SelectItem value="7200">5 dias</SelectItem>
              <SelectItem value="14400">10 dias</SelectItem>
            </SelectContent>
          </Select>
          <Textarea
            value={step.message || ''}
            onChange={(e) => {
              const newSteps = [...steps];
              newSteps[idx] = { ...newSteps[idx], message: e.target.value };
              handleChange('remarketingSteps', newSteps);
            }}
            placeholder="Mensagem de follow-up..."
            className="min-h-[50px] text-xs"
          />

          {/* Media attachment */}
          {step.mediaUrl ? (
            <div className="flex items-center gap-2 p-2 rounded-md bg-background border border-border">
              {step.mediaType === 'image' ? (
                <img src={step.mediaUrl} alt="" className="h-10 w-10 rounded object-cover" />
              ) : step.mediaType === 'video' ? (
                <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center">
                  <Video className="h-5 w-5 text-primary" />
                </div>
              ) : (
                <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
              )}
              <span className="text-[10px] text-muted-foreground truncate flex-1">
                {step.mediaName || 'Mídia anexada'}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-destructive shrink-0"
                onClick={() => removeMedia(step.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[10px] gap-1.5 w-full border-dashed"
              disabled={uploadingStepId === step.id}
              onClick={() => {
                activeStepRef.current = step.id;
                fileInputRef.current?.click();
              }}
            >
              {uploadingStepId === step.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Image className="h-3 w-3" />
              )}
              {uploadingStepId === step.id ? 'Enviando...' : 'Anexar mídia (foto, vídeo, doc)'}
            </Button>
          )}
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2 border-dashed"
        onClick={() => {
          handleChange('remarketingSteps', [...steps, { id: generateId(), delayMinutes: 10, message: '' }]);
        }}
      >
        <Plus className="h-3.5 w-3.5" />
        Adicionar tentativa
      </Button>

      {/* Quiet Hours */}
      {steps.length > 0 && (
        <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Moon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] font-semibold">Horário silencioso</span>
            </div>
            <Switch
              checked={quietHoursEnabled}
              onCheckedChange={(v) => handleChange('remarketingQuietHours', v)}
            />
          </div>
          {quietHoursEnabled && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground">
                Follow-ups não serão enviados neste período. Serão reagendados para o próximo horário permitido.
              </p>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Label className="text-[10px] text-muted-foreground">Pausa às</Label>
                  <Input
                    type="time"
                    value={quietStart}
                    onChange={(e) => handleChange('remarketingQuietStart', e.target.value)}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-[10px] text-muted-foreground">Retoma às</Label>
                  <Input
                    type="time"
                    value={quietEnd}
                    onChange={(e) => handleChange('remarketingQuietEnd', e.target.value)}
                    className="h-7 text-xs"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI Generation */}
      {steps.length > 0 && (
        <div className="p-3 rounded-lg border border-dashed border-blue-500/40 bg-blue-500/5 space-y-2">
          <div className="flex items-center gap-2 text-blue-600">
            <Sparkles className="h-3.5 w-3.5" />
            <span className="text-[10px] font-semibold">Gerar mensagens com IA</span>
          </div>
          <Textarea
            value={(localData.remarketingContext as string) || ''}
            onChange={(e) => handleChange('remarketingContext', e.target.value)}
            placeholder="Contexto: ex. Estou perguntando o nome do cliente para cadastro..."
            className="min-h-[40px] text-xs"
          />
          <Button
            size="sm"
            className="w-full h-8 gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs"
            disabled={isGenerating || !localData.remarketingContext}
            onClick={async () => {
              setIsGenerating(true);
              try {
                const { data, error } = await supabase.functions.invoke('generate-remarketing-messages', {
                  body: {
                    context: localData.remarketingContext,
                    steps: steps.map((s: any) => ({
                      id: s.id,
                      delayMinutes: s.delayMinutes,
                    })),
                  }
                });
                if (error) throw error;
                if (data?.steps) {
                  // Preserve media attachments when AI regenerates text
                  const mergedSteps = data.steps.map((newStep: any) => {
                    const existing = steps.find((s: any) => s.id === newStep.id);
                    return existing
                      ? { ...newStep, mediaUrl: existing.mediaUrl, mediaType: existing.mediaType, mediaName: existing.mediaName }
                      : newStep;
                  });
                  handleChange('remarketingSteps', mergedSteps);
                  toast.success('Mensagens geradas com sucesso!');
                }
              } catch (err) {
                console.error(err);
                toast.error('Erro ao gerar mensagens com IA.');
              } finally {
                setIsGenerating(false);
              }
            }}
          >
            {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {isGenerating ? 'Gerando...' : 'Gerar mensagens'}
          </Button>
        </div>
      )}
    </div>
  );
}

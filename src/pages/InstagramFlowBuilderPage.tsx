import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useInstagramAccounts } from '@/hooks/useInstagramAccounts';
import {
  useInstagramFlow,
  useUpsertInstagramFlow,
  type InstagramFlowEdge,
  type InstagramFlowNode,
} from '@/hooks/useInstagramFlows';
import type { InstagramTriggerType } from '@/hooks/useInstagramAutomationRules';
import { InstagramFlowCanvas } from '@/components/instagram/flow/InstagramFlowCanvas';
import { InstagramMediaPicker } from '@/components/instagram/InstagramMediaPicker';

const TRIGGER_LABELS: Record<InstagramTriggerType, string> = {
  comment_keyword: 'Comentário em post',
  dm_keyword: 'Mensagem no direct',
  story_reply: 'Resposta a story',
  story_mention: 'Menção em story',
  first_message: 'Primeira mensagem',
};

/** Gatilhos em que a palavra-chave filtra o disparo. */
const KEYWORD_TRIGGERS: InstagramTriggerType[] = ['comment_keyword', 'dm_keyword', 'story_reply'];

export default function InstagramFlowBuilderPage() {
  const [searchParams] = useSearchParams();
  const flowId = searchParams.get('id');
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: accounts = [] } = useInstagramAccounts();
  const { data: existingFlow, isLoading } = useInstagramFlow(flowId);
  const upsertFlow = useUpsertInstagramFlow();

  const connectedAccounts = accounts.filter((a) => a.status === 'connected');

  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [triggerType, setTriggerType] = useState<InstagramTriggerType>('comment_keyword');
  const [keywords, setKeywords] = useState('');
  const [scope, setScope] = useState<'all_posts' | 'specific_media'>('all_posts');
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [saving, setSaving] = useState(false);

  // O grafo vive numa ref: o canvas avisa a cada arraste, e guardar isso em
  // estado re-renderizaria a página inteira a cada pixel movido.
  const graphRef = useRef<{ nodes: InstagramFlowNode[]; edges: InstagramFlowEdge[] }>({
    nodes: [],
    edges: [],
  });

  useEffect(() => {
    if (!existingFlow) return;
    setName(existingFlow.name);
    setAccountId(existingFlow.instagram_account_id);
    setTriggerType(existingFlow.trigger_type);
    setKeywords((existingFlow.trigger_config?.keywords || []).join(', '));
    setScope(existingFlow.trigger_config?.scope || 'all_posts');
    setMediaIds(existingFlow.trigger_config?.media_ids || []);
    setIsActive(existingFlow.is_active);
  }, [existingFlow]);

  useEffect(() => {
    if (!accountId && connectedAccounts.length) setAccountId(connectedAccounts[0].id);
  }, [connectedAccounts, accountId]);

  const handleGraphChange = useCallback((nodes: InstagramFlowNode[], edges: InstagramFlowEdge[]) => {
    graphRef.current = { nodes, edges };
  }, []);

  const selectedAccount = accounts.find((a) => a.id === accountId);

  const handleSave = async () => {
    if (!name.trim() || !accountId) {
      toast({ title: 'Preencha o nome e a conta', variant: 'destructive' });
      return;
    }
    if (KEYWORD_TRIGGERS.includes(triggerType) && triggerType !== 'story_reply' && !keywords.trim()) {
      toast({ title: 'Informe ao menos uma palavra-chave', variant: 'destructive' });
      return;
    }

    const { nodes, edges } = graphRef.current;
    // Um fluxo sem nenhum bloco ligado ao início não faz nada quando dispara.
    // Avisar aqui evita a automação "ativa" que nunca envia mensagem alguma.
    const startNode = nodes.find((n) => n.type === 'start');
    if (isActive && (!startNode || !edges.some((e) => e.source === startNode.id))) {
      toast({
        title: 'Ligue o primeiro bloco ao início',
        description: 'Um fluxo ativo sem bloco conectado não faz nada quando o gatilho acontece.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const saved = await upsertFlow.mutateAsync({
        id: flowId || undefined,
        instagram_account_id: accountId,
        name: name.trim(),
        trigger_type: triggerType,
        trigger_config: {
          keywords: KEYWORD_TRIGGERS.includes(triggerType)
            ? keywords.split(',').map((k) => k.trim()).filter(Boolean)
            : [],
          match_type: 'any',
          scope: triggerType === 'comment_keyword' ? scope : 'all_posts',
          media_ids: triggerType === 'comment_keyword' && scope === 'specific_media' ? mediaIds : [],
        },
        nodes,
        edges,
        is_active: isActive,
      });
      toast({ title: 'Fluxo salvo' });
      if (!flowId && saved?.id) navigate(`/tools/wizzy-engage/fluxo?id=${saved.id}`, { replace: true });
    } catch (error: any) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (flowId && isLoading) {
    return (
      <MainLayout>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/tools/wizzy-engage')}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Voltar
          </Button>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome do fluxo"
            className="max-w-xs"
          />
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label className="text-sm font-normal">{isActive ? 'Ativo' : 'Pausado'}</Label>
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </div>

        <div className="grid gap-3 rounded-lg border p-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Conta</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {connectedAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    @{account.ig_username || account.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Gatilho</Label>
            <Select value={triggerType} onValueChange={(v: InstagramTriggerType) => setTriggerType(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TRIGGER_LABELS) as InstagramTriggerType[]).map((key) => (
                  <SelectItem key={key} value={key}>{TRIGGER_LABELS[key]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {KEYWORD_TRIGGERS.includes(triggerType) && (
            <div className="space-y-1.5">
              <Label className="text-xs">
                Palavras-chave
                {triggerType === 'story_reply' && (
                  <span className="ml-1 text-muted-foreground">— opcional</span>
                )}
              </Label>
              <Input
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="quero, preço"
              />
            </div>
          )}

          {triggerType === 'comment_keyword' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Escopo</Label>
              <Select value={scope} onValueChange={(v: 'all_posts' | 'specific_media') => setScope(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_posts">Todos os posts</SelectItem>
                  <SelectItem value="specific_media">Posts específicos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {triggerType === 'comment_keyword' && scope === 'specific_media' && accountId && (
            <div className="space-y-1.5 md:col-span-3">
              <Label className="text-xs">Em quais posts</Label>
              <InstagramMediaPicker accountId={accountId} value={mediaIds} onChange={setMediaIds} />
            </div>
          )}
        </div>

        <div className="h-[calc(100vh-22rem)] min-h-[520px]">
          <InstagramFlowCanvas
            initialNodes={existingFlow?.nodes}
            initialEdges={existingFlow?.edges}
            accountUsername={selectedAccount?.ig_username}
            accountAvatarUrl={selectedAccount?.ig_profile_pic_url}
            onChange={handleGraphChange}
          />
        </div>
      </div>
    </MainLayout>
  );
}

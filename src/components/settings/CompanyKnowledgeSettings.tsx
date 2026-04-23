import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Plus, Trash2, Building2, Sparkles, Loader2, HelpCircle } from 'lucide-react';
import {
  useOrganizationKnowledge,
  useUpsertOrganizationKnowledge,
  type OrganizationKnowledge,
  type FAQItem,
} from '@/hooks/useOrganizationKnowledge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const PLACEHOLDER_HINTS: { token: string; label: string }[] = [
  { token: '{{empresa.nome}}', label: 'Nome' },
  { token: '{{empresa.site}}', label: 'Site' },
  { token: '{{empresa.telefone}}', label: 'Telefone' },
  { token: '{{empresa.email}}', label: 'Email' },
  { token: '{{empresa.endereco}}', label: 'Endereço' },
  { token: '{{empresa.horario}}', label: 'Horário' },
  { token: '{{empresa.pagamentos}}', label: 'Pagamentos' },
  { token: '{{empresa.tom}}', label: 'Tom de voz' },
  { token: '{{empresa.diferenciais}}', label: 'Diferenciais' },
  { token: '{{empresa.sobre}}', label: 'Sobre' },
  { token: '{{empresa.faqs}}', label: 'FAQs' },
];

export function CompanyKnowledgeSettings() {
  const { data, isLoading } = useOrganizationKnowledge();
  const upsert = useUpsertOrganizationKnowledge();

  const [form, setForm] = useState<Partial<OrganizationKnowledge>>({});

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const update = <K extends keyof OrganizationKnowledge>(key: K, value: OrganizationKnowledge[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const updateFaq = (idx: number, patch: Partial<FAQItem>) => {
    const faqs = [...(form.faqs || [])];
    faqs[idx] = { ...faqs[idx], ...patch };
    update('faqs', faqs);
  };

  const addFaq = () => update('faqs', [...(form.faqs || []), { question: '', answer: '' }]);
  const removeFaq = (idx: number) =>
    update(
      'faqs',
      (form.faqs || []).filter((_, i) => i !== idx),
    );

  const handleSave = () => upsert.mutate(form);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Base de conhecimento da empresa</CardTitle>
                  <CardDescription className="mt-1">
                    Preencha uma vez. Os Agentes de IA usam esses dados automaticamente nas
                    conversas via marcadores como{' '}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">{'{{empresa.nome}}'}</code>
                    .
                  </CardDescription>
                </div>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className="gap-1">
                    <Sparkles className="h-3 w-3" /> Auto-injeção
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Os dados aqui são automaticamente substituídos no prompt da IA quando ela
                  responde aos clientes.
                </TooltipContent>
              </Tooltip>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome da empresa</Label>
                <Input
                  value={form.company_name || ''}
                  onChange={(e) => update('company_name', e.target.value)}
                  placeholder="Ex: Escritório Silva & Associados"
                />
              </div>
              <div className="space-y-2">
                <Label>Site</Label>
                <Input
                  value={form.website || ''}
                  onChange={(e) => update('website', e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input
                  value={form.phone || ''}
                  onChange={(e) => update('phone', e.target.value)}
                  placeholder="(11) 99999-9999"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  value={form.email || ''}
                  onChange={(e) => update('email', e.target.value)}
                  placeholder="contato@empresa.com"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Endereço</Label>
                <Input
                  value={form.address || ''}
                  onChange={(e) => update('address', e.target.value)}
                  placeholder="Rua, número — bairro, cidade/UF"
                />
              </div>
              <div className="space-y-2">
                <Label>Horário de atendimento</Label>
                <Input
                  value={form.hours || ''}
                  onChange={(e) => update('hours', e.target.value)}
                  placeholder="Seg–Sex 9h–18h"
                />
              </div>
              <div className="space-y-2">
                <Label>Formas de pagamento</Label>
                <Input
                  value={form.payment_methods || ''}
                  onChange={(e) => update('payment_methods', e.target.value)}
                  placeholder="PIX, cartão, boleto"
                />
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Tom de voz da IA</Label>
                <Textarea
                  value={form.tone_of_voice || ''}
                  onChange={(e) => update('tone_of_voice', e.target.value)}
                  placeholder="Ex: Cordial, próximo, sem juridiquês. Trate o cliente por você."
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Diferenciais</Label>
                <Textarea
                  value={form.differentials || ''}
                  onChange={(e) => update('differentials', e.target.value)}
                  placeholder="O que torna sua empresa única?"
                  rows={3}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Sobre a empresa</Label>
                <Textarea
                  value={form.about || ''}
                  onChange={(e) => update('about', e.target.value)}
                  placeholder="Apresentação curta — quem somos, o que fazemos, para quem."
                  rows={4}
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Perguntas frequentes</Label>
                  <p className="text-xs text-muted-foreground">
                    A IA pode responder essas perguntas automaticamente.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addFaq}>
                  <Plus className="mr-1 h-4 w-4" /> Adicionar
                </Button>
              </div>
              {(form.faqs || []).length === 0 && (
                <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Nenhuma FAQ cadastrada ainda.
                </p>
              )}
              {(form.faqs || []).map((faq, idx) => (
                <div key={idx} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-start gap-2">
                    <Input
                      value={faq.question}
                      onChange={(e) => updateFaq(idx, { question: e.target.value })}
                      placeholder="Pergunta"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFaq(idx)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea
                    value={faq.answer}
                    onChange={(e) => updateFaq(idx, { answer: e.target.value })}
                    placeholder="Resposta"
                    rows={2}
                  />
                </div>
              ))}
            </div>

            <Separator />

            <div className="rounded-lg bg-muted/50 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <HelpCircle className="h-4 w-4" /> Marcadores disponíveis nos prompts da IA
              </div>
              <div className="flex flex-wrap gap-2">
                {PLACEHOLDER_HINTS.map((p) => (
                  <Tooltip key={p.token}>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="cursor-default font-mono text-xs">
                        {p.token}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>{p.label}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={upsert.isPending}>
                {upsert.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar base de conhecimento
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

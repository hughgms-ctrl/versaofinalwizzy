import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  usePlatformPackages,
  useActivatePackage,
  useActivatedPackages,
} from '@/hooks/usePlatformPackages';
import {
  useOrganizationKnowledge,
  useUpsertOrganizationKnowledge,
} from '@/hooks/useOrganizationKnowledge';
import { Loader2, ArrowRight, ArrowLeft, Check, Sparkles, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import wizzyLogo from '@/assets/wizzy-logo.png';

type Step = 1 | 2 | 3;

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [selectedObjectives, setSelectedObjectives] = useState<Set<string>>(new Set());
  const [activatingAll, setActivatingAll] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const { data: areas = [], isLoading: loadingAreas } = usePlatformPackages({ kind: 'area' });
  const { data: objectives = [] } = usePlatformPackages({
    kind: 'objective',
    parentId: selectedAreaId,
  });
  const { data: activated = [] } = useActivatedPackages();
  const activate = useActivatePackage();
  const { data: knowledge } = useOrganizationKnowledge();
  const upsertKnowledge = useUpsertOrganizationKnowledge();

  const [companyForm, setCompanyForm] = useState({
    company_name: '',
    website: '',
    phone: '',
    address: '',
    hours: '',
    payment_methods: '',
    tone_of_voice: '',
    differentials: '',
  });

  // Pre-fill from existing knowledge or org name
  useEffect(() => {
    if (knowledge) {
      setCompanyForm((prev) => ({
        ...prev,
        company_name: (knowledge as any).company_name || prev.company_name,
        website: (knowledge as any).website || prev.website,
        phone: (knowledge as any).phone || prev.phone,
        address: (knowledge as any).address || prev.address,
        hours: (knowledge as any).hours || prev.hours,
        payment_methods: (knowledge as any).payment_methods || prev.payment_methods,
        tone_of_voice: (knowledge as any).tone_of_voice || prev.tone_of_voice,
        differentials: (knowledge as any).differentials || prev.differentials,
      }));
    }
  }, [knowledge]);

  // Redirect if already onboarded
  useEffect(() => {
    if (!profile?.organization_id) return;
    (async () => {
      const { data } = await supabase
        .from('organizations')
        .select('onboarded_at')
        .eq('id', profile.organization_id)
        .maybeSingle();
      if ((data as any)?.onboarded_at) {
        navigate('/dashboard', { replace: true });
      }
    })();
  }, [profile?.organization_id, navigate]);

  const publishedAreas = areas.filter((a) => a.is_published);
  const publishedObjectives = objectives.filter((o) => o.is_published);

  // Se não há áreas disponíveis, pula o passo 1 automaticamente
  // (evita o usuário ficar preso numa tela sem opções)
  useEffect(() => {
    if (step === 1 && !loadingAreas && publishedAreas.length === 0) {
      setStep(2);
    }
  }, [step, loadingAreas, publishedAreas.length]);

  const finish = async (skipped = false) => {
    if (!profile?.organization_id) return;
    setFinishing(true);
    try {
      await supabase
        .from('organizations')
        .update({ onboarded_at: new Date().toISOString() } as never)
        .eq('id', profile.organization_id);

      toast({
        title: skipped ? 'Configuração adiada' : 'Tudo pronto!',
        description: skipped
          ? 'Você pode ativar pacotes a qualquer momento em Configurações.'
          : 'Seu workspace foi configurado com sucesso.',
      });
      navigate('/dashboard', { replace: true });
    } finally {
      setFinishing(false);
    }
  };

  const handleSaveCompany = async () => {
    await upsertKnowledge.mutateAsync(companyForm);
    setStep(3);
  };

  const handleActivateAll = async () => {
    // Sem área selecionada (ex: pulou o passo 1), apenas finaliza
    if (!selectedAreaId) {
      await finish(false);
      return;
    }
    setActivatingAll(true);
    try {
      // Always activate the area first
      if (!activated.find((a) => a.package_id === selectedAreaId)) {
        await activate.mutateAsync(selectedAreaId);
      }
      // Then each selected objective
      for (const objId of Array.from(selectedObjectives)) {
        await activate.mutateAsync(objId);
      }
      await finish(false);
    } catch (err: any) {
      toast({
        title: 'Erro durante ativação',
        description: err.message || 'Tente novamente em Configurações.',
        variant: 'destructive',
      });
    } finally {
      setActivatingAll(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={wizzyLogo} alt="Wizzy" className="h-9 w-9 rounded-lg" />
            <div>
              <p className="font-semibold">Bem-vindo ao Wizzy</p>
              <p className="text-xs text-muted-foreground">Configuração inicial em 3 passos</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => finish(true)}
            disabled={finishing}
          >
            <SkipForward className="h-4 w-4 mr-2" />
            Pular
          </Button>
        </div>
        {/* Progress */}
        <div className="container max-w-4xl mx-auto px-4 pb-4">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((n) => (
              <div key={n} className="flex-1 flex items-center gap-2">
                <div
                  className={cn(
                    'h-1.5 flex-1 rounded-full transition-colors',
                    step >= n ? 'bg-primary' : 'bg-muted'
                  )}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span className={cn(step >= 1 && 'text-foreground font-medium')}>1. Sua área</span>
            <span className={cn(step >= 2 && 'text-foreground font-medium')}>2. Sua empresa</span>
            <span className={cn(step >= 3 && 'text-foreground font-medium')}>3. Objetivos</span>
          </div>
        </div>
      </header>

      <main className="flex-1 container max-w-4xl mx-auto px-4 py-8">
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Qual a sua área de atuação?</CardTitle>
              <CardDescription>
                Escolha a vertical que melhor descreve seu negócio. Vamos preparar agentes e fluxos
                prontos pra você.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingAreas ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : publishedAreas.length === 0 ? (
                <div className="text-center py-8 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Nenhum pacote vertical disponível ainda.
                  </p>
                  <Button onClick={() => finish(true)} disabled={finishing}>
                    Continuar para o sistema
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {publishedAreas.map((area) => (
                    <button
                      key={area.id}
                      onClick={() => setSelectedAreaId(area.id)}
                      className={cn(
                        'rounded-lg border-2 p-4 text-left transition-all hover:border-primary',
                        selectedAreaId === area.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border'
                      )}
                    >
                      <div className="text-3xl mb-2">{area.icon || '📦'}</div>
                      <h3 className="font-semibold text-sm">{area.name}</h3>
                      {area.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          {area.description}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex justify-end mt-6">
                <Button
                  onClick={() => setStep(2)}
                  disabled={!selectedAreaId && publishedAreas.length > 0}
                >
                  Continuar
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Conte sobre sua empresa</CardTitle>
              <CardDescription>
                Esses dados serão usados automaticamente pelos agentes de IA. Você pode editar
                depois em Configurações → Empresa.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Nome da empresa</Label>
                  <Input
                    value={companyForm.company_name}
                    onChange={(e) =>
                      setCompanyForm({ ...companyForm, company_name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Site</Label>
                  <Input
                    placeholder="https://"
                    value={companyForm.website}
                    onChange={(e) => setCompanyForm({ ...companyForm, website: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input
                    value={companyForm.phone}
                    onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Horário de atendimento</Label>
                  <Input
                    placeholder="Seg-Sex 9h-18h"
                    value={companyForm.hours}
                    onChange={(e) => setCompanyForm({ ...companyForm, hours: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label>Endereço</Label>
                <Input
                  value={companyForm.address}
                  onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                />
              </div>

              <div>
                <Label>Formas de pagamento</Label>
                <Input
                  placeholder="Pix, Cartão, Boleto..."
                  value={companyForm.payment_methods}
                  onChange={(e) =>
                    setCompanyForm({ ...companyForm, payment_methods: e.target.value })
                  }
                />
              </div>

              <div>
                <Label>Tom de voz</Label>
                <Input
                  placeholder="Cordial e direto, evita gírias..."
                  value={companyForm.tone_of_voice}
                  onChange={(e) =>
                    setCompanyForm({ ...companyForm, tone_of_voice: e.target.value })
                  }
                />
              </div>

              <div>
                <Label>Diferenciais</Label>
                <Textarea
                  rows={2}
                  placeholder="O que destaca sua empresa..."
                  value={companyForm.differentials}
                  onChange={(e) =>
                    setCompanyForm({ ...companyForm, differentials: e.target.value })
                  }
                />
              </div>

              <div className="flex justify-between mt-4">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar
                </Button>
                <Button onClick={handleSaveCompany} disabled={upsertKnowledge.isPending}>
                  {upsertKnowledge.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Continuar
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Quais objetivos quer ativar agora?</CardTitle>
              <CardDescription>
                Cada objetivo cria um conjunto de fluxos, agentes e tags prontos. Você pode ativar
                mais depois em Configurações → Pacotes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedAreaId ? (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <Sparkles className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Nenhum pacote pronto está disponível no momento.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Você pode começar a usar o sistema normalmente. Quando houver pacotes prontos,
                    você poderá ativá-los em Configurações → Pacotes.
                  </p>
                </div>
              ) : publishedObjectives.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <Sparkles className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Nenhum objetivo disponível para esta área.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Vamos ativar apenas a configuração base da área.
                  </p>
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {publishedObjectives.map((obj) => {
                    const isSel = selectedObjectives.has(obj.id);
                    return (
                      <button
                        key={obj.id}
                        onClick={() => {
                          const next = new Set(selectedObjectives);
                          if (isSel) next.delete(obj.id);
                          else next.add(obj.id);
                          setSelectedObjectives(next);
                        }}
                        className={cn(
                          'rounded-lg border-2 p-3 text-left transition-all hover:border-primary',
                          isSel ? 'border-primary bg-primary/5' : 'border-border'
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span>{obj.icon || '🎯'}</span>
                              <h4 className="font-semibold text-sm">{obj.name}</h4>
                            </div>
                            {obj.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                                {obj.description}
                              </p>
                            )}
                          </div>
                          {isSel && (
                            <Badge variant="default" className="shrink-0 text-[10px]">
                              <Check className="h-3 w-3" />
                            </Badge>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-between mt-4">
                <Button variant="outline" onClick={() => setStep(2)} disabled={activatingAll}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar
                </Button>
                <div className="flex gap-2">
                  {selectedAreaId && (
                    <Button
                      variant="outline"
                      onClick={() => finish(true)}
                      disabled={activatingAll || finishing}
                    >
                      Pular ativação
                    </Button>
                  )}
                  <Button onClick={handleActivateAll} disabled={activatingAll || finishing}>
                    {(activatingAll || finishing) && (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    )}
                    <Sparkles className="h-4 w-4 mr-2" />
                    {selectedAreaId ? 'Ativar e finalizar' : 'Finalizar e entrar'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

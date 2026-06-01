import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAdminAIModels, useUpdateAdminAIModels, type AIModelFeature, type AdminAIModelStrategy } from '@/hooks/useAdminDashboard';

const TEXT_MODELS = [
  { value: 'gpt-5.2', label: 'GPT-5.2' },
  { value: 'gpt-5.1', label: 'GPT-5.1' },
  { value: 'gpt-5', label: 'GPT-5' },
  { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
  { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
  { value: 'gpt-4.1', label: 'GPT-4.1' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
  { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
];

const TRANSCRIPTION_MODELS = [
  { value: 'gpt-4o-transcribe', label: 'GPT-4o Transcribe' },
  { value: 'gpt-4o-mini-transcribe', label: 'GPT-4o Mini Transcribe' },
  { value: 'whisper-1', label: 'Whisper 1' },
];

const FEATURES: { value: AIModelFeature; label: string; description: string; section?: string }[] = [
  { value: 'flow_ai', label: 'Flow AI', description: 'Assistente interno do Wizzy Flow para projetos, tarefas, processos e POPs.', section: 'Wizzy Flow' },
  { value: 'agents', label: 'Agentes IA', description: 'Respostas automáticas e orquestração de atendimento.' },
  { value: 'conversation_summary', label: 'Resumo de conversas', description: 'Sínteses e análises do histórico.' },
  { value: 'prompt_generation', label: 'Geração de prompts', description: 'Criação e melhoria de prompts dos agentes.' },
  { value: 'flow_generation', label: 'Geração de fluxos', description: 'Criação de fluxos visuais por texto.' },
  { value: 'document_processing', label: 'Processamento de documentos', description: 'Leitura de modelos DOCX/TXT e extração de campos variáveis.' },
  { value: 'document_field_unification', label: 'Unificação de campos', description: 'Agrupamento de campos semelhantes em packs de documentos.' },
  { value: 'training_rules', label: 'Treinamento do agente', description: 'Transforma feedback em regras contextuais para agentes.' },
  { value: 'remarketing', label: 'Remarketing', description: 'Geração de mensagens automáticas de follow-up.' },
  { value: 'qualification_rules', label: 'Regras de qualificação', description: 'Extração de critérios objetivos a partir do prompt do agente.' },
  { value: 'transcription', label: 'Transcrição', description: 'Áudios e mídia convertidos para texto.' },
];

const DEFAULT_STRATEGY: AdminAIModelStrategy = {
  default_model: 'gpt-4o-mini',
  features: {
    agents: 'gpt-4o-mini',
    conversation_summary: 'gpt-4o-mini',
    prompt_generation: 'gpt-4.1-mini',
    flow_generation: 'gpt-4.1',
    document_processing: 'gpt-4.1-mini',
    document_field_unification: 'gpt-4.1-mini',
    training_rules: 'gpt-4.1-mini',
    remarketing: 'gpt-4.1-mini',
    qualification_rules: 'gpt-4.1-mini',
    flow_ai: 'gpt-4.1-mini',
    transcription: 'gpt-4o-mini-transcribe',
  },
};

export function AdminAIModelsContent({ showHeader = true }: { showHeader?: boolean }) {
  const { data, isLoading } = useAdminAIModels();
  const updateModels = useUpdateAdminAIModels();
  const [strategy, setStrategy] = useState<AdminAIModelStrategy>(DEFAULT_STRATEGY);

  useEffect(() => {
    if (data?.strategy) {
      setStrategy({
        default_model: data.strategy.default_model || DEFAULT_STRATEGY.default_model,
        features: {
          ...DEFAULT_STRATEGY.features,
          ...(data.strategy.features || {}),
        },
      });
    }
  }, [data]);

  const updateFeature = (feature: AIModelFeature, model: string) => {
    setStrategy((prev) => ({
      ...prev,
      features: { ...prev.features, [feature]: model },
    }));
  };

  const modelsForFeature = (feature?: AIModelFeature) => {
    return feature === 'transcription' ? TRANSCRIPTION_MODELS : TEXT_MODELS;
  };

  const safeFeatureModel = (feature: AIModelFeature) => {
    const models = modelsForFeature(feature);
    const selected = strategy.features[feature] || strategy.default_model;
    return models.some((model) => model.value === selected) ? selected : models[0].value;
  };

  const normalizedStrategy = (): AdminAIModelStrategy => ({
    default_model: TEXT_MODELS.some((model) => model.value === strategy.default_model)
      ? strategy.default_model
      : DEFAULT_STRATEGY.default_model,
    features: {
      agents: safeFeatureModel('agents'),
      conversation_summary: safeFeatureModel('conversation_summary'),
      prompt_generation: safeFeatureModel('prompt_generation'),
      flow_generation: safeFeatureModel('flow_generation'),
      document_processing: safeFeatureModel('document_processing'),
      document_field_unification: safeFeatureModel('document_field_unification'),
      training_rules: safeFeatureModel('training_rules'),
      remarketing: safeFeatureModel('remarketing'),
      qualification_rules: safeFeatureModel('qualification_rules'),
      flow_ai: safeFeatureModel('flow_ai'),
      transcription: safeFeatureModel('transcription'),
    },
  });

  return (
      <div className="space-y-6">
        {showHeader && (
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Modelos de IA</h1>
            <p className="mt-1 text-muted-foreground">Controle central dos modelos OpenAI usados por cada função do Wizzy.</p>
          </div>
        </div>
        )}

        {isLoading ? (
          <Skeleton className="h-96" />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Estratégia OpenAI</CardTitle>
              <CardDescription>
                O cliente informa apenas a chave OpenAI. Os modelos e tarefas são definidos aqui pelo admin.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-2 md:max-w-md">
                <Label>Modelo padrão</Label>
                <select
                  value={strategy.default_model}
                  onChange={(event) => setStrategy((prev) => ({ ...prev, default_model: event.target.value }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {TEXT_MODELS.map((model) => (
                    <option key={model.value} value={model.value}>{model.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3">
                {FEATURES.map((feature) => (
                  <div key={feature.value} className="grid gap-3 rounded-md border p-4 md:grid-cols-[1fr_260px] md:items-center">
                    <div>
                      {feature.section && (
                        <p className="mb-1 text-xs font-semibold uppercase tracking-normal text-primary">{feature.section}</p>
                      )}
                      <p className="font-medium text-foreground">{feature.label}</p>
                      <p className="text-sm text-muted-foreground">{feature.description}</p>
                    </div>
                    <select
                      value={safeFeatureModel(feature.value)}
                      onChange={(event) => updateFeature(feature.value, event.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {modelsForFeature(feature.value).map((model) => (
                        <option key={model.value} value={model.value}>{model.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <Button onClick={() => updateModels.mutate(normalizedStrategy())} disabled={updateModels.isPending} className="gap-2">
                  <Save className="h-4 w-4" />
                  Salvar modelos
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
  );
}

export default function AdminAIModelsPage() {
  return (
    <AdminLayout>
      <AdminAIModelsContent />
    </AdminLayout>
  );
}

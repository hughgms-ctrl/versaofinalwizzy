export const OPENAI_CHAT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

export const DEFAULT_AI_MODEL_STRATEGY = {
  provider: 'openai',
  default_model: 'gpt-4o-mini',
  features: {
    agents: 'gpt-4o-mini',
    conversation_summary: 'gpt-4o-mini',
    prompt_generation: 'gpt-4.1-mini',
    flow_generation: 'gpt-4.1',
    transcription: 'gpt-4o-mini-transcribe',
    document_processing: 'gpt-4.1-mini',
    document_field_unification: 'gpt-4.1-mini',
    training_rules: 'gpt-4.1-mini',
    remarketing: 'gpt-4.1-mini',
    qualification_rules: 'gpt-4.1-mini',
    flow_ai: 'gpt-4.1-mini',
    agent_tester_persona: 'gpt-4o-mini',
    agent_tester_evaluator: 'gpt-4.1-mini',
  },
};

export type AIModelFeature = keyof typeof DEFAULT_AI_MODEL_STRATEGY.features;

function cleanModel(model?: string | null) {
  return String(model || DEFAULT_AI_MODEL_STRATEGY.default_model).replace('openai/', '').replace('google/', '');
}

function normalizeText(value?: string | null) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

function resolvePlanAIMode(plan?: any) {
  const aiMode = normalizeText(plan?.ai_mode);
  const slug = normalizeText(plan?.slug);
  const name = normalizeText(plan?.name);

  if (
    aiMode === 'platform_api' ||
    slug === 'max' ||
    slug === 'wizzy-ai' ||
    slug === 'wizzy_ai' ||
    name.includes('max') ||
    name.includes('wizzy ai')
  ) {
    return 'platform_api';
  }

  return 'own_api';
}

export async function getAIModelStrategy(supabase: any) {
  const { data } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'ai_model_strategy')
    .maybeSingle();

  const saved = data?.value || {};
  return {
    ...DEFAULT_AI_MODEL_STRATEGY,
    ...saved,
    provider: 'openai',
    features: {
      ...DEFAULT_AI_MODEL_STRATEGY.features,
      ...(saved.features || {}),
    },
  };
}

export async function getPlatformOpenAIKey(supabase: any) {
  const envKey = Deno.env.get('WIZZY_OPENAI_API_KEY') || Deno.env.get('OPENAI_API_KEY') || '';
  if (envKey) return envKey;

  const { data } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'ai_usage_connection_settings')
    .maybeSingle();

  return data?.value?.openai_api_key || '';
}

export async function getOrganizationIdFromRequest(supabase: any, req: Request, explicitOrgId?: string | null) {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const isServiceRole = !!serviceRoleKey && token === serviceRoleKey;

  // explicitOrgId (vindo do body) só é confiável de chamador interno (service role).
  // Antes era retornado sem qualquer verificação, então uma função verify_jwt=false
  // podia receber a org da vítima no body e queimar a chave de IA dela sem autenticar.
  if (explicitOrgId) {
    if (isServiceRole) return explicitOrgId;
    if (!token) return null;
    const { data: userData } = await supabase.auth.getUser(token);
    const userId = userData?.user?.id;
    if (!userId) return null;
    // Só retorna a org pedida se o usuário for membro dela.
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .eq('organization_id', explicitOrgId)
      .maybeSingle();
    if (membership) return explicitOrgId;
    // Fallback legado (orgs sem organization_members): valida via profile.
    const { data: legacyProfile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('user_id', userId)
      .maybeSingle();
    return legacyProfile?.organization_id === explicitOrgId ? explicitOrgId : null;
  }

  if (isServiceRole || !token) return null;

  const { data: userData } = await supabase.auth.getUser(token);
  const userId = userData?.user?.id;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('user_id', userId)
    .maybeSingle();

  return profile?.organization_id || null;
}

export async function resolveOpenAIConfig(supabase: any, organizationId: string | null | undefined, feature: AIModelFeature) {
  const strategy = await getAIModelStrategy(supabase);
  const model = cleanModel(strategy.features?.[feature] || strategy.default_model);
  const platformKey = await getPlatformOpenAIKey(supabase);

  if (!organizationId) {
    return platformKey ? { endpoint: OPENAI_CHAT_ENDPOINT, apiKey: platformKey, model, source: 'platform' } : null;
  }

  const [{ data: planRow }, { data: integrationConfig }] = await Promise.all([
    supabase
      .from('organization_plans')
      .select('status, plan:platform_plans(ai_mode, slug, name)')
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false })
      .maybeSingle(),
    supabase
      .from('integration_configs')
      .select('openai_api_key')
      .eq('organization_id', organizationId)
      .maybeSingle(),
  ]);

  const aiMode = resolvePlanAIMode(planRow?.plan);
  // Planos own_api nunca podem usar a key da plataforma: sem key própria configurada, a IA fica indisponível.
  const apiKey = aiMode === 'platform_api' ? platformKey : integrationConfig?.openai_api_key;

  if (!apiKey) return null;
  return { endpoint: OPENAI_CHAT_ENDPOINT, apiKey, model, source: aiMode === 'platform_api' ? 'platform' : 'customer' };
}

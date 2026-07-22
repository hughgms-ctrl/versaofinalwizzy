-- Semente de teste: um template real pra validar o wizard de aplicar template
-- (Etapa 5) de ponta a ponta, já que ainda não existe nenhuma tela de criar
-- template do zero. Publicado desde já (status='published') pra aparecer na
-- galeria pra qualquer organização, não só admin.
INSERT INTO public.agent_templates (
  name, description, category, status, suggested_trigger_keyword,
  conversion_rate, flow_snapshot, agent_snapshot
) VALUES (
  'BPC Loas',
  'Qualifica renda e identifica elegibilidade ao benefício.',
  'beneficios_inss',
  'published',
  'bpc,loas,beneficio',
  62,
  '{}'::jsonb,
  jsonb_build_object(
    'function_role', 'triagem',
    'prompt_base', 'Você é um assistente de triagem para casos de BPC/LOAS (Benefício de Prestação Continuada). Converse de forma acolhedora e simples, sem jargão jurídico. Pergunte, uma coisa de cada vez: (1) idade ou se é pessoa com deficiência, (2) renda familiar por pessoa, (3) se já tentou o benefício antes e foi negado. Ao final, explique que um responsável vai analisar o caso e retornar em breve, e pergunte o melhor horário de contato.',
    'persona', 'Atendente cordial e paciente, evita termos técnicos, confirma o que entendeu antes de seguir.'
  )
);

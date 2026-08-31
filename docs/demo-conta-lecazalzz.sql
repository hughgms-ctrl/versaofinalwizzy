-- =============================================================================
-- CONTA DEMO — lecazalzz@gmail.com
-- Cria: 2 agentes de IA + 1 fluxo de botões (menu de atendimento) + 2 gatilhos
-- Rodar no SQL Editor do Supabase. Idempotente: rodar 2x não duplica
-- (remove antes os itens de demo com o mesmo nome).
-- =============================================================================

DO $do$
DECLARE
  v_user  uuid;
  v_org   uuid;
  v_flow  uuid := gen_random_uuid();
  v_agent_sofia uuid := gen_random_uuid();
  v_agent_max   uuid := gen_random_uuid();
  v_ws    uuid[];
  v_nodes jsonb;
  v_edges jsonb;
BEGIN
  -- 1) Localiza a organização pelo email da conta demo
  SELECT u.id, p.organization_id
    INTO v_user, v_org
  FROM auth.users u
  JOIN public.profiles p ON p.user_id = u.id
  WHERE lower(u.email) = 'lecazalzz@gmail.com'
  LIMIT 1;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Conta lecazalzz@gmail.com nao encontrada (sem profile/organizacao)';
  END IF;

  -- Workspaces da org: o fluxo precisa estar vinculado a eles para aparecer
  -- na lista quando um workspace esta selecionado no topo (FlowsPage esconde
  -- fluxo sem workspace ao filtrar).
  SELECT COALESCE(array_agg(w.id), '{}'::uuid[])
    INTO v_ws
  FROM public.workspaces w
  WHERE w.organization_id = v_org;

  -- 0) Limpa uma execução anterior deste mesmo script (pelo nome)
  DELETE FROM public.campaigns
    WHERE organization_id = v_org
      AND name IN ('Demo — Menu (palavra-chave)', 'Demo — Boas-vindas (saudacao)');
  DELETE FROM public.flows
    WHERE organization_id = v_org AND name = 'Menu de Atendimento (Demo)';
  DELETE FROM public.ai_agents
    WHERE organization_id = v_org
      AND name IN ('Sofia — Atendimento', 'Max — Qualificacao (SDR)');

  -- 2) Agentes de IA -----------------------------------------------------------
  INSERT INTO public.ai_agents
    (id, organization_id, name, description, function_role, persona, prompt_base,
     behavior_style, tone_style, response_length, emoji_usage, is_active, flow_ids)
  VALUES
    (v_agent_sofia, v_org,
     'Sofia — Atendimento',
     'Atendimento ao cliente: tira duvidas sobre a plataforma e encaminha para um humano quando necessario.',
     'Atendimento ao cliente',
     'Atendente virtual simpatica e agil da Wizzy, especialista na plataforma.',
     'Voce e a Sofia, assistente virtual da Wizzy — plataforma de atendimento e automacao para WhatsApp e Instagram.' || E'\n\n' ||
     'O QUE A WIZZY FAZ:' || E'\n' ||
     '- Centraliza conversas de varios numeros de WhatsApp e contas de Instagram em um so lugar.' || E'\n' ||
     '- Fluxos visuais de automacao com botoes, listas, condicoes e testes A/B.' || E'\n' ||
     '- Agentes de IA que atendem sozinhos e transferem para humanos quando preciso.' || E'\n' ||
     '- Funil de vendas (pipeline), etiquetas, campos personalizados e disparos em massa.' || E'\n' ||
     '- Mensagens agendadas, grupos, relatorios e muito mais.' || E'\n\n' ||
     'PLANOS:' || E'\n' ||
     '- Starter: R$ 197/mes — 1 numero, fluxos ilimitados e agente de IA.' || E'\n' ||
     '- Pro: R$ 397/mes — 3 numeros, campanhas em massa e funil completo.' || E'\n' ||
     '- Scale: R$ 797/mes — numeros ilimitados, Instagram e suporte dedicado.' || E'\n\n' ||
     'REGRAS:' || E'\n' ||
     '- Responda somente sobre a Wizzy e atendimento. Se nao souber, diga que vai verificar com o time.' || E'\n' ||
     '- Se a pessoa pedir para falar com um humano ou demonstrar irritacao, avise que vai transferir para um atendente.',
     'informal', 'caloroso', 'curto', 'nunca', true,
     ARRAY[v_flow]::uuid[]),

    (v_agent_max, v_org,
     'Max — Qualificacao (SDR)',
     'Qualifica leads: coleta nome, empresa e volume de atendimento antes de passar ao comercial.',
     'Qualificacao de leads',
     'SDR consultivo e objetivo, focado em entender o cenario do lead.',
     'Voce e o Max, SDR da Wizzy. Sua missao e qualificar o lead em uma conversa natural, UMA pergunta por vez:' || E'\n' ||
     '1. Nome e empresa.' || E'\n' ||
     '2. Quantos atendimentos por mes a empresa faz no WhatsApp.' || E'\n' ||
     '3. Quantas pessoas atendem hoje.' || E'\n' ||
     '4. Principal dificuldade no atendimento atual.' || E'\n\n' ||
     'Ao final, faca um resumo do que entendeu e avise que um consultor vai entrar em contato para uma demonstracao.' || E'\n' ||
     'Nao invente precos nem prazos. Se perguntarem algo fora do escopo, volte com gentileza para a qualificacao.',
     'informal', 'neutro', 'moderado', 'nunca', true,
     NULL);

  -- 3) Fluxo de botoes ---------------------------------------------------------
  v_nodes := replace($json$[
    {"id":"start-1","type":"start","position":{"x":50,"y":200},"data":{"label":"Inicio"}},
    {"id":"node_1","type":"content-block","position":{"x":330,"y":200},"data":{"label":"Boas-vindas","items":[{"id":"i1","type":"text","content":"Ola {{name}}! Que bom te ver por aqui.\n\nEu sou o assistente virtual da *Wizzy*."}]}},
    {"id":"node_2","type":"message-buttons","position":{"x":610,"y":200},"data":{"label":"Menu principal","text":"Como podemos te ajudar hoje? Escolha uma opcao abaixo.","buttons":[{"id":"b1","label":"Falar com atendente"},{"id":"b2","label":"Duvidas com a IA"},{"id":"b3","label":"Conhecer os planos"}]}},
    {"id":"node_3","type":"content-block","position":{"x":890,"y":20},"data":{"label":"Transferindo","items":[{"id":"i1","type":"text","content":"Perfeito! Ja estou te passando para um dos nossos atendentes. So um instante!"}]}},
    {"id":"node_4","type":"action-transfer","position":{"x":1170,"y":20},"data":{"label":"Escalacao humana"}},
    {"id":"node_7","type":"content-block","position":{"x":890,"y":200},"data":{"label":"Ponte para a IA","items":[{"id":"i1","type":"text","content":"Otimo! A Sofia, nossa assistente de IA, vai te atender a partir de agora.\n\nPode mandar sua pergunta que ela responde por aqui."}]}},
    {"id":"node_5","type":"ai-handoff","position":{"x":1170,"y":200},"data":{"label":"IA Sofia assume","agentId":"__AGENT_SOFIA__","agentName":"Sofia — Atendimento"}},
    {"id":"node_6","type":"content-block","position":{"x":890,"y":400},"data":{"label":"Planos","items":[{"id":"i1","type":"text","content":"*Nossos planos*\n\n- *Starter* — R$ 197/mes: 1 numero, fluxos ilimitados e agente de IA.\n- *Pro* — R$ 397/mes: 3 numeros, campanhas em massa e funil completo.\n- *Scale* — R$ 797/mes: numeros ilimitados, Instagram e suporte dedicado."},{"id":"i2","type":"delay","delaySeconds":2},{"id":"i3","type":"text","content":"Quer conversar com um especialista? E so digitar *menu* e escolher a opcao de atendente."}]}}
  ]$json$, '__AGENT_SOFIA__', v_agent_sofia::text)::jsonb;

  v_edges := $json$[
    {"id":"e1","source":"start-1","target":"node_1"},
    {"id":"e2","source":"node_1","target":"node_2"},
    {"id":"e3","source":"node_2","sourceHandle":"btn_0","target":"node_3"},
    {"id":"e4","source":"node_3","target":"node_4"},
    {"id":"e5","source":"node_2","sourceHandle":"btn_1","target":"node_7"},
    {"id":"e7","source":"node_7","target":"node_5"},
    {"id":"e6","source":"node_2","sourceHandle":"btn_2","target":"node_6"}
  ]$json$::jsonb;

  INSERT INTO public.flows
    (id, organization_id, name, description, is_active, created_by, nodes, edges,
     workspace_id, workspace_ids)
  VALUES
    (v_flow, v_org,
     'Menu de Atendimento (Demo)',
     'Menu com botoes: atendente humano, IA (Sofia) ou apresentacao dos planos.',
     true, v_user, v_nodes, v_edges,
     v_ws[1], v_ws);

  -- 4) Gatilhos (campanhas) ----------------------------------------------------
  INSERT INTO public.campaigns
    (organization_id, name, flow_id, trigger_keyword, match_type, is_active)
  VALUES
    (v_org, 'Demo — Menu (palavra-chave)', v_flow, 'menu', 'contains', true),
    (v_org, 'Demo — Boas-vindas (saudacao)', v_flow,
     'oi,ola,olá,bom dia,boa tarde,boa noite,hello,hi', 'exact', true);

  RAISE NOTICE 'OK! org=% | fluxo=% | Sofia=% | Max=%', v_org, v_flow, v_agent_sofia, v_agent_max;
END
$do$;

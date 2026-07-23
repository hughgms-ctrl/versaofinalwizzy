-- Base de conhecimento do agente (RAG) -- ver conversa com o usuário: em vez
-- de colar o arquivo inteiro no prompt (caro, lento, estoura o limite de
-- tamanho), o conteúdo vira pedaços pequenos com embedding, e só os trechos
-- relevantes pra pergunta atual entram no prompt.

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- agent_knowledge_files: um arquivo enviado (PDF/DOCX/Excel) por agente.
-- organization_id denormalizado (também dá pra chegar via agent_id->ai_agents,
-- mas duplicar aqui evita JOIN nas policies e no filtro de storage).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.agent_knowledge_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'error')),
  error_message text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_knowledge_files_agent_id ON public.agent_knowledge_files(agent_id);
CREATE INDEX idx_agent_knowledge_files_organization_id ON public.agent_knowledge_files(organization_id);

ALTER TABLE public.agent_knowledge_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org access agent_knowledge_files" ON public.agent_knowledge_files
  FOR ALL TO public
  USING (organization_id = public.get_user_org_id((select auth.uid())))
  WITH CHECK (organization_id = public.get_user_org_id((select auth.uid())));

-- ─────────────────────────────────────────────────────────────────────────────
-- agent_knowledge_chunks: os pedaços de texto extraídos + embedding de cada um.
-- 1536 dimensões = text-embedding-3-small (OpenAI), o padrão configurado em
-- knowledge_base_embedding -- se o admin trocar pra um modelo com dimensão
-- diferente no futuro, essa coluna precisa de uma migration própria.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.agent_knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL REFERENCES public.agent_knowledge_files(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  content text NOT NULL,
  embedding extensions.vector(1536),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_knowledge_chunks_agent_id ON public.agent_knowledge_chunks(agent_id);
CREATE INDEX idx_agent_knowledge_chunks_embedding ON public.agent_knowledge_chunks
  USING ivfflat (embedding extensions.vector_cosine_ops) WITH (lists = 100);

ALTER TABLE public.agent_knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org access agent_knowledge_chunks" ON public.agent_knowledge_chunks
  FOR ALL TO public
  USING (organization_id = public.get_user_org_id((select auth.uid())))
  WITH CHECK (organization_id = public.get_user_org_id((select auth.uid())));

-- ─────────────────────────────────────────────────────────────────────────────
-- match_agent_knowledge_chunks: busca de similaridade (cosine) restrita a UM
-- agente -- chamada pelo agent-orchestrator (service role) antes de montar o
-- prompt, então a checagem de organização aqui é best-effort (defesa em
-- profundidade), não a única barreira -- quem decide QUAL agent_id consultar
-- já é código de confiança (edge function), não input direto do usuário final.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_agent_knowledge_chunks(
  _agent_id uuid,
  _query_embedding extensions.vector(1536),
  _match_count int DEFAULT 6
)
RETURNS TABLE(id uuid, content text, similarity float)
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  SELECT c.id, c.content, 1 - (c.embedding <=> _query_embedding) AS similarity
  FROM public.agent_knowledge_chunks c
  WHERE c.agent_id = _agent_id
  ORDER BY c.embedding <=> _query_embedding
  LIMIT _match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_agent_knowledge_chunks(uuid, extensions.vector, int) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Bucket privado pros arquivos originais (o texto extraído vive em
-- agent_knowledge_chunks; o bucket guarda o arquivo original pra reprocessar
-- ou baixar depois). Path: <agent_id>/<arquivo> -- escopo via ai_agents.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('agent-knowledge-files', 'agent-knowledge-files', false)
ON CONFLICT (id) DO UPDATE SET public = false;

CREATE POLICY "Org access agent-knowledge-files select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'agent-knowledge-files'
    AND EXISTS (
      SELECT 1 FROM public.ai_agents a
      WHERE a.id::text = (storage.foldername(name))[1]
        AND a.organization_id = public.get_user_org_id((select auth.uid()))
    )
  );

CREATE POLICY "Org access agent-knowledge-files insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'agent-knowledge-files'
    AND EXISTS (
      SELECT 1 FROM public.ai_agents a
      WHERE a.id::text = (storage.foldername(name))[1]
        AND a.organization_id = public.get_user_org_id((select auth.uid()))
    )
  );

CREATE POLICY "Org access agent-knowledge-files delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'agent-knowledge-files'
    AND EXISTS (
      SELECT 1 FROM public.ai_agents a
      WHERE a.id::text = (storage.foldername(name))[1]
        AND a.organization_id = public.get_user_org_id((select auth.uid()))
    )
  );

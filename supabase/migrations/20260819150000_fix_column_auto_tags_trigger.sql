-- Tags automáticas por coluna (pipeline_columns.auto_add_tag_ids) voltando a
-- funcionar.
--
-- O consumidor do campo sempre existiu: o trigger trg_apply_column_auto_tags em
-- conversation_pipeline_positions (migration 20260507040048). O que estava
-- errado era o valor gravado.
--
-- A função inseria contact_tags.added_by_type = 'system', e 'system' NUNCA
-- esteve na CHECK dessa coluna — hoje ela aceita ('manual','flow','ai',
-- 'whatsapp','import') (20260809120000). Como o trigger é AFTER INSERT/UPDATE na
-- tabela de posições, a violação da CHECK não falhava só a tag: ela derrubava a
-- transação inteira. Ou seja, arrastar um card para uma coluna com tag
-- automática configurada quebrava A PRÓPRIA MOVIMENTAÇÃO do card.
--
-- Além do valor, dois endurecimentos, porque este trigger consegue bloquear
-- movimentação de card e por isso não pode confiar no conteúdo do array:
--
--   1. auto_add_tag_ids é uuid[] SEM foreign key. Tag apagada por fora do
--      delete_tag_safely deixa id pendurado no array, e o INSERT batia na FK de
--      contact_tags — mesmo estrago, outra constraint. Agora só entra id que
--      ainda existe em tags.
--   2. `NEW.column_id = OLD.column_id` dá NULL (não FALSE) quando a coluna
--      antiga é NULL, então o early-return não valia nesse caso.
--      IS NOT DISTINCT FROM compara direito.

CREATE OR REPLACE FUNCTION public.apply_column_auto_tags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _tag_ids uuid[];
  _contact_id uuid;
BEGIN
  IF NEW.column_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.column_id IS NOT DISTINCT FROM OLD.column_id THEN RETURN NEW; END IF;

  SELECT auto_add_tag_ids INTO _tag_ids
  FROM public.pipeline_columns
  WHERE id = NEW.column_id;

  IF _tag_ids IS NULL OR array_length(_tag_ids, 1) IS NULL THEN RETURN NEW; END IF;

  SELECT contact_id INTO _contact_id
  FROM public.conversations
  WHERE id = NEW.conversation_id;

  IF _contact_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.contact_tags (contact_id, tag_id, added_by_type)
  SELECT _contact_id, t.id, 'flow'
  FROM public.tags t
  WHERE t.id = ANY(_tag_ids)
  ON CONFLICT (contact_id, tag_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Recriado de propósito, e não só substituído: se a 20260507040048 nunca chegou
-- a rodar neste banco, a função acima existe mas não está ligada a nada.
DROP TRIGGER IF EXISTS trg_apply_column_auto_tags ON public.conversation_pipeline_positions;
CREATE TRIGGER trg_apply_column_auto_tags
  AFTER INSERT OR UPDATE OF column_id ON public.conversation_pipeline_positions
  FOR EACH ROW EXECUTE FUNCTION public.apply_column_auto_tags();

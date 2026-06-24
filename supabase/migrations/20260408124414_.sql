
-- Quizzes table
CREATE TABLE public.quizzes (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
    name text NOT NULL,
    description text,
    public_token text DEFAULT encode(gen_random_bytes(16), 'hex'),
    is_active boolean NOT NULL DEFAULT false,
    theme jsonb NOT NULL DEFAULT '{"primaryColor": "#7c3aed", "backgroundColor": "#ffffff", "fontFamily": "Inter"}'::jsonb,
    settings jsonb NOT NULL DEFAULT '{"requirePhone": true, "requireName": true, "requireEmail": false, "showProgressBar": true, "autoTriggerWhatsApp": true}'::jsonb,
    welcome_screen jsonb DEFAULT '{"title": "Bem-vindo!", "description": "", "buttonText": "Começar", "showWelcome": true}'::jsonb,
    end_screen jsonb DEFAULT '{"title": "Obrigado!", "description": "Suas respostas foram enviadas com sucesso.", "buttonText": "Finalizar", "showEndScreen": true}'::jsonb,
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Quiz questions (blocks) table
CREATE TABLE public.quiz_questions (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
    type text NOT NULL DEFAULT 'short_text',
    title text NOT NULL DEFAULT '',
    description text,
    required boolean NOT NULL DEFAULT false,
    position integer NOT NULL DEFAULT 0,
    options jsonb DEFAULT '[]'::jsonb,
    logic jsonb DEFAULT '[]'::jsonb,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Quiz submissions table
CREATE TABLE public.quiz_submissions (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
    conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
    respondent_name text,
    respondent_phone text,
    respondent_email text,
    answers jsonb NOT NULL DEFAULT '[]'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    completed_at timestamptz,
    whatsapp_triggered boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_quizzes_org ON public.quizzes(organization_id);
CREATE INDEX idx_quizzes_token ON public.quizzes(public_token);
CREATE INDEX idx_quiz_questions_quiz ON public.quiz_questions(quiz_id, position);
CREATE INDEX idx_quiz_submissions_quiz ON public.quiz_submissions(quiz_id);
CREATE INDEX idx_quiz_submissions_org ON public.quiz_submissions(organization_id);
CREATE INDEX idx_quiz_submissions_contact ON public.quiz_submissions(contact_id);

-- RLS
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_submissions ENABLE ROW LEVEL SECURITY;

-- Quizzes policies
CREATE POLICY "Users can view quizzes in their org" ON public.quizzes
    FOR SELECT TO authenticated
    USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage quizzes in their org" ON public.quizzes
    FOR ALL TO authenticated
    USING (organization_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin')))
    WITH CHECK (organization_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin')));

-- Quiz questions policies  
CREATE POLICY "Users can view quiz questions" ON public.quiz_questions
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = quiz_questions.quiz_id AND q.organization_id = get_user_org_id(auth.uid())));

CREATE POLICY "Admins can manage quiz questions" ON public.quiz_questions
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = quiz_questions.quiz_id AND q.organization_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin'))))
    WITH CHECK (EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = quiz_questions.quiz_id AND q.organization_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin'))));

-- Quiz submissions policies
CREATE POLICY "Users can view submissions in their org" ON public.quiz_submissions
    FOR SELECT TO authenticated
    USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage submissions" ON public.quiz_submissions
    FOR ALL TO authenticated
    USING (organization_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin')))
    WITH CHECK (organization_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin')));

-- Public access for quiz submissions (anonymous users answering quizzes)
CREATE POLICY "Anyone can submit quiz answers" ON public.quiz_submissions
    FOR INSERT TO anon
    WITH CHECK (true);

-- Public read access for active quizzes (for the public quiz page)
CREATE POLICY "Anyone can view active quizzes by token" ON public.quizzes
    FOR SELECT TO anon
    USING (is_active = true AND public_token IS NOT NULL);

CREATE POLICY "Anyone can view questions of active quizzes" ON public.quiz_questions
    FOR SELECT TO anon
    USING (EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = quiz_questions.quiz_id AND q.is_active = true AND q.public_token IS NOT NULL));

-- Updated_at trigger
CREATE TRIGGER set_quizzes_updated_at BEFORE UPDATE ON public.quizzes
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_quiz_questions_updated_at BEFORE UPDATE ON public.quiz_questions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
;

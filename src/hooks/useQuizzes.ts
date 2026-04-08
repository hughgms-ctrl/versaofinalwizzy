import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface Quiz {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  name: string;
  description: string | null;
  public_token: string | null;
  is_active: boolean;
  theme: Record<string, any>;
  settings: Record<string, any>;
  welcome_screen: Record<string, any>;
  end_screen: Record<string, any>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuizQuestion {
  id: string;
  quiz_id: string;
  type: string;
  title: string;
  description: string | null;
  required: boolean;
  position: number;
  options: any[];
  logic: any[];
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface QuizSubmission {
  id: string;
  quiz_id: string;
  organization_id: string;
  contact_id: string | null;
  conversation_id: string | null;
  respondent_name: string | null;
  respondent_phone: string | null;
  respondent_email: string | null;
  answers: any[];
  metadata: Record<string, any>;
  completed_at: string | null;
  whatsapp_triggered: boolean;
  created_at: string;
}

export function useQuizzes() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const quizzesQuery = useQuery({
    queryKey: ['quizzes', profile?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quizzes')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Quiz[];
    },
    enabled: !!profile?.organization_id,
  });

  const createQuiz = useMutation({
    mutationFn: async (values: { name: string; description?: string }) => {
      const { data, error } = await supabase
        .from('quizzes')
        .insert({
          name: values.name,
          description: values.description || null,
          organization_id: profile!.organization_id,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Quiz;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quizzes'] });
      toast.success('Quiz criado com sucesso');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateQuiz = useMutation({
    mutationFn: async ({ id, ...values }: Partial<Quiz> & { id: string }) => {
      const { data, error } = await supabase
        .from('quizzes')
        .update(values)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as Quiz;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quizzes'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteQuiz = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('quizzes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quizzes'] });
      toast.success('Quiz excluído');
    },
    onError: (err: any) => toast.error(err.message),
  });

  return { ...quizzesQuery, createQuiz, updateQuiz, deleteQuiz };
}

export function useQuizQuestions(quizId: string | undefined) {
  const queryClient = useQueryClient();

  const questionsQuery = useQuery({
    queryKey: ['quiz-questions', quizId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quiz_questions')
        .select('*')
        .eq('quiz_id', quizId!)
        .order('position', { ascending: true });
      if (error) throw error;
      return data as QuizQuestion[];
    },
    enabled: !!quizId,
  });

  const addQuestion = useMutation({
    mutationFn: async (values: Partial<QuizQuestion> & { quiz_id: string }) => {
      const { data, error } = await supabase
        .from('quiz_questions')
        .insert(values)
        .select()
        .single();
      if (error) throw error;
      return data as QuizQuestion;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quiz-questions', quizId] }),
    onError: (err: any) => toast.error(err.message),
  });

  const updateQuestion = useMutation({
    mutationFn: async ({ id, ...values }: Partial<QuizQuestion> & { id: string }) => {
      const { data, error } = await supabase
        .from('quiz_questions')
        .update(values)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as QuizQuestion;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quiz-questions', quizId] }),
    onError: (err: any) => toast.error(err.message),
  });

  const deleteQuestion = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('quiz_questions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quiz-questions', quizId] }),
    onError: (err: any) => toast.error(err.message),
  });

  const reorderQuestions = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const updates = orderedIds.map((id, index) =>
        supabase.from('quiz_questions').update({ position: index }).eq('id', id)
      );
      await Promise.all(updates);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quiz-questions', quizId] }),
  });

  return { ...questionsQuery, addQuestion, updateQuestion, deleteQuestion, reorderQuestions };
}

export function useQuizSubmissions(quizId: string | undefined) {
  return useQuery({
    queryKey: ['quiz-submissions', quizId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quiz_submissions')
        .select('*')
        .eq('quiz_id', quizId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as QuizSubmission[];
    },
    enabled: !!quizId,
  });
}

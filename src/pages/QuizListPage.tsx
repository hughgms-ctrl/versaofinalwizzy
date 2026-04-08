import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, HelpCircle, ExternalLink, BarChart3, Copy, Trash2, MoreVertical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuizzes } from '@/hooks/useQuizzes';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function QuizListPage() {
  const navigate = useNavigate();
  const { data: quizzes, isLoading, createQuiz, deleteQuiz } = useQuizzes();

  const handleCreate = async () => {
    const result = await createQuiz.mutateAsync({ name: 'Novo Quizz' });
    navigate(`/tools/quiz/builder?id=${result.id}`);
  };

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/quiz/${token}`);
    toast.success('Link copiado!');
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Quizz</h1>
            <p className="text-muted-foreground">Crie questionários interativos para qualificar e capturar leads.</p>
          </div>
          <Button onClick={handleCreate} disabled={createQuiz.isPending}>
            <Plus className="h-4 w-4 mr-2" />
            Criar Quizz
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : quizzes && quizzes.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {quizzes.map((quiz) => (
              <Card
                key={quiz.id}
                className="cursor-pointer hover:border-primary/50 transition-all group"
                onClick={() => navigate(`/tools/quiz/builder?id=${quiz.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                        <HelpCircle className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{quiz.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(quiz.created_at), "dd MMM yyyy", { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant={quiz.is_active ? 'default' : 'secondary'} className="text-[10px]">
                        {quiz.is_active ? 'Ativo' : 'Rascunho'}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {quiz.public_token && (
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); copyLink(quiz.public_token!); }}>
                              <Copy className="h-3.5 w-3.5 mr-2" />
                              Copiar link
                            </DropdownMenuItem>
                          )}
                          {quiz.public_token && quiz.is_active && (
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); window.open(`/quiz/${quiz.public_token}`, '_blank'); }}>
                              <ExternalLink className="h-3.5 w-3.5 mr-2" />
                              Abrir quizz
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => { e.stopPropagation(); deleteQuiz.mutate(quiz.id); }}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  {quiz.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{quiz.description}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
              <HelpCircle className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">Nenhum quizz criado</h3>
            <p className="text-muted-foreground mt-1 max-w-md">
              Crie seu primeiro quizz interativo para capturar leads e iniciar atendimentos automáticos via WhatsApp.
            </p>
            <Button className="mt-4" onClick={handleCreate} disabled={createQuiz.isPending}>
              <Plus className="h-4 w-4 mr-2" />
              Criar primeiro quizz
            </Button>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

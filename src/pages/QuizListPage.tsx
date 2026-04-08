import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, HelpCircle, ExternalLink, BarChart3, Copy } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function QuizListPage() {
  const navigate = useNavigate();

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Quiz</h1>
            <p className="text-muted-foreground">Crie questionários interativos para qualificar e capturar leads.</p>
          </div>
          <Button onClick={() => navigate('/tools/quiz/new')}>
            <Plus className="h-4 w-4 mr-2" />
            Criar Quiz
          </Button>
        </div>

        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
            <HelpCircle className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">Nenhum quiz criado</h3>
          <p className="text-muted-foreground mt-1 max-w-md">
            Crie seu primeiro quiz interativo para capturar leads e iniciar atendimentos automáticos via WhatsApp.
          </p>
          <Button className="mt-4" onClick={() => navigate('/tools/quiz/new')}>
            <Plus className="h-4 w-4 mr-2" />
            Criar primeiro quiz
          </Button>
        </div>
      </div>
    </MainLayout>
  );
}

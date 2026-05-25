import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, Upload, Sparkles } from 'lucide-react';

export function ImportHistorySettings() {
  return (
    <Card className="bg-card border-border">
      <CardContent className="pt-6">
        <div className="flex flex-col items-center justify-center py-8 space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <Clock className="h-5 w-5" />
            <span className="text-lg font-semibold">Em breve</span>
          </div>
          
          <p className="text-center text-muted-foreground max-w-md">
            Estamos desenvolvendo nossa própria extensão para Chrome que permitirá 
            importar todo o seu histórico de conversas de forma simples e sem limitações.
          </p>

          <div className="mt-6 p-4 rounded-lg bg-muted/50 border border-border max-w-md">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">O que está por vir:</p>
                <ul className="space-y-1">
                  <li>• Extensão própria sem limitações de mensagens</li>
                  <li>• Importação com um clique</li>
                  <li>• Suporte a mídias e anexos</li>
                  <li>• Sincronização automática de novos contatos</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

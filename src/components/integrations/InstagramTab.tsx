import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Instagram, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function InstagramTab() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 max-w-4xl">
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-pink-500/10">
              <Instagram className="h-5 w-5 text-pink-500" />
            </div>
            <div>
              <CardTitle className="text-foreground">Instagram</CardTitle>
              <CardDescription>
                Conecte perfis do Instagram e gerencie automações estilo ManyChat
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-muted-foreground">
              As configurações de conexão do Instagram estão na página de Configurações.
            </p>
            <Button onClick={() => navigate('/settings')} className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Ir para Configurações
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

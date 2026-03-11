import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Key } from 'lucide-react';

export default function AdminApiPage() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">API & Custos</h1>
          <p className="text-muted-foreground mt-1">Monitoramento de uso de APIs e custos de IA</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              Consumo de API
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Dados de consumo serão exibidos aqui.</p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}

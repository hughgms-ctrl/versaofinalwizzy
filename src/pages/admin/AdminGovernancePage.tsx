import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollText } from 'lucide-react';

export default function AdminGovernancePage() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Governança</h1>
          <p className="text-muted-foreground mt-1">Políticas de governança e conformidade da plataforma</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="h-5 w-5 text-primary" />
              Políticas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Nenhuma política configurada ainda.</p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}

import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Building2, Database, Bot, TrendingUp,
  AlertTriangle, CheckCircle2
} from 'lucide-react';

export default function AdminPage() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Visão Geral</h1>
          <p className="text-slate-400 mt-1">Dashboard administrativo da plataforma Wizzy</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard title="Organizações" value="—" description="Total de clientes" icon={Building2} />
          <MetricCard title="Storage Total" value="—" description="Uso de armazenamento" icon={Database} />
          <MetricCard title="Custo IA (mês)" value="—" description="Gasto com API de IA" icon={Bot} />
          <MetricCard title="MRR" value="—" description="Receita mensal recorrente" icon={TrendingUp} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Alertas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-400">Nenhum alerta no momento.</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                Status da Plataforma
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <StatusItem label="Supabase" status="online" />
                <StatusItem label="Edge Functions" status="online" />
                <StatusItem label="WhatsApp API" status="online" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}

function MetricCard({ title, value, description, icon: Icon }: {
  title: string; value: string; description: string; icon: React.ElementType;
}) {
  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-slate-300">{title}</CardTitle>
        <Icon className="h-4 w-4 text-slate-500" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-white">{value}</div>
        <p className="text-xs text-slate-400">{description}</p>
      </CardContent>
    </Card>
  );
}

function StatusItem({ label, status }: { label: string; status: 'online' | 'offline' }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-300">{label}</span>
      <Badge className={status === 'online' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}>
        {status === 'online' ? '● Online' : '● Offline'}
      </Badge>
    </div>
  );
}

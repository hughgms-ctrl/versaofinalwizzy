import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useConversationsByHour } from '@/hooks/useDashboardData';
import { Skeleton } from '@/components/ui/skeleton';

export function ConversationsChart() {
  const { data = [], isLoading } = useConversationsByHour();

  // Show only every 4th hour for cleaner labels
  const displayData = data.filter((_, i) => i % 2 === 0);

  return (
    <div className="metric-card h-[400px]">
      <div className="metric-card-gradient" />
      <div className="relative h-full">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Volume de Mensagens</h3>
            <p className="text-sm text-muted-foreground">Mensagens enviadas por hora - Últimas 24h</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-primary" />
              <span className="text-sm text-muted-foreground">IA</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-green-500" />
              <span className="text-sm text-muted-foreground">Humano</span>
            </div>
          </div>
        </div>
        
        {isLoading ? (
          <Skeleton className="w-full h-[300px]" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={displayData}>
              <defs>
                <linearGradient id="aiGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(234 89% 54%)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="hsl(234 89% 54%)" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="humanGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142 71% 45%)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="hsl(142 71% 45%)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" vertical={false} />
              <XAxis 
                dataKey="time" 
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(220 9% 46%)', fontSize: 12 }}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(220 9% 46%)', fontSize: 12 }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(0 0% 100%)', 
                  border: '1px solid hsl(220 13% 91%)',
                  borderRadius: '12px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                }}
              />
              <Area 
                type="monotone" 
                dataKey="ai" 
                stroke="hsl(234 89% 54%)" 
                strokeWidth={2}
                fill="url(#aiGradient)" 
                name="IA"
              />
              <Area 
                type="monotone" 
                dataKey="human" 
                stroke="hsl(142 71% 45%)" 
                strokeWidth={2}
                fill="url(#humanGradient)" 
                name="Humano"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

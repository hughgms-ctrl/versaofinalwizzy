import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { useResolutionData } from '@/hooks/useDashboardData';
import { Skeleton } from '@/components/ui/skeleton';

export function ResolutionChart() {
  const { data = [], isLoading } = useResolutionData();

  return (
    <div className="metric-card h-[400px]">
      <div className="metric-card-gradient" />
      <div className="relative h-full">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-foreground">Status das Conversas</h3>
          <p className="text-sm text-muted-foreground">Aberto, em andamento, encerradas e arquivadas</p>
        </div>
        
        {isLoading ? (
          <Skeleton className="w-full h-[300px]" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={4}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '12px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  color: 'hsl(var(--foreground))',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
                itemStyle={{ color: 'hsl(var(--foreground))' }}
                formatter={(value: number) => [`${value}%`, '']}
              />
              <Legend 
                verticalAlign="bottom" 
                iconType="circle"
                formatter={(value) => <span className="text-sm text-foreground">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

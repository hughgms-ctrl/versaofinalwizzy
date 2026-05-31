import { Card, CardContent, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Badge } from "@/fluzz/components/ui/badge";
import { Repeat, Clock, FolderKanban, FileText } from "lucide-react";

interface RecurringTaskCardProps {
  task: {
    id: string;
    title: string;
    description: string | null;
    priority: string | null;
    recurrence_type: string;
    process_documentation?: {
      id: string;
      title: string;
    } | null;
    projects?: {
      id: string;
      name: string;
    } | null;
  };
}

const recurrenceLabels: Record<string, string> = {
  daily: "Diária",
  weekly: "Semanal",
  monthly: "Mensal",
  yearly: "Anual",
};

const priorityColors: Record<string, string> = {
  low: "bg-blue-500/10 text-blue-500",
  medium: "bg-yellow-500/10 text-yellow-500",
  high: "bg-red-500/10 text-red-500",
};

export function RecurringTaskCard({ task }: RecurringTaskCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Repeat className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">{task.title}</CardTitle>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <Badge variant="outline" className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {recurrenceLabels[task.recurrence_type] || task.recurrence_type}
            </Badge>
            {task.priority && (
              <Badge className={priorityColors[task.priority]}>
                {task.priority === "low" ? "Baixa" : task.priority === "medium" ? "Média" : "Alta"}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {task.description && (
          <p className="text-sm text-muted-foreground">{task.description}</p>
        )}
        
        <div className="flex flex-wrap gap-2">
          {task.projects && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <FolderKanban className="h-3 w-3" />
              {task.projects.name}
            </Badge>
          )}
          {task.process_documentation && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {task.process_documentation.title}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
import { Card, CardContent, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Badge } from "@/fluzz/components/ui/badge";
import { TaskCard } from "./TaskCard";
import { FolderOpen, Folder, User, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/fluzz/components/ui/collapsible";

interface ProjectTaskGroupProps {
  projectName: string;
  projectId: string | null;
  tasks: any[];
  type: "project" | "folder" | "personal" | "routine";
  onDeleteTask: (taskId: string) => void;
}

// Natural sort function - recognizes numbers in strings
const naturalSort = (a: string, b: string) => {
  return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
};

export function ProjectTaskGroup({ 
  projectName, 
  projectId, 
  tasks, 
  type, 
  onDeleteTask 
}: ProjectTaskGroupProps) {
  const [isOpen, setIsOpen] = useState(true);

  // Sort tasks by title using natural sort
  const sortedTasks = [...tasks].sort((a, b) => naturalSort(a.title, b.title));

  const getIcon = () => {
    switch (type) {
      case "project":
        return <FolderOpen className="h-4 w-4 text-blue-500" />;
      case "personal":
        return <User className="h-4 w-4 text-purple-500" />;
      case "folder":
        return <Folder className="h-4 w-4 text-cyan-500" />;
      case "routine":
        return <RefreshCw className="h-4 w-4 text-green-500" />;
    }
  };

  const getBorderColor = () => {
    switch (type) {
      case "project":
        return "border-l-blue-500";
      case "personal":
        return "border-l-purple-500";
      case "folder":
        return "border-l-cyan-500";
      case "routine":
        return "border-l-green-500";
    }
  };

  return (
    <Card className={`border-l-4 ${getBorderColor()}`}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {getIcon()}
                {projectName}
              </CardTitle>
              <Badge variant="secondary">
                {tasks.length} {tasks.length === 1 ? "tarefa" : "tarefas"}
              </Badge>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-2 pt-0">
            {sortedTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onDelete={() => onDeleteTask(task.id)}
              />
            ))}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
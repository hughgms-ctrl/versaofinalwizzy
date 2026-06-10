import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { toast } from "sonner";

export function useProjectActions() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const duplicateProject = useMutation({
    mutationFn: async (project: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Criar novo projeto com status ativo, mantendo a cor e com is_draft = true
      const { data: newProject, error: projectError } = await supabase
        .from("projects")
        .insert([
          {
            name: `Cópia de ${project.name}`,
            description: project.description, // Copiar descrição do projeto
            status: 'active',
            user_id: user.id,
            workspace_id: project.workspace_id,
            is_draft: true,
            pending_notifications: true,
            color: project.color, // Manter a mesma cor
          },
        ])
        .select()
        .single();

      if (projectError) throw projectError;

      // Buscar tarefas com subtasks
      const { data: tasks, error: tasksError } = await supabase
        .from("tasks")
        .select("*, subtasks(*)")
        .eq("project_id", project.id);

      if (tasksError) throw tasksError;

      // Buscar task_processes separadamente
      const taskIds = tasks?.map(t => t.id) || [];
      let taskProcesses: any[] = [];
      
      if (taskIds.length > 0) {
        const { data: tpData, error: tpError } = await supabase
          .from("task_processes")
          .select("*")
          .in("task_id", taskIds);

        if (tpError) console.warn("Erro ao buscar task_processes:", tpError);
        taskProcesses = tpData || [];
      }

      // Buscar task_assignees separadamente
      let taskAssignees: any[] = [];
      if (taskIds.length > 0) {
        const { data: taData, error: taError } = await supabase
          .from("task_assignees")
          .select("*")
          .in("task_id", taskIds);

        if (taError) console.warn("Erro ao buscar task_assignees:", taError);
        taskAssignees = taData || [];
      }

      if (tasks && tasks.length > 0) {
        // Criar mapeamento de task_id antigo -> índice
        const taskIdToIndex: Record<string, number> = {};
        tasks.forEach((task, index) => {
          taskIdToIndex[task.id] = index;
        });

        // Mapear tarefas: copiar título, descrição, setor, responsável e processos
        // NÃO copiar: due_date, documentation (links e anexos)
        const newTasks = tasks.map((task, index) => ({
          title: task.title,
          description: task.description,
          status: 'todo',
          priority: task.priority,
          assigned_to: task.assigned_to,
          setor: task.setor,
          documentation: null, // NÃO copiar documentação
          process_id: task.process_id,
          completed_verified: false,
          project_id: newProject.id,
          workspace_id: project.workspace_id,
          due_date: null, // NÃO copiar datas
          start_date: null, // NÃO copiar datas
          task_order: task.task_order || index,
        }));

        const { data: insertedTasks, error: insertError } = await supabase
          .from("tasks")
          .insert(newTasks)
          .select();

        if (insertError) throw insertError;

        if (insertedTasks && insertedTasks.length > 0) {
          // Copiar subtasks para cada tarefa
          const allSubtasks: any[] = [];
          
          for (let i = 0; i < tasks.length; i++) {
            const originalTask = tasks[i];
            const newTask = insertedTasks[i];
            
            if (originalTask.subtasks && originalTask.subtasks.length > 0) {
              const subtasksForTask = originalTask.subtasks.map((subtask: any) => ({
                title: subtask.title,
                completed: false,
                task_id: newTask.id,
              }));
              
              allSubtasks.push(...subtasksForTask);
            }
          }

          if (allSubtasks.length > 0) {
            const { error: subtasksError } = await supabase
              .from("subtasks")
              .insert(allSubtasks);
            
            if (subtasksError) console.warn("Erro ao copiar subtasks:", subtasksError);
          }

          // Copiar task_processes (relacionamento de tarefas com processos)
          if (taskProcesses.length > 0) {
            const newTaskProcesses = taskProcesses
              .filter(tp => taskIdToIndex[tp.task_id] !== undefined)
              .map(tp => ({
                task_id: insertedTasks[taskIdToIndex[tp.task_id]].id,
                process_id: tp.process_id,
              }));

            if (newTaskProcesses.length > 0) {
              const { error: tpInsertError } = await supabase
                .from("task_processes")
                .insert(newTaskProcesses);
              
              if (tpInsertError) console.warn("Erro ao copiar task_processes:", tpInsertError);
            }
          }

          // Copiar task_assignees (múltiplos responsáveis)
          if (taskAssignees.length > 0) {
            const newTaskAssignees = taskAssignees
              .filter(ta => taskIdToIndex[ta.task_id] !== undefined)
              .map(ta => ({
                task_id: insertedTasks[taskIdToIndex[ta.task_id]].id,
                user_id: ta.user_id,
              }));

            if (newTaskAssignees.length > 0) {
              const { error: taInsertError } = await supabase
                .from("task_assignees")
                .insert(newTaskAssignees);
              
              if (taInsertError) console.warn("Erro ao copiar task_assignees:", taInsertError);
            }
          }
        }
      }

      return newProject;
    },
    onSuccess: (newProject) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Projeto duplicado com sucesso!");
      if (newProject) {
        navigate(`/tools/wizzy-flow/projects/${newProject.id}`);
      }
    },
    onError: (error) => {
      console.error("Erro ao duplicar projeto:", error);
      toast.error("Erro ao duplicar projeto");
    },
  });

  const saveAsTemplate = useMutation({
    mutationFn: async (project: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Create a template entry in project_templates table with color
      const { data: newTemplate, error: templateError } = await supabase
        .from("project_templates")
        .insert([
          {
            name: project.name,
            description: project.description,
            workspace_id: project.workspace_id,
            created_by: user.id,
            color: project.color, // Manter a cor no template
          },
        ])
        .select()
        .single();

      if (templateError) throw templateError;

      // Buscar tarefas com subtasks
      const { data: tasks, error: tasksError } = await supabase
        .from("tasks")
        .select("*, subtasks(*)")
        .eq("project_id", project.id);

      if (tasksError) throw tasksError;

      // Buscar task_processes
      const taskIds = tasks?.map(t => t.id) || [];
      let taskProcesses: any[] = [];
      let taskAssignees: any[] = [];
      
      if (taskIds.length > 0) {
        const { data: tpData } = await supabase
          .from("task_processes")
          .select("*")
          .in("task_id", taskIds);

        taskProcesses = tpData || [];

        // Buscar task_assignees para salvar no template
        const { data: taData } = await supabase
          .from("task_assignees")
          .select("*")
          .in("task_id", taskIds);

        taskAssignees = taData || [];
      }

      if (tasks && tasks.length > 0) {
        const taskIdToIndex: Record<string, number> = {};
        tasks.forEach((task, index) => {
          taskIdToIndex[task.id] = index;
        });

        const newTemplateTasks = tasks.map((task, index) => ({
          template_id: newTemplate.id,
          title: task.title,
          description: task.description,
          priority: task.priority,
          setor: task.setor,
          documentation: null, // NÃO copiar documentação
          process_id: task.process_id,
          task_order: task.task_order || index,
        }));

        const { data: insertedTasks, error: insertError } = await supabase
          .from("template_tasks")
          .insert(newTemplateTasks)
          .select();

        if (insertError) throw insertError;

        if (insertedTasks && insertedTasks.length > 0) {
          // Copy subtasks to template_subtasks
          const allSubtasks: any[] = [];
          for (let i = 0; i < tasks.length; i++) {
            const originalTask = tasks[i];
            const newTask = insertedTasks[i];
            if (originalTask.subtasks && originalTask.subtasks.length > 0) {
              const subtasksForTask = originalTask.subtasks.map((subtask: any, subIndex: number) => ({
                template_task_id: newTask.id,
                title: subtask.title,
                task_order: subIndex,
              }));
              allSubtasks.push(...subtasksForTask);
            }
          }

          if (allSubtasks.length > 0) {
            await supabase.from("template_subtasks").insert(allSubtasks);
          }

          // Copy task_processes to template_task_processes
          if (taskProcesses.length > 0) {
            const newTaskProcesses = taskProcesses
              .filter(tp => taskIdToIndex[tp.task_id] !== undefined)
              .map(tp => ({
                template_task_id: insertedTasks[taskIdToIndex[tp.task_id]].id,
                process_id: tp.process_id,
              }));

            if (newTaskProcesses.length > 0) {
              await supabase.from("template_task_processes").insert(newTaskProcesses);
            }
          }

          // Copy task_assignees to template_task_assignees
          if (taskAssignees.length > 0) {
            const newTaskAssignees = taskAssignees
              .filter(ta => taskIdToIndex[ta.task_id] !== undefined)
              .map(ta => ({
                template_task_id: insertedTasks[taskIdToIndex[ta.task_id]].id,
                user_id: ta.user_id,
              }));

            if (newTaskAssignees.length > 0) {
              await supabase.from("template_task_assignees").insert(newTaskAssignees);
            }
          }
        }
      }

      return newTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-templates"] });
      toast.success("Projeto salvo como modelo!");
    },
    onError: () => {
      toast.error("Erro ao salvar como modelo");
    },
  });

  return {
    duplicateProject,
    saveAsTemplate,
  };
}

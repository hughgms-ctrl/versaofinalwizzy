import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { Button } from "@/fluzz/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { ArrowLeft, Edit } from "lucide-react";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { Skeleton } from "@/fluzz/components/ui/skeleton";

export default function GettingStartedDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin, isGestor } = useWorkspace();
  const canEdit = isAdmin || isGestor;

  const { data: section, isLoading } = useQuery({
    queryKey: ["getting-started-section", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("getting_started_sections")
        .select("*")
        .eq("id", id!)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-6 max-w-4xl mx-auto">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-96" />
        </div>
      </AppLayout>
    );
  }

  if (!section) {
    return (
      <AppLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Página não encontrada</p>
          <Button onClick={() => navigate("/tools/wizzy-flow/workspace/getting-started")} className="mt-4">
            Voltar
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl mx-auto px-2 md:px-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/tools/wizzy-flow/workspace/getting-started")}>
              <ArrowLeft size={20} />
            </Button>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                {section.title}
              </h1>
            </div>
          </div>
          {canEdit && (
            <Button 
              onClick={() => navigate(`/tools/wizzy-flow/workspace/getting-started/${section.id}/edit`)} 
              size="sm"
              className="gap-2"
            >
              <Edit size={14} />
              Editar
            </Button>
          )}
        </div>

        <Card>
          <CardContent className="pt-6">
            <div 
              className="prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: section.content || "" }}
            />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

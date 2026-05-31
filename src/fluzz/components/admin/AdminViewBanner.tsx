import { useNavigate } from "react-router-dom";
import { useAdminView } from "@/fluzz/contexts/AdminViewContext";
import { Button } from "@/fluzz/components/ui/button";
import { Shield, X, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const AdminViewBanner = () => {
  const { activeSession, isAdminViewing, endSession, isLoading } = useAdminView();
  const navigate = useNavigate();

  if (!isAdminViewing || !activeSession) return null;

  const expiresAt = new Date(activeSession.expires_at);

  const handleEndSession = async () => {
    await endSession();
    navigate("/tools/wizzy-flow/admin/users");
  };

  return (
    <div className="bg-orange-500 text-white px-4 py-3 flex items-center justify-between gap-4 flex-wrap shadow-lg">
      <div className="flex items-center gap-3">
        <Shield className="h-5 w-5" />
        <div className="text-sm">
          <span className="font-bold">MODO ADMINISTRADOR:</span>{" "}
          <span>Visualizando workspace "{activeSession.workspace_name}"</span>
          <span className="hidden sm:inline opacity-80 ml-2">
            • Expira às {format(expiresAt, "HH:mm", { locale: ptBR })}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate("/tools/wizzy-flow/admin/users")}
          className="h-7 text-xs bg-white/20 hover:bg-white/30 text-white border-0"
        >
          <ExternalLink className="h-3 w-3 mr-1" />
          Voltar ao Painel
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleEndSession}
          disabled={isLoading}
          className="h-7 text-xs bg-transparent border-white/50 text-white hover:bg-white/20"
        >
          <X className="h-3 w-3 mr-1" />
          Encerrar Sessão
        </Button>
      </div>
    </div>
  );
};

import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock, ArrowRight, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentUserRole } from "@/hooks/useUserPermissions";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moduleName?: string;
}

const UpgradeModal = ({ open, onOpenChange, moduleName }: UpgradeModalProps) => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { selectedWorkspace } = useWorkspaceContext();
  const activeOrganizationId = selectedWorkspace?.organization_id || profile?.organization_id || null;
  const { data: userRole } = useCurrentUserRole(activeOrganizationId);
  const canManageBilling = userRole === "owner" || userRole === "admin";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl">
            Recurso disponivel no upgrade
          </DialogTitle>
          <DialogDescription className="text-center">
            {moduleName
              ? `O modulo "${moduleName}" nao esta disponivel no plano atual.`
              : "Este recurso nao esta disponivel no plano atual."}
            {" "}
            {canManageBilling
              ? "Faca upgrade para desbloquear."
              : "Peca ao administrador do workspace para ajustar o plano."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 mt-4">
          {canManageBilling && (
            <Button
              onClick={() => {
                onOpenChange(false);
                navigate("/plans");
              }}
              className="w-full"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Ver planos e fazer upgrade
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full">
            Agora nao
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UpgradeModal;

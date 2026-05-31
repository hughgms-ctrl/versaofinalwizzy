import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useAuth } from "@/fluzz/contexts/AuthContext";
import { useIsMobile } from "@/fluzz/hooks/use-mobile";
import { usePWAInstall } from "@/fluzz/hooks/usePWAInstall";
import { usePushNotifications } from "@/fluzz/hooks/usePushNotifications";
import { X, Check, Camera, Download, Bell, ChevronRight, ChevronLeft } from "lucide-react";
import { Button } from "@/fluzz/components/ui/button";
import { cn } from "@/fluzz/lib/utils";
import { useNavigate } from "react-router-dom";

const SESSION_KEY = "setup_popup_dismissed_session";
const COMPLETED_KEY_PREFIX = "setup_popup_completed_v1";

interface SetupTask {
  id: "photo" | "pwa" | "notifications";
  title: string;
  description: string;
  icon: React.ReactNode;
  completed: boolean;
  action: () => void;
  instructions: string[];
}

export function SetupPopup() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const {
    isInstalled,
    isIOS,
    canShowPrompt,
    install,
    isInitialized: isPWAReady,
  } = usePWAInstall();
  const {
    isSubscribed,
    subscribe,
    permission,
    isInitialized: isPushReady,
  } = usePushNotifications();

  const completedKey = user ? `${COMPLETED_KEY_PREFIX}:${user.id}` : COMPLETED_KEY_PREFIX;
  const isCompletedInBrowser =
    !!user && typeof window !== "undefined" && localStorage.getItem(completedKey) === "true";

  const [isDismissed, setIsDismissed] = useState(false);
  const [showInstructions, setShowInstructions] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);

  // Check if dismissed this session
  useEffect(() => {
    const dismissed = sessionStorage.getItem(SESSION_KEY);
    if (dismissed === "true") {
      setIsDismissed(true);
    }
  }, []);

  // Fetch profile to check for avatar
  const { data: profile, isPending: isProfilePending } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const isSetupStatusReady = !isProfilePending && isPWAReady && isPushReady;

  const hasPhoto = !!profile?.avatar_url;
  const hasPWA = isInstalled;
  const hasNotifications = isSubscribed;

  // All tasks completed
  const allCompleted = hasPhoto && hasPWA && hasNotifications;

  // Persist completion per user (prevents any future “flash” on navigation)
  useEffect(() => {
    if (!user) return;
    if (!isSetupStatusReady) return;
    if (!allCompleted) return;

    try {
      localStorage.setItem(completedKey, "true");
    } catch {
      // ignore storage failures
    }
  }, [user, isSetupStatusReady, allCompleted, completedKey]);

  // Define setup tasks
  const tasks: SetupTask[] = [
    {
      id: "photo",
      title: "Adicionar foto",
      description: "Coloque sua foto de perfil",
      icon: <Camera className="h-5 w-5" />,
      completed: hasPhoto,
      action: () => navigate("/tools/wizzy-flow/profile"),
      instructions: [
        "Toque no botão abaixo para ir ao seu perfil",
        "Clique em 'Alterar Foto'",
        "Escolha uma foto da sua galeria",
        "Salve as alterações",
      ],
    },
    {
      id: "pwa",
      title: "Instalar aplicativo",
      description: "Adicione o Wizzy Flow à sua tela inicial",
      icon: <Download className="h-5 w-5" />,
      completed: hasPWA,
      action: async () => {
        if (canShowPrompt) {
          await install();
        } else {
          navigate("/tools/wizzy-flow/install");
        }
      },
      instructions: isIOS
        ? [
            "Toque no botão de compartilhar (ícone de quadrado com seta)",
            "Role para baixo e toque em 'Adicionar à Tela de Início'",
            "Toque em 'Adicionar' no canto superior direito",
          ]
        : [
            "Toque no botão abaixo para instalar",
            "Se aparecer um banner, toque em 'Instalar'",
            "O app será adicionado à sua tela inicial",
          ],
    },
    {
      id: "notifications",
      title: "Ativar notificações",
      description: "Receba lembretes de tarefas",
      icon: <Bell className="h-5 w-5" />,
      completed: hasNotifications,
      action: async () => {
        if (permission === "denied") {
          navigate("/tools/wizzy-flow/profile");
        } else {
          await subscribe();
        }
      },
      instructions:
        permission === "denied"
          ? [
              "As notificações estão bloqueadas",
              "Acesse as configurações do navegador",
              "Permita notificações para este site",
              "Volte e tente novamente",
            ]
          : [
              "Toque no botão abaixo para ativar",
              "Quando solicitado, toque em 'Permitir'",
              "Pronto! Você receberá lembretes importantes",
            ],
    },
  ];

  // Filter to show only incomplete tasks (or all if inside PWA and missing photo/notifications)
  const pendingTasks = tasks.filter((task) => {
    if (hasPWA) {
      // Inside PWA: only show photo and notifications if incomplete
      return (task.id === "photo" || task.id === "notifications") && !task.completed;
    }
    return !task.completed;
  });

  const handleDismiss = () => {
    sessionStorage.setItem(SESSION_KEY, "true");
    setIsDismissed(true);
  };

  const handleTaskAction = (task: SetupTask) => {
    if (showInstructions === task.id) {
      task.action();
    } else {
      setShowInstructions(task.id);
    }
  };

  // Don't show on desktop
  if (!isMobile) return null;

  // Don't show if not logged in
  if (!user) return null;

  // Nunca piscar se já foi concluído neste navegador
  if (isCompletedInBrowser) return null;

  // Evita “flash”: só renderiza depois de sabermos o status real das 3 tarefas
  if (!isSetupStatusReady) return null;

  // Don't show if all completed
  if (allCompleted) return null;

  // Don't show if no pending tasks
  if (pendingTasks.length === 0) return null;

  // Don't show if dismissed this session
  if (isDismissed) return null;

  const currentInstructionTask = tasks.find((t) => t.id === showInstructions);

  return (
    <div
      className={cn(
        "fixed bottom-20 left-4 right-4 z-50 animate-in slide-in-from-bottom-4 duration-300",
        "bg-card border border-border rounded-xl shadow-lg",
        isMinimized && "bottom-4"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span className="text-sm font-medium text-foreground">
            {isMinimized
              ? `${pendingTasks.length} ${pendingTasks.length === 1 ? "passo" : "passos"} restante${pendingTasks.length === 1 ? "" : "s"}`
              : "Complete sua configuração"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsMinimized(!isMinimized)}
          >
            {isMinimized ? (
              <ChevronLeft className="h-4 w-4 rotate-90" />
            ) : (
              <ChevronLeft className="h-4 w-4 -rotate-90" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={handleDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {!isMinimized && (
        <div className="p-3 space-y-2">
          {/* Progress indicator */}
          <div className="flex items-center gap-1 mb-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors",
                  task.completed ? "bg-green-500" : "bg-muted"
                )}
              />
            ))}
          </div>

          {/* Show instructions or task list */}
          {showInstructions && currentInstructionTask ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowInstructions(null)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="font-medium text-sm">{currentInstructionTask.title}</span>
              </div>

              <ol className="space-y-2 pl-4">
                {currentInstructionTask.instructions.map((instruction, index) => (
                  <li
                    key={index}
                    className="text-xs text-muted-foreground flex items-start gap-2"
                  >
                    <span className="font-medium text-foreground min-w-[16px]">
                      {index + 1}.
                    </span>
                    {instruction}
                  </li>
                ))}
              </ol>

              <Button
                className="w-full mt-2"
                size="sm"
                onClick={() => currentInstructionTask.action()}
              >
                {currentInstructionTask.id === "photo"
                  ? "Ir para Perfil"
                  : currentInstructionTask.id === "pwa"
                    ? canShowPrompt
                      ? "Instalar Agora"
                      : "Ver Instruções"
                    : "Ativar Notificações"}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {pendingTasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => handleTaskAction(task)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-lg transition-colors",
                    "bg-muted/50 hover:bg-muted",
                    task.completed && "opacity-50"
                  )}
                >
                  <div
                    className={cn(
                      "h-10 w-10 rounded-full flex items-center justify-center",
                      task.completed
                        ? "bg-green-500/20 text-green-500"
                        : "bg-primary/10 text-primary"
                    )}
                  >
                    {task.completed ? <Check className="h-5 w-5" /> : task.icon}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-foreground">{task.title}</p>
                    <p className="text-xs text-muted-foreground">{task.description}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

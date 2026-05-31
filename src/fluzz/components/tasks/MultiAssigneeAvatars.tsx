import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/fluzz/components/ui/avatar";
import { User, Plus, CheckCircle2, UserRoundPlus } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/fluzz/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/fluzz/components/ui/popover";
import { cn } from "@/fluzz/lib/utils";

interface MultiAssigneeAvatarsProps {
  taskId: string;
  assignees?: { user_id: string; is_reviewer?: boolean }[];
  externalAssigneeIds?: string[];
  maxDisplay?: number;
  size?: "sm" | "md" | "lg";
  showAddButton?: boolean;
  onAddClick?: () => void;
  className?: string;
}

const sizeClasses = {
  sm: "h-6 w-6 text-xs",
  md: "h-7 w-7 text-xs",
  lg: "h-8 w-8 text-sm",
};

const overlapClasses = {
  sm: "-ml-2",
  md: "-ml-2.5",
  lg: "-ml-3",
};

export function MultiAssigneeAvatars({
  taskId,
  assignees = [],
  externalAssigneeIds = [],
  maxDisplay = 3,
  size = "md",
  showAddButton = false,
  onAddClick,
  className,
}: MultiAssigneeAvatarsProps) {
  const [showAllPopover, setShowAllPopover] = useState(false);

  // Fetch profiles for internal assignees
  const userIds = assignees.map(a => a.user_id);
  const { data: profiles } = useQuery({
    queryKey: ["profiles-multi", userIds],
    queryFn: async () => {
      if (userIds.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", userIds);
      if (error) throw error;
      return data;
    },
    enabled: userIds.length > 0,
  });

  // Fetch external participants
  const { data: externalParticipants } = useQuery({
    queryKey: ["external-participants-avatars", externalAssigneeIds],
    queryFn: async () => {
      if (externalAssigneeIds.length === 0) return [];
      const { data, error } = await supabase
        .from("external_participants")
        .select("id, name, phone")
        .in("id", externalAssigneeIds);
      if (error) throw error;
      return data;
    },
    enabled: externalAssigneeIds.length > 0,
  });

  const totalCount = assignees.length + externalAssigneeIds.length;
  const displayedAssignees = assignees.slice(0, maxDisplay);
  const remainingInternalSlots = Math.max(0, maxDisplay - displayedAssignees.length);
  const displayedExternals = (externalParticipants || []).slice(0, remainingInternalSlots);
  const displayedTotal = displayedAssignees.length + displayedExternals.length;
  const remainingCount = totalCount - displayedTotal;

  const getProfile = (userId: string) => profiles?.find(p => p.id === userId);
  const getInitials = (name: string | null) => name ? name.charAt(0).toUpperCase() : null;

  if (totalCount === 0 && !showAddButton) {
    return (
      <div className="flex justify-center">
        <Avatar className={cn(sizeClasses[size])}>
          <AvatarFallback className="bg-muted">
            <User className="h-3 w-3 text-muted-foreground" />
          </AvatarFallback>
        </Avatar>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center", className)}>
      <TooltipProvider>
        <div className="flex items-center">
          {/* Internal assignees */}
          {displayedAssignees.map((assignee, index) => {
            const profile = getProfile(assignee.user_id);
            const initials = getInitials(profile?.full_name || null);
            const isReviewer = assignee.is_reviewer;
            
            return (
              <Tooltip key={assignee.user_id}>
                <TooltipTrigger asChild>
                  <div className="relative">
                    <Avatar 
                      className={cn(
                        sizeClasses[size],
                        "border-2 cursor-pointer hover:z-10 transition-transform hover:scale-110",
                        isReviewer ? "border-amber-400" : "border-background",
                        index > 0 && overlapClasses[size]
                      )}
                    >
                      <AvatarImage src={profile?.avatar_url || undefined} />
                      <AvatarFallback className={cn(
                        "font-medium",
                        isReviewer ? "bg-amber-500/20 text-amber-600" : "bg-primary/10 text-primary"
                      )}>
                        {initials || <User className="h-3 w-3" />}
                      </AvatarFallback>
                    </Avatar>
                    {isReviewer && (
                      <div className="absolute -bottom-0.5 -right-0.5 bg-amber-500 rounded-full p-0.5">
                        <CheckCircle2 className="h-2 w-2 text-white" />
                      </div>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{profile?.full_name || "Usuário"}{isReviewer ? ' (Aprovador)' : ''}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}

          {/* External assignees */}
          {displayedExternals.map((ext, index) => (
            <Tooltip key={ext.id}>
              <TooltipTrigger asChild>
                <div className="relative">
                  <Avatar 
                    className={cn(
                      sizeClasses[size],
                      "border-2 border-dashed border-accent cursor-pointer hover:z-10 transition-transform hover:scale-110",
                      (displayedAssignees.length + index) > 0 && overlapClasses[size]
                    )}
                  >
                    <AvatarFallback className="bg-accent text-accent-foreground font-medium">
                      {ext.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-0.5 -right-0.5 bg-accent rounded-full p-0.5">
                    <UserRoundPlus className="h-2 w-2 text-accent-foreground" />
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>{ext.name} (Externo)</p>
              </TooltipContent>
            </Tooltip>
          ))}

          {remainingCount > 0 && (
            <Popover open={showAllPopover} onOpenChange={setShowAllPopover}>
              <PopoverTrigger asChild>
                <Avatar 
                  className={cn(
                    sizeClasses[size],
                    "border-2 border-background cursor-pointer hover:z-10 transition-transform hover:scale-110",
                    overlapClasses[size]
                  )}
                >
                  <AvatarFallback className="bg-muted text-muted-foreground font-medium">
                    +{remainingCount}
                  </AvatarFallback>
                </Avatar>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="start">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Todos os responsáveis
                  </p>
                  {assignees.map(assignee => {
                    const profile = getProfile(assignee.user_id);
                    return (
                      <div key={assignee.user_id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted">
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={profile?.avatar_url || undefined} />
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {getInitials(profile?.full_name || null) || <User className="h-2 w-2" />}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm truncate">{profile?.full_name || "Usuário"}</span>
                      </div>
                    );
                  })}
                  {(externalParticipants || []).map(ext => (
                    <div key={ext.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted">
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="bg-accent text-accent-foreground text-xs">
                          {ext.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm truncate">{ext.name}</span>
                      <UserRoundPlus className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {showAddButton && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddClick?.();
                  }}
                  className={cn(
                    sizeClasses[size],
                    "border-2 border-dashed border-muted-foreground/30 rounded-full flex items-center justify-center",
                    "hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer",
                    totalCount > 0 && overlapClasses[size]
                  )}
                >
                  <Plus className="h-3 w-3 text-muted-foreground" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Adicionar responsável</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </TooltipProvider>
    </div>
  );
}

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useAuth } from "./AuthContext";

interface AdminContextType {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  adminRole: "super_admin" | "admin" | "employee" | null;
  loading: boolean;
  checkAdminStatus: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export const AdminProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [adminRole, setAdminRole] = useState<"super_admin" | "admin" | "employee" | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAdminStatus = async () => {
    if (!user) {
      setIsAdmin(false);
      setIsSuperAdmin(false);
      setAdminRole(null);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("admin_users")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (error || !data) {
        setIsAdmin(false);
        setIsSuperAdmin(false);
        setAdminRole(null);
      } else {
        setIsAdmin(true);
        setIsSuperAdmin(data.role === "super_admin");
        setAdminRole(data.role as "super_admin" | "admin" | "employee");
      }
    } catch {
      setIsAdmin(false);
      setIsSuperAdmin(false);
      setAdminRole(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAdminStatus();
  }, [user]);

  return (
    <AdminContext.Provider
      value={{
        isAdmin,
        isSuperAdmin,
        adminRole,
        loading,
        checkAdminStatus,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
};

export const useAdmin = () => {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error("useAdmin must be used within an AdminProvider");
  }
  return context;
};

import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { SidebarProvider } from "@/contexts/SidebarContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { NotificationProvider } from "@/components/NotificationProvider";
import Index from "./pages/Index";
import AuthPage from "./pages/AuthPage";
import ConversationsPage from "./pages/ConversationsPage";
import ContactsPage from "./pages/ContactsPage";
import PipelinePage from "./pages/PipelinePage";
import AgentsPage from "./pages/AgentsPage";
import AgentEditorPage from "./pages/AgentEditorPage";
import MasterAgentEditorPage from "./pages/MasterAgentEditorPage";
import FlowBuilderPage from "./pages/FlowBuilderPage";
import FlowsPage from "./pages/FlowsPage";
import TeamPage from "./pages/TeamPage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";
import ScheduledMessagesPage from "./pages/ScheduledMessagesPage";
import ProfilePage from "./pages/ProfilePage";
import WidgetsPage from "./pages/WidgetsPage";
import WidgetEditorPage from "./pages/WidgetEditorPage";
import DocumentsPage from "./pages/DocumentsPage";
import IntegrationsPage from "./pages/IntegrationsPage";
import PublicFormPage from "./pages/PublicFormPage";
import PublicPackFormPage from "./pages/PublicPackFormPage";
import SignaturePage from "./pages/SignaturePage";
import PublicSignaturePage from "./pages/PublicSignaturePage";
import PublicBookingPage from "./pages/PublicBookingPage";
import NotFound from "./pages/NotFound";
import CampaignsPage from "./pages/CampaignsPage";
import CalendarPage from "./pages/CalendarPage";
import AdminPage from "./pages/AdminPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminClientsPage from "./pages/admin/AdminClientsPage";
import AdminPlansPage from "./pages/admin/AdminPlansPage";
import AdminApiPage from "./pages/admin/AdminApiPage";
import AdminGovernancePage from "./pages/admin/AdminGovernancePage";
import AdminSecurityPage from "./pages/admin/AdminSecurityPage";
import AdminHistoryPage from "./pages/admin/AdminHistoryPage";
import { AdminProtectedRoute } from "@/components/admin/AdminProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SidebarProvider>
          <WorkspaceProvider>
            <TooltipProvider>
              <NotificationProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter>
                  <Routes>
                    <Route path="/auth" element={<AuthPage />} />
                    <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                    <Route path="/conversations" element={<ProtectedRoute><ConversationsPage /></ProtectedRoute>} />
                    <Route path="/contacts" element={<ProtectedRoute><ContactsPage /></ProtectedRoute>} />
                    <Route path="/pipeline" element={<ProtectedRoute><PipelinePage /></ProtectedRoute>} />
                    <Route path="/agents" element={<ProtectedRoute><AgentsPage /></ProtectedRoute>} />
                    <Route path="/agents/:agentId" element={<ProtectedRoute><AgentEditorPage /></ProtectedRoute>} />
                    <Route path="/master-agent/:promptId" element={<ProtectedRoute><MasterAgentEditorPage /></ProtectedRoute>} />
                    <Route path="/flows" element={<ProtectedRoute><FlowsPage /></ProtectedRoute>} />
                    <Route path="/flow-builder" element={<ProtectedRoute><FlowBuilderPage /></ProtectedRoute>} />
                    <Route path="/team" element={<ProtectedRoute><TeamPage /></ProtectedRoute>} />
                    <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
                    <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                    <Route path="/scheduled" element={<ProtectedRoute><ScheduledMessagesPage /></ProtectedRoute>} />
                    <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                    <Route path="/widgets" element={<ProtectedRoute><WidgetsPage /></ProtectedRoute>} />
                    <Route path="/widgets/:widgetId" element={<ProtectedRoute><WidgetEditorPage /></ProtectedRoute>} />
                    <Route path="/documents" element={<ProtectedRoute><DocumentsPage /></ProtectedRoute>} />
                    <Route path="/integrations" element={<ProtectedRoute><IntegrationsPage /></ProtectedRoute>} />
                    <Route path="/form" element={<PublicFormPage />} />
                    <Route path="/pack-form" element={<PublicPackFormPage />} />
                    <Route path="/signature/:documentId" element={<SignaturePage />} />
                    <Route path="/sign/:token" element={<PublicSignaturePage />} />
                    <Route path="/agendar/:slug" element={<PublicBookingPage />} />
                    <Route path="/campaigns" element={<ProtectedRoute><CampaignsPage /></ProtectedRoute>} />
                    <Route path="/calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
                    <Route path="/admin/login" element={<AdminLoginPage />} />
                    <Route path="/admin" element={<AdminProtectedRoute><AdminPage /></AdminProtectedRoute>} />
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </BrowserRouter>
              </NotificationProvider>
            </TooltipProvider>
          </WorkspaceProvider>
        </SidebarProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;

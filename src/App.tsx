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
import { PrivacyProvider } from "@/contexts/PrivacyContext";
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
import ToolsPage from "./pages/ToolsPage";
import QuizListPage from "./pages/QuizListPage";
import QuizBuilderPage from "./pages/QuizBuilderPage";
import PublicQuizPage from "./pages/PublicQuizPage";
import IntegrationsPage from "./pages/IntegrationsPage";
import PublicFormPage from "./pages/PublicFormPage";
import PublicPackFormPage from "./pages/PublicPackFormPage";
import SignaturePage from "./pages/SignaturePage";
import PublicSignaturePage from "./pages/PublicSignaturePage";
import PublicVerificationPage from "./pages/PublicVerificationPage";
import PublicBookingPage from "./pages/PublicBookingPage";
import PublicDocumentFillPage from "./pages/PublicDocumentFillPage";
import NotFound from "./pages/NotFound";
import CampaignsPage from "./pages/CampaignsPage";
import CalendarPage from "./pages/CalendarPage";
import OperationsPage from "./pages/OperationsPage";
import MyTasksPage from "./pages/MyTasksPage";
import DeadlinesCalendarPage from "./pages/DeadlinesCalendarPage";
import CaseTemplatesPage from "./pages/CaseTemplatesPage";
import LandingPage from "./pages/LandingPage";
import PlansPage from "./pages/PlansPage";
import OnboardingPage from "./pages/OnboardingPage";
import AdminPage from "./pages/AdminPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminClientsPage from "./pages/admin/AdminClientsPage";
import AdminPlansPage from "./pages/admin/AdminPlansPage";
import AdminPackagesPage from "./pages/admin/AdminPackagesPage";
import AdminApiPage from "./pages/admin/AdminApiPage";
import AdminGovernancePage from "./pages/admin/AdminGovernancePage";
import AdminSecurityPage from "./pages/admin/AdminSecurityPage";
import AdminHistoryPage from "./pages/admin/AdminHistoryPage";
import AdminMonitoringPage from "./pages/admin/AdminMonitoringPage";
import AdminDocsPage from "./pages/admin/AdminDocsPage";
import { AdminProtectedRoute } from "@/components/admin/AdminProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SidebarProvider>
          <WorkspaceProvider>
            <TooltipProvider>
              <PrivacyProvider>
              <NotificationProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter>
                  <Routes>
                    <Route path="/landing" element={<LandingPage />} />
                    <Route path="/auth" element={<AuthPage />} />
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
                    <Route path="/dashboard" element={<ProtectedRoute><Index /></ProtectedRoute>} />
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
                    <Route path="/tools" element={<ProtectedRoute><ToolsPage /></ProtectedRoute>} />
                    <Route path="/tools/buttons" element={<ProtectedRoute><WidgetsPage /></ProtectedRoute>} />
                    <Route path="/tools/buttons/:widgetId" element={<ProtectedRoute><WidgetEditorPage /></ProtectedRoute>} />
                    <Route path="/tools/documents" element={<ProtectedRoute><DocumentsPage /></ProtectedRoute>} />
                    <Route path="/tools/quiz" element={<ProtectedRoute><QuizListPage /></ProtectedRoute>} />
                    <Route path="/tools/quiz/builder" element={<ProtectedRoute><QuizBuilderPage /></ProtectedRoute>} />
                    <Route path="/widgets" element={<ProtectedRoute><WidgetsPage /></ProtectedRoute>} />
                    <Route path="/widgets/:widgetId" element={<ProtectedRoute><WidgetEditorPage /></ProtectedRoute>} />
                    <Route path="/documents" element={<ProtectedRoute><DocumentsPage /></ProtectedRoute>} />
                    <Route path="/integrations" element={<ProtectedRoute><IntegrationsPage /></ProtectedRoute>} />
                    <Route path="/form" element={<PublicFormPage />} />
                    <Route path="/pack-form" element={<PublicPackFormPage />} />
                    <Route path="/q/:token" element={<PublicQuizPage />} />
                    <Route path="/signature/:documentId" element={<SignaturePage />} />
                    <Route path="/sign/:token" element={<PublicSignaturePage />} />
                    <Route path="/verificar" element={<PublicVerificationPage />} />
                    <Route path="/verificar/:codigo" element={<PublicVerificationPage />} />
                    <Route path="/agendar/:slug" element={<PublicBookingPage />} />
                    <Route path="/preencher-contrato/:token" element={<PublicDocumentFillPage />} />
                    <Route path="/campaigns" element={<ProtectedRoute><CampaignsPage /></ProtectedRoute>} />
                    <Route path="/calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
                    <Route path="/operations" element={<ProtectedRoute><OperationsPage /></ProtectedRoute>} />
                    <Route path="/operations/tasks" element={<ProtectedRoute><MyTasksPage /></ProtectedRoute>} />
                    <Route path="/operations/deadlines" element={<ProtectedRoute><DeadlinesCalendarPage /></ProtectedRoute>} />
                    <Route path="/operations/templates" element={<ProtectedRoute><CaseTemplatesPage /></ProtectedRoute>} />
                    <Route path="/plans" element={<ProtectedRoute><PlansPage /></ProtectedRoute>} />
                    <Route path="/admin/login" element={<AdminLoginPage />} />
                    <Route path="/admin" element={<AdminProtectedRoute><AdminPage /></AdminProtectedRoute>} />
                    <Route path="/admin/clients" element={<AdminProtectedRoute><AdminClientsPage /></AdminProtectedRoute>} />
                    <Route path="/admin/plans" element={<AdminProtectedRoute><AdminPlansPage /></AdminProtectedRoute>} />
                    <Route path="/admin/packages" element={<AdminProtectedRoute><AdminPackagesPage /></AdminProtectedRoute>} />
                    <Route path="/admin/api" element={<AdminProtectedRoute><AdminApiPage /></AdminProtectedRoute>} />
                    <Route path="/admin/governance" element={<AdminProtectedRoute><AdminGovernancePage /></AdminProtectedRoute>} />
                    <Route path="/admin/security" element={<AdminProtectedRoute><AdminSecurityPage /></AdminProtectedRoute>} />
                    <Route path="/admin/monitoring" element={<AdminProtectedRoute><AdminMonitoringPage /></AdminProtectedRoute>} />
                    <Route path="/admin/docs" element={<AdminProtectedRoute><AdminDocsPage /></AdminProtectedRoute>} />
                    <Route path="/admin/history" element={<AdminProtectedRoute><AdminHistoryPage /></AdminProtectedRoute>} />
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </BrowserRouter>
              </NotificationProvider>
              </PrivacyProvider>
            </TooltipProvider>
          </WorkspaceProvider>
        </SidebarProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;

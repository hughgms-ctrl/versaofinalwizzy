import React, { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { SidebarProvider } from "@/contexts/SidebarContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { PrivacyProvider } from "@/contexts/PrivacyContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { NotificationProvider } from "@/components/NotificationProvider";
import { AdminProtectedRoute } from "@/components/admin/AdminProtectedRoute";

const Index = lazy(() => import("./pages/Index"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const ConversationsPage = lazy(() => import("./pages/ConversationsPage"));
const ContactsPage = lazy(() => import("./pages/ContactsPage"));
const PipelinePage = lazy(() => import("./pages/PipelinePage"));
const AgentsPage = lazy(() => import("./pages/AgentsPage"));
const AgentEditorPage = lazy(() => import("./pages/AgentEditorPage"));
const MasterAgentEditorPage = lazy(() => import("./pages/MasterAgentEditorPage"));
const FlowBuilderPage = lazy(() => import("./pages/FlowBuilderPage"));
const FlowsPage = lazy(() => import("./pages/FlowsPage"));
const TeamPage = lazy(() => import("./pages/TeamPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const ScheduledMessagesPage = lazy(() => import("./pages/ScheduledMessagesPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const WidgetsPage = lazy(() => import("./pages/WidgetsPage"));
const WidgetEditorPage = lazy(() => import("./pages/WidgetEditorPage"));
const DocumentsPage = lazy(() => import("./pages/DocumentsPage"));
const ToolsPage = lazy(() => import("./pages/ToolsPage"));
const WizzyFlowPage = lazy(() => import("./pages/WizzyFlowPage"));
const QuizListPage = lazy(() => import("./pages/QuizListPage"));
const QuizBuilderPage = lazy(() => import("./pages/QuizBuilderPage"));
const PublicQuizPage = lazy(() => import("./pages/PublicQuizPage"));
const IntegrationsPage = lazy(() => import("./pages/IntegrationsPage"));
const PublicFormPage = lazy(() => import("./pages/PublicFormPage"));
const PublicPackFormPage = lazy(() => import("./pages/PublicPackFormPage"));
const SignaturePage = lazy(() => import("./pages/SignaturePage"));
const PublicSignaturePage = lazy(() => import("./pages/PublicSignaturePage"));
const PublicVerificationPage = lazy(() => import("./pages/PublicVerificationPage"));
const PublicBookingPage = lazy(() => import("./pages/PublicBookingPage"));
const PublicDocumentFillPage = lazy(() => import("./pages/PublicDocumentFillPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const CampaignsPage = lazy(() => import("./pages/CampaignsPage"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const LandingPage = lazy(() => import("./pages/LandingPage"));
const PlansPage = lazy(() => import("./pages/PlansPage"));
const SubscriptionPage = lazy(() => import("./pages/SubscriptionPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const AdminLoginPage = lazy(() => import("./pages/AdminLoginPage"));
const AdminClientsPage = lazy(() => import("./pages/admin/AdminClientsPage"));
const AdminPlansPage = lazy(() => import("./pages/admin/AdminPlansPage"));
const AdminWhatsAppIntegrationsPage = lazy(() => import("./pages/admin/AdminWhatsAppIntegrationsPage"));
const AdminPaymentGatewaysPage = lazy(() => import("./pages/admin/AdminPaymentGatewaysPage"));
const AdminAIPage = lazy(() => import("./pages/admin/AdminAIPage"));
const AdminOperationsPage = lazy(() => import("./pages/admin/AdminOperationsPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

const RouteLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
    Carregando...
  </div>
);

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
                  <Suspense fallback={<RouteLoader />}>
                    <Routes>
                      <Route path="/landing" element={<LandingPage />} />
                      <Route path="/auth" element={<AuthPage />} />
                      <Route path="/" element={<LandingPage />} />
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
                      <Route path="/tools/wizzy-flow/*" element={<ProtectedRoute><WizzyFlowPage /></ProtectedRoute>} />
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
                      <Route path="/plans" element={<ProtectedRoute><PlansPage /></ProtectedRoute>} />
                      <Route path="/subscription" element={<ProtectedRoute><SubscriptionPage /></ProtectedRoute>} />
                      <Route path="/admin/login" element={<AdminLoginPage />} />
                      <Route path="/admin" element={<AdminProtectedRoute><AdminPage /></AdminProtectedRoute>} />
                      <Route path="/admin/clients" element={<AdminProtectedRoute><AdminClientsPage /></AdminProtectedRoute>} />
                      <Route path="/admin/plans" element={<AdminProtectedRoute><AdminPlansPage /></AdminProtectedRoute>} />
                      <Route path="/admin/payment-gateways" element={<AdminProtectedRoute><AdminPaymentGatewaysPage /></AdminProtectedRoute>} />
                      <Route path="/admin/ai" element={<AdminProtectedRoute><AdminAIPage /></AdminProtectedRoute>} />
                      <Route path="/admin/ai/usage" element={<AdminProtectedRoute><AdminAIPage /></AdminProtectedRoute>} />
                      <Route path="/admin/ai/models" element={<AdminProtectedRoute><AdminAIPage /></AdminProtectedRoute>} />
                      <Route path="/admin/ai/api" element={<AdminProtectedRoute><AdminAIPage /></AdminProtectedRoute>} />
                      <Route path="/admin/ai-models" element={<Navigate to="/admin/ai/models" replace />} />
                      <Route path="/admin/ai-usage" element={<Navigate to="/admin/ai/usage" replace />} />
                      <Route path="/admin/api" element={<Navigate to="/admin/ai/api" replace />} />
                      <Route path="/admin/whatsapp-apis" element={<AdminProtectedRoute><AdminWhatsAppIntegrationsPage /></AdminProtectedRoute>} />
                      <Route path="/admin/operations" element={<AdminProtectedRoute><AdminOperationsPage /></AdminProtectedRoute>} />
                      <Route path="/admin/operations/governance" element={<AdminProtectedRoute><AdminOperationsPage /></AdminProtectedRoute>} />
                      <Route path="/admin/operations/security" element={<AdminProtectedRoute><AdminOperationsPage /></AdminProtectedRoute>} />
                      <Route path="/admin/operations/monitoring" element={<AdminProtectedRoute><AdminOperationsPage /></AdminProtectedRoute>} />
                      <Route path="/admin/operations/docs" element={<AdminProtectedRoute><AdminOperationsPage /></AdminProtectedRoute>} />
                      <Route path="/admin/operations/history" element={<AdminProtectedRoute><AdminOperationsPage /></AdminProtectedRoute>} />
                      <Route path="/admin/governance" element={<Navigate to="/admin/operations/governance" replace />} />
                      <Route path="/admin/security" element={<Navigate to="/admin/operations/security" replace />} />
                      <Route path="/admin/monitoring" element={<Navigate to="/admin/operations/monitoring" replace />} />
                      <Route path="/admin/docs" element={<Navigate to="/admin/operations/docs" replace />} />
                      <Route path="/admin/history" element={<Navigate to="/admin/operations/history" replace />} />
                      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
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

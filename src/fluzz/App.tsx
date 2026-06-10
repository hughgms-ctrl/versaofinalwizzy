import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { WorkspaceProvider } from '@/fluzz/contexts/WorkspaceContext';
import { AuthProvider } from '@/fluzz/contexts/AuthContext';
import { ViewModeProvider } from '@/fluzz/contexts/ViewModeContext';
import { AdminProvider } from '@/fluzz/contexts/AdminContext';
import { AdminViewProvider } from '@/fluzz/contexts/AdminViewContext';

const Home = lazy(() => import('./pages/Home'));
const FocusProjects = lazy(() => import('./pages/FocusProjects'));
const Projects = lazy(() => import('./pages/Projects'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const MyTasks = lazy(() => import('./pages/MyTasks'));
const TaskDetail = lazy(() => import('./pages/TaskDetail'));
const Profile = lazy(() => import('./pages/Profile'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Workspace = lazy(() => import('./pages/Workspace'));
const Culture = lazy(() => import('./pages/workspace/Culture'));
const CultureForm = lazy(() => import('./pages/workspace/CultureForm'));
const Vision = lazy(() => import('./pages/workspace/Vision'));
const VisionForm = lazy(() => import('./pages/workspace/VisionForm'));
const Processes = lazy(() => import('./pages/workspace/Processes'));
const ProcessForm = lazy(() => import('./pages/workspace/ProcessForm'));
const Notes = lazy(() => import('./pages/workspace/Notes'));
const NoteForm = lazy(() => import('./pages/workspace/NoteForm'));
const NoteDetail = lazy(() => import('./pages/workspace/NoteDetail'));
const GettingStarted = lazy(() => import('./pages/workspace/GettingStarted'));
const GettingStartedForm = lazy(() => import('./pages/workspace/GettingStartedForm'));
const GettingStartedDetail = lazy(() => import('./pages/workspace/GettingStartedDetail'));
const Positions = lazy(() => import('./pages/Positions'));
const Inventory = lazy(() => import('./pages/Inventory'));
const PositionDetail = lazy(() => import('./pages/PositionDetail'));
const RoutineTaskDetail = lazy(() => import('./pages/RoutineTaskDetail'));
const BriefingRepository = lazy(() => import('./pages/BriefingRepository'));
const BriefingDocument = lazy(() => import('./pages/BriefingDocument'));
const TeamManagement = lazy(() => import('./pages/TeamManagement'));
const TeamMemberPermissions = lazy(() => import('./pages/TeamMemberPermissions'));
const AIAssistant = lazy(() => import('./pages/AIAssistant'));
const WorkloadOverview = lazy(() => import('./pages/WorkloadOverview'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Participants = lazy(() => import('./pages/workspace/Participants'));
const AIConfig = lazy(() => import('./pages/workspace/AIConfig'));

export const FLUZZ_BASE = '/tools/wizzy-flow';

const FluzzApp = () => (
  <ViewModeProvider>
    <AuthProvider>
      <WorkspaceProvider>
        <AdminProvider>
          <AdminViewProvider>
            <Suspense fallback={<div className="min-h-screen bg-background" />}>
              <Routes>
                <Route index element={<Home />} />
                <Route path="home" element={<Home />} />
                <Route path="workspace" element={<Workspace />} />
                <Route path="projects" element={<Projects />} />
                <Route path="focus-projects" element={<FocusProjects />} />
                <Route path="projects/:id" element={<ProjectDetail />} />
                <Route path="my-tasks" element={<MyTasks />} />
                <Route path="tasks/:id" element={<TaskDetail />} />
                <Route path="profile" element={<Profile />} />
                <Route path="analytics" element={<Analytics />} />
                <Route path="workspace/culture" element={<Culture />} />
                <Route path="workspace/culture/edit" element={<CultureForm />} />
                <Route path="workspace/vision" element={<Vision />} />
                <Route path="workspace/vision/edit" element={<VisionForm />} />
                <Route path="workspace/processes" element={<Processes />} />
                <Route path="workspace/processes/new" element={<ProcessForm />} />
                <Route path="workspace/processes/:id/edit" element={<ProcessForm />} />
                <Route path="workspace/notes" element={<Notes />} />
                <Route path="workspace/notes/new" element={<NoteForm />} />
                <Route path="workspace/notes/:id" element={<NoteDetail />} />
                <Route path="workspace/notes/:id/edit" element={<NoteForm />} />
                <Route path="workspace/getting-started" element={<GettingStarted />} />
                <Route path="workspace/getting-started/new" element={<GettingStartedForm />} />
                <Route path="workspace/getting-started/:id" element={<GettingStartedDetail />} />
                <Route path="workspace/getting-started/:id/edit" element={<GettingStartedForm />} />
                <Route path="positions" element={<Positions />} />
                <Route path="positions/:id" element={<PositionDetail />} />
                <Route path="routine-tasks/:id" element={<RoutineTaskDetail />} />
                <Route path="inventory" element={<Inventory />} />
                <Route path="workspace/participants" element={<Participants />} />
                <Route path="workspace/ai-config" element={<AIConfig />} />
                <Route path="briefings" element={<BriefingRepository />} />
                <Route path="briefing/:briefingId" element={<BriefingDocument />} />
                <Route path="team" element={<TeamManagement />} />
                <Route path="team/:userId" element={<TeamMemberPermissions />} />
                <Route path="ai-assistant" element={<AIAssistant />} />
                <Route path="workload" element={<WorkloadOverview />} />
                <Route path="auth" element={<Navigate to={FLUZZ_BASE} replace />} />
                <Route path="workspace/setup" element={<Navigate to={FLUZZ_BASE} replace />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AdminViewProvider>
        </AdminProvider>
      </WorkspaceProvider>
    </AuthProvider>
  </ViewModeProvider>
);

export default FluzzApp;

import { Navigate, Route, Routes } from 'react-router-dom';

import Home from './pages/Home';
import FocusProjects from './pages/FocusProjects';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import MyTasks from './pages/MyTasks';
import TaskDetail from './pages/TaskDetail';
import Profile from './pages/Profile';
import Analytics from './pages/Analytics';
import Workspace from './pages/Workspace';
import Culture from './pages/workspace/Culture';
import CultureForm from './pages/workspace/CultureForm';
import Vision from './pages/workspace/Vision';
import VisionForm from './pages/workspace/VisionForm';
import Processes from './pages/workspace/Processes';
import ProcessForm from './pages/workspace/ProcessForm';
import Notes from './pages/workspace/Notes';
import NoteForm from './pages/workspace/NoteForm';
import NoteDetail from './pages/workspace/NoteDetail';
import GettingStarted from './pages/workspace/GettingStarted';
import GettingStartedForm from './pages/workspace/GettingStartedForm';
import GettingStartedDetail from './pages/workspace/GettingStartedDetail';
import Positions from './pages/Positions';
import Inventory from './pages/Inventory';
import PositionDetail from './pages/PositionDetail';
import RoutineTaskDetail from './pages/RoutineTaskDetail';
import BriefingRepository from './pages/BriefingRepository';
import BriefingDocument from './pages/BriefingDocument';
import TeamManagement from './pages/TeamManagement';
import TeamMemberPermissions from './pages/TeamMemberPermissions';
import AIAssistant from './pages/AIAssistant';
import WorkloadOverview from './pages/WorkloadOverview';
import NotFound from './pages/NotFound';
import Participants from './pages/workspace/Participants';
import AIConfig from './pages/workspace/AIConfig';
import { WorkspaceProvider } from '@/fluzz/contexts/WorkspaceContext';
import { AuthProvider } from '@/fluzz/contexts/AuthContext';
import { ViewModeProvider } from '@/fluzz/contexts/ViewModeContext';
import { AdminProvider } from '@/fluzz/contexts/AdminContext';
import { AdminViewProvider } from '@/fluzz/contexts/AdminViewContext';

export const FLUZZ_BASE = '/tools/wizzy-flow';

const FluzzApp = () => (
  <ViewModeProvider>
    <AuthProvider>
      <WorkspaceProvider>
        <AdminProvider>
          <AdminViewProvider>
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
          </AdminViewProvider>
        </AdminProvider>
      </WorkspaceProvider>
    </AuthProvider>
  </ViewModeProvider>
);

export default FluzzApp;

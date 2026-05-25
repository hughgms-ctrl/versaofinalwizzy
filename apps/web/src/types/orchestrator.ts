// Orchestrator Visual Node Types

export type OrchestratorNodeType =
  | 'orch-trigger'
  | 'orch-agent'
  | 'orch-pipeline'
  | 'orch-tag'
  | 'orch-department'
  | 'orch-flow'
  | 'orch-delay'
  | 'orch-condition'
  | 'orch-human'
  | 'orch-document';

export interface OrchestratorNodeData {
  label: string;
  type: OrchestratorNodeType;
  config?: Record<string, unknown>;
}

export interface OrchestratorComponent {
  type: OrchestratorNodeType;
  label: string;
  description: string;
  icon: string;
  color: string;
}

export interface OrchestratorComponentCategory {
  id: string;
  label: string;
  icon: string;
  components: OrchestratorComponent[];
}

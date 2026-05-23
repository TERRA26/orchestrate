import type {
  OrchestratorRun,
  OrchestratorTask,
  OrchestratorTaskId,
  OrchestratorWorker,
  OrchestratorWorkerId,
} from "@orchestrate/contracts";

// ---------------------------------------------------------------------------
// Shared types for the Control Room components
// ---------------------------------------------------------------------------

export type SelectedEntity =
  | { type: "task"; id: OrchestratorTaskId; data: OrchestratorTask }
  | { type: "worker"; id: OrchestratorWorkerId; data: OrchestratorWorker };

export type EntityId = OrchestratorTaskId | OrchestratorWorkerId;

export interface ControlRoomRunInfo {
  run: OrchestratorRun | null;
  tasks: ReadonlyArray<OrchestratorTask>;
  workers: ReadonlyArray<OrchestratorWorker>;
}

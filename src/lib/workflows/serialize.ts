// Workflow DB row → DTO serialization (parses JSON-string columns).
import type { Workflow, WorkflowRun } from '@prisma/client'
import type {
  WorkflowDTO,
  WorkflowRunDTO,
  WorkflowRunLog,
  WorkflowStep,
  WorkflowTriggerConfig,
  WorkflowTriggerType,
} from '@/lib/types'

export function serializeWorkflow(workflow: Workflow): WorkflowDTO {
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    enabled: workflow.enabled,
    triggerType: workflow.triggerType as WorkflowTriggerType,
    triggerConfig: parseTriggerConfig(workflow.triggerConfig),
    steps: parseSteps(workflow.steps),
    runCount: workflow.runCount,
    createdAt: workflow.createdAt.toISOString(),
    createdBy: workflow.createdBy,
  }
}

export function parseTriggerConfig(raw: string): WorkflowTriggerConfig {
  try {
    const parsed = JSON.parse(raw) as WorkflowTriggerConfig
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function parseSteps(raw: string): WorkflowStep[] {
  try {
    const parsed = JSON.parse(raw) as WorkflowStep[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function serializeWorkflowRun(run: WorkflowRun, workflowName?: string): WorkflowRunDTO {
  return {
    id: run.id,
    workflowId: run.workflowId,
    workflowName,
    status: (run.status as WorkflowRunDTO['status']) ?? 'running',
    triggerLabel: run.triggerLabel,
    logs: parseRunLogs(run.logs),
    error: run.error,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
  }
}

export function parseRunLogs(raw: string | null): WorkflowRunLog[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as WorkflowRunLog[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

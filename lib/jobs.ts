// lib/jobs.ts
// Lightweight in-memory job tracker для one-shot bulk operations.
//
// Limitation: serverless cold starts wipe state. Adequate dla short-running
// jobs які finish synchronously у POST handler (sync model — caller dostanie
// result у responsie + job_id для archival lookup поки instance hot).
// Dla long-running async jobs з тривалим polling — TODO future migration na
// db-backed jobs table.

export type JobStatus = 'running' | 'completed' | 'failed'

export interface JobRecord<T = unknown> {
  id: string
  type: string
  status: JobStatus
  started_at: string
  finished_at?: string
  progress?: { processed: number; total: number }
  result?: T
  error?: string
}

const jobs = new Map<string, JobRecord>()

export function createJob<T = unknown>(type: string): JobRecord<T> {
  const id = crypto.randomUUID()
  const job: JobRecord<T> = {
    id,
    type,
    status: 'running',
    started_at: new Date().toISOString(),
  }
  jobs.set(id, job as JobRecord)
  return job
}

export function updateJob<T = unknown>(
  id: string,
  patch: Partial<JobRecord<T>>,
): JobRecord<T> | null {
  const existing = jobs.get(id) as JobRecord<T> | undefined
  if (!existing) return null
  const updated: JobRecord<T> = { ...existing, ...patch }
  jobs.set(id, updated as JobRecord)
  return updated
}

export function finishJob<T = unknown>(
  id: string,
  status: 'completed' | 'failed',
  result?: T,
  error?: string,
): JobRecord<T> | null {
  return updateJob<T>(id, {
    status,
    finished_at: new Date().toISOString(),
    result,
    error,
  })
}

export function getJob<T = unknown>(id: string): JobRecord<T> | null {
  return (jobs.get(id) as JobRecord<T> | undefined) ?? null
}

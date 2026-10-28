import { NextRequest, NextResponse, after } from 'next/server';
import { auth } from '@/auth';
import { randomUUID } from 'crypto';
import { motorPoolBridge, type AgentTaskRecord } from '@/lib/agent-bridge';
import { getNeonClient, ensureSchema, withQueryTimeout } from '@/lib/db';
import logger from '@/lib/log';

export const runtime = 'nodejs';

type TaskPriority = 'low' | 'normal' | 'high';
type TaskStatus = 'queued' | 'in_progress' | 'completed' | 'failed';

type TaskRecord = AgentTaskRecord;

interface TaskSubmission {
  type: string;
  payload: TaskRecord;
  priority: TaskPriority;
  meta?: TaskRecord;
}

interface ValidationResult {
  success: boolean;
  data?: TaskSubmission;
  errors?: string[];
}

interface TaskQueueItem {
  id: string;
  type: string;
  payload: TaskRecord;
  priority: TaskPriority;
  meta?: TaskRecord;
  status: TaskStatus;
  result?: TaskRecord;
  error?: string;
  createdAt: string;
  queuedAt: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
  submittedBy?: {
    name?: string | null;
    email?: string | null;
    userId?: string | null;
  };
  /**
   * Whether the durable receipt write for this (terminal) task succeeded.
   * Undefined whenever the outcome isn't known yet: either the task hasn't
   * reached a terminal status, OR it just has (status flips to
   * completed/failed first) and the receipt write triggered by that
   * transition is still in flight. A GET racing that narrow window will
   * correctly see a terminal status with receiptPersisted still undefined —
   * that's the accurate "durability not yet confirmed" signal, not a bug;
   * the task's own result is already final regardless of receipt durability
   * (see persistReceipt's docstring). Poll again to observe true/false.
   */
  receiptPersisted?: boolean;
  receiptError?: string;
}

const MAX_TASKS = 1000;
const TASK_TTL_MS = 24 * 60 * 60 * 1000;

const VALID_PRIORITIES: readonly TaskPriority[] = ['low', 'normal', 'high'];
const taskStore = new Map<string, TaskQueueItem>();
const pendingQueue: string[] = [];
let runnerActive = false;

const isTerminalStatus = (status: TaskStatus): boolean =>
  status === 'completed' || status === 'failed';

const getTaskTimestamp = (task: TaskQueueItem): number => {
  const ts = Date.parse(task.completedAt ?? task.updatedAt ?? task.createdAt);
  return Number.isNaN(ts) ? 0 : ts;
};

const pruneExpiredTasks = (): void => {
  const now = Date.now();
  for (const [taskId, task] of taskStore.entries()) {
    if (now - getTaskTimestamp(task) > TASK_TTL_MS) {
      taskStore.delete(taskId);
    }
  }
};

const pruneTaskStore = (): void => {
  pruneExpiredTasks();

  if (taskStore.size <= MAX_TASKS) {
    return;
  }

  const evictionOrder = [...taskStore.entries()]
    .sort(([, a], [, b]) => {
      const aTerminal = isTerminalStatus(a.status);
      const bTerminal = isTerminalStatus(b.status);
      if (aTerminal !== bTerminal) {
        return aTerminal ? -1 : 1;
      }
      return getTaskTimestamp(a) - getTaskTimestamp(b);
    })
    .map(([id]) => id);

  while (taskStore.size > MAX_TASKS && evictionOrder.length > 0) {
    const taskId = evictionOrder.shift();
    if (taskId) {
      taskStore.delete(taskId);
    }
  }

  for (let i = pendingQueue.length - 1; i >= 0; i -= 1) {
    if (!taskStore.has(pendingQueue[i])) {
      pendingQueue.splice(i, 1);
    }
  }
};

const isRecord = (value: unknown): value is TaskRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseTask = (value: unknown): ValidationResult => {
  if (!isRecord(value)) {
    return { success: false, errors: ['Request body must be a JSON object'] };
  }

  const errors: string[] = [];
  const { type, payload, priority, meta } = value;

  if (typeof type !== 'string') {
    errors.push('type must be a string');
  }

  if (!isRecord(payload)) {
    errors.push('payload must be an object');
  }

  const priorityValue = priority === undefined ? 'normal' : priority;
  if (typeof priorityValue !== 'string' || !VALID_PRIORITIES.includes(priorityValue as TaskPriority)) {
    errors.push('priority must be one of: low, normal, high');
  }
  const normalizedPriority = (
    VALID_PRIORITIES.includes(priorityValue as TaskPriority) ? priorityValue : 'normal'
  ) as TaskPriority;

  if (meta !== undefined && !isRecord(meta)) {
    errors.push('meta must be an object when provided');
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      type: type as string,
      payload: payload as TaskRecord,
      priority: normalizedPriority,
      ...(meta !== undefined ? { meta: meta as TaskRecord } : {}),
    },
  };
};

const sanitizeError = (error: unknown): string =>
  error instanceof Error ? error.message : 'Task execution failed';

// Transport lives in lib/agent-bridge.ts; the queue only owns scheduling and status.
const executeTask = (task: TaskQueueItem): Promise<TaskRecord> =>
  motorPoolBridge.dispatch({
    id: task.id,
    type: task.type,
    payload: task.payload,
    priority: task.priority,
    meta: task.meta,
  });

interface ReceiptPersistResult {
  success: boolean;
  error?: string;
}

/**
 * Persist a terminal task as a durable session receipt. The in-memory queue is
 * lost on restart; this keeps a record of what each agent session did.
 *
 * The write is awaited by the caller (see processQueue) so it isn't racing
 * serverless instance teardown as a fire-and-forget promise would. A failure
 * here must NOT fail the task itself — the task's own result already
 * succeeded/failed independently of whether its receipt got durably stored —
 * so failures are caught, logged loudly via logger.warn (this codebase's
 * convention for discoverable-but-non-fatal problems), and reported back to
 * the caller via the returned result so processQueue can record it on the
 * task (surfaced through GET /api/agent/tasks?id=... as `receiptPersisted` /
 * `receiptError`) rather than being silently swallowed.
 */
const persistReceipt = async (task: TaskQueueItem): Promise<ReceiptPersistResult> => {
  try {
    const db = getNeonClient();
    await withQueryTimeout(ensureSchema(db), 'ensureSchema');
    const motorPoolSessionId =
      (task.result as { motorPoolSessionId?: string } | undefined)?.motorPoolSessionId ?? null;
    await withQueryTimeout(
      db`
        INSERT INTO agent_task_receipts (
          task_id, type, priority, status, payload, meta, result, error,
          motor_pool_session_id, submitted_by_email,
          created_at, queued_at, started_at, completed_at
        )
        VALUES (
          ${task.id}, ${task.type}, ${task.priority}, ${task.status},
          ${JSON.stringify(task.payload ?? {})}, ${task.meta ? JSON.stringify(task.meta) : null},
          ${task.result ? JSON.stringify(task.result) : null}, ${task.error ?? null},
          ${motorPoolSessionId}, ${task.submittedBy?.email ?? null},
          ${task.createdAt}, ${task.queuedAt}, ${task.startedAt ?? null}, ${task.completedAt ?? null}
        )
      `,
      'receipt insert',
    );
    return { success: true };
  } catch (error) {
    const message = sanitizeError(error);
    logger.warn(`[agent-tasks] Failed to persist receipt for task ${task.id}:`, error);
    return { success: false, error: message };
  }
};

const processQueue = async () => {
  if (runnerActive) {
    return;
  }

  runnerActive = true;

  try {
    while (pendingQueue.length > 0) {
      const taskId = pendingQueue.shift();
      if (!taskId) {
        continue;
      }

      const task = taskStore.get(taskId);
      if (!task || task.status !== 'queued') {
        continue;
      }

      const startedAt = new Date().toISOString();
      task.status = 'in_progress';
      task.startedAt = startedAt;
      task.updatedAt = startedAt;

      try {
        const result = await executeTask(task);
        const completedAt = new Date().toISOString();
        task.status = 'completed';
        task.result = result;
        task.completedAt = completedAt;
        task.updatedAt = completedAt;

        const receipt = await persistReceipt(task);
        task.receiptPersisted = receipt.success;
        if (!receipt.success) {
          task.receiptError = receipt.error;
        }
      } catch (error) {
        const completedAt = new Date().toISOString();
        task.status = 'failed';
        task.error = sanitizeError(error);
        task.completedAt = completedAt;
        task.updatedAt = completedAt;

        const receipt = await persistReceipt(task);
        task.receiptPersisted = receipt.success;
        if (!receipt.success) {
          task.receiptError = receipt.error;
        }
      }
    }
  } finally {
    runnerActive = false;
  }
};

const enqueueTask = (task: TaskQueueItem) => {
  taskStore.set(task.id, task);
  pendingQueue.push(task.id);
  pruneTaskStore();
  // Netlify (and other serverless platforms) can tear down the function
  // once the HTTP response is sent — a bare `void processQueue()` isn't
  // guaranteed to survive past that point. next/server's after() is the
  // framework-level, deployment-agnostic hook for "run this after the
  // response is flushed, but keep the invocation alive until it settles."
  after(processQueue);
};

const toPublicTask = (task: TaskQueueItem) => ({
  id: task.id,
  type: task.type,
  payload: task.payload,
  priority: task.priority,
  meta: task.meta,
  status: task.status,
  result: task.result,
  error: task.error,
  createdAt: task.createdAt,
  queuedAt: task.queuedAt,
  startedAt: task.startedAt,
  completedAt: task.completedAt,
  updatedAt: task.updatedAt,
  submittedBy: task.submittedBy,
  receiptPersisted: task.receiptPersisted,
  receiptError: task.receiptError,
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body: unknown = await req.json();
    const result = parseTask(body);
    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid task format', details: result.errors },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    // result.data is always defined here because result.success is true
    const { type, payload, priority, meta } = result.data!;
    // Use stable userId (GitHub numeric ID) as primary identifier
    const submittedById = session.userId ?? session.user.email ?? null;
    const task: TaskQueueItem = {
      id: randomUUID(),
      type,
      payload,
      priority,
      ...(meta !== undefined ? { meta } : {}),
      status: 'queued',
      createdAt: now,
      queuedAt: now,
      updatedAt: now,
      submittedBy: {
        name: session.user.name,
        email: session.user.email,
        userId: submittedById,
      },
    };

    enqueueTask(task);

    return NextResponse.json(
      { task: toPublicTask(task), status: 'accepted', queuedAt: task.queuedAt },
      { status: 202 }
    );
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const callerEmail = session.user.email;

  const taskId = req.nextUrl.searchParams.get('id');
  if (taskId) {
    pruneExpiredTasks();
    const task = taskStore.get(taskId);
    if (!task || task.submittedBy?.email !== callerEmail) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, task: toPublicTask(task) }, { status: 200 });
  }

  // Session receipts: durable history from the DB (survives queue restarts).
  if (req.nextUrl.searchParams.get('receipts') === 'true') {
    try {
      const db = getNeonClient();
      await ensureSchema(db);
      const rows = await db`
        SELECT task_id, type, priority, status, result, error, motor_pool_session_id,
               submitted_by_email, created_at, queued_at, started_at, completed_at
        FROM agent_task_receipts
        WHERE submitted_by_email = ${callerEmail}
        ORDER BY created_at DESC
        LIMIT 100
      `;
      return NextResponse.json({ success: true, receipts: rows }, { status: 200 });
    } catch (error) {
      logger.warn('[agent-tasks] Failed to read receipts:', error);
      return NextResponse.json({ success: false, error: 'Failed to read receipts' }, { status: 500 });
    }
  }

  pruneExpiredTasks();
  const tasks = Array.from(taskStore.values())
    .filter((task) => task.submittedBy?.email === callerEmail)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toPublicTask);

  const summary = tasks.reduce(
    (acc, task) => {
      acc.total += 1;
      acc.byStatus[task.status] = (acc.byStatus[task.status] || 0) + 1;
      return acc;
    },
    { total: 0, byStatus: {} as Record<string, number> }
  );

  return NextResponse.json({ success: true, tasks, summary }, { status: 200 });
}

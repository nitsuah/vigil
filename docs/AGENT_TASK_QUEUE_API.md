# Agent Task Queue API

> 🧭 [vigil](../README.md) · [Features](../FEATURES.md) · [Roadmap](../ROADMAP.md) · [Tasks](../TASKS.md) · [Changelog](../CHANGELOG.md) · [Metrics](../METRICS.md) <!-- nav -->

Defines the contract for authenticated agent task submission, queueing, execution, and task-status retrieval.

## Endpoint

- **POST /api/agent/tasks**
  - Submit a new agent task to the queue.
- **GET /api/agent/tasks?id=<taskId>**
  - Retrieve one task by id.
- **GET /api/agent/tasks**
  - Retrieve all known tasks plus queue summary counts.

### Request Body

```
{
  "type": "string",           // Task type identifier (required)
  "payload": { ... },           // Task-specific payload (required, object)
  "priority": "normal",        // Priority: low | normal | high (optional, default: normal)
  "meta": { ... }               // Optional metadata (object)
}
```

### Response

- **202 Accepted**
  - `{ task, status: 'accepted', queuedAt }`
- **200 OK** (GET)
  - `?id=<taskId>`: `{ success: true, task }`
  - no query: `{ success: true, tasks, summary }`
- **401 Unauthorized**
  - `{ error: 'Unauthorized' }`
- **404 Not Found**
  - `{ error: 'Task not found' }`
- **400 Bad Request**
  - `{ error, details }` (invalid task payload) or `{ error: 'Malformed request' }`

### Notes

- Authentication is required for submission and retrieval.
- Queue execution is currently an in-memory runner with simulated dispatch response payloads.
- Queue state resets when the API process restarts; persistence is a follow-up enhancement.

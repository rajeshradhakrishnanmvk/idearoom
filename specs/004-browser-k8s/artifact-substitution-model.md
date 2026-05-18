# ThinkPak Substitution Model for Browser K8s Ecosystem

## Goal
Build a real browser cluster runtime for learning and prototyping where user-supplied main.flow.js executes inside Web Workers across browser nodes.

## ThinkPak Substitute Prompts Applied
- Substitute objects: image -> artifact revision, container -> runtime unit.
- Substitute process: pull/push -> sync/publish.
- Substitute environment: virtualization host -> browser runtime graph.
- Substitute viewpoint: treat orchestration as evented JavaScript state transitions.

## Substitution Matrix
| Legacy Term | Browser-Native Substitute | Why it fits this ecosystem |
|---|---|---|
| Image | Artifact revision | Immutable JS build metadata + entrypoint.
| Container | Runtime unit | Scheduled execution instance of an artifact revision.
| Registry | Artifact family catalog | Domain/family hierarchy for JS artifacts.
| Pull | Sync | Fetches artifact metadata into runtime cache/state.
| Tag | Revision | Version identity for artifact behavior.
| Layer size | Module count | JS-first indicator for artifact complexity.

## main.flow.js Contract
- main.flow.js is required for each published artifact.
- The file sets self.mainFlow with lifecycle hooks:
  - onStart(ctx)
  - onTick(ctx)
  - onStop(ctx)
- ctx includes podName, nodeName, tick, and mutable memory.
- Hooks run inside dedicated Web Workers.
- Hook execution is guarded by timeout to avoid runaway scripts.

## Data Model
- family:
  - ref: domain/family
  - policy: open|restricted
  - artifacts: artifact[]
  - updatedAt
- artifact:
  - ref
  - mainFlowSource
  - publishedAt
- runtimeUnit:
  - name
  - artifactRef
  - node
  - status
  - tickCount
  - lastOutput
  - tickTimeoutMs
  - memorySoftQuotaKb
  - memoryEstimateBytes
  - memoryWarningCount
  - logs[]
  - trace[]
- node:
  - name
  - workerCapacity
- controlPlaneEvent:
  - type
  - message
  - severity
  - at
- namespacePolicy:
  - namespace
  - maxWorkers
  - maxMemoryKb

## Browser Tech Mapping
- State store: localStorage + in-memory model.
- Control plane: form/event handlers + deterministic reducers.
- Scheduler simulation: assign workloads to nodes by capacity-aware score.
- Runtime execution: each workload is a real Web Worker running main.flow.js.
- Cluster controls: tick-all and stop-all send commands to active workers.
- Event timeline: audit trail for artifact publication, scheduling, ticks, and runtime errors.

## Implemented Scheduling Rules
- Nodes have workerCapacity limits.
- Each workload replica consumes one worker slot.
- Auto-score placement chooses node with highest free-capacity score.
- Manual placement targets explicit node and validates free slots.
- Namespace policies enforce launch-time limits for max workers and aggregate configured memory quotas.

## Implemented Runtime Execution
- Workloads launch as real Web Workers.
- Worker lifecycle commands:
  - start
  - tick
  - stop
- Worker events:
  - started
  - tick
  - stopped
  - runtimeError
- Runtime output from main.flow.js is captured as workload lastOutput.

## Implemented Sandbox Guardrails
- onStart, onTick, and onStop are executed with timeout guards.
- Timeout or runtime exceptions trigger hard-fail policy:
  - workload transitions to Error
  - worker is terminated
  - failure is logged in event stream and workload logs.
- Memory soft quota is tracked per workload using in-worker memory estimate from ctx.memory serialization.
- Over-quota and recovery transitions emit events and trace lines.

## Implemented Artifact Portability
- Artifact bundles can be exported to JSON file.
- Artifact bundles can be imported from JSON file.
- Import merges by artifact ref and updates main.flow.js source when refs match.
- Export includes per-artifact signature.
- Import verifies signatures and rejects invalid entries.

## Implemented Runtime Log Stream
- Each workload maintains in-browser log lines for lifecycle and tick outputs.
- Runtime Logs panel shows recent lines per workload for debugging flow behavior.

## Implemented Trace Timeline
- Each workload captures structured trace entries (schedule/start/tick/stop/error/memory).
- Worker Trace Timeline panel renders recent trace events for each workload.

## Implemented Namespace Policy Controls
- Namespace policy panel supports create/update for max workers and max memory quota.
- Launch requests are denied when namespace policy ceilings would be exceeded.
- Runtime namespace memory is continuously aggregated and emits warn/recover events when crossing policy limits.

## Implemented Global Trace Explorer
- Global trace view flattens all workload trace events into a searchable stream.
- Filters support workload name substring, exact trace type, and message text search.
- Results are sorted by most recent event to support rapid debugging across workloads.

## Next Evolution
- Add optional public-key signature verification for artifact manifests.
- Add namespace-level RBAC-style publication and launch controls.
- Add trace export with correlation IDs for cross-session replay.

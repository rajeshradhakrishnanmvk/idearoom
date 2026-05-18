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
- node:
  - name
  - workerCapacity
- controlPlaneEvent:
  - type
  - message
  - severity
  - at

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

## Next Evolution
- Add worker sandbox limits (message size and tick timeout guards).
- Add artifact import/export for sharing flow bundles.
- Add visual worker trace timeline per workload.

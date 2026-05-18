# ThinkPak Substitution Model for Browser K8s Ecosystem

## Goal
Replace image/container mental models with JavaScript-native artifacts and runtime units while preserving Kubernetes-like control plane behavior.

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

## Data Model
- family:
  - ref: domain/family
  - policy: open|restricted
  - artifacts: artifact[]
  - updatedAt
- artifact:
  - revision
  - moduleCount
  - entrypoint
  - publishedAt
- runtimeUnit:
  - name
  - artifactRef
  - node
  - status
  - probeIntervalSec
  - failureThreshold
  - restartPolicy
  - restartCount
  - startedAt
- syncEvent:
  - artifactRef
  - at
- service:
  - name
  - selector
  - strategy
  - requestCount
- controlPlaneEvent:
  - type
  - message
  - severity
  - at

## Browser Tech Mapping
- State store: localStorage + in-memory model.
- Control plane: form/event handlers + deterministic reducers.
- Scheduler simulation: assign runtime units to nodes by score and free capacity.
- Observability: summary chips + runtime list + sync history.
- Event timeline: audit trail for schedule decisions, policy denials, probes, restarts, and service routing.

## Implemented Scheduling Rules
- Nodes have two hard limits: moduleBudget and unitCapacity.
- Each runtime unit consumes moduleCount from its artifact revision.
- Auto-score placement chooses the node with the highest score:
  - score = (moduleHeadroom * 2) + unitHeadroom
  - only nodes that satisfy both limits are candidates.
- Manual placement validates the same limits before allowing start.

## Implemented Policy Gate
- Restricted families require at least one prior sync event for a specific artifact revision before a runtime unit can start.
- Open families can start immediately if scheduler capacity checks pass.

## Implemented Health & Restart Behavior
- Runtime units support probe interval and failure threshold metadata.
- Manual probe ticks can fail probabilistically to simulate unstable workloads.
- If failure threshold is reached:
  - on-failure: runtime unit restarts and restartCount increments.
  - never: runtime unit transitions to Failed state.

## Implemented Service Routing
- Services bind to runtime units by selector token matching against unit name or artifact reference.
- Routing strategies:
  - round-robin
  - random
- Each route request records an event and increments requestCount.

## Next Evolution
- Add readiness gate separate from liveness probes.
- Add weighted service routing and canary split controls.
- Add deployment object for desired replica reconciliation.

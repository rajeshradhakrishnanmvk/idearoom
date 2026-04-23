# Autonomous Operations with Oversight - Safety Design

## Overview

The safety system ensures autonomous agents operate within acceptable risk boundaries while maintaining human oversight for critical decisions.

---

## Multi-Tiered Safety Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Tier 1: Pre-Action Validation                              │
│  - Permission checks (RBAC)                                 │
│  - Policy compliance (OPA)                                  │
│  - Blast radius analysis                                    │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Tier 2: Risk Assessment                                    │
│  - Impact scoring (0-100)                                   │
│  - Reversibility check                                      │
│  - Cost impact analysis                                     │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Tier 3: Approval Workflow                                  │
│  - Auto-approve (low risk)                                  │
│  - Agent consensus (medium risk)                            │
│  - Human approval (high risk)                               │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Tier 4: Execution Controls                                 │
│  - Canary rollout                                           │
│  - Progressive deployment                                   │
│  - Automatic rollback triggers                              │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Tier 5: Post-Action Monitoring                             │
│  - Outcome validation                                       │
│  - Anomaly detection                                        │
│  - Learning from results                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Risk Scoring System

### Risk Calculation Formula

```python
risk_score = (
    blast_radius * 30 +
    reversibility_difficulty * 25 +
    cost_impact * 20 +
    compliance_violation * 15 +
    timing_sensitivity * 10
) / 100

# Score ranges:
# 0-30: Low risk (auto-approve)
# 31-60: Medium risk (agent consensus)
# 61-85: High risk (human approval required)
# 86-100: Critical risk (multi-human approval + change window)
```

### Risk Factors

#### 1. Blast Radius (0-100)
```
- Single pod: 10
- Single deployment: 30
- Namespace-wide: 50
- Cluster-wide: 70
- Multi-cluster: 90
- Production data deletion: 100
```

#### 2. Reversibility (0-100)
```
- Fully reversible (scale up/down): 10
- Reversible with data loss risk: 50
- Partially reversible: 70
- Irreversible (data deletion): 100
```

#### 3. Cost Impact (0-100)
```
- < $10/month: 10
- $10-$100/month: 30
- $100-$1000/month: 60
- > $1000/month: 100
```

#### 4. Compliance Violation (0-100)
```
- No compliance impact: 0
- Minor policy violation: 40
- Regulatory compliance risk: 80
- Legal/contractual breach: 100
```

#### 5. Timing Sensitivity (0-100)
```
- Off-hours, low traffic: 10
- Business hours, normal traffic: 50
- Peak hours, high traffic: 90
- During active incident: 100
```

---

## Autonomy Levels

### Level 0: Advisory Mode (Manual Approval)
- Agent makes recommendations only
- Human executes all actions
- Used for: New deployments, learning phase

```yaml
autonomyLevel: advisory
approvalRequired: all-actions
```

### Level 1: Supervised Autonomy
- Agent can execute low-risk actions automatically
- Medium/high-risk require approval
- Used for: Production environments (default)

```yaml
autonomyLevel: supervised
autoApprove:
  riskThreshold: 30
  actions:
    - scale-up
    - restart-pod
    - patch-security-vulnerability
```

### Level 2: Full Autonomy (Observability)
- Agent executes all actions automatically
- Human monitoring only
- Used for: Dev/staging environments

```yaml
autonomyLevel: autonomous
autoApprove:
  riskThreshold: 85
  excludeActions:
    - delete-data
    - terminate-cluster
```

---

## Approval Workflows

### Automatic Approval (Low Risk)

```
Agent detects issue → Evaluates action → Risk score: 25
→ AUTO-APPROVE → Execute → Notify stakeholders
```

Example:
```
[2026-04-23 10:30:00] AUTO-EXECUTED by agent-security
Action: Patched vulnerability CVE-2026-1234 in nginx
Risk Score: 18 (low)
Affected: 3 pods in staging
Notification sent to: #security-alerts
```

### Agent Consensus (Medium Risk)

```
Agent A proposes → Broadcasts to peer agents
→ Peer agents vote (based on their domain expertise)
→ Quorum reached (3/5 approve) → Execute
```

Example:
```
cost-agent proposes: "Downsize api-service: 10→5 replicas"
Risk Score: 45 (medium)

Voting:
✓ cost-agent: Approve (saves $400/mo, low utilization)
✓ performance-agent: Approve (traffic supports 5 replicas)
✗ reliability-agent: Reject (reduces redundancy below SLA)
✓ security-agent: Neutral (no security impact)

Result: 2 approve, 1 reject, 1 neutral → APPROVED (majority)
Execution scheduled: Rolling update over 10 minutes
```

### Human Approval (High Risk)

```
Agent proposes → Risk score: 75
→ Notification to on-call engineer
→ Human reviews + approves/rejects
→ Execute or abort
```

Approval UI:
```
┌────────────────────────────────────────────────────────────┐
│ 🚨 HIGH-RISK ACTION REQUIRES YOUR APPROVAL                 │
├────────────────────────────────────────────────────────────┤
│ Proposed by: agent-cost (confidence: 0.89)                 │
│ Action: Terminate 5 database read replicas                 │
│ Risk Score: 72/100                                         │
│                                                             │
│ IMPACT:                                                     │
│ ✓ Cost savings: $1,200/month                               │
│ ⚠ Read capacity reduced by 50%                             │
│ ⚠ Failover time increases from 2s to 8s                    │
│                                                             │
│ AGENT REASONING:                                            │
│ "Read traffic has decreased 60% over past 30 days.         │
│  Current replicas handle only 23% of capacity.              │
│  Recommend reducing from 10 to 5 replicas."                │
│                                                             │
│ MITIGATION:                                                 │
│ - Canary rollout: Remove 1 replica, monitor 24h            │
│ - Auto-rollback if read latency > 200ms                    │
│ - Keep snapshots for quick restoration                     │
│                                                             │
│ [Approve] [Reject] [Modify] [Simulate First]               │
└────────────────────────────────────────────────────────────┘
```

---

## Circuit Breakers & Kill Switches

### Automatic Rollback Triggers

```yaml
apiVersion: agentic.io/v1
kind: RollbackPolicy
metadata:
  name: auto-rollback-performance
spec:
  enabled: true
  triggers:
    - metric: error_rate
      threshold: 5%
      duration: 2m
      action: rollback
    - metric: latency_p99
      threshold: 1000ms
      duration: 5m
      action: rollback
    - metric: pod_crash_rate
      threshold: 10%
      duration: 1m
      action: rollback_and_alert
  rollbackStrategy:
    type: immediate  # or progressive
    notifyChannels: ["slack:#incidents", "pagerduty:ops-team"]
```

### Emergency Kill Switch

```bash
# Global kill switch - stops all autonomous operations
$ agentic emergency-stop --reason "Suspected agent malfunction"

⚠️  EMERGENCY STOP ACTIVATED

All autonomous agent operations have been PAUSED.

Active operations frozen: 3
- agent-cost: scale-down operation (50% complete) → PAUSED
- agent-security: patch deployment → PAUSED
- agent-performance: cache optimization → PAUSED

Agents switched to ADVISORY MODE only.

To resume: agentic resume --confirm
To investigate: agentic audit --since 1h
```

### Per-Agent Circuit Breaker

```yaml
apiVersion: agentic.io/v1
kind: CircuitBreaker
metadata:
  name: cost-agent-breaker
spec:
  agent: agent-cost
  failureThreshold: 3  # failures before opening circuit
  timeout: 300s  # how long circuit stays open
  conditions:
    - consecutiveFailures: 3
    - errorRate: 0.5  # 50% error rate
    - userOverrides: 5  # humans overriding agent decisions
  onOpen:
    action: switch-to-advisory
    notify: ["#cost-ops"]
    escalate: true
```

---

## Audit & Explainability

### Action Audit Log

```json
{
  "auditId": "audit-67890",
  "timestamp": "2026-04-23T10:30:00Z",
  "agent": "agent-cost-prod-us-east",
  "action": {
    "type": "scale",
    "target": "deployment/api-service",
    "before": {"replicas": 10},
    "after": {"replicas": 5}
  },
  "decision": {
    "reasoning": "CPU utilization < 15% for 48 hours. Traffic decreased 40% post-campaign end.",
    "alternatives": [
      {"action": "scale to 7", "score": 0.72},
      {"action": "keep at 10", "score": 0.45},
      {"action": "scale to 5", "score": 0.89}
    ],
    "riskScore": 42,
    "confidence": 0.89
  },
  "approval": {
    "required": true,
    "approvers": [
      {"agent": "reliability-agent", "vote": "approve", "timestamp": "2026-04-23T10:29:45Z"},
      {"agent": "performance-agent", "vote": "approve", "timestamp": "2026-04-23T10:29:47Z"}
    ],
    "status": "approved"
  },
  "execution": {
    "startTime": "2026-04-23T10:30:15Z",
    "endTime": "2026-04-23T10:35:20Z",
    "status": "success",
    "rollout": "progressive",
    "stepsCompleted": 5
  },
  "outcome": {
    "costSavings": "$380/month",
    "performanceImpact": "latency +2ms (acceptable)",
    "errors": 0,
    "rollbacksTriggered": 0
  },
  "immutableHash": "sha256:a3f2c1..."
}
```

### Decision Explanation API

```bash
$ agentic explain audit-67890

📋 Decision Explanation: Scale Down api-service

CONTEXT:
- Action taken: 2026-04-23 at 10:30 UTC
- Agent: cost-agent (v2.3.1)
- Approved by: reliability-agent, performance-agent

REASONING:
The cost-agent observed that api-service was significantly over-provisioned:

1. CPU Utilization Analysis:
   - Current: 12% average over 48 hours
   - Historical baseline: 55% (before traffic drop)
   - Conclusion: Pods are idle 88% of the time

2. Traffic Pattern Analysis:
   - Traffic decreased 40% starting 2026-04-20
   - Root cause: Marketing campaign ended
   - Projection: Traffic will remain at new baseline

3. Cost Analysis:
   - Current cost: 10 replicas × $76/mo = $760/mo
   - Optimized: 5 replicas × $76/mo = $380/mo
   - Savings: $380/mo (50% reduction)

4. Risk Assessment:
   - Performance impact: Minimal (5 replicas handle current load at 24%)
   - Reliability: Still meets SLA (3+ replicas required)
   - Reversibility: High (can scale back instantly if needed)

ALTERNATIVES CONSIDERED:
1. Scale to 7 replicas: More conservative, but $152/mo wasted
2. Keep at 10 replicas: Safe but $380/mo wasted
3. Scale to 5 replicas: ✓ SELECTED (optimal cost/performance)

OUTCOME:
✓ Successfully executed over 5 minutes (progressive rollout)
✓ No errors or rollbacks triggered
✓ Latency increased by 2ms (45ms → 47ms) - within acceptable range
✓ Savings confirmed: $380/month

---

Run 'agentic audit --agent cost-agent --last 7d' for more decisions.
```

---

## Human-in-the-Loop Patterns

### Pattern 1: Propose-Review-Execute

```
Agent analyzes → Generates proposal → Human reviews → Human approves → Execute
```

Best for: Production environments, high-risk actions

### Pattern 2: Execute-Monitor-Intervene

```
Agent executes → Human monitors → Human can intervene/rollback anytime
```

Best for: Staging environments, lower-risk actions

### Pattern 3: Collaborative Decision

```
Agent provides data → Human makes decision → Agent executes
```

Best for: Strategic decisions (architecture changes, budget allocation)

### Pattern 4: Learning Mode

```
Agent recommends → Human decides → Agent learns from human's choice
```

Best for: Training agents, new domains

---

## Governance & Compliance

### Policy-as-Code

```yaml
apiVersion: agentic.io/v1
kind: GovernancePolicy
metadata:
  name: production-safety-policy
spec:
  scope:
    clusters: ["production-*"]
  rules:
    - name: no-autonomous-delete
      description: "Prevent autonomous deletion in production"
      condition: |
        action.type == "delete" &&
        target.namespace matches "production-*"
      effect: deny
      requireApproval: human

    - name: cost-threshold
      description: "Actions >$500/mo require CFO approval"
      condition: |
        action.costImpact > 500
      effect: allow
      requireApproval:
        - role: sre-lead
        - role: cfo

    - name: data-protection
      description: "PII data operations require legal review"
      condition: |
        target.labels contains "data-classification=pii"
      effect: allow
      requireApproval:
        - role: legal-team
        - role: security-team
      auditRetention: 7years
```

### Compliance Reporting

```bash
$ agentic compliance-report --framework SOC2 --period last-quarter

📊 SOC2 Compliance Report (Q1 2026)

✓ CC6.1: Logical Access Controls
  - All agent actions authenticated via mTLS
  - RBAC enforced on 100% of operations
  - Audit logs immutable and retained 7 years

✓ CC7.2: System Monitoring
  - 24/7 automated monitoring via agents
  - 99.97% uptime achieved
  - Mean time to detection: 45 seconds

✓ CC8.1: Change Management
  - 847 autonomous changes executed
  - 100% audit trail completeness
  - 23 high-risk changes required human approval

⚠ CC9.2: Risk Assessment (1 finding)
  - Recommendation: Increase risk score threshold for database operations

Export: [PDF] [CSV] [Send to Auditor]
```


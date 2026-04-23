# Natural Language Interface (NLI) - Detailed Design

## Overview

The NLI translates human intent expressed in natural language into executable infrastructure operations, making Kubernetes management accessible to anyone who can describe what they want.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  User Input (Natural Language)                               │
│  "Scale the API service if CPU goes above 80%"              │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Intent Parser (LLM-based)                                   │
│  - Entity extraction                                         │
│  - Intent classification                                     │
│  - Ambiguity resolution                                      │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Intent Validator                                            │
│  - Validate permissions                                      │
│  - Check safety constraints                                  │
│  - Confirm with user if needed                               │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Action Planner                                              │
│  - Generate execution plan                                   │
│  - Select appropriate agents                                 │
│  - Create task graph                                         │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Execution Engine                                            │
│  - Dispatch to agents                                        │
│  - Monitor progress                                          │
│  - Return results in natural language                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Intent Classification

### Intent Categories

1. **Query/Read**: "What's the CPU usage of my API pods?"
2. **Action/Write**: "Scale down the database to 2 replicas"
3. **Policy/Rule**: "Always keep at least 3 replicas of the frontend"
4. **Analysis**: "Why is my service slow?"
5. **Troubleshooting**: "Debug the payment service errors"
6. **Planning**: "What's the best way to reduce costs by 20%?"

### Intent Schema (Structured Output)

```json
{
  "intent": {
    "type": "ACTION",
    "operation": "scale",
    "confidence": 0.92
  },
  "entities": {
    "target": {
      "resourceType": "deployment",
      "name": "api-service",
      "namespace": "production",
      "cluster": "us-east-1"  // inferred from context
    },
    "parameters": {
      "replicas": 5,
      "condition": {
        "metric": "cpu_usage",
        "operator": ">",
        "threshold": 80,
        "unit": "percent"
      }
    }
  },
  "context": {
    "user": "alice@company.com",
    "timestamp": "2026-04-23T10:30:00Z",
    "sessionId": "session-12345"
  },
  "risks": [
    {
      "description": "Scaling during peak hours may cause brief disruption",
      "severity": "low",
      "mitigation": "Use rolling update strategy"
    }
  ],
  "requiredApprovals": []
}
```

---

## Example Interactions

### Example 1: Simple Query

```
User: "How many pods are running in production?"

NLI Processing:
- Intent: QUERY
- Entity: namespace=production, resourceType=pod

Agent: cost-agent (has observability data)

Response: "There are currently 47 pods running in the production namespace:
- 12 pods: api-service
- 8 pods: web-frontend
- 15 pods: worker-jobs
- 12 pods: database-replicas

Would you like details on any specific service?"
```

### Example 2: Complex Action

```
User: "Optimize costs in staging without affecting performance"

NLI Processing:
- Intent: ACTION (complex, multi-step)
- Entity: namespace=staging
- Goal: reduce costs
- Constraint: maintain performance

Execution Plan:
1. cost-agent analyzes resource utilization
2. performance-agent establishes baseline metrics
3. cost-agent proposes rightsizing actions
4. performance-agent validates impact
5. Execution with canary rollout

Response: "I've analyzed the staging environment and found 3 optimization opportunities:

1. **Downsize worker-jobs**: 8→5 replicas (saves $320/mo)
   - Current CPU: 15% average
   - Performance impact: None (below 50% threshold)

2. **Switch to spot instances**: api-service (saves $180/mo)
   - Risk: Low (stateless service)
   - Fallback: On-demand instances available

3. **Reduce database storage**: 500GB→300GB (saves $40/mo)
   - Current usage: 180GB
   - Buffer: 66% headroom

Total savings: $540/month (23% reduction)

Shall I proceed with these changes? Reply 'approve all', 'approve 1,2', or 'explain <number>' for details."
```

### Example 3: Policy Creation

```
User: "Make sure we always have at least 3 frontend pods during business hours (9am-5pm EST)"

NLI Processing:
- Intent: POLICY_CREATE
- Entity: deployment=frontend
- Constraint: min_replicas=3, schedule=business_hours

Response: "I'll create a scheduled scaling policy for the frontend service.

Policy Summary:
- **Resource**: frontend deployment
- **Schedule**: Mon-Fri, 9am-5pm EST
- **Min Replicas**: 3
- **Max Replicas**: 10 (inferred from current HPA)
- **Outside Hours**: Minimum 1 replica

This policy will be enforced by the reliability-agent. Cost impact: ~$45/month.

Would you like to:
1. Apply this policy (respond 'apply')
2. Modify the schedule (respond 'change schedule to...')
3. See a simulation first (respond 'simulate')"
```

### Example 4: Troubleshooting

```
User: "The checkout service is slow, what's wrong?"

NLI Processing:
- Intent: TROUBLESHOOT
- Entity: service=checkout
- Symptom: latency_high

Multi-Agent Collaboration:
- performance-agent: checks metrics
- reliability-agent: checks health
- security-agent: checks for attacks

Response: "I've identified the issue with checkout-service:

**Root Cause**: Database connection pool exhaustion
- Current connections: 98/100 (pool limit)
- Wait time: 450ms average
- Started: 2 hours ago (coincides with traffic spike)

**Immediate Actions Taken**:
✓ Increased connection pool to 200 (temporary)
✓ Performance restored (latency now 45ms, was 890ms)

**Recommended Long-term Fix**:
1. Implement connection pooling in app code
2. Add read replicas for better distribution
3. Enable query caching

I've created a ticket in Jira (INFRA-4521) with full details.
Monitor dashboard: https://grafana.company.com/checkout-health"
```

---

## Conversation Context Management

### Session State

```json
{
  "sessionId": "session-67890",
  "user": "alice@company.com",
  "startTime": "2026-04-23T10:00:00Z",
  "context": {
    "currentCluster": "production-us-east-1",
    "currentNamespace": "default",
    "recentEntities": [
      {"type": "deployment", "name": "api-service"},
      {"type": "service", "name": "checkout"}
    ],
    "conversationHistory": [
      {
        "turn": 1,
        "user": "Show me api-service pods",
        "assistant": "There are 5 pods...",
        "intent": "QUERY",
        "timestamp": "2026-04-23T10:05:00Z"
      }
    ]
  }
}
```

### Context-Aware Interactions

```
User: "Scale api-service to 10 replicas"
NLI: [Executes, remembers api-service]

User: "What's the CPU usage?"
NLI: [Infers: asking about api-service from context]
Response: "The api-service CPU usage is currently 45%..."

User: "And memory?"
NLI: [Still referring to api-service]
Response: "Memory usage for api-service is 2.1GB / 4GB (52%)"
```

---

## Interface Modalities

### 1. CLI (Command Line Interface)

```bash
$ agentic ask "What's the health of production cluster?"

🤖 Analyzing production cluster health...

✓ Control Plane: Healthy (API server, etcd, scheduler)
✓ Nodes: 15/15 ready
⚠ Pods: 2 pods in CrashLoopBackOff
  - payment-worker-abc123 (namespace: billing)
  - notification-service-xyz789 (namespace: messaging)

Overall Status: DEGRADED
Incidents: 2 active

Run 'agentic fix payment-worker' to auto-resolve or 'agentic explain payment-worker' for details.
```

### 2. Web UI (Chat Interface)

```
┌────────────────────────────────────────────────────────────┐
│  Agentic OS - Natural Language Console                     │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  You: Reduce costs by 15% without impacting reliability   │
│                                                             │
│  🤖 Agent: I've created a cost optimization plan:          │
│                                                             │
│  [Interactive Card]                                         │
│  ┌────────────────────────────────────────────────────┐   │
│  │ Cost Optimization Plan                              │   │
│  │ Target: -15% ($2,340/mo savings)                    │   │
│  │                                                      │   │
│  │ ✓ Approved: Downsize dev environments ($890)        │   │
│  │ ⏳ Pending: Switch to spot instances ($1,200)       │   │
│  │ ⏳ Pending: Archive old logs ($250)                 │   │
│  │                                                      │   │
│  │ [Approve All] [Review Details] [Modify]             │   │
│  └────────────────────────────────────────────────────┘   │
│                                                             │
│  Type your message... [Send]                               │
└────────────────────────────────────────────────────────────┘
```

### 3. API (Programmatic)

```bash
curl -X POST https://agentic-api.company.com/v1/intents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Scale frontend to handle 2x current traffic",
    "context": {
      "cluster": "production",
      "user": "alice@company.com"
    }
  }'
```

Response:
```json
{
  "intentId": "intent-12345",
  "status": "planning",
  "plan": {
    "steps": [
      {
        "agent": "performance-agent",
        "action": "calculate-target-replicas",
        "status": "complete",
        "result": {"targetReplicas": 20}
      },
      {
        "agent": "cost-agent",
        "action": "estimate-cost-impact",
        "status": "in_progress"
      }
    ]
  },
  "estimatedCompletion": "30s"
}
```

### 4. Voice Interface (Future)

```
User: "Hey Agentic, what's the status of my clusters?"
Agent: "All 3 clusters are healthy. Production is running 47 pods,
        staging has 23, and development has 12."

User: "Any cost-saving opportunities?"
Agent: "Yes, I found $600 per month in savings. Should I show you the details?"
```

---

## Prompt Engineering for Intent Parsing

### System Prompt Template

```
You are the Intent Parser for an Agentic Operating System managing Kubernetes infrastructure.

Your job is to parse user requests and extract structured intents.

CONTEXT:
- Current cluster: {cluster_name}
- Current namespace: {namespace}
- User role: {user_role}
- Recent conversation: {conversation_history}

USER INPUT: "{user_query}"

Extract the following:
1. INTENT_TYPE: [QUERY, ACTION, POLICY, ANALYSIS, TROUBLESHOOT, PLANNING]
2. ENTITIES: Resources mentioned (deployments, services, pods, etc.)
3. PARAMETERS: Values, thresholds, constraints
4. RISKS: Potential issues with this request
5. CLARIFICATION_NEEDED: If the request is ambiguous, what questions to ask?

Output as JSON following this schema: {...}
```

### Few-Shot Examples in Prompt

```
EXAMPLE 1:
User: "Scale api-service to 10"
Output: {
  "intent": {"type": "ACTION", "operation": "scale"},
  "entities": {"deployment": "api-service", "replicas": 10},
  "risks": ["No condition specified - manual scaling"],
  "clarificationNeeded": null
}

EXAMPLE 2:
User: "Make it faster"
Output: {
  "intent": {"type": "ACTION", "operation": "optimize"},
  "entities": {"target": "AMBIGUOUS"},
  "clarificationNeeded": "What should I make faster? (options: api-service, checkout, database)"
}
```

---

## Safety & Validation

### Pre-Execution Checks

1. **Permission Check**: Does user have RBAC permissions?
2. **Blast Radius**: How many resources affected?
3. **Reversibility**: Can this be undone?
4. **Cost Impact**: Financial implications?
5. **Compliance**: Does this violate any policies?

### User Confirmation for High-Risk Actions

```
User: "Delete all pods in production"

🚨 HIGH-RISK ACTION DETECTED

This action will:
- Delete 47 pods across 12 deployments
- Cause temporary service disruption
- Affect production traffic

Are you ABSOLUTELY SURE? Type 'DELETE PRODUCTION PODS' to confirm
or 'cancel' to abort.

[ ] I understand this is irreversible
[ ] I have approval from on-call engineer
[ ] I have created a backup/rollback plan

[Confirm] [Cancel]
```

---

## Multilingual Support (Future Phase)

```
User (Spanish): "Escala el servicio de API a 10 réplicas"
Translation: "Scale the API service to 10 replicas"
Intent: {ACTION, scale, api-service, 10}
Response (Spanish): "He escalado api-service a 10 réplicas..."
```


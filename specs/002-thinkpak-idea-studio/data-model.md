# Data Model: ThinkPak Idea Studio

## Idea
- id: string (uuid-like)
- title: string
- note: string
- promptCategory: string
- promptCard: string
- createdAt: string (ISO timestamp)
- updatedAt: string (ISO timestamp)

## ConceptDetail
- ideaId: string (foreign key to Idea.id)
- problem: string
- audience: string
- value: string

## EvaluationCriterion
- id: string
- name: string
- weight: number (1-5)

## IdeaScore
- ideaId: string
- criterionValues: map<string, number>
- totalScore: number
- rationale: string

## Storage Schema

```json
{
  "ideas": [],
  "conceptDetails": {},
  "criteria": [],
  "scores": {}
}
```

# Feature Specification: ThinkPak Idea Studio

**Feature Branch**: `002-thinkpak-idea-studio`

**Created**: 2026-05-18

**Status**: Draft

**Input**: User description: "use specify constitution and build me an idea using skills thinkpak, only html/css/js without third-party dependency"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generate Ideas with ThinkPak Prompts (Priority: P1)

As a creator, I can pick ThinkPak strategies and capture idea notes quickly so I can produce multiple candidate ideas in one session.

**Why this priority**: Without rapid generation, there is no idea pipeline.

**Independent Test**: Open the app, choose at least three prompts, capture three ideas, and verify they persist after refresh.

**Acceptance Scenarios**:

1. **Given** an empty session, **When** the user selects a ThinkPak prompt and writes an idea, **Then** the idea is saved to the idea list.
2. **Given** saved ideas, **When** the browser refreshes, **Then** ideas are restored from localStorage.

---

### User Story 2 - Shape Ideas into Clear Concepts (Priority: P2)

As a creator, I can expand raw notes into problem, audience, and value statements so each idea becomes actionable.

**Why this priority**: Raw brainstorm notes are often too vague to execute.

**Independent Test**: Edit one generated idea into structured fields and export a readable concept summary.

**Acceptance Scenarios**:

1. **Given** a raw idea, **When** the user fills problem, audience, and value fields, **Then** the app shows a structured concept card.

---

### User Story 3 - Evaluate and Select the Best Idea (Priority: P3)

As a creator, I can score ideas with ThinkPak evaluation methods and pick a winner with explicit rationale.

**Why this priority**: Selection quality determines whether ideation leads to real execution.

**Independent Test**: Score at least two ideas with defined criteria and confirm the top idea is ranked and explained.

**Acceptance Scenarios**:

1. **Given** multiple shaped ideas, **When** the user applies criteria scores, **Then** ideas are ranked by total score.
2. **Given** a ranked list, **When** the user selects a winner, **Then** a rationale summary is generated from the scores and notes.

---

### Edge Cases

- What happens when localStorage quota is reached?
- How does system handle malformed or missing saved session data?
- What happens when user submits empty text fields?
- How does ranking handle ties in total score?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide ThinkPak prompt selection across at least five strategy groups.
- **FR-002**: System MUST allow users to create, edit, and delete ideas during a session.
- **FR-003**: System MUST persist ideas and scoring data in localStorage.
- **FR-004**: System MUST provide a structured shaping form with fields for problem, audience, and value.
- **FR-005**: System MUST provide at least one evaluation board with configurable criteria and numeric scoring.
- **FR-006**: System MUST rank ideas automatically based on evaluation totals.
- **FR-007**: System MUST generate a plain-language winner rationale using score breakdowns.
- **FR-008**: System MUST run fully offline after initial page load.
- **FR-009**: System MUST be implemented using only HTML, CSS, and JavaScript with no third-party dependencies.

### Key Entities *(include if feature involves data)*

- **Idea**: Brainstorm entry with title, notes, prompt source, timestamps.
- **ConceptDetail**: Structured expansion fields linked one-to-one with Idea.
- **EvaluationCriterion**: Named scoring dimension (for example feasibility, novelty, timing).
- **IdeaScore**: Per-idea score values by criterion and computed total.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: User can capture at least 10 ideas in less than 15 minutes during one session.
- **SC-002**: 100 percent of core actions (create, edit, score, rank) work with network disabled.
- **SC-003**: At least 90 percent of first-time users can complete Generate -> Shape -> Evaluate flow without external help.
- **SC-004**: The app can load saved data and become interactive in under 2 seconds on a typical laptop browser.

## Assumptions

- Users run a modern evergreen browser with localStorage support.
- Single-user sessions are in scope for v1; real-time multi-user sync is out of scope.
- Export format is plain text or JSON file download; no cloud integration is required.
- Local-only persistence is acceptable for the initial release.

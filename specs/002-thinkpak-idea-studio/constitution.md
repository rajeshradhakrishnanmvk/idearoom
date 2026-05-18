# ThinkPak Idea Studio Constitution

## Core Principles

### I. ThinkPak-First Ideation
Every feature MUST be traceable to one or more ThinkPak prompts from cards 3 through 47. Work must document which prompt triggered the idea.

### II. Delayed Evaluation Discipline
Idea generation and idea evaluation MUST happen in separate steps. Evaluation methods from cards 48 through 56 are only applied after a candidate set of ideas exists.

### III. Zero-Dependency Frontend
The product MUST run with only HTML, CSS, and JavaScript. No third-party frameworks, UI kits, or package manager dependencies are allowed.

### IV. Offline-First by Default
Core workflows (create ideas, score ideas, edit notes) MUST work without network access in a modern browser.

### V. Explainable Decisions
When an idea is selected, the app MUST show why using transparent criteria (for example, PMI, checkerboard criteria, or eight-factor scores).

## Technical Constraints

- Runtime: static browser app only.
- Build tooling: none required.
- Data persistence: browser localStorage only.
- Security: no remote APIs and no external script loading.
- Accessibility: keyboard-first navigation and semantic HTML.

## Development Workflow

- Start from spec user stories in priority order P1 to P3.
- Keep each story independently testable in a browser.
- Add a manual test checklist for each story.
- Do not introduce dependencies to speed up implementation.

## Governance

- This constitution overrides conflicting implementation shortcuts.
- Any exception requires a written rationale in plan.md and explicit user approval.
- Each pull request MUST include a constitution compliance check section.

**Version**: 1.0.0 | **Ratified**: 2026-05-18 | **Last Amended**: 2026-05-18

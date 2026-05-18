# Tasks: ThinkPak Idea Studio

**Input**: Design documents from `/specs/002-thinkpak-idea-studio/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Manual tests are included because the specification emphasizes independently testable stories.

**Organization**: Tasks are grouped by user story.

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Create app skeleton in `specs/002-thinkpak-idea-studio/app/index.html`, `specs/002-thinkpak-idea-studio/app/styles.css`, `specs/002-thinkpak-idea-studio/app/app.js`
- [ ] T002 Define localStorage schema and bootstrap state in `specs/002-thinkpak-idea-studio/app/app.js`
- [ ] T003 [P] Create semantic layout and keyboard-friendly navigation in `specs/002-thinkpak-idea-studio/app/index.html`

## Phase 2: Foundational (Blocking Prerequisites)

- [ ] T004 Implement state load/save and migration guards in `specs/002-thinkpak-idea-studio/app/app.js`
- [ ] T005 [P] Implement reusable render helpers for lists and forms in `specs/002-thinkpak-idea-studio/app/app.js`
- [ ] T006 [P] Add base visual tokens and responsive layout in `specs/002-thinkpak-idea-studio/app/styles.css`

## Phase 3: User Story 1 - Generate Ideas with ThinkPak Prompts (Priority: P1)

**Goal**: Capture and persist idea candidates from ThinkPak prompts.

**Independent Test**: Add three ideas, refresh page, verify all are present.

- [ ] T007 [US1] Add prompt category and card selector UI in `specs/002-thinkpak-idea-studio/app/index.html`
- [ ] T008 [US1] Implement create/edit/delete idea handlers in `specs/002-thinkpak-idea-studio/app/app.js`
- [ ] T009 [US1] Render idea list with timestamps and prompt metadata in `specs/002-thinkpak-idea-studio/app/app.js`
- [ ] T010 [US1] Add manual test checklist entries in `specs/002-thinkpak-idea-studio/quickstart.md`

## Phase 4: User Story 2 - Shape Ideas into Clear Concepts (Priority: P2)

**Goal**: Convert raw idea notes into structured concept statements.

**Independent Test**: Fill problem/audience/value for one idea and verify summary card.

- [ ] T011 [US2] Add shape form fields in `specs/002-thinkpak-idea-studio/app/index.html`
- [ ] T012 [US2] Persist concept details and bind to selected idea in `specs/002-thinkpak-idea-studio/app/app.js`
- [ ] T013 [US2] Render concept summary panel in `specs/002-thinkpak-idea-studio/app/app.js`

## Phase 5: User Story 3 - Evaluate and Select the Best Idea (Priority: P3)

**Goal**: Score ideas, rank them, and explain the selected winner.

**Independent Test**: Score at least two ideas and validate ranking plus rationale.

- [ ] T014 [US3] Add criteria configuration UI in `specs/002-thinkpak-idea-studio/app/index.html`
- [ ] T015 [US3] Implement weighted scoring and rank calculation in `specs/002-thinkpak-idea-studio/app/app.js`
- [ ] T016 [US3] Implement winner rationale generator in `specs/002-thinkpak-idea-studio/app/app.js`
- [ ] T017 [US3] Add ranking table and tie handling UI in `specs/002-thinkpak-idea-studio/app/index.html`

## Final Phase: Polish

- [ ] T018 [P] Improve responsive behavior and contrast in `specs/002-thinkpak-idea-studio/app/styles.css`
- [ ] T019 [P] Add empty-state and error-state messages in `specs/002-thinkpak-idea-studio/app/app.js`
- [ ] T020 Validate full quickstart flow and update `specs/002-thinkpak-idea-studio/quickstart.md`

## Dependencies & Execution Order

- Setup -> Foundational -> US1 -> US2 -> US3 -> Polish
- Within each user story, UI fields should be present before wiring handlers.
- US2 and US3 depend on persisted ideas created in US1.

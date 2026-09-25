# Testing Improvement Strategy Prompt

> 🧭 [vigil](../README.md) · [Features](../FEATURES.md) · [Roadmap](../ROADMAP.md) · [Tasks](../TASKS.md) · [Changelog](../CHANGELOG.md) · [Metrics](../METRICS.md) <!-- nav -->

**Role**: Senior SDET / Engineering Lead
**Objective**: Systematically increase code coverage from ~0% to >50% for the target repository, following a "Start Small, Iterate Up" approach.

---

## Instructions

You are working on one of the following repositories: `farm-3j`, `gcp`, `avatar`, or `osrs`. Your goal is to improve the testing backbone and coverage incrementally.

### Prerequisite Check

1. **Identify the Stack**: Confirm if it's TypeScript/Vitest (`farm-3j`), Python/Pytest (`gcp`, `osrs`, `avatar`), or other.
2. **Verify Harness**: Run the existing test command (`npm test`, `pytest`). Ensure it executes cleanly, even if no tests exist. If it fails, **fix the harness first**.

### Phase 1: The Walking Skeleton (Target: >1-5%)

_Goal: Ensure the project is testable and strictly enforces CI/CD basics._

- Create/Fix `test` scripts in `package.json` or `pytest.ini`.
- Add a simple "Smoke Test" that imports the main modules (e.g., `import app`, `import bot`). This ensures syntax correctness and basic dependency resolution.
- **Deliverable**: A passing test suite (even if trivial) and a working CI check.

### Phase 2: Low-Hanging Fruit (Target: 10-20%)

_Goal: Cover pure functions and utilities that require no mocking._

- Identify "Utility" files (e.g., `utils.ts`, `helpers.py`, data parsers, math functions).
- Write comprehensive unit tests for these. They are easy to test and often high-value.
- **Deliverable**: High coverage on `lib/utils` or `common/` directories.

### Phase 3: Mocking the World (Target: 30-40%)

_Goal: Test core business logic by isolating external dependencies (APIs, Database, UI)._

- **farm-3j**: Mock the Canvas/Context. Test game logic (`gameLogic.ts`, `farmReducer.ts`) purely as state transitions.
- **gcp**: Mock `googleapiclient` and `fs`. Test `copy_folder` logic by providing fake file lists and verifying calls.
- **osrs**: Mock `cv2` (OpenCV) and input listeners. Test bot decision logic (State Machine) by feeding fake screen data.
- **avatar**: If Notebook-heavy, extract core logic into `.py` modules and test those. Or use `nbval` for smoke testing notebooks.
- **Deliverable**: Tests for the main "Controller" or "Service" logic.

### Phase 4: Integration & Edge Cases (Target: >50%)

_Goal: Ensure components work together and handle errors gracefully._

- Add tests for failure modes (API errors, invalid inputs, timeouts).
- If possible, add a limited Integration Test that spins up a lightweight environment (e.g., in-memory DB).

---

## Execution Rules

- **One Step at a Time**: Do not try to jump to Phase 4. Complete Phase 1 fully before moving to Phase 2.
- **Update Metrics**: After every major PR/Commit, update `METRICS.md` with the new coverage %.
- **Don't Break the Build**: Ensure `npm run build` or linting still passes.

## Example Prompt for the Bot

_"I am working on [REPO_NAME]. Please implement Phase [X] of the Testing Strategy. Current coverage is [CURRENT_%]. Focus on [SPECIFIC_FILES_OR_MODULES]."\_

# ChubbTest: QA assessment for the Claims Management App

Take-home QA assessment by **Alok Kumar Singh**. The application under test is in [`demo-app-qa-main/`](demo-app-qa-main/). All my work is on the `chubb_test` branch.

## Start here

| Document | What's in it |
|---|---|
| [TEST_STRATEGY.md](demo-app-qa-main/TEST_STRATEGY.md) | Risk assessment, what I tested and why, confirmed defects, what I left out, next steps |
| [TESTING.md](demo-app-qa-main/TESTING.md) | How to run every suite, with the setup gotchas I hit |
| [AI_JOURNAL.md](demo-app-qa-main/AI_JOURNAL.md) | How I worked with AI: timeline and accepted / challenged / overridden decisions |

## Results at a glance

| Suite | Result | Defects exposed |
|---|---|---|
| UI (Vitest, 286 tests) | 275 passed, 11 failed | BUG-04, BUG-05, BUG-06, BUG-07 (+2 shipped theme tests that already failed) |
| Claims Service (JUnit, MockMvc, Testcontainers) | 7 run, 3 failing | BUG-01, BUG-08 |
| BFF (JUnit concurrency) | 1 run, 1 failing | **BUG-02 (critical)** |
| API integration (Playwright, live stack) | 6 passed, 3 failed | BUG-01, BUG-08, BUG-17 |

**Also found during setup:**
- **BUG-14:** UI crashes after login on a fresh start
- **BUG-15:** the shipped Claims Service tests don't compile
- **BUG-16:** sign-up returns 500

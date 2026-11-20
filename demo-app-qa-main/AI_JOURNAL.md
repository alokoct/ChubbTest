# AI Working Journal

**Author:** Alok Kumar Singh · **AI tool:** Claude (chat-based agent)

## How I worked with AI

As the brief asks, AI was my main working interface. I used it to:
- read the codebase and draft the risk map
- propose test designs and generate most of the test code
- explain errors and suggest fixes

I owned the decisions and the checking:
- running every suite on my own machine
- reading the actual `Expected / Received` values
- deciding what was a real defect versus an environment or harness problem
- cutting scope to fit the time-box
- deciding what to claim in the report

The code the AI wrote was **not compiled or run by the AI** for the Java and live end-to-end parts: its sandbox had no Maven Central or Docker Hub access. My machine was the first place those tests ran, so verifying them was my job.

## Timeline (from my commit history on `chubb_test`)

| Time (20 Nov) | Commit | What happened |
|---|---|---|
| before 14:38 | — | Set up Docker, JDK, Maven and Node. **The build failed on Java 25**, so I set `JAVA_HOME` to 21. **The UI crashed after login** ("Module not found: ./generated"), so I traced it to the missing generated client, logged it as **BUG-14**, generated the client and rebuilt the UI container |
| 14:38 | `11b4c0f` init commit | Original code plus `.gitignore` rules for `target/` (after a first push was rejected for 100 MB+ jar files) |
| 15:26 | `2f0352d` | Shared UI test helpers |
| 15:33 | `90af342` | UI ↔ backend contract tests. 3 failures, all BUG-07 |
| 15:37 | `a75ef89` | APAC timezone test. 4 failures, all `max="2026-11-19"` on 20 Nov (BUG-04) |
| 15:46 | `9b91877` | Component tests. **First run: 4 failures instead of the expected 2.** I investigated before committing (see decision 5) |
| 16:06 | `3b6b0e4` | Fixed the shipped test that didn't compile (**BUG-15**) **and** added the two Claims Service tests. VS Code's "stage all" bundled them into one commit; the message only mentions the fix |
| 16:19 | `726245c` | BFF concurrency test. Request A sent B's token (**BUG-02**) |
| 16:27 | `ff41b00` | Playwright API harness |
| 16:56 | `886b7d7` | E2E specs, plus the harness fixes and the test-env override, after three debugging rounds (see decisions 9–12) |

## Decision log

| # | What the AI produced or claimed | My call | Why |
|---|---|---|---|
| 1 | Pointed out that the brief says Angular / "no tests" but the repo is Next.js with ~93 test files | **Accepted, after checking it myself** | A wrong premise wastes the time-box. I targeted the gaps instead of duplicating coverage |
| 2 | Proposed a broad scope: ~43 tests including WebSocket, CDC, identity stress, browser journeys and k6 | **Overrode: cut to the must-haves** | The brief asks for component, unit and integration tests in 2–3 hours. I kept the highest-risk items and moved the rest to "next steps" |
| 3 | Setup instructions assumed Java 21 would be used | **Challenged** | Maven picked Java 25 and the build failed. I pinned `JAVA_HOME` to 21 and noted it in TESTING.md |
| 4 | Expected the app to work after `./start-app.sh` | **Found a defect (BUG-14)** | The UI crashed after login. I generated the client on the host and rebuilt the UI. Logged as a shipped-setup defect |
| 5 | Predicted 2 failures in the component tests, and earlier ~2 failures on the original suite | **Challenged: I saw 4, and 17 on the original suite** | The extra failures were all `setItem` undefined, which pointed to environment, not app. Node 25's built-in `localStorage` clashes with jsdom. I switched to Node 22, and then the whole suite matched: 275 passed, 11 failed |
| 6 | Red tests "prove the bugs" | **Verified each one** | I read every `Expected / Received`, e.g. `max="2026-11-20"` vs `"2026-11-19"`, and `"request-from-claimant-a"="Bearer token-of-claimant-b"`. A red test only counts if it's red for the right reason |
| 7 | Java tests written but never compiled | **Ran them first: found BUG-15** | The compile error was in a *shipped* test, not the new ones. I made a minimal fix in the test only (a mocked event publisher) and left the app code alone |
| 8 | Latch-based deterministic test for BUG-02, instead of a stress loop | **Accepted, after understanding it** | It fails every run and will pass once the shared state is removed. Easy to defend; a flaky test would be ignored |
| 9 | First live E2E run: 9/9 failed | **Did not accept these as findings** | They all failed in *setup* (sign-up 500, admin login 401). From the BFF logs (`NotAuthorizedException 401` in `SignupUseCaseImpl`) I traced a Keycloak admin-password mismatch: **BUG-16**. I fixed it with a **test-only compose override**, not an app change |
| 10 | The AI's E2E helper cached the CSRF token at login | **Caught an AI mistake** | The second POST/PATCH in a test got 403. The real UI re-reads the token on every request, so the harness now fetches a fresh one per mutation |
| 11 | Parallel run: admin login intermittently 401 | **Contained it, didn't chase it** | Running serially gives stable results. I documented it as an open observation, not a confirmed defect |
| 12 | Listed BUG-11 (stale dashboard) and BUG-12 (concurrent approve/reject) as defects | **Overrode: removed them from the confirmed list** | Both tests **passed** on the live stack. I only report what I can show; both stay as code-review concerns and regression guards |
| 13 | A claimant reading another's claim was expected to get 403/404 | **New finding (BUG-17)** | It got 500. Access is still denied, but the BFF turns every downstream error into a 500, so fixing BUG-01 in the Claims Service alone won't fix the UI |
| 14 | Option to fix the defects in app code | **Declined** | The task is to assess and test. The failing tests are the acceptance criteria for the fixes |

## What I'd do differently with more time
- Commit the shipped-test fix separately from the new Claims tests (`3b6b0e4`), and keep the E2E harness fixes, override and specs in separate commits.
- Pin tool versions (`.nvmrc`, Maven toolchains) from the start. Two of my debugging rounds were environment drift.
- Ask the AI to prove its Java and E2E code runs in a real environment before handing it over, or set up a CI job that does.

# Test Strategy & Findings: Claims Management App

**Author:** Alok Kumar Singh · **Branch:** `chubb_test` · **Date:** 20 Nov 2026
**Ran on:** MacBook, Docker Desktop, JDK 21, Node 22

---

## 1. Summary

- I added **37 automated tests** across four levels: UI unit/contract, UI component, Java web/persistence/concurrency, and API integration against the live Docker stack. I also added shared test helpers and a small test-environment override.
- **11 defects confirmed by failing tests or by direct reproduction.** The most serious, **BUG-02**, is that under concurrent use the BFF can send one user's request with **another user's login token**. The Claims Service takes the claim owner from that token, so a claim can be saved against the wrong customer.
- **4 of those defects I hit myself while setting up and running the stack:**
  - **BUG-14:** the UI crashes after login on a fresh start.
  - **BUG-15:** the shipped Claims Service test suite does not compile.
  - **BUG-16:** user sign-up always returns 500.
  - **BUG-17:** the BFF turns every downstream error into a 500.
- Every failing test fails **for the reason it was written to expose**. I checked the actual `Expected / Received` values for each one, not just the red/green count.
- **Two defects predicted from code review did not reproduce** in my runs (stale dashboard cache, concurrent approve/reject). I **removed them from the confirmed list** rather than claim them, and kept their tests as regression guards.

## 2. Brief vs. what I found in the repo

| The brief says | What I found | What I did about it |
|---|---|---|
| Angular frontend | **Next.js 16 / React 19** | Used React Testing Library + Vitest (already in the repo) |
| "No tests whatsoever" | **~93 existing test files**, mostly mock-based unit tests | Mapped what they cover and aimed my tests at the gaps: HTTP behaviour, concurrency, cross-service contracts, live end to end |
| A simple three-tier app | Also a BFF gateway, Keycloak, Redis, Kafka, optional Debezium CDC | More integration points between services, so I focused on those |

## 3. How I assessed risk

I read the code layer by layer: domain → use cases → controllers → BFF adapters → messaging/WebSocket → UI stores and components. For each area I asked:

1. **Impact.** What does a defect here cost an insurer? Paying or denying the wrong claim, or exposing one customer's data to another, ranks highest.
2. **Complexity.** Does it involve state machines, concurrency or time zones?
3. **Integration seams.** Is a rule duplicated across layers? Is mutable state shared between users?

### Risk map (highest first)

| # | Area | Why it's risky |
|---|---|---|
| R1 | **Identity propagation BFF → Claims Service** | Claim ownership comes from the forwarded JWT, and the BFF swaps the token on a **shared, singleton** HTTP client |
| R2 | **Claim status lifecycle** | Drives payouts. The rules exist in **two places** (Java and the UI), and there is no optimistic locking |
| R3 | **Authorization / data isolation** | A claimant must never see another claimant's claims or reach admin functions |
| R4 | **Error handling across layers** | Errors must reach the user as the correct HTTP status with a readable message |
| R5 | **Validation parity and time zones** | All APAC users are ahead of UTC, and "today" is calculated in UTC |
| R6 | **Real-time chain** (Kafka → BFF → WebSocket → UI) | Four hops, two event formats, and behaviour driven by config |

## 4. What I tested, and at which level

I followed the testing pyramid: each risk is tested at the cheapest level that can still catch it.

| Level | Files | Tests | Covers |
|---|---|---|---|
| UI unit / contract | `claim-status-transitions.contract.test.ts`, `claim-schemas.backend-parity.test.ts` | 7 | R2, R5. The UI rules must match `ClaimStatus.java` / `Claim.java`. The transition test **reads the Java source**, so drift fails the build |
| UI component (Testing Library) | `wizard-step-1.timezone.test.tsx`, `claim-status-select.test.tsx`, `use-claim-realtime-handler.test.tsx` | 13 | R4, R5, R6. Tests the user's point of view; real component and store, with **only the HTTP client faked** |
| Java web contract | `AdminClaimStatusHttpTest` (MockMvc through the real dispatcher and exception handler) | 4 | R2, R4. Checks the status codes promised in `claims-api.yml` |
| Java persistence (Testcontainers Postgres) | `AdminClaimListOrderingIntegrationTest` | 3 | Admin list ordering against a real database |
| Java concurrency | `ClaimsServiceAdapterConcurrencyTest` | 1 | R1. Forces one specific interleaving with latches, so it fails **every time**, not randomly |
| API integration (Playwright, live stack) | `authorization.spec.ts`, `claim-lifecycle.spec.ts` | 9 | R2, R3, R4. Real Keycloak logins, BFF, Claims Service, Postgres, Redis |

**Shared helpers:**
- `tests/support/app-routes.ts`, `api-fakes.ts` (UI)
- `tests/e2e/support/*`: the `BffSession` API client, fixtures and test data builders
- `tests/e2e/global-setup.ts`

### Design choices
- **Fake only the HTTP client, not the store.** Mocking the store would test implementation details. Running the real store caught the rollback and error-message behaviour.
- **Deterministic concurrency tests.** A sleep-based stress loop is flaky and gets ignored. Latches make BUG-02 fail every run, and the test passes as soon as the shared state is removed.
- **Contract tests that read the other side's source.** These catch UI ↔ backend drift without a running stack.
- **Each end-to-end test creates its own users**, so tests don't depend on seeded data.
- **Retries are off** in Playwright, so they can't hide real defects.

## 5. Results on my machine

| Suite | Command | Result | Notes |
|---|---|---|---|
| UI (whole Vitest suite) | `npm test` | **275 passed, 11 failed** (286) | 9 failures are my defect tests (BUG-04 ×4, BUG-07 ×3, BUG-05, BUG-06). The other 2 are shipped theme tests that already failed |
| Claims: HTTP contract | `mvn test -Dtest=AdminClaimStatusHttpTest` | 4 run, **2 errors** | Both errors are BUG-01 |
| Claims: ordering (Postgres) | `mvn test -Dtest=AdminClaimListOrderingIntegrationTest -Dsurefire.excludedGroups=` | 3 run, **1 failure** | The unfiltered list is not newest-first (BUG-08) |
| BFF: concurrency | `mvn test -Dtest=ClaimsServiceAdapterConcurrencyTest` | 1 run, **1 failure** | Request A carried `Bearer token-of-claimant-b` (BUG-02) |
| API integration | `npx playwright test` | **6 passed, 3 failed** (9) | Failures: BUG-17, BUG-01, BUG-08. Passing: happy path, 3 authorization checks, concurrent decision, dashboard freshness |

> I ran the targeted Java tests only, not the full Maven suites. The full Claims Service suite could not compile at all until I fixed the shipped test (BUG-15).

## 6. Confirmed defects

Bug IDs follow the order the issues were first logged, which is why the numbers are not sequential.

| ID | Sev | Defect | Evidence |
|---|---|---|---|
| **BUG-02** | 🔴 Critical | **Users' login tokens can be mixed up under concurrency.** `ClaimsServiceAdapter` / `AdminController` call `apiClient.setBearerToken(userJwt)` on a **singleton** `ApiClient`, then make the call. Two overlapping requests can go out with each other's JWT, so a claim is filed under, or listed for, the wrong customer. | `ClaimsServiceAdapterConcurrencyTest`: request A sent `Bearer token-of-claimant-b` |
| **BUG-16** | 🟠 High | **Sign-up always fails with 500 on the shipped stack.** The BFF signs in to Keycloak's admin API with `KEYCLOAK_ADMIN_PASSWORD` (default `admin`). Keycloak is bootstrapped with `Admin123!`, and `docker-compose.apps.yml` never passes the variable. The BFF log shows `NotAuthorizedException: HTTP 401` in `SignupUseCaseImpl`. | Found on my first live run (9/9 setup failures). Fixed **for testing only** with `docker-compose.e2e.yml` |
| **BUG-01** | 🟠 High | **A forbidden status change returns 500 instead of 400.** `InvalidStatusTransitionException` and `UnauthorizedException` have no handler in `ClaimExceptionHandler`. | `AdminClaimStatusHttpTest` (2 errors), plus `claim-lifecycle.spec.ts` (live: Expected 400, Received 500) |
| **BUG-17** | 🟠 High | **The BFF turns every Claims Service error into a 500.** `ClaimsServiceAdapter` wraps all non-2xx responses in `IllegalStateException`. Asking for another claimant's claim returns 500 instead of 403/404: access is still denied and no data leaks, but the status is wrong. **This also means fixing BUG-01 in the Claims Service alone would not fix what the UI sees.** | `authorization.spec.ts` (Expected 403/404, Received 500) |
| **BUG-14** | 🟠 High | **The UI crashes after login on a fresh start.** The generated API client (`src/lib/api/generated`) is gitignored, and the UI Dockerfile never generates it, giving "Module not found: ./generated". | Found during my setup. Workaround: `npm run generate:api` on the host, then rebuild the `ui` container |
| **BUG-04** | 🟡 Medium | **APAC users can't pick today as the incident date early in the morning.** The picker's `max` uses `new Date().toISOString()` (a UTC date). | `wizard-step-1.timezone.test.tsx`: Sydney, Singapore, Tokyo and Mumbai all get `max="2026-11-19"` on 20 Nov |
| **BUG-15** | 🟡 Medium | **The shipped Claims Service test suite does not compile.** `UpdateClaimStatusUseCase` gained an `ApplicationEventPublisher` parameter, but `UpdateClaimStatusUseCaseTest` still passes three arguments. | Compilation error on my first `mvn test`. I applied a minimal fix in the test only (commit `3b6b0e4`) |
| **BUG-08** | 🟢 Low-Med | **The admin claim list is not newest-first.** `ClaimRepositoryAdapter.findAll()` has no `ORDER BY`. The UI re-sorts, which hides it there, but API consumers get arbitrary order. | Testcontainers test (1 failure), plus live API (the newer claim sorted behind the older one) |
| **BUG-05** | 🟢 Low-Med | **Clicking a status toast leads to a 404.** The claimant's toast navigates to `/claims/{id}`, and no page exists for that route. | `use-claim-realtime-handler.test.tsx` |
| **BUG-06** | 🟢 Low | **Admins see a raw library error.** On a server 500 the admin sees "Response returned an error code". | `claim-status-select.test.tsx` |
| **BUG-07** | 🟢 Low | **UI and server validation disagree.** The client doesn't trim description/location, but the server does, so padded input passes every wizard step and is rejected at the end. | `claim-schemas.backend-parity.test.ts` (3 failures) |

## 7. Code-review concerns: not confirmed by a test

These are worth raising with the team. I did not reproduce them, so I don't claim them as defects.

| ID | Concern | Status |
|---|---|---|
| BUG-11 | Dashboard stats cached in Redis for 300 s, with no cache clearing when claims change | **Did not reproduce** through the live BFF (test passes). Kept as a regression guard |
| BUG-12 | No optimistic locking, so two admins might both approve and reject a claim | **Did not reproduce** in my runs (exactly one decision accepted). Timing-dependent; kept as a guard |
| BUG-03 | `docker-compose.apps.yml` sets `APP_EVENTS_CDC_ENABLED=true` (the README says false), and `start-app.sh` doesn't start Debezium, so real-time events may never be produced | Not tested (I scoped out real-time E2E) |
| BUG-09 | WebSocket sends from several threads with no serialisation; the handler closes the session on `IllegalStateException` | Not tested |
| BUG-10 | CDC event drift: Debezium uses `claim_id`, but `TestEventController` and the AsyncAPI schema use `id` | Not tested |
| BUG-13 | The server checks "incident date not in future" with `LocalDate.now()` on a UTC container, the twin of BUG-04 | Needs an injected `Clock` to test |
| — | Claims Service JWT decoder replaces the default validators, so the **issuer isn't validated** | Not tested |
| — | Metrics tagged with `userId` (unbounded cardinality); WebSocket token passed as a query parameter; money as `double` in the APIs | Not tested |

## 8. Environment findings (not app defects, but they cost time)

| Finding | Effect | What I did |
|---|---|---|
| Homebrew installed **Java 25** for Maven | Build failed (`ExceptionInInitializerError … EndPosTable`, a Lombok incompatibility) | Set `JAVA_HOME` to JDK 21 |
| Homebrew installed **Node 25** | Node 25's built-in `localStorage` clashes with jsdom: zustand persist fails with `setItem` undefined. That gave **17 failures on the original suite instead of 2**, plus 3 false failures in my realtime test | Switched to Node 22 LTS; results then matched the expected defects |
| BFF CSRF token is good for **one** state-changing request | My first harness reused it, so the second POST/PATCH got 403 | The harness now fetches a fresh token before each mutation, as the real UI does |
| **Parallel logins** as the same seeded admin | Intermittent `401 Invalid email or password` | The suite runs serially (`workers: 1`). Logged as an open observation for investigation |

## 9. State of the shipped test suite
- The **Claims Service tests did not compile** (BUG-15).
- **Two UI theme tests fail:** they expect `localStorage`, but the store uses `sessionStorage`, so the theme choice is not kept across browser sessions.
- `playwright.config.ts` pointed at a **missing `tests/e2e/global-setup.ts`**. I added it and simplified the config.
- **A fresh checkout can't run UI tests** until the API client is generated (needs Java and network access).
- The existing **controller tests call methods directly**, so they can't see HTTP-level defects like BUG-01. The Kafka consumer tests assert `broadcast(any())`.

## 10. What I deliberately left out
| Left out | Why |
|---|---|
| More domain unit tests (`ClaimStatus`, `Claim`) | Already covered well by the shipped tests. More would add numbers, not confidence |
| WebSocket concurrency and CDC contract tests | Lower priority than identity and lifecycle in the time-box. Listed as concerns above |
| Browser (UI) end-to-end journeys | The API-level integration tests cover the same backend paths faster and more reliably. A browser smoke test is the next step |
| Load test (k6) and visual regression | Bonus items. Correctness risks came first |
| Fixing the defects in app code | The task is to assess and test. The failing tests serve as **acceptance criteria** for the fixes |

## 11. Next steps (priority order)
1. **Fix BUG-02**: per-request credentials (an interceptor reading the token from the request context, or a client per request). My concurrency test is the regression guard.
2. **Fix BUG-16 and BUG-14** so a fresh `./start-app.sh` gives a working app (pass `KEYCLOAK_ADMIN_PASSWORD`; generate the client in the UI image build).
3. **Fix error mapping end to end (BUG-01 + BUG-17)**: map domain exceptions in the Claims Service *and* pass downstream status codes through the BFF.
4. **CI on every PR**: `mvn verify` (with Testcontainers), `vitest`, and Playwright against compose. Pin Node 22 / JDK 21 so environment drift can't produce false failures.
5. **Contract testing**: replace my source-parsing parity tests with Pact or OpenAPI/AsyncAPI schema validation.
6. **Real-time and concurrency coverage**: WebSocket fan-out, CDC payload contract, optimistic locking with a 409 contract test, and the parallel-login 401.
7. **Bonus tiers**: browser smoke journey, k6 load test with an owner-isolation check, visual regression on the wizard and admin table.

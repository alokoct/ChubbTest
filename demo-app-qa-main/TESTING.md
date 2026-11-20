# How to run the tests

These steps are the ones that worked for me on macOS. Each "gotcha" below is something I hit myself.

## 1. Prerequisites

| Tool | Version | Gotcha |
|---|---|---|
| Docker Desktop | recent | Must be running. Testcontainers and the stack both need it |
| JDK | **21** | Homebrew's Maven may pull in Java 25, which breaks the Lombok build. Run `export JAVA_HOME=$(/usr/libexec/java_home -v 21)` |
| Maven | 3.9+ | — |
| Node.js | **22 LTS** (or 20) | **Not Node 25.** Its built-in `localStorage` breaks jsdom and causes false test failures. Use `brew install node@22` and put it first on your `PATH` |

## 2. Start the stack

From `demo-app-qa-main/`:
```bash
./start-infra.sh          # wait ~2 min for Keycloak
./start-app.sh            # leave running
```

**Fix BUG-14 (UI crashes after login).** Generate the API client, then rebuild the UI container:
```bash
cd code/demo-app-ui && npm ci && npm run generate:api && cd ../..
docker compose -f docker-compose.apps.yml up -d --build ui
```

**Fix BUG-16 (sign-up returns 500)** before running the E2E suite. This is a test-environment override; no app code changes:
```bash
docker compose -f docker-compose.apps.yml -f docker-compose.e2e.yml up -d --no-deps bff-service
```

If admin login starts returning 401 after many runs, Keycloak's brute-force protection may have locked the account. Restart it with `docker restart demo-keycloak` (its realm is in memory and re-imports).

## 3. UI tests (Vitest)

```bash
cd code/demo-app-ui
npm test                                   # whole suite
npx vitest run <path-to-test-file>         # a single file
```
**Expected:** 275 passed, 11 failed (286). That's 9 defect tests plus 2 shipped theme tests that already failed.

## 4. Java tests

```bash
cd code/claims-service
mvn test -Dtest=AdminClaimStatusHttpTest -Dcheckstyle.skip -Dpmd.skip -Dsurefire.failIfNoSpecifiedTests=false
mvn test -Dtest=AdminClaimListOrderingIntegrationTest -Dsurefire.excludedGroups= -Dcheckstyle.skip -Dpmd.skip -Dsurefire.failIfNoSpecifiedTests=false

cd ../bff-service
mvn test -Dtest=ClaimsServiceAdapterConcurrencyTest -Dcheckstyle.skip -Dpmd.skip -Dsurefire.failIfNoSpecifiedTests=false
```
**Expected:** 4 run / 2 errors (BUG-01) · 3 run / 1 failure (BUG-08) · 1 run / 1 failure (BUG-02).

`-Dsurefire.excludedGroups=` includes the `@Tag("integration")` Testcontainers tests, which are excluded by default.

## 5. API integration tests (Playwright, against the running stack)

```bash
cd code/demo-app-ui
npx playwright test
npx playwright show-report      # HTML report
```
**Expected:** 6 passed, 3 failed (BUG-17, BUG-01, BUG-08).

The suite runs **serially** on purpose: parallel logins as the same admin intermittently get 401. Override the target with `E2E_BFF_URL`, `E2E_UI_URL`, `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD`.

## 6. What I added

| Layer | Path (under `demo-app-qa-main/code/`) |
|---|---|
| UI helpers | `demo-app-ui/tests/support/app-routes.ts`, `api-fakes.ts` |
| UI contract | `demo-app-ui/src/features/admin/utils/claim-status-transitions.contract.test.ts` |
| UI contract | `demo-app-ui/src/features/claims/schemas/claim-schemas.backend-parity.test.ts` |
| UI component | `demo-app-ui/src/features/claims/components/wizard-step-1.timezone.test.tsx` |
| UI component | `demo-app-ui/src/features/admin/components/claim-status-select.test.tsx` |
| UI hook | `demo-app-ui/src/features/claims/hooks/use-claim-realtime-handler.test.tsx` |
| Claims web | `claims-service/src/test/java/com/example/demo/adapter/in/web/AdminClaimStatusHttpTest.java` |
| Claims DB | `claims-service/src/test/java/com/example/demo/adapter/out/persistence/AdminClaimListOrderingIntegrationTest.java` |
| Claims fix | `claims-service/src/test/java/com/example/demo/application/usecases/UpdateClaimStatusUseCaseTest.java` (BUG-15) |
| BFF | `bff-service/src/test/java/com/example/demo/adapter/out/claimsservice/ClaimsServiceAdapterConcurrencyTest.java` |
| E2E harness | `demo-app-ui/tests/e2e/support/*`, `tests/e2e/global-setup.ts`, `playwright.config.ts` |
| E2E specs | `demo-app-ui/tests/e2e/api/authorization.spec.ts`, `claim-lifecycle.spec.ts` |
| Test env | `demo-app-qa-main/docker-compose.e2e.yml` (BUG-16) |

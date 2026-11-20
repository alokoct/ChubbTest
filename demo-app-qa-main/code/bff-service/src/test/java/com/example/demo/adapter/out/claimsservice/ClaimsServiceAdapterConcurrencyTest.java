package com.example.demo.adapter.out.claimsservice;

import com.example.bff.adapter.out.claims.ApiClient;
import com.example.demo.application.auth.ServiceAccountTokenProvider;
import com.fasterxml.jackson.databind.ObjectMapper;
import okhttp3.Interceptor;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Protocol;
import okhttp3.Response;
import okhttp3.ResponseBody;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * Identity isolation between concurrent users of the BFF.
 *
 * <p>The BFF forwards each user's JWT to the Claims Service, which derives the claim owner from
 * the token subject (ClaimController uses {@code jwt.getSubject()}). ClaimsServiceAdapter is a
 * singleton that calls {@code apiClient.setBearerToken(userToken)} on a singleton ApiClient and
 * then makes the call. Two overlapping requests can therefore send one user's request with the
 * other user's token: a claim is filed under the wrong person, or one user's list returns
 * another user's claims.</p>
 *
 * <p>Rather than relying on a timing-dependent stress loop, the test forces one legal
 * interleaving deterministically: request A sets its token, request B sets its token, then A
 * builds its HTTP call. A correct implementation (per-request credentials) never calls the shared
 * setter, the latches simply time out, and the test passes.</p>
 */
class ClaimsServiceAdapterConcurrencyTest {

    private static final String CLAIMANT_A_TOKEN = "token-of-claimant-a";
    private static final String CLAIMANT_B_TOKEN = "token-of-claimant-b";
    private static final String REQUEST_A_THREAD = "request-from-claimant-a";
    private static final String REQUEST_B_THREAD = "request-from-claimant-b";
    private static final long INTERLEAVING_TIMEOUT_SECONDS = 2;
    private static final long REQUEST_TIMEOUT_SECONDS = 10;

    private final Map<String, String> authorizationSentByThread = new ConcurrentHashMap<>();
    private final CountDownLatch claimantATokenSet = new CountDownLatch(1);
    private final CountDownLatch claimantBTokenSet = new CountDownLatch(1);

    @Test
    @DisplayName("each claimant's request reaches the Claims Service with that claimant's own token")
    void concurrentRequestsKeepTheirOwnIdentity() throws Exception {
        var adapter = new ClaimsServiceAdapter(
                interleavingApiClient(), mock(ServiceAccountTokenProvider.class), new ObjectMapper());

        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<?> requestA = pool.submit(namedTask(REQUEST_A_THREAD,
                    () -> adapter.listClaims(CLAIMANT_A_TOKEN, UUID.randomUUID())));
            Future<?> requestB = pool.submit(namedTask(REQUEST_B_THREAD, () -> {
                awaitQuietly(claimantATokenSet);
                adapter.listClaims(CLAIMANT_B_TOKEN, UUID.randomUUID());
            }));
            requestA.get(REQUEST_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            requestB.get(REQUEST_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }

        assertThat(authorizationSentByThread)
                .containsEntry(REQUEST_A_THREAD, "Bearer " + CLAIMANT_A_TOKEN)
                .containsEntry(REQUEST_B_THREAD, "Bearer " + CLAIMANT_B_TOKEN);
    }

    /**
     * Real generated ApiClient whose HTTP layer is replaced by an interceptor that records the
     * Authorization header per thread and answers with an empty claim list.
     */
    private ApiClient interleavingApiClient() {
        ApiClient apiClient = new ApiClient() {
            @Override
            public void setBearerToken(String bearerToken) {
                super.setBearerToken(bearerToken);
                if (CLAIMANT_A_TOKEN.equals(bearerToken)) {
                    claimantATokenSet.countDown();
                    awaitQuietly(claimantBTokenSet);
                } else if (CLAIMANT_B_TOKEN.equals(bearerToken)) {
                    claimantBTokenSet.countDown();
                }
            }
        };
        apiClient.setBasePath("http://claims-service.test");
        apiClient.setHttpClient(new OkHttpClient.Builder().addInterceptor(recordingStub()).build());
        return apiClient;
    }

    private Interceptor recordingStub() {
        return chain -> {
            authorizationSentByThread.put(
                    Thread.currentThread().getName(),
                    String.valueOf(chain.request().header("Authorization")));
            return new Response.Builder()
                    .request(chain.request())
                    .protocol(Protocol.HTTP_1_1)
                    .code(200)
                    .message("OK")
                    .body(ResponseBody.create("[]", MediaType.get("application/json")))
                    .build();
        };
    }

    private static Runnable namedTask(String threadName, Runnable body) {
        return () -> {
            Thread.currentThread().setName(threadName);
            body.run();
        };
    }

    private static void awaitQuietly(CountDownLatch latch) {
        try {
            latch.await(INTERLEAVING_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }
}
package com.example.demo.adapter.in.web;

import com.example.demo.application.usecases.ListAllClaimsUseCase;
import com.example.demo.application.usecases.UpdateClaimStatusUseCase;
import com.example.demo.domain.claim.ClaimNotFoundException;
import com.example.demo.domain.claim.InvalidStatusTransitionException;
import com.example.demo.user.domain.UnauthorizedException;
import com.example.demo.user.domain.UserRepository;
import io.micrometer.tracing.Tracer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP contract of PATCH /api/admin/claims/{id}/status as published in claims-api.yml.
 *
 * <p>The existing AdminClaimsControllerTest calls controller methods directly, so it never
 * exercises the exception-to-HTTP mapping in {@link ClaimExceptionHandler}. These tests drive the
 * real Spring MVC dispatcher (controller + advice + JSON binding) with the use case stubbed, and
 * assert the status codes the OpenAPI spec promises to clients (BFF and UI rely on them).</p>
 */
class AdminClaimStatusHttpTest {

    private static final String ERROR_BASE_URL = "https://api.demo-app.com/errors";
    private static final String STATUS_ENDPOINT = "/api/admin/claims/{claimId}/status";
    private static final UUID ADMIN_ID = UUID.fromString("00000000-0000-4000-8000-0000000000ad");
    private static final UUID CLAIM_ID = UUID.fromString("00000000-0000-4000-8000-00000000c1a1");

    private UpdateClaimStatusUseCase updateClaimStatusUseCase;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        updateClaimStatusUseCase = mock(UpdateClaimStatusUseCase.class);
        Tracer tracer = mock(Tracer.class);

        var controller = new AdminClaimsController(
                mock(ListAllClaimsUseCase.class),
                updateClaimStatusUseCase,
                mock(UserRepository.class),
                mock(ClaimWebMapper.class),
                tracer);

        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new ClaimExceptionHandler(new ErrorTypeConstants(ERROR_BASE_URL)))
                .build();

        authenticateAs(ADMIN_ID);
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("responds 400 with a problem detail when the lifecycle forbids the requested transition")
    void rejectsForbiddenTransitionAsClientError() throws Exception {
        String reason = "Cannot transition from REJECTED to APPROVED";
        when(updateClaimStatusUseCase.execute(any())).thenThrow(new InvalidStatusTransitionException(reason));

        requestStatusChange("APPROVED")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value(reason))
                .andExpect(jsonPath("$.type").value(ERROR_BASE_URL + "/validation-error"));
    }

    @Test
    @DisplayName("responds 403 when the caller is not an admin in the user registry")
    void rejectsNonAdminCallerAsForbidden() throws Exception {
        when(updateClaimStatusUseCase.execute(any()))
                .thenThrow(new UnauthorizedException("Only admin users can update claim status"));

        requestStatusChange("UNDER_REVIEW")
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("responds 404 when the claim does not exist")
    void reportsUnknownClaimAsNotFound() throws Exception {
        when(updateClaimStatusUseCase.execute(any())).thenThrow(new ClaimNotFoundException(CLAIM_ID));

        requestStatusChange("UNDER_REVIEW")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.type").value(ERROR_BASE_URL + "/not-found"));
    }

    @Test
    @DisplayName("responds 400 when the requested status is not part of the lifecycle")
    void rejectsUnknownStatusValue() throws Exception {
        requestStatusChange("PAID")
                .andExpect(status().isBadRequest());
    }

    private ResultActions requestStatusChange(String newStatus) throws Exception {
        return mockMvc.perform(patch(STATUS_ENDPOINT, CLAIM_ID)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"newStatus\":\"" + newStatus + "\"}"));
    }

    private static void authenticateAs(UUID userId) {
        Jwt jwt = Jwt.withTokenValue("test-token")
                .header("alg", "RS256")
                .subject(userId.toString())
                .claim("realm_access", Map.of("roles", List.of("ADMIN")))
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(3600))
                .build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt, List.of()));
    }
}
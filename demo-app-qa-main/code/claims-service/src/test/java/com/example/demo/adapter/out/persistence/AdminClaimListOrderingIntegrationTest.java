package com.example.demo.adapter.out.persistence;

import com.example.demo.domain.claim.Claim;
import com.example.demo.domain.claim.ClaimRepository;
import com.example.demo.domain.claim.ClaimStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The admin claims list (GET /api/admin/claims) is documented as newest-first
 * (ListAllClaimsUseCase javadoc, AC #7). Each filter combination hits a different repository
 * query, so ordering is verified against a real Postgres for every path.
 *
 * <p>Claims are inserted out of chronological order (middle, oldest, newest) so that Postgres
 * returning rows in physical/insertion order cannot accidentally satisfy the assertion.</p>
 */
@DataJpaTest
@Testcontainers
@Tag("integration")
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({ClaimRepositoryAdapter.class, ClaimPersistenceMapperImpl.class})
class AdminClaimListOrderingIntegrationTest {

    private static final Instant OLDEST = Instant.parse("2026-11-01T01:00:00Z");
    private static final Instant MIDDLE = Instant.parse("2026-11-02T01:00:00Z");
    private static final Instant NEWEST = Instant.parse("2026-11-03T01:00:00Z");

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("testdb")
            .withUsername("test")
            .withPassword("test");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.liquibase.enabled", () -> true);
    }

    @Autowired
    private ClaimRepository claimRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private final UUID claimantId = UUID.randomUUID();
    private UUID oldestClaim;
    private UUID middleClaim;
    private UUID newestClaim;

    @BeforeEach
    void seedClaimsOutOfChronologicalOrder() {
        jdbcTemplate.update("DELETE FROM claims");
        jdbcTemplate.update(
                "INSERT INTO users (user_id, email, name, role, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
                claimantId, "ordering-" + claimantId + "@example.com", "Ordering Claimant", "CLAIMANT");

        middleClaim = persistClaimCreatedAt(MIDDLE);
        oldestClaim = persistClaimCreatedAt(OLDEST);
        newestClaim = persistClaimCreatedAt(NEWEST);
    }

    @Test
    @DisplayName("unfiltered admin list returns newest claim first")
    void unfilteredListIsNewestFirst() {
        assertNewestFirst(claimRepository.findAll());
    }

    @Test
    @DisplayName("status-filtered admin list returns newest claim first")
    void statusFilteredListIsNewestFirst() {
        assertNewestFirst(claimRepository.findAllByStatus(ClaimStatus.SUBMITTED));
    }

    @Test
    @DisplayName("claimant-filtered list returns newest claim first")
    void claimantFilteredListIsNewestFirst() {
        assertNewestFirst(claimRepository.findByUserId(claimantId));
    }

    private void assertNewestFirst(List<Claim> claims) {
        assertThat(claims)
                .extracting(Claim::getClaimId)
                .containsExactly(newestClaim, middleClaim, oldestClaim);
    }

    private UUID persistClaimCreatedAt(Instant createdAt) {
        UUID claimId = UUID.randomUUID();
        claimRepository.save(Claim.reconstitute(
                claimId,
                claimantId,
                LocalDate.of(2026, 10, 30),
                "1 Raffles Place, Singapore",
                "Water damage from burst pipe in the kitchen",
                new BigDecimal("2500.00"),
                ClaimStatus.SUBMITTED,
                createdAt,
                createdAt));
        return claimId;
    }
}
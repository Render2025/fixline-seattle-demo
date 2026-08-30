import { withDatabase } from "./db";
import {
  assessProblemReadiness,
  type CoverageLevel,
  type ValidationStatus,
  type ProblemBootstrapState
} from "./bootstrap-readiness";

import type { Env } from "./types";

/*
  FixLine Bootstrap Readiness Database Adapter v0.1

  Purpose:
  Read the current PostgreSQL bootstrap state for one local problem,
  translate it into the deterministic readiness model, and return
  both the underlying evidence state and the calculated permissions.

  IMPORTANT:
  Missing database evidence becomes UNKNOWN / NOT_STARTED.
  It must never be interpreted as zero real-world need, zero providers,
  zero relationships, or proof of a gap.
*/

function coverageLevel(
  value: unknown
): CoverageLevel {
  const allowed: CoverageLevel[] = [
    "UNKNOWN",
    "VERY_LOW",
    "LOW",
    "MEDIUM",
    "HIGH"
  ];

  const normalized =
    String(value ?? "UNKNOWN").toUpperCase();

  return allowed.includes(
    normalized as CoverageLevel
  )
    ? (normalized as CoverageLevel)
    : "UNKNOWN";
}

function validationStatus(
  value: unknown
): ValidationStatus {
  const allowed: ValidationStatus[] = [
    "NOT_STARTED",
    "IN_PROGRESS",
    "FAILED",
    "PASSED"
  ];

  const normalized =
    String(value ?? "NOT_STARTED").toUpperCase();

  return allowed.includes(
    normalized as ValidationStatus
  )
    ? (normalized as ValidationStatus)
    : "NOT_STARTED";
}

export async function installBootstrapReadinessPersistence(
  env: Env
) {
  return withDatabase(env, async client => {
    await client.query("BEGIN");

    try {
      /*
        Stores benchmark results for translating external source
        taxonomies such as AIRS / 211 into FixLine capabilities.
      */
      await client.query(`
        CREATE TABLE IF NOT EXISTS taxonomy_validation_results (
          id TEXT PRIMARY KEY,

          bootstrap_run_id TEXT NOT NULL
            REFERENCES location_bootstrap_runs(id)
            ON DELETE CASCADE,

          local_problem_priority_id TEXT NOT NULL
            REFERENCES local_problem_priorities(id)
            ON DELETE CASCADE,

          source_taxonomy TEXT NOT NULL,

          validation_status TEXT NOT NULL
            DEFAULT 'NOT_STARTED',

          benchmark_case_count INTEGER NOT NULL
            DEFAULT 0,

          expected_relevant_items INTEGER NOT NULL
            DEFAULT 0,

          retrieved_relevant_items INTEGER NOT NULL
            DEFAULT 0,

          false_positive_items INTEGER NOT NULL
            DEFAULT 0,

          unexplained_mappings INTEGER NOT NULL
            DEFAULT 0,

          benchmark_method TEXT,

          reviewer_note TEXT,

          tested_at TIMESTAMPTZ,

          created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

          updated_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

          UNIQUE (
            bootstrap_run_id,
            local_problem_priority_id,
            source_taxonomy
          )
        );
      `);

      /*
        Tracks broad-registry ingestion separately from specialist
        enrichment sources.

        Example:
        WA 211 could eventually be BROAD_SERVICE_REGISTRY.
        KCRHA is currently SPECIALIST_REGISTRY.
      */
      await client.query(`
        CREATE TABLE IF NOT EXISTS problem_source_ingestion_status (
          id TEXT PRIMARY KEY,

          bootstrap_run_id TEXT NOT NULL
            REFERENCES location_bootstrap_runs(id)
            ON DELETE CASCADE,

          local_problem_priority_id TEXT NOT NULL
            REFERENCES local_problem_priorities(id)
            ON DELETE CASCADE,

          source_id TEXT,

          source_name TEXT NOT NULL,

          source_role TEXT NOT NULL,

          ingestion_status TEXT NOT NULL
            DEFAULT 'NOT_STARTED',

          organizations_mapped INTEGER NOT NULL
            DEFAULT 0,

          programs_mapped INTEGER NOT NULL
            DEFAULT 0,

          records_staged INTEGER NOT NULL
            DEFAULT 0,

          records_reviewed INTEGER NOT NULL
            DEFAULT 0,

          notes TEXT,

          updated_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

          UNIQUE (
            bootstrap_run_id,
            local_problem_priority_id,
            source_name
          )
        );
      `);

      /*
        Stores the calculated readiness result so the API/UI/MCP
        can expose the same state consistently.
      */
      await client.query(`
        CREATE TABLE IF NOT EXISTS problem_intelligence_readiness (
          id TEXT PRIMARY KEY,

          bootstrap_run_id TEXT NOT NULL
            REFERENCES location_bootstrap_runs(id)
            ON DELETE CASCADE,

          local_problem_priority_id TEXT NOT NULL
            REFERENCES local_problem_priorities(id)
            ON DELETE CASCADE,

          readiness TEXT NOT NULL,

          describe_problem BOOLEAN NOT NULL
            DEFAULT FALSE,

          list_discovered_providers BOOLEAN NOT NULL
            DEFAULT FALSE,

          produce_coverage_hypotheses BOOLEAN NOT NULL
            DEFAULT FALSE,

          produce_service_gap_claims BOOLEAN NOT NULL
            DEFAULT FALSE,

          produce_collaboration_hypotheses BOOLEAN NOT NULL
            DEFAULT FALSE,

          produce_strong_collaboration_recommendations
            BOOLEAN NOT NULL DEFAULT FALSE,

          produce_project_hypotheses BOOLEAN NOT NULL
            DEFAULT FALSE,

          produce_strong_project_recommendations
            BOOLEAN NOT NULL DEFAULT FALSE,

          result_json JSONB NOT NULL,

          calculated_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

          UNIQUE (
            bootstrap_run_id,
            local_problem_priority_id
          )
        );
      `);

      await client.query(`
        INSERT INTO schema_version (
          version,
          description
        )
        VALUES (
          'fixline-core-014',
          'Bootstrap readiness persistence, taxonomy validation and source-ingestion status'
        )
        ON CONFLICT DO NOTHING;
      `);

      await client.query("COMMIT");

      return {
        ok: true,
        migration: "fixline-core-014",
        system:
          "FixLine Bootstrap Readiness Persistence v0.1",
        created_models: [
          "taxonomy_validation_results",
          "problem_source_ingestion_status",
          "problem_intelligence_readiness"
        ],
        safeguard:
          "Missing data remains UNKNOWN and cannot establish a service or relationship gap."
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

/*
  Build the readiness state for a local prioritized problem.
*/
export async function getProblemBootstrapReadiness(
  env: Env,
  localProblemPriorityId: string
) {
  return withDatabase(env, async client => {
    /*
      Problem and independent need-evidence state.
    */
    const problemResult = await client.query(
      `
      SELECT
        lpp.id,
        lpp.bootstrap_run_id,
        lpp.problem_id,
        lpp.local_problem_name,
        lpp.confidence,
        lpp.evidence_source_count,

        COUNT(lpe.id)::int
          AS actual_evidence_count

      FROM local_problem_priorities lpp

      LEFT JOIN local_problem_evidence lpe
        ON lpe.local_problem_priority_id = lpp.id

      WHERE lpp.id = $1

      GROUP BY
        lpp.id,
        lpp.bootstrap_run_id,
        lpp.problem_id,
        lpp.local_problem_name,
        lpp.confidence,
        lpp.evidence_source_count

      LIMIT 1;
      `,
      [localProblemPriorityId]
    );

    if (!problemResult.rows.length) {
      return null;
    }

    const problem =
      problemResult.rows[0];

    /*
      Latest ecosystem coverage assessment.
    */
    const coverageResult = await client.query(
      `
      SELECT *
      FROM ecosystem_coverage_assessments
      WHERE
        bootstrap_run_id = $1
        AND (
          local_problem_priority_id = $2
          OR local_problem_priority_id IS NULL
        )
      ORDER BY
        CASE
          WHEN local_problem_priority_id = $2
          THEN 0
          ELSE 1
        END,
        assessed_at DESC
      LIMIT 1;
      `,
      [
        problem.bootstrap_run_id,
        localProblemPriorityId
      ]
    );

    const coverage =
      coverageResult.rows[0] ?? {};

    /*
      Prefer a broad service registry if one has been recorded.
    */
    const broadSourceResult =
      await client.query(
        `
        SELECT *
        FROM problem_source_ingestion_status
        WHERE
          bootstrap_run_id = $1
          AND local_problem_priority_id = $2
          AND source_role = 'BROAD_SERVICE_REGISTRY'
        ORDER BY updated_at DESC
        LIMIT 1;
        `,
        [
          problem.bootstrap_run_id,
          localProblemPriorityId
        ]
      );

    const broadSource =
      broadSourceResult.rows[0] ?? null;

    /*
      Latest taxonomy benchmark.
    */
    const taxonomyResult =
      await client.query(
        `
        SELECT *
        FROM taxonomy_validation_results
        WHERE
          bootstrap_run_id = $1
          AND local_problem_priority_id = $2
        ORDER BY
          tested_at DESC NULLS LAST,
          updated_at DESC
        LIMIT 1;
        `,
        [
          problem.bootstrap_run_id,
          localProblemPriorityId
        ]
      );

    const taxonomy =
      taxonomyResult.rows[0] ?? {};

    /*
      Relationship totals are computed from documented FixLine
      relationship data rather than inferred absence.
    */
    const relationshipResult =
      await client.query(`
        SELECT
          COUNT(*)::int
            AS documented_relationship_count,

          COUNT(*) FILTER (
            WHERE UPPER(
              COALESCE(relationship_type, '')
            ) LIKE '%FUND%'
          )::int
            AS funding_relationship_count,

          COUNT(*) FILTER (
            WHERE UPPER(
              COALESCE(relationship_type, '')
            ) LIKE '%CONTRACT%'
          )::int
            AS contracting_relationship_count,

          COUNT(*) FILTER (
            WHERE
              UPPER(
                COALESCE(relationship_type, '')
              ) LIKE '%COALITION%'
              OR
              UPPER(
                COALESCE(relationship_type, '')
              ) LIKE '%NETWORK%'
          )::int
            AS coalition_relationship_count

        FROM relationships;
      `);

    const relationshipCounts =
      relationshipResult.rows[0] ?? {};

    /*
      Build deterministic state.

      IMPORTANT:
      The three "uses..." flags remain false only because the
      current database model has not yet recorded evidence that
      these prohibited inputs were used.

      Later, source evidence should carry explicit input classes.
    */
    const state: ProblemBootstrapState = {
      problemId:
        problem.problem_id ??
        localProblemPriorityId,

      problemName:
        problem.local_problem_name,

      needEvidence: {
        independentNeedEvidence:
          coverageLevel(
            problem.confidence
          ),

        evidenceSourceCount:
          Math.max(
            Number(
              problem.evidence_source_count ?? 0
            ),
            Number(
              problem.actual_evidence_count ?? 0
            )
          ),

        usesProviderCountsToEstablishNeed:
          false,

        usesMediaSalienceToEstablishNeed:
          false,

        usesPoliticalPriorityToEstablishNeed:
          false
      },

      ecosystem: {
        broadServiceRegistryStatus:
          broadSource
            ? String(
                broadSource.ingestion_status
              ).toUpperCase() === "INGESTED"
              ? "INGESTED"
              : String(
                  broadSource.ingestion_status
                ).toUpperCase() === "INGESTING"
              ? "INGESTING"
              : "ACCESS_AVAILABLE"
            : "ACCESS_PENDING",

        broadServiceRegistryName:
          broadSource?.source_name,

        organizationsMapped:
          Number(
            coverage.organizations_mapped ??
            broadSource?.organizations_mapped ??
            0
          ),

        programsMapped:
          Number(
            coverage.programs_mapped ??
            broadSource?.programs_mapped ??
            0
          ),

        sourceCoverage:
          coverageLevel(
            coverage.organization_coverage
          ),

        providerCoverage:
          coverageLevel(
            coverage.program_coverage
          ),

        geographicCoverage:
          "UNKNOWN",

        populationCoverage:
          "UNKNOWN",

        freshnessCoverage:
          "UNKNOWN",

        capacityCoverage:
          coverageLevel(
            coverage.capacity_coverage
          )
      },

      taxonomy: {
        status:
          validationStatus(
            taxonomy.validation_status
          ),

        benchmarkCaseCount:
          Number(
            taxonomy.benchmark_case_count ??
            0
          ),

        expectedRelevantItems:
          Number(
            taxonomy.expected_relevant_items ??
            0
          ),

        retrievedRelevantItems:
          Number(
            taxonomy.retrieved_relevant_items ??
            0
          ),

        falsePositiveItems:
          Number(
            taxonomy.false_positive_items ??
            0
          ),

        unexplainedMappings:
          Number(
            taxonomy.unexplained_mappings ??
            0
          )
      },

      relationships: {
        relationshipCoverage:
          coverageLevel(
            coverage.relationship_coverage
          ),

        documentedRelationshipCount:
          Number(
            relationshipCounts
              .documented_relationship_count ??
            0
          ),

        fundingRelationshipCount:
          Number(
            relationshipCounts
              .funding_relationship_count ??
            0
          ),

        contractingRelationshipCount:
          Number(
            relationshipCounts
              .contracting_relationship_count ??
            0
          ),

        coalitionRelationshipCount:
          Number(
            relationshipCounts
              .coalition_relationship_count ??
            0
          )
      }
    };

    const result =
      assessProblemReadiness(state);

    return {
      state,
      result
    };
  });
}

/*
  Calculate readiness and persist it.
*/
export async function calculateAndPersistProblemReadiness(
  env: Env,
  localProblemPriorityId: string
) {
  const assessment =
    await getProblemBootstrapReadiness(
      env,
      localProblemPriorityId
    );

  if (!assessment) {
    return null;
  }

  return withDatabase(env, async client => {
    const problemResult =
      await client.query(
        `
        SELECT
          id,
          bootstrap_run_id
        FROM local_problem_priorities
        WHERE id = $1
        LIMIT 1;
        `,
        [localProblemPriorityId]
      );

    if (!problemResult.rows.length) {
      return null;
    }

    const problem =
      problemResult.rows[0];

    const readinessId =
      `readiness-${localProblemPriorityId}`;

    await client.query(
      `
      INSERT INTO problem_intelligence_readiness (
        id,
        bootstrap_run_id,
        local_problem_priority_id,
        readiness,

        describe_problem,
        list_discovered_providers,
        produce_coverage_hypotheses,
        produce_service_gap_claims,
        produce_collaboration_hypotheses,
        produce_strong_collaboration_recommendations,
        produce_project_hypotheses,
        produce_strong_project_recommendations,

        result_json,
        calculated_at
      )
      VALUES (
        $1,$2,$3,$4,
        $5,$6,$7,$8,$9,$10,$11,$12,
        $13::jsonb,
        NOW()
      )

      ON CONFLICT (
        bootstrap_run_id,
        local_problem_priority_id
      )

      DO UPDATE SET
        readiness =
          EXCLUDED.readiness,

        describe_problem =
          EXCLUDED.describe_problem,

        list_discovered_providers =
          EXCLUDED.list_discovered_providers,

        produce_coverage_hypotheses =
          EXCLUDED.produce_coverage_hypotheses,

        produce_service_gap_claims =
          EXCLUDED.produce_service_gap_claims,

        produce_collaboration_hypotheses =
          EXCLUDED.produce_collaboration_hypotheses,

        produce_strong_collaboration_recommendations =
          EXCLUDED.produce_strong_collaboration_recommendations,

        produce_project_hypotheses =
          EXCLUDED.produce_project_hypotheses,

        produce_strong_project_recommendations =
          EXCLUDED.produce_strong_project_recommendations,

        result_json =
          EXCLUDED.result_json,

        calculated_at =
          NOW();
      `,
      [
        readinessId,
        problem.bootstrap_run_id,
        localProblemPriorityId,
        assessment.result.readiness,

        assessment.result.permissions
          .describeProblem,

        assessment.result.permissions
          .listDiscoveredProviders,

        assessment.result.permissions
          .produceCoverageHypotheses,

        assessment.result.permissions
          .produceServiceGapClaims,

        assessment.result.permissions
          .produceCollaborationHypotheses,

        assessment.result.permissions
          .produceStrongCollaborationRecommendations,

        assessment.result.permissions
          .produceProjectHypotheses,

        assessment.result.permissions
          .produceStrongProjectRecommendations,

        JSON.stringify(
          assessment.result
        )
      ]
    );

    return {
      ok: true,

      persisted: true,

      local_problem_priority_id:
        localProblemPriorityId,

      ...assessment
    };
  });
}

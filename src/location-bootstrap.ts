import { withDatabase } from "./db";
import type { Env } from "./types";

/*
  FixLine Location Bootstrap v0.1

  Goal:
  Turn a geographic location into a defensible initial civic graph.

  LOCATION
    → LOCAL PROBLEM SCAN
    → SOURCE DISCOVERY
    → MASS ACTOR / PROGRAM INGESTION
    → ENTITY RESOLUTION
    → CAPABILITY / POPULATION / GEOGRAPHY MAPPING
    → FUNDING / RELATIONSHIP MAPPING
    → COVERAGE ASSESSMENT
    → INTELLIGENCE READINESS

  Core safeguard:
  Lack of mapped data must never be interpreted as lack of
  organizations, programs, relationships, capacity, or resources.
*/

export async function installLocationBootstrapModel(env: Env) {
  return withDatabase(env, async client => {
    await client.query("BEGIN");

    try {
      /*
        One bootstrap run represents FixLine attempting to become
        knowledgeable about one geographic area.
      */
      await client.query(`
        CREATE TABLE IF NOT EXISTS location_bootstrap_runs (
          id TEXT PRIMARY KEY,

          location_id TEXT NOT NULL,

          location_name TEXT NOT NULL,

          geographic_level TEXT,
          parent_geography TEXT,

          status TEXT NOT NULL DEFAULT 'INITIALIZING',

          started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMPTZ,

          problem_scan_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
          source_discovery_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
          ingestion_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
          entity_resolution_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
          relationship_mapping_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
          coverage_assessment_status TEXT NOT NULL DEFAULT 'NOT_STARTED',

          intelligence_readiness TEXT NOT NULL DEFAULT 'NOT_READY',

          notes TEXT,

          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      /*
        FixLine's locally prioritized problems.

        These are not simply a copy of the universal ontology.
        Priority must arise from evidence about this location.
      */
      await client.query(`
        CREATE TABLE IF NOT EXISTS local_problem_priorities (
          id TEXT PRIMARY KEY,

          bootstrap_run_id TEXT NOT NULL
            REFERENCES location_bootstrap_runs(id)
            ON DELETE CASCADE,

          problem_id TEXT
            REFERENCES problems(id)
            ON DELETE SET NULL,

          local_problem_name TEXT NOT NULL,

          priority_rank INTEGER,

          priority_band TEXT,

          severity TEXT,
          trend TEXT,
          confidence TEXT NOT NULL DEFAULT 'UNKNOWN',

          evidence_summary TEXT,

          population_disparities TEXT,
          geographic_disparities TEXT,

          evidence_source_count INTEGER NOT NULL DEFAULT 0,

          assessment_status TEXT NOT NULL DEFAULT 'PROPOSED',

          human_review_required BOOLEAN NOT NULL DEFAULT TRUE,

          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          UNIQUE (
            bootstrap_run_id,
            local_problem_name
          )
        );
      `);

      /*
        Evidence supporting why a local problem is prioritized.

        Multiple indicators should normally support consequential
        priority claims.
      */
      await client.query(`
        CREATE TABLE IF NOT EXISTS local_problem_evidence (
          id TEXT PRIMARY KEY,

          local_problem_priority_id TEXT NOT NULL
            REFERENCES local_problem_priorities(id)
            ON DELETE CASCADE,

          source_name TEXT NOT NULL,
          source_authority TEXT NOT NULL,

          source_url TEXT,

          indicator_name TEXT,

          indicator_value TEXT,
          indicator_unit TEXT,

          observation_period TEXT,

          geography TEXT,

          population TEXT,

          evidence_type TEXT,

          interpretation TEXT,

          retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          verification_status TEXT NOT NULL DEFAULT 'SOURCE_RECORDED',

          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      /*
        Source-discovery candidates.

        FixLine should seek large authoritative registries first,
        before crawling individual organizations.
      */
      await client.query(`
        CREATE TABLE IF NOT EXISTS source_discovery_candidates (
          id TEXT PRIMARY KEY,

          bootstrap_run_id TEXT NOT NULL
            REFERENCES location_bootstrap_runs(id)
            ON DELETE CASCADE,

          local_problem_priority_id TEXT
            REFERENCES local_problem_priorities(id)
            ON DELETE SET NULL,

          source_name TEXT NOT NULL,

          publisher TEXT,

          source_url TEXT NOT NULL,

          source_type TEXT,

          authority_level TEXT,

          geographic_scope TEXT,

          estimated_organization_count INTEGER,
          estimated_program_count INTEGER,

          machine_readable BOOLEAN,
          export_available BOOLEAN,
          api_available BOOLEAN,

          access_method TEXT,

          discovery_status TEXT NOT NULL DEFAULT 'DISCOVERED',

          ingestion_priority TEXT NOT NULL DEFAULT 'MEDIUM',

          reason_for_priority TEXT,

          safety_or_privacy_notes TEXT,

          discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          reviewed_at TIMESTAMPTZ,

          UNIQUE (
            bootstrap_run_id,
            source_url
          )
        );
      `);

      /*
        Coverage measurements.

        This is essential because FixLine must distinguish:

        "we found no provider"

        from

        "our provider coverage is poor."
      */
      await client.query(`
        CREATE TABLE IF NOT EXISTS ecosystem_coverage_assessments (
          id TEXT PRIMARY KEY,

          bootstrap_run_id TEXT NOT NULL
            REFERENCES location_bootstrap_runs(id)
            ON DELETE CASCADE,

          local_problem_priority_id TEXT
            REFERENCES local_problem_priorities(id)
            ON DELETE CASCADE,

          organizations_mapped INTEGER NOT NULL DEFAULT 0,
          programs_mapped INTEGER NOT NULL DEFAULT 0,

          capabilities_mapped INTEGER NOT NULL DEFAULT 0,

          populations_mapped INTEGER NOT NULL DEFAULT 0,

          known_relationships INTEGER NOT NULL DEFAULT 0,

          funding_relationships INTEGER NOT NULL DEFAULT 0,

          authoritative_sources_ingested INTEGER NOT NULL DEFAULT 0,

          authoritative_sources_pending INTEGER NOT NULL DEFAULT 0,

          capacity_known_count INTEGER NOT NULL DEFAULT 0,
          capacity_unknown_count INTEGER NOT NULL DEFAULT 0,

          organization_coverage TEXT NOT NULL DEFAULT 'UNKNOWN',
          program_coverage TEXT NOT NULL DEFAULT 'UNKNOWN',
          relationship_coverage TEXT NOT NULL DEFAULT 'UNKNOWN',
          funding_coverage TEXT NOT NULL DEFAULT 'UNKNOWN',
          capacity_coverage TEXT NOT NULL DEFAULT 'UNKNOWN',
          evidence_coverage TEXT NOT NULL DEFAULT 'UNKNOWN',

          overall_coverage TEXT NOT NULL DEFAULT 'UNKNOWN',

          recommendation_readiness TEXT NOT NULL DEFAULT 'NOT_READY',

          limitations TEXT,

          assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      /*
        A recommendation gate.

        This prevents "AI saw two names, therefore they should partner."
      */
      await client.query(`
        CREATE TABLE IF NOT EXISTS intelligence_readiness_checks (
          id TEXT PRIMARY KEY,

          bootstrap_run_id TEXT NOT NULL
            REFERENCES location_bootstrap_runs(id)
            ON DELETE CASCADE,

          local_problem_priority_id TEXT
            REFERENCES local_problem_priorities(id)
            ON DELETE CASCADE,

          check_type TEXT NOT NULL,

          status TEXT NOT NULL,

          explanation TEXT,

          blocking BOOLEAN NOT NULL DEFAULT TRUE,

          checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      /*
        Record recommendations separately from underlying evidence.

        Recommendations are hypotheses unless explicitly approved.
      */
      await client.query(`
        CREATE TABLE IF NOT EXISTS civic_intelligence_hypotheses (
          id TEXT PRIMARY KEY,

          bootstrap_run_id TEXT NOT NULL
            REFERENCES location_bootstrap_runs(id)
            ON DELETE CASCADE,

          local_problem_priority_id TEXT
            REFERENCES local_problem_priorities(id)
            ON DELETE SET NULL,

          hypothesis_type TEXT NOT NULL,

          title TEXT NOT NULL,

          description TEXT NOT NULL,

          rationale TEXT,

          confidence TEXT NOT NULL DEFAULT 'UNKNOWN',

          ecosystem_coverage_at_generation TEXT,

          evidence_status TEXT NOT NULL DEFAULT 'INCOMPLETE',

          human_review_required BOOLEAN NOT NULL DEFAULT TRUE,

          authorization_status TEXT NOT NULL DEFAULT 'NOT_AUTHORIZED',

          status TEXT NOT NULL DEFAULT 'PROPOSED',

          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      /*
        Evidence supporting or contradicting a hypothesis.

        FixLine should be able to explain WHY it suggested something.
      */
      await client.query(`
        CREATE TABLE IF NOT EXISTS hypothesis_evidence (
          id TEXT PRIMARY KEY,

          hypothesis_id TEXT NOT NULL
            REFERENCES civic_intelligence_hypotheses(id)
            ON DELETE CASCADE,

          evidence_direction TEXT NOT NULL,

          evidence_type TEXT NOT NULL,

          entity_type TEXT,
          entity_id TEXT,

          source_record_id TEXT,

          explanation TEXT,

          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      /*
        Seed Seattle / King County as the first reusable bootstrap run.
      */
      await client.query(`
        INSERT INTO location_bootstrap_runs (
          id,
          location_id,
          location_name,
          geographic_level,
          parent_geography,
          status,
          problem_scan_status,
          source_discovery_status,
          ingestion_status,
          entity_resolution_status,
          relationship_mapping_status,
          coverage_assessment_status,
          intelligence_readiness,
          notes
        )
        VALUES (
          'bootstrap-seattle-king-county-001',
          'loc-seattle-king-county-wa-us',
          'Seattle / King County, Washington',
          'COUNTY_METRO',
          'Washington, United States',
          'IN_PROGRESS',
          'IN_PROGRESS',
          'IN_PROGRESS',
          'IN_PROGRESS',
          'IN_PROGRESS',
          'IN_PROGRESS',
          'NOT_STARTED',
          'NOT_READY',
          'First FixLine location-bootstrap implementation. Existing pilot data must not be interpreted as comprehensive ecosystem coverage.'
        )

        ON CONFLICT (id)
        DO UPDATE SET
          status = 'IN_PROGRESS',
          updated_at = NOW();
      `);

      /*
        Record KCRHA as the first discovered high-value source.

        This is source discovery metadata, not an assertion that KCRHA
        covers the entire social-service ecosystem.
      */
      await client.query(`
        INSERT INTO source_discovery_candidates (
          id,
          bootstrap_run_id,
          source_name,
          publisher,
          source_url,
          source_type,
          authority_level,
          geographic_scope,
          estimated_program_count,
          machine_readable,
          export_available,
          api_available,
          access_method,
          discovery_status,
          ingestion_priority,
          reason_for_priority,
          safety_or_privacy_notes
        )
        VALUES (
          'source-discovery-kcrha-rsd-001',
          'bootstrap-seattle-king-county-001',
          'KCRHA Regional Services Database',
          'King County Regional Homelessness Authority',
          'https://kcrha.org/find-services/regional-services-database/',
          'GOVERNMENT_SERVICE_REGISTRY',
          'GOVERNMENT_PRIMARY',
          'King County, Washington',
          406,
          TRUE,
          TRUE,
          FALSE,
          'EXPORT',
          'CONFIRMED',
          'HIGH',
          'Large authoritative structured registry covering hundreds of homelessness-response programs.',
          'Some locations may be withheld or generalized. Safety-sensitive services must not be inferred from missing records.'
        )

        ON CONFLICT (id)
        DO UPDATE SET
          discovery_status = 'CONFIRMED';
      `);

      /*
        Initial coverage state for the existing pilot.

        The important thing here is LOW/UNKNOWN, not pretending the
        current graph is comprehensive.
      */
      await client.query(`
        INSERT INTO ecosystem_coverage_assessments (
          id,
          bootstrap_run_id,
          organizations_mapped,
          programs_mapped,
          capabilities_mapped,
          known_relationships,
          authoritative_sources_ingested,
          organization_coverage,
          program_coverage,
          relationship_coverage,
          funding_coverage,
          capacity_coverage,
          evidence_coverage,
          overall_coverage,
          recommendation_readiness,
          limitations
        )
        VALUES (
          'coverage-seattle-bootstrap-001',
          'bootstrap-seattle-king-county-001',
          18,
          0,
          107,
          1,
          0,
          'LOW',
          'LOW',
          'VERY_LOW',
          'LOW',
          'VERY_LOW',
          'LOW',
          'LOW',
          'NOT_READY',
          'Existing bounded pilot predates mass public-record ingestion. Organization, program, relationship, capacity and local-problem evidence coverage are incomplete.'
        )

        ON CONFLICT (id)
        DO UPDATE SET
          assessed_at = NOW();
      `);

      /*
        Explicit gate: do not treat the current Seattle graph as ready
        for strong collaboration-gap recommendations.
      */
      await client.query(`
        INSERT INTO intelligence_readiness_checks (
          id,
          bootstrap_run_id,
          check_type,
          status,
          explanation,
          blocking
        )
        VALUES (
          'readiness-seattle-relationships-001',
          'bootstrap-seattle-king-county-001',
          'RELATIONSHIP_GRAPH_COVERAGE',
          'FAIL',
          'Relationship coverage is currently too sparse to treat absent edges as evidence of novel collaboration opportunities.',
          TRUE
        )

        ON CONFLICT (id)
        DO UPDATE SET
          status = 'FAIL',
          explanation = EXCLUDED.explanation,
          checked_at = NOW();
      `);

      await client.query(`
        INSERT INTO schema_version (
          version,
          description
        )
        VALUES (
          'fixline-core-013',
          'Location bootstrap, local problem evidence, source discovery, ecosystem coverage and intelligence-readiness model'
        )
        ON CONFLICT DO NOTHING;
      `);

      await client.query("COMMIT");

      return {
        ok: true,

        migration:
          "fixline-core-013",

        system:
          "FixLine Location Bootstrap v0.1",

        bootstrap:
          "Seattle / King County, Washington",

        operating_sequence: [
          "LOCAL PROBLEM SCAN",
          "SOURCE DISCOVERY",
          "MASS INGESTION",
          "ENTITY RESOLUTION",
          "CAPABILITY / POPULATION / GEOGRAPHY MAPPING",
          "FUNDING / RELATIONSHIP MAPPING",
          "ECOSYSTEM COVERAGE ASSESSMENT",
          "INTELLIGENCE READINESS",
          "FIXLINE RECOMMENDATIONS"
        ],

        core_rules: [
          "No strong recommendation without ecosystem context.",
          "Low graph coverage must never be interpreted as absence of services or relationships.",
          "Local problem priority must be supported by evidence.",
          "Organizations and programs must remain distinct.",
          "Public funding and contract relationships are evidence-backed edges.",
          "Unknown capacity remains UNKNOWN.",
          "Collaboration recommendations are hypotheses requiring human review.",
          "MCP access does not authorize civic action."
        ],

        current_state: {
          intelligence_readiness:
            "NOT_READY",

          reason:
            "Seattle pilot ecosystem coverage remains incomplete; mass public-record ingestion is now required."
        }
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

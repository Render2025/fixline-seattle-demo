import { withDatabase } from "./db";
import type { Env } from "./types";

/*
  FixLine Public Records Ingestion Layer v0.1

  Purpose:
  Establish staging/provenance tables before importing large
  Seattle / King County public datasets.

  IMPORTANT:
  Source records are not automatically promoted into canonical
  FixLine organizations, programs, capabilities or relationships.
  Entity resolution and consequential mappings require review.
*/

export async function installPublicRecordsIngestionModel(env: Env) {
  return withDatabase(env, async client => {
    await client.query("BEGIN");

    try {
      /*
        One record for each authoritative source FixLine knows about.
      */
      await client.query(`
        CREATE TABLE IF NOT EXISTS public_data_sources (
          id TEXT PRIMARY KEY,

          name TEXT NOT NULL,

          publisher TEXT NOT NULL,

          source_type TEXT NOT NULL,

          source_url TEXT NOT NULL,

          geographic_scope TEXT,

          authority_level TEXT NOT NULL,

          description TEXT,

          retrieval_method TEXT,

          last_checked_at TIMESTAMPTZ,

          last_successful_ingest_at TIMESTAMPTZ,

          status TEXT NOT NULL DEFAULT 'ACTIVE',

          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      /*
        Raw records remain preserved separately from canonical data.

        This is critical for provenance and reprocessing.
      */
      await client.query(`
        CREATE TABLE IF NOT EXISTS public_source_records (
          id TEXT PRIMARY KEY,

          source_id TEXT NOT NULL
            REFERENCES public_data_sources(id)
            ON DELETE CASCADE,

          source_record_id TEXT,

          source_record_type TEXT,

          source_name TEXT,

          source_url TEXT,

          retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          source_updated_at TIMESTAMPTZ,

          raw_payload JSONB NOT NULL,

          raw_text TEXT,

          fingerprint TEXT,

          ingestion_status TEXT NOT NULL DEFAULT 'STAGED',

          review_status TEXT NOT NULL DEFAULT 'UNREVIEWED',

          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          UNIQUE(source_id, source_record_id)
        );
      `);

      /*
        Proposed entity resolution.

        A source record may map to:
        - existing canonical organization
        - proposed new organization
        - ambiguous candidates
        - non-organization program/service record
      */
      await client.query(`
        CREATE TABLE IF NOT EXISTS entity_resolution_candidates (
          id TEXT PRIMARY KEY,

          source_record_id TEXT NOT NULL
            REFERENCES public_source_records(id)
            ON DELETE CASCADE,

          canonical_organization_id TEXT
            REFERENCES organizations(id)
            ON DELETE SET NULL,

          proposed_name TEXT,

          resolution_status TEXT NOT NULL DEFAULT 'UNRESOLVED',

          confidence TEXT NOT NULL DEFAULT 'UNKNOWN',

          match_method TEXT,

          explanation TEXT,

          human_review_required BOOLEAN NOT NULL DEFAULT TRUE,

          reviewed_by TEXT,

          reviewed_at TIMESTAMPTZ,

          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      /*
        Programs are distinct from organizations.

        One organization may operate many programs.
      */
      await client.query(`
        CREATE TABLE IF NOT EXISTS programs (
          id TEXT PRIMARY KEY,

          organization_id TEXT
            REFERENCES organizations(id)
            ON DELETE SET NULL,

          name TEXT NOT NULL,

          program_type TEXT,

          description TEXT,

          status TEXT NOT NULL DEFAULT 'UNKNOWN',

          service_area TEXT,

          physical_address TEXT,

          latitude DOUBLE PRECISION,

          longitude DOUBLE PRECISION,

          phone TEXT,

          website TEXT,

          eligibility_summary TEXT,

          access_summary TEXT,

          availability_or_constraints TEXT,

          current_capacity TEXT NOT NULL DEFAULT 'UNKNOWN',

          verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED',

          source_authority TEXT,

          last_verified_at TIMESTAMPTZ,

          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      /*
        Preserve exact source provenance for canonical objects.
      */
      await client.query(`
        CREATE TABLE IF NOT EXISTS entity_source_evidence (
          id TEXT PRIMARY KEY,

          source_record_id TEXT NOT NULL
            REFERENCES public_source_records(id)
            ON DELETE CASCADE,

          entity_type TEXT NOT NULL,

          entity_id TEXT NOT NULL,

          evidence_type TEXT NOT NULL,

          evidence_note TEXT,

          evidence_excerpt TEXT,

          source_url TEXT,

          authority_level TEXT,

          verified_at TIMESTAMPTZ,

          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      /*
        Programs may expose many capabilities.
      */
      await client.query(`
        CREATE TABLE IF NOT EXISTS program_capabilities (
          program_id TEXT NOT NULL
            REFERENCES programs(id)
            ON DELETE CASCADE,

          capability_id TEXT NOT NULL
            REFERENCES capabilities(id)
            ON DELETE CASCADE,

          mapping_status TEXT NOT NULL DEFAULT 'PROPOSED',

          mapping_method TEXT,

          confidence TEXT NOT NULL DEFAULT 'UNKNOWN',

          evidence_source_record_id TEXT
            REFERENCES public_source_records(id)
            ON DELETE SET NULL,

          human_review_required BOOLEAN NOT NULL DEFAULT TRUE,

          PRIMARY KEY (
            program_id,
            capability_id
          )
        );
      `);

      /*
        Population groups are kept explicit instead of buried in text.
      */
      await client.query(`
        CREATE TABLE IF NOT EXISTS population_groups (
          id TEXT PRIMARY KEY,

          name TEXT NOT NULL UNIQUE,

          description TEXT
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS program_populations (
          program_id TEXT NOT NULL
            REFERENCES programs(id)
            ON DELETE CASCADE,

          population_group_id TEXT NOT NULL
            REFERENCES population_groups(id)
            ON DELETE CASCADE,

          source_record_id TEXT
            REFERENCES public_source_records(id)
            ON DELETE SET NULL,

          PRIMARY KEY (
            program_id,
            population_group_id
          )
        );
      `);

      /*
        Government funding / contracting records create actual
        evidence-backed relationships.

        Do not confuse this with informal partnership or referrals.
      */
      await client.query(`
        CREATE TABLE IF NOT EXISTS public_funding_relationships (
          id TEXT PRIMARY KEY,

          funder_name TEXT NOT NULL,

          funder_organization_id TEXT
            REFERENCES organizations(id)
            ON DELETE SET NULL,

          recipient_name TEXT NOT NULL,

          recipient_organization_id TEXT
            REFERENCES organizations(id)
            ON DELETE SET NULL,

          program_id TEXT
            REFERENCES programs(id)
            ON DELETE SET NULL,

          relationship_type TEXT NOT NULL,

          award_or_contract_name TEXT,

          amount NUMERIC,

          currency TEXT DEFAULT 'USD',

          start_date DATE,

          end_date DATE,

          status TEXT,

          source_record_id TEXT
            REFERENCES public_source_records(id)
            ON DELETE SET NULL,

          source_url TEXT,

          verification_status TEXT NOT NULL DEFAULT 'SOURCE_RECORDED',

          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      /*
        Every import run gets its own ledger entry.
      */
      await client.query(`
        CREATE TABLE IF NOT EXISTS ingestion_runs (
          id TEXT PRIMARY KEY,

          source_id TEXT NOT NULL
            REFERENCES public_data_sources(id),

          started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          finished_at TIMESTAMPTZ,

          status TEXT NOT NULL DEFAULT 'STARTED',

          records_seen INTEGER NOT NULL DEFAULT 0,

          records_inserted INTEGER NOT NULL DEFAULT 0,

          records_updated INTEGER NOT NULL DEFAULT 0,

          records_skipped INTEGER NOT NULL DEFAULT 0,

          records_flagged_for_review INTEGER NOT NULL DEFAULT 0,

          error_count INTEGER NOT NULL DEFAULT 0,

          notes TEXT
        );
      `);

      /*
        Seed the first authoritative sources.
      */
      const sources = [
        {
          id: "source-kcrha-rsd",
          name: "KCRHA Regional Services Database",
          publisher:
            "King County Regional Homelessness Authority",
          sourceType:
            "GOVERNMENT_SERVICE_DATABASE",
          url:
            "https://kcrha.org/find-services/regional-services-database/",
          scope:
            "King County, Washington",
          authority:
            "GOVERNMENT_PRIMARY",
          description:
            "400+ programs providing homelessness-related housing, shelter, outreach, navigation, behavioral health, substance-use and other services."
        },

        {
          id: "source-kingcounty-behavioral-health",
          name:
            "King County Behavioral Health Provider Directory",
          publisher:
            "King County Department of Community and Human Services",
          sourceType:
            "GOVERNMENT_PROVIDER_DIRECTORY",
          url:
            "https://kingcounty.gov/en/dept/dchs/human-social-services/behavioral-health-recovery/search-services-providers",
          scope:
            "King County, Washington",
          authority:
            "GOVERNMENT_PRIMARY",
          description:
            "Public directory of behavioral-health and substance-use providers and service classifications."
        },

        {
          id: "source-seattle-hsd",
          name:
            "Seattle Human Services Department Funding Records",
          publisher:
            "City of Seattle Human Services Department",
          sourceType:
            "GOVERNMENT_FUNDING_RECORDS",
          url:
            "https://www.seattle.gov/human-services/for-providers/funding-opportunities",
          scope:
            "Seattle and portions of King County",
          authority:
            "GOVERNMENT_PRIMARY",
          description:
            "Funding opportunities, award records and related public documentation concerning Seattle-funded human-services organizations and programs."
        }
      ];

      for (const source of sources) {
        await client.query(
          `
          INSERT INTO public_data_sources (
            id,
            name,
            publisher,
            source_type,
            source_url,
            geographic_scope,
            authority_level,
            description,
            retrieval_method,
            status
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,
            'PUBLIC_RECORD_INGESTION',
            'ACTIVE'
          )

          ON CONFLICT (id)
          DO UPDATE SET
            name = EXCLUDED.name,
            publisher = EXCLUDED.publisher,
            source_type = EXCLUDED.source_type,
            source_url = EXCLUDED.source_url,
            geographic_scope = EXCLUDED.geographic_scope,
            authority_level = EXCLUDED.authority_level,
            description = EXCLUDED.description,
            updated_at = NOW();
          `,
          [
            source.id,
            source.name,
            source.publisher,
            source.sourceType,
            source.url,
            source.scope,
            source.authority,
            source.description
          ]
        );
      }

      await client.query(`
        INSERT INTO schema_version (
          version,
          description
        )
        VALUES (
          'fixline-core-012',
          'Public-record ingestion, program registry, entity resolution and source-evidence model'
        )
        ON CONFLICT DO NOTHING;
      `);

      await client.query("COMMIT");

      return {
        ok: true,

        migration:
          "fixline-core-012",

        model:
          "Public source → raw record → entity resolution → organization/program → capability/population → funding relationship → provenance",

        safeguards: {
          raw_records_preserved: true,
          automatic_canonicalization: false,
          human_review_for_entity_resolution: true,
          capability_mapping_requires_review: true,
          funding_relationships_distinct_from_partnerships: true
        },

        seeded_sources:
          sources.map(source => ({
            id: source.id,
            name: source.name,
            authority:
              source.authority
          }))
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

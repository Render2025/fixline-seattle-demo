import { withDatabase } from "./db";

import {
  listProblems,
  getProblemIntelligence
} from "./problem-intelligence";

import {
  getOutcome
} from "./outcomes";

import {
  getLedgerRecord
} from "./ledger";

import type { Env } from "./types";

function queryTerms(query: string) {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map(x => x.trim())
    .filter(x => x.length > 2);
}

async function listOrganizations(env: Env) {
  return withDatabase(env, async client => {
    const result = await client.query(`
      SELECT
        o.id,
        o.location_id,
        o.display_name,
        o.organization_type,
        o.verification_status,
        o.website,
        o.service_area,
        o.status,
        o.last_verified_at,
        o.availability_or_constraints,
        o.source_authority,
        o.evidence_note,
        o.current_capacity,

        COALESCE(
          json_agg(c.name ORDER BY c.name)
          FILTER (WHERE c.id IS NOT NULL),
          '[]'::json
        ) AS verified_capabilities

      FROM organizations o

      LEFT JOIN organization_capabilities oc
        ON oc.organization_id = o.id

      LEFT JOIN capabilities c
        ON c.id = oc.capability_id

      GROUP BY
        o.id,
        o.location_id,
        o.display_name,
        o.organization_type,
        o.verification_status,
        o.website,
        o.service_area,
        o.status,
        o.last_verified_at,
        o.availability_or_constraints,
        o.source_authority,
        o.evidence_note,
        o.current_capacity

      ORDER BY o.display_name
    `);

    return result.rows;
  });
}

async function getOrganization(
  env: Env,
  id: string
) {
  return withDatabase(env, async client => {
    const result = await client.query(
      `
      SELECT
        o.id,
        o.location_id,
        o.display_name,
        o.organization_type,
        o.verification_status,
        o.website,
        o.service_area,
        o.status,
        o.last_verified_at,
        o.availability_or_constraints,
        o.source_authority,
        o.evidence_note,
        o.current_capacity,

        COALESCE(
          json_agg(c.name ORDER BY c.name)
          FILTER (WHERE c.id IS NOT NULL),
          '[]'::json
        ) AS verified_capabilities

      FROM organizations o

      LEFT JOIN organization_capabilities oc
        ON oc.organization_id = o.id

      LEFT JOIN capabilities c
        ON c.id = oc.capability_id

      WHERE o.id = $1

      GROUP BY
        o.id,
        o.location_id,
        o.display_name,
        o.organization_type,
        o.verification_status,
        o.website,
        o.service_area,
        o.status,
        o.last_verified_at,
        o.availability_or_constraints,
        o.source_authority,
        o.evidence_note,
        o.current_capacity
      `,
      [id]
    );

    return result.rows[0] ?? null;
  });
}

async function findMatchingOrganizations(
  env: Env,
  query: string
) {
  const terms = queryTerms(query);

  if (!terms.length) {
    return [];
  }

  return withDatabase(env, async client => {
    const result = await client.query(
      `
      WITH org_data AS (
        SELECT
          o.id,
          o.display_name,
          o.organization_type,
          o.website,
          o.current_capacity,

          COALESCE(
            json_agg(c.name ORDER BY c.name)
            FILTER (WHERE c.id IS NOT NULL),
            '[]'::json
          ) AS verified_capabilities,

          LOWER(
            COALESCE(o.display_name, '') || ' ' ||
            COALESCE(o.organization_type, '') || ' ' ||
            COALESCE(string_agg(c.name, ' '), '')
          ) AS search_text

        FROM organizations o

        LEFT JOIN organization_capabilities oc
          ON oc.organization_id = o.id

        LEFT JOIN capabilities c
          ON c.id = oc.capability_id

        GROUP BY
          o.id,
          o.display_name,
          o.organization_type,
          o.website,
          o.current_capacity
      )

      SELECT
        *,
        (
          SELECT COUNT(*)
          FROM unnest($1::text[]) AS term
          WHERE search_text LIKE '%' || term || '%'
        ) AS match_count

      FROM org_data

      WHERE (
        SELECT COUNT(*)
        FROM unnest($1::text[]) AS term
        WHERE search_text LIKE '%' || term || '%'
      ) > 0

      ORDER BY
        match_count DESC,
        display_name ASC

      LIMIT 20
      `,
      [terms]
    );

    return result.rows.map((row: any) => ({
      organization: {
        id: row.id,
        display_name: row.display_name,
        organization_type: row.organization_type,
        website: row.website,
        current_capacity: row.current_capacity,
        verified_capabilities:
          row.verified_capabilities
      },

      score: Number(row.match_count)
    }));
  });
}

async function checkRelationship(
  env: Env,
  a: string,
  b: string
) {
  return withDatabase(env, async client => {
    const result = await client.query(
      `
      SELECT
        r.id,
        r.organization_a_id,
        oa.display_name AS organization_a_name,

        r.organization_b_id,
        ob.display_name AS organization_b_name,

        r.relationship_type,
        r.status,
        r.evidence_note,
        r.source_url,
        r.verified_at

      FROM relationships r

      LEFT JOIN organizations oa
        ON oa.id = r.organization_a_id

      LEFT JOIN organizations ob
        ON ob.id = r.organization_b_id

      WHERE
        (
          r.organization_a_id = $1
          AND r.organization_b_id = $2
        )
        OR
        (
          r.organization_a_id = $2
          AND r.organization_b_id = $1
        )

      LIMIT 1
      `,
      [a, b]
    );

    const relationship =
      result.rows[0] ?? null;

    return {
      relationship_found:
        Boolean(relationship),

      relationship,

      interpretation:
        relationship
          ? "The bounded FixLine graph contains a relationship record."
          : "No relationship is recorded in the bounded graph. This does not prove that no real-world relationship exists."
    };
  });
}

async function whoShouldTalk(
  env: Env,
  query: string
) {
  const matches =
    await findMatchingOrganizations(
      env,
      query
    );

  const strongest =
    matches.slice(0, 6);

  const candidates: any[] = [];

  for (
    let i = 0;
    i < strongest.length;
    i++
  ) {
    for (
      let j = i + 1;
      j < strongest.length;
      j++
    ) {
      const a =
        strongest[i];

      const b =
        strongest[j];

      const relationship =
        await checkRelationship(
          env,
          a.organization.id,
          b.organization.id
        );

      let classification =
        "NEEDS_MORE_EVIDENCE";

      if (
        relationship.relationship_found
      ) {
        classification =
          "REDUNDANT_ALREADY_EXISTS";
      } else if (
        a.score >= 2 &&
        b.score >= 2
      ) {
        classification =
          "NOVEL_CANDIDATE";
      }

      candidates.push({
        classification,

        organization_a: {
          id:
            a.organization.id,
          name:
            a.organization.display_name,
          relevance_score:
            a.score
        },

        organization_b: {
          id:
            b.organization.id,
          name:
            b.organization.display_name,
          relevance_score:
            b.score
        },

        existing_relationship:
          relationship.relationship,

        safeguards: {
          human_review_required: true,

          absence_of_relationship_record_does_not_prove_novelty:
            true
        }
      });
    }
  }

  return {
    query,
    engine:
      "FixLine Who Should Talk v0.1",

    candidates
  };
}

export async function buildReviewBundle(
  env: Env
) {
  const [
    problems,
    problem5,
    organizations,
    farestart,
    matches,
    candidateConnections,
    relationship,
    ledger,
    outcome
  ] = await Promise.all([
    listProblems(env),

    getProblemIntelligence(
      env,
      5
    ),

    listOrganizations(env),

    getOrganization(
      env,
      "org-farestart"
    ),

    findMatchingOrganizations(
      env,
      "job training"
    ),

    whoShouldTalk(
      env,
      "job training"
    ),

    checkRelationship(
      env,
      "org-farestart",
      "org-hopelink"
    ),

    getLedgerRecord(
      env,
      "ledger-demo-food-access-001"
    ),

    getOutcome(
      env,
      "outcome-demo-food-access-001"
    )
  ]);

  return {
    review_bundle: {
      name:
        "FixLine Seattle Pilot Architecture Review Bundle",

      generated_at:
        new Date().toISOString(),

      purpose:
        "Read-only architecture review bundle assembled from the live PostgreSQL-backed bounded FixLine demonstration.",

      important_scope_notes: [
        "Seattle / King County is a demonstration environment, not a universal taxonomy.",
        "Capability does not mean current capacity.",
        "Absence of a relationship record does not prove that no real-world relationship exists.",
        "Suggested collaboration does not mean an appropriate or authorized partnership.",
        "Project launch does not mean a problem is solved.",
        "Measurement does not equal verification.",
        "Durable claims require recheck.",
        "The demonstration project, funding, outcome, verification and ledger lifecycle records are synthetic pilot records."
      ]
    },

    datasets: {
      problems: {
        count:
          problems.length,
        items:
          problems
      },

      problem_5_food_insecurity_intelligence:
        problem5,

      organizations: {
        count:
          organizations.length,
        items:
          organizations
      },

      farestart,

      job_training_matches: {
        query:
          "job training",
        items:
          matches
      },

      who_should_talk_job_training:
        candidateConnections,

      farestart_hopelink_relationship:
        relationship,

      demonstration_ledger_record:
        ledger,

      demonstration_outcome:
        outcome
    },

    requested_review_questions: [
      "Do the returned data actually support FixLine's product claims?",
      "Is the Problem → Capability → Organization → Relationship → Project → Funding Gap → Outcome → Verification → Recheck → Unfinished Work model coherent?",
      "Are uncertainty and provenance represented strongly enough?",
      "Where is the matching or collaboration logic naive, weak, or misleading?",
      "What must change before showing this to Seattle/King County government, funders, nonprofits, or Microsoft?",
      "Which components are genuinely differentiated civic intelligence versus ordinary directory or project-management functionality?",
      "What should the public interface show first so a new stakeholder understands FixLine within 30 seconds?",
      "Does the small bounded dataset create false confidence in problem-capability mappings or possible collaboration gaps?"
    ]
  };
}

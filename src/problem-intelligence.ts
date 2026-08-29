import { withDatabase } from "./db";
import type { Env } from "./types";

export async function getProblemByNumber(
  env: Env,
  problemNumber: number
) {
  return withDatabase(env, async client => {
    const result = await client.query(
      `
      SELECT
        id,
        location_id,
        problem_number,
        name,
        description,
        status,
        severity,
        quantification_mode,
        evidence_summary,
        confidence,
        last_verified_at,
        recheck_at,
        created_at,
        updated_at
      FROM problems
      WHERE problem_number = $1
      LIMIT 1
      `,
      [problemNumber]
    );

    return result.rows[0] ?? null;
  });
}

export async function listProblems(env: Env) {
  return withDatabase(env, async client => {
    const result = await client.query(`
      SELECT
        id,
        location_id,
        problem_number,
        name,
        description,
        status,
        severity,
        quantification_mode,
        evidence_summary,
        confidence,
        last_verified_at,
        recheck_at,
        created_at,
        updated_at
      FROM problems
      ORDER BY problem_number
    `);

    return result.rows;
  });
}

export async function getProblemCapabilities(
  env: Env,
  problemNumber: number
) {
  return withDatabase(env, async client => {
    const problemResult = await client.query(
      `
      SELECT *
      FROM problems
      WHERE problem_number = $1
      LIMIT 1
      `,
      [problemNumber]
    );

    const problem = problemResult.rows[0] ?? null;

    if (!problem) return null;

    const capabilityResult = await client.query(
      `
      SELECT
        c.id,
        c.name,
        c.category,
        pc.relevance_type,
        pc.evidence_note,

        COALESCE(
          json_agg(
            json_build_object(
              'id', o.id,
              'display_name', o.display_name,
              'organization_type', o.organization_type,
              'website', o.website,
              'current_capacity', o.current_capacity
            )
            ORDER BY o.display_name
          ) FILTER (WHERE o.id IS NOT NULL),
          '[]'::json
        ) AS organizations

      FROM problem_capabilities pc

      JOIN capabilities c
        ON c.id = pc.capability_id

      LEFT JOIN organization_capabilities oc
        ON oc.capability_id = c.id

      LEFT JOIN organizations o
        ON o.id = oc.organization_id

      WHERE pc.problem_id = $1

      GROUP BY
        c.id,
        c.name,
        c.category,
        pc.relevance_type,
        pc.evidence_note

      ORDER BY c.name
      `,
      [problem.id]
    );

    return {
      problem,
      capabilities: capabilityResult.rows
    };
  });
}

export async function getProblemIntelligence(
  env: Env,
  problemNumber: number
) {
  return withDatabase(env, async client => {
    const problemResult = await client.query(
      `
      SELECT *
      FROM problems
      WHERE problem_number = $1
      LIMIT 1
      `,
      [problemNumber]
    );

    const problem = problemResult.rows[0] ?? null;

    if (!problem) return null;

    const capabilityResult = await client.query(
      `
      SELECT
        c.id,
        c.name,
        c.category,
        pc.relevance_type,
        pc.evidence_note
      FROM problem_capabilities pc
      JOIN capabilities c
        ON c.id = pc.capability_id
      WHERE pc.problem_id = $1
      ORDER BY c.name
      `,
      [problem.id]
    );

    const organizationResult = await client.query(
      `
      SELECT
        problem_id,
        problem_number,
        problem_name,
        organization_id,
        organization_name,
        organization_type,
        website,
        verification_status,
        current_capacity,
        relevant_capabilities
      FROM problem_relevant_organizations
      WHERE problem_number = $1
      ORDER BY organization_name
      `,
      [problemNumber]
    );

    const pairResult = await client.query(
      `
      SELECT
        organization_a_id,
        organization_a_name,
        organization_b_id,
        organization_b_name,
        relationship_id,
        relationship_type,
        relationship_status,
        evidence_note,
        source_url,
        classification
      FROM problem_collaboration_pairs
      WHERE problem_number = $1
      ORDER BY
        classification,
        organization_a_name,
        organization_b_name
      `,
      [problemNumber]
    );

    const knownRelationships =
      pairResult.rows.filter(
        row => row.classification === "KNOWN_RELATIONSHIP"
      );

    const possibleGaps =
      pairResult.rows.filter(
        row => row.classification === "POSSIBLE_COLLABORATION_GAP"
      );

    return {
      problem,

      evidence_state: {
        status: problem.status,
        confidence: problem.confidence,
        severity: problem.severity,
        quantification_mode: problem.quantification_mode,
        evidence_summary: problem.evidence_summary,
        last_verified_at: problem.last_verified_at,
        recheck_at: problem.recheck_at
      },

      approved_capabilities: {
        count: capabilityResult.rows.length,
        items: capabilityResult.rows
      },

      relevant_organizations: {
        count: organizationResult.rows.length,
        items: organizationResult.rows
      },

      collaboration_analysis: {
        known_relationship_count: knownRelationships.length,
        possible_gap_count: possibleGaps.length,
        known_relationships: knownRelationships,
        possible_collaboration_gaps: possibleGaps
      },

      safeguards: {
        capability_does_not_mean_current_capacity: true,
        missing_relationship_does_not_prove_novelty: true,
        possible_collaboration_gap_is_a_review_hypothesis: true,
        ai_output_is_not_authorization: true,
        human_review_required_for_consequential_action: true
      }
    };
  });
}

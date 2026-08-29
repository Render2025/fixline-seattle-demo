import { withDatabase } from "./db";
import type { Env } from "./types";

export async function listOutcomes(env: Env) {
  return withDatabase(env, async client => {
    const result = await client.query(`
      SELECT
        o.id,
        o.project_id,
        p.name AS project_name,
        o.outcome_type,
        o.description,
        o.baseline_value,
        o.target_value,
        o.measured_value,
        o.measured_unit,
        o.direction,
        o.verification_status,
        o.verification_method,
        o.evidence_note,
        o.source_url,
        o.confidence,
        o.verified_at,
        o.recheck_at,
        o.created_at
      FROM outcomes o
      JOIN projects p
        ON p.id = o.project_id
      ORDER BY o.created_at
    `);

    return result.rows;
  });
}

export async function getOutcome(
  env: Env,
  outcomeId: string
) {
  return withDatabase(env, async client => {
    const outcomeResult = await client.query(
      `
      SELECT
        o.id,
        o.project_id,
        p.name AS project_name,
        p.problem_id,
        pr.problem_number,
        pr.name AS problem_name,
        o.outcome_type,
        o.description,
        o.baseline_value,
        o.target_value,
        o.measured_value,
        o.measured_unit,
        o.direction,
        o.verification_status,
        o.verification_method,
        o.evidence_note,
        o.source_url,
        o.confidence,
        o.verified_at,
        o.recheck_at,
        o.created_at
      FROM outcomes o

      JOIN projects p
        ON p.id = o.project_id

      LEFT JOIN problems pr
        ON pr.id = p.problem_id

      WHERE o.id = $1
      LIMIT 1
      `,
      [outcomeId]
    );

    const outcome = outcomeResult.rows[0] ?? null;

    if (!outcome) {
      return null;
    }

    const verificationsResult = await client.query(
      `
      SELECT
        id,
        verification_status,
        measured_value,
        measured_unit,
        verification_method,
        evidence_note,
        source_url,
        confidence,
        verified_at,
        created_at
      FROM outcome_verifications
      WHERE outcome_id = $1
      ORDER BY created_at
      `,
      [outcomeId]
    );

    const rechecksResult = await client.query(
      `
      SELECT
        id,
        problem_id,
        project_id,
        outcome_id,
        scheduled_for,
        status,
        reason,
        result_summary,
        created_at,
        completed_at
      FROM rechecks
      WHERE outcome_id = $1
      ORDER BY scheduled_for
      `,
      [outcomeId]
    );

    return {
      outcome,

      verifications: {
        count: verificationsResult.rows.length,
        items: verificationsResult.rows
      },

      rechecks: {
        count: rechecksResult.rows.length,
        items: rechecksResult.rows
      },

      safeguards: {
        project_completion_does_not_equal_problem_resolution: true,
        measurement_does_not_equal_verification: true,
        verification_does_not_make_result_permanent: true,
        recheck_is_required_for_durable_claims: true
      }
    };
  });
}

export async function listRechecks(env: Env) {
  return withDatabase(env, async client => {
    const result = await client.query(`
      SELECT
        r.id,

        r.problem_id,
        pr.problem_number,
        pr.name AS problem_name,

        r.project_id,
        p.name AS project_name,

        r.outcome_id,
        o.description AS outcome_description,

        r.scheduled_for,
        r.status,
        r.reason,
        r.result_summary,
        r.created_at,
        r.completed_at

      FROM rechecks r

      LEFT JOIN problems pr
        ON pr.id = r.problem_id

      LEFT JOIN projects p
        ON p.id = r.project_id

      LEFT JOIN outcomes o
        ON o.id = r.outcome_id

      ORDER BY
        r.scheduled_for,
        r.id
    `);

    return result.rows;
  });
}

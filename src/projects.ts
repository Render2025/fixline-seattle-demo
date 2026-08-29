import { withDatabase } from "./db";
import type { Env } from "./types";

export async function listProjects(env: Env) {
  return withDatabase(env, async client => {
    const result = await client.query(`
      SELECT
        p.id,
        p.location_id,
        p.problem_id,
        pr.problem_number,
        pr.name AS problem_name,
        p.name,
        p.description,
        p.status,
        p.target_outcome,
        p.funding_needed,
        p.funding_committed,
        p.funding_gap,
        p.funding_currency,
        p.funding_status,
        p.blocker_reason,
        p.created_at,
        p.updated_at
      FROM projects p
      LEFT JOIN problems pr
        ON pr.id = p.problem_id
      ORDER BY
        pr.problem_number NULLS LAST,
        p.name
    `);

    return result.rows;
  });
}

export async function getProject(
  env: Env,
  projectId: string
) {
  return withDatabase(env, async client => {
    const projectResult = await client.query(
      `
      SELECT
        p.id,
        p.location_id,
        p.problem_id,
        pr.problem_number,
        pr.name AS problem_name,
        p.name,
        p.description,
        p.status,
        p.target_outcome,
        p.funding_needed,
        p.funding_committed,
        p.funding_gap,
        p.funding_currency,
        p.funding_status,
        p.blocker_reason,
        p.created_at,
        p.updated_at
      FROM projects p
      LEFT JOIN problems pr
        ON pr.id = p.problem_id
      WHERE p.id = $1
      LIMIT 1
      `,
      [projectId]
    );

    const project = projectResult.rows[0] ?? null;

    if (!project) {
      return null;
    }

    const organizationsResult = await client.query(
      `
      SELECT
        po.organization_id,
        o.display_name,
        o.organization_type,
        po.role,
        po.participation_status,
        o.current_capacity
      FROM project_organizations po
      JOIN organizations o
        ON o.id = po.organization_id
      WHERE po.project_id = $1
      ORDER BY o.display_name
      `,
      [projectId]
    );

    const fundingResult = await client.query(
      `
      SELECT
        id,
        funder_name,
        amount,
        currency,
        commitment_status,
        evidence_note,
        source_url,
        committed_at,
        created_at
      FROM funding_commitments
      WHERE project_id = $1
      ORDER BY created_at DESC
      `,
      [projectId]
    );

    const outcomesResult = await client.query(
      `
      SELECT
        id,
        outcome_type,
        description,
        measured_value,
        measured_unit,
        verification_status,
        verified_at,
        recheck_at,
        created_at
      FROM outcomes
      WHERE project_id = $1
      ORDER BY created_at
      `,
      [projectId]
    );

    return {
      project,

      participating_organizations: {
        count: organizationsResult.rows.length,
        items: organizationsResult.rows
      },

      funding: {
        needed: project.funding_needed,
        committed: project.funding_committed,
        gap: project.funding_gap,
        currency: project.funding_currency,
        status: project.funding_status,
        commitment_count: fundingResult.rows.length,
        commitments: fundingResult.rows
      },

      outcomes: {
        count: outcomesResult.rows.length,
        items: outcomesResult.rows
      },

      safeguards: {
        proposed_funder_is_not_committed_money: true,
        funding_commitment_requires_evidence: true,
        project_launch_does_not_mean_problem_solved: true
      }
    };
  });
}

export async function listFundingGaps(env: Env) {
  return withDatabase(env, async client => {
    const result = await client.query(`
      SELECT
        pfs.project_id,
        pfs.problem_id,
        pr.problem_number,
        pr.name AS problem_name,
        pfs.project_name,
        pfs.project_status,
        pfs.target_outcome,
        pfs.funding_needed,
        pfs.funding_committed,
        pfs.funding_gap,
        pfs.funding_currency,
        pfs.funding_status,
        pfs.commitment_count,
        pfs.verified_commitment_total
      FROM project_funding_status pfs
      LEFT JOIN problems pr
        ON pr.id = pfs.problem_id
      WHERE COALESCE(pfs.funding_gap, 0) > 0
      ORDER BY
        pfs.funding_gap DESC,
        pfs.project_name
    `);

    return result.rows;
  });
}

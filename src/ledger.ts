import { withDatabase } from "./db";
import type { Env } from "./types";

export async function listLedger(env: Env) {
  return withDatabase(env, async client => {
    const result = await client.query(`
      SELECT
        id,
        location_id,
        problem_id,
        problem_number,
        problem_name,
        project_id,
        project_name,
        organization_id,
        organization_name,
        outcome_id,
        outcome_description,
        relationship_id,
        record_type,
        status,
        summary,
        provenance,
        confidence,
        source_url,
        verified_at,
        recheck_at,
        created_at
      FROM unfinished_work_ledger
      ORDER BY
        recheck_at NULLS LAST,
        created_at DESC
    `);

    return result.rows;
  });
}

export async function getLedgerRecord(
  env: Env,
  ledgerId: string
) {
  return withDatabase(env, async client => {
    const result = await client.query(
      `
      SELECT
        id,
        location_id,
        problem_id,
        problem_number,
        problem_name,
        project_id,
        project_name,
        organization_id,
        organization_name,
        outcome_id,
        outcome_description,
        relationship_id,
        record_type,
        status,
        summary,
        provenance,
        confidence,
        source_url,
        verified_at,
        recheck_at,
        created_at
      FROM unfinished_work_ledger
      WHERE id = $1
      LIMIT 1
      `,
      [ledgerId]
    );

    return result.rows[0] ?? null;
  });
}

export async function listOpenUnfinishedWork(
  env: Env
) {
  return withDatabase(env, async client => {
    const result = await client.query(`
      SELECT
        id,
        problem_number,
        problem_name,
        project_name,
        outcome_description,
        record_type,
        status,
        summary,
        confidence,
        recheck_at,
        created_at
      FROM unfinished_work_ledger
      WHERE status NOT IN (
        'CLOSED',
        'SUSTAINED',
        'RESOLVED'
      )
      ORDER BY
        recheck_at NULLS LAST,
        problem_number NULLS LAST,
        created_at DESC
    `);

    return result.rows;
  });
}

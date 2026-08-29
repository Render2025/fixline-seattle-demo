import { Client } from "pg";
import {
  pilotStats
} from "./core";
import type { Env } from "./types";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*"
    }
  });
}

async function withDatabase<T>(
  env: Env,
  fn: (client: Client) => Promise<T>
): Promise<T> {
  if (!env.HYPERDRIVE?.connectionString) {
    throw new Error("HYPERDRIVE binding is missing");
  }

  const client = new Client({
    connectionString: env.HYPERDRIVE.connectionString
  });

  await client.connect();

  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function dbHealth(env: Env) {
  try {
    const result = await withDatabase(env, async client => {
      const query = await client.query(`
        SELECT
          NOW() AS database_time,
          current_database() AS database_name,
          current_user AS database_user,
          version() AS postgres_version
      `);

      return query.rows[0];
    });

    return json({
      ok: true,
      database: "PostgreSQL",
      hyperdrive: true,
      connection: "Cloudflare Hyperdrive -> Neon",
      result
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      },
      500
    );
  }
}

async function databaseSummary(env: Env) {
  try {
    const result = await withDatabase(env, async client => {
      const system = await client.query(`
        SELECT id, value, updated_at
        FROM fixline_system
        ORDER BY id
      `);

      const counts = await client.query(`
        SELECT
          (SELECT COUNT(*) FROM organizations) AS organizations,
          (SELECT COUNT(*) FROM capabilities) AS capabilities,
          (SELECT COUNT(*) FROM organization_capabilities) AS capability_edges,
          (SELECT COUNT(*) FROM relationships) AS relationships
      `);

      return {
        system: system.rows,
        counts: counts.rows[0]
      };
    });

    return json({
      ok: true,
      source: "persistent PostgreSQL",
      connection: "Cloudflare Worker -> Hyperdrive -> Neon",
      ...result
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      },
      500
    );
  }
}

async function databaseOrganizations(env: Env) {
  try {
    const organizations = await withDatabase(env, async client => {
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
            json_agg(
              c.name
              ORDER BY c.name
            ) FILTER (WHERE c.id IS NOT NULL),
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

    return json(organizations);
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      },
      500
    );
  }
}

async function databaseOrganization(
  env: Env,
  id: string
) {
  try {
    const organization = await withDatabase(
      env,
      async client => {
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
              json_agg(
                c.name
                ORDER BY c.name
              ) FILTER (WHERE c.id IS NOT NULL),
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
      }
    );

    if (!organization) {
      return json(
        { error: "ORGANIZATION_NOT_FOUND" },
        404
      );
    }

    return json(organization);
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      },
      500
    );
  }
}

async function databaseMatches(
  env: Env,
  query: string
) {
  try {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .map(x => x.trim())
      .filter(x => x.length > 2);

    if (!terms.length) {
      return json({
        query,
        source: "PostgreSQL civic graph",
        results: []
      });
    }

    const matches = await withDatabase(env, async client => {
      const result = await client.query(
        `
        WITH org_data AS (
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
              json_agg(
                c.name
                ORDER BY c.name
              ) FILTER (WHERE c.id IS NOT NULL),
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
        `,
        [terms]
      );

      return result.rows;
    });

    return json({
      query,
      source: "PostgreSQL civic graph",
      terms,
      results: matches.map((row: any) => ({
        organization: {
          id: row.id,
          location_id: row.location_id,
          display_name: row.display_name,
          organization_type: row.organization_type,
          verification_status: row.verification_status,
          website: row.website,
          service_area: row.service_area,
          status: row.status,
          last_verified_at: row.last_verified_at,
          availability_or_constraints:
            row.availability_or_constraints,
          source_authority: row.source_authority,
          evidence_note: row.evidence_note,
          verified_capabilities:
            row.verified_capabilities,
          current_capacity:
            row.current_capacity
        },
        score: Number(row.match_count),
        reason:
          "Search terms matched the organization name, type, or verified capabilities stored in PostgreSQL."
      }))
    });
  } catch (error) {
    return json(
      {
        ok: false,
        query,
        error: error instanceof Error ? error.message : String(error)
      },
      500
    );
  }
}

async function databaseRelationship(
  env: Env,
  a: string,
  b: string
) {
  try {
    const result = await withDatabase(
      env,
      async client => {
        const query = await client.query(
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
            r.verified_at,
            r.created_at

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

          ORDER BY r.verified_at DESC NULLS LAST
          `,
          [a, b]
        );

        return query.rows;
      }
    );

    if (!result.length) {
      return json({
        source: "PostgreSQL civic graph",
        relationship_found: false,
        relationship: null,
        interpretation:
          "No relationship is recorded in the bounded FixLine graph. This does not prove that no real-world relationship exists."
      });
    }

    return json({
      source: "PostgreSQL civic graph",
      relationship_found: true,
      novelty_allowed: false,
      relationship: result,
      interpretation:
        "FixLine found an existing relationship record. Do not present this pair as a novel introduction without further review."
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      },
      500
    );
  }
}

export async function handleApi(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/health") {
    return json({
      ok: true,
      service: "FixLine",
      mode: env.FIXLINE_MODE,
      time: new Date().toISOString()
    });
  }

  if (url.pathname === "/api/db-health") {
    return dbHealth(env);
  }

  if (url.pathname === "/api/database") {
    return databaseSummary(env);
  }

  if (url.pathname === "/api/stats") {
    return json(pilotStats());
  }

  if (url.pathname === "/api/organizations") {
    return databaseOrganizations(env);
  }

  if (url.pathname.startsWith("/api/organizations/")) {
    const id = decodeURIComponent(
      url.pathname.split("/").pop()!
    );

    return databaseOrganization(env, id);
  }

  if (url.pathname === "/api/matches") {
    const q = url.searchParams.get("q")?.trim() ?? "";

    if (!q) {
      return json(
        { error: "QUERY_REQUIRED" },
        400
      );
    }

    return databaseMatches(env, q);
  }

  /*
    RELATIONSHIP DETECTION IS NOW POSTGRESQL-BACKED.
  */

  if (url.pathname === "/api/relationship") {
    const a = url.searchParams.get("a");
    const b = url.searchParams.get("b");

    if (!a || !b) {
      return json(
        { error: "A_AND_B_REQUIRED" },
        400
      );
    }

    return databaseRelationship(env, a, b);
  }

  return json(
    { error: "NOT_FOUND" },
    404
  );
}

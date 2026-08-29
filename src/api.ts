import { Client } from "pg";
import {
  findMatches,
  knownRelationship,
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

  /*
    IMPORTANT:
    /api/admin/import-seattle has been removed.

    The initial Seattle import is complete.
    Public anonymous clients should not have
    a database-write endpoint.
  */

  if (url.pathname === "/api/stats") {
    return json(pilotStats());
  }

  /*
    THESE ARE NOW POSTGRESQL-BACKED.
  */

  if (url.pathname === "/api/organizations") {
    return databaseOrganizations(env);
  }

  if (url.pathname.startsWith("/api/organizations/")) {
    const id = decodeURIComponent(
      url.pathname.split("/").pop()!
    );

    return databaseOrganization(env, id);
  }

  /*
    MATCHING IS STILL USING THE BOUNDED
    IN-MEMORY GRAPH FOR THIS STEP.

    We will move matching to PostgreSQL next.
  */

  if (url.pathname === "/api/matches") {
    const q = url.searchParams.get("q")?.trim() ?? "";

    if (!q) {
      return json(
        { error: "QUERY_REQUIRED" },
        400
      );
    }

    return json({
      query: q,
      source: "bounded matcher",
      results: findMatches(q)
    });
  }

  if (url.pathname === "/api/relationship") {
    const a = url.searchParams.get("a");
    const b = url.searchParams.get("b");

    if (!a || !b) {
      return json(
        { error: "A_AND_B_REQUIRED" },
        400
      );
    }

    return json({
      relationship: knownRelationship(a, b)
    });
  }

  return json(
    { error: "NOT_FOUND" },
    404
  );
}

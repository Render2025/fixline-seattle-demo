import { Client } from "pg";
import {
  listOrganizations,
  getOrganization,
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
        database: "PostgreSQL",
        error: error instanceof Error ? error.message : String(error)
      },
      500
    );
  }
}

async function fixlineDatabase(env: Env) {
  try {
    const rows = await withDatabase(env, async client => {
      const result = await client.query(`
        SELECT
          id,
          value,
          updated_at
        FROM fixline_system
        ORDER BY id
      `);

      return result.rows;
    });

    return json({
      ok: true,
      source: "persistent PostgreSQL",
      connection: "Cloudflare Worker -> Hyperdrive -> Neon",
      records: rows
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
    return fixlineDatabase(env);
  }

  if (url.pathname === "/api/stats") {
    return json(pilotStats());
  }

  if (url.pathname === "/api/organizations") {
    return json(listOrganizations());
  }

  if (url.pathname.startsWith("/api/organizations/")) {
    const id = decodeURIComponent(
      url.pathname.split("/").pop()!
    );

    const org = getOrganization(id);

    return org
      ? json(org)
      : json({ error: "NOT_FOUND" }, 404);
  }

  if (url.pathname === "/api/matches") {
    const q = url.searchParams.get("q")?.trim() ?? "";

    if (!q) {
      return json({ error: "QUERY_REQUIRED" }, 400);
    }

    return json({
      query: q,
      results: findMatches(q)
    });
  }

  if (url.pathname === "/api/relationship") {
    const a = url.searchParams.get("a");
    const b = url.searchParams.get("b");

    if (!a || !b) {
      return json({ error: "A_AND_B_REQUIRED" }, 400);
    }

    return json({
      relationship: knownRelationship(a, b)
    });
  }

  return json({ error: "NOT_FOUND" }, 404);
}

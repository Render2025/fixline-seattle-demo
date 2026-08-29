import { Client } from "pg";
import {
  listOrganizations,
  getOrganization,
  findMatches,
  knownRelationship,
  pilotStats
} from "./core";
import {
  organizations,
  capabilities,
  organizationCapabilities,
  relationships
} from "./seed";
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

async function fixlineDatabase(env: Env) {
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

async function importSeattle(env: Env) {
  try {
    const result = await withDatabase(env, async client => {
      await client.query("BEGIN");

      try {
        for (const org of organizations) {
          await client.query(
            `
            INSERT INTO organizations (
              id,
              location_id,
              display_name,
              organization_type,
              verification_status,
              website,
              service_area,
              status,
              last_verified_at,
              availability_or_constraints,
              source_authority,
              evidence_note,
              current_capacity
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'UNKNOWN'
            )
            ON CONFLICT (id) DO UPDATE SET
              location_id = EXCLUDED.location_id,
              display_name = EXCLUDED.display_name,
              organization_type = EXCLUDED.organization_type,
              verification_status = EXCLUDED.verification_status,
              website = EXCLUDED.website,
              service_area = EXCLUDED.service_area,
              status = EXCLUDED.status,
              last_verified_at = EXCLUDED.last_verified_at,
              availability_or_constraints = EXCLUDED.availability_or_constraints,
              source_authority = EXCLUDED.source_authority,
              evidence_note = EXCLUDED.evidence_note,
              updated_at = NOW()
            `,
            [
              org.id,
              org.location_id,
              org.display_name,
              org.organization_type,
              org.verification_status,
              org.website,
              org.service_area_json?.text ?? null,
              org.status,
              org.last_verified_at,
              org.availability_or_constraints ?? null,
              org.source_authority ?? null,
              org.evidence_note ?? null
            ]
          );
        }

        for (const cap of capabilities) {
          await client.query(
            `
            INSERT INTO capabilities (
              id,
              name,
              category
            )
            VALUES ($1,$2,$3)
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
              category = EXCLUDED.category
            `,
            [
              cap.id,
              cap.name,
              cap.capability_category ?? null
            ]
          );
        }

        for (const edge of organizationCapabilities) {
          await client.query(
            `
            INSERT INTO organization_capabilities (
              organization_id,
              capability_id,
              verification_status,
              verified_at,
              availability_status
            )
            VALUES ($1,$2,'verified',$3,$4)
            ON CONFLICT (organization_id, capability_id)
            DO UPDATE SET
              verification_status = EXCLUDED.verification_status,
              verified_at = EXCLUDED.verified_at,
              availability_status = EXCLUDED.availability_status
            `,
            [
              edge.organization_id,
              edge.capability_id,
              edge.verified_at ?? null,
              edge.availability_status ?? "UNKNOWN"
            ]
          );
        }

        for (const rel of relationships) {
          if (
            rel.subject_a_type !== "Organization" ||
            rel.subject_b_type !== "Organization"
          ) {
            continue;
          }

          await client.query(
            `
            INSERT INTO relationships (
              id,
              organization_a_id,
              organization_b_id,
              relationship_type,
              status,
              evidence_note,
              source_url
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT (id) DO UPDATE SET
              organization_a_id = EXCLUDED.organization_a_id,
              organization_b_id = EXCLUDED.organization_b_id,
              relationship_type = EXCLUDED.relationship_type,
              status = EXCLUDED.status,
              evidence_note = EXCLUDED.evidence_note,
              source_url = EXCLUDED.source_url
            `,
            [
              rel.id,
              rel.subject_a_id,
              rel.subject_b_id,
              rel.relationship_type,
              rel.status,
              rel.note ?? null,
              rel.source_url ?? null
            ]
          );
        }

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }

      const counts = await client.query(`
        SELECT
          (SELECT COUNT(*) FROM organizations) AS organizations,
          (SELECT COUNT(*) FROM capabilities) AS capabilities,
          (SELECT COUNT(*) FROM organization_capabilities) AS capability_edges,
          (SELECT COUNT(*) FROM relationships) AS relationships
      `);

      return counts.rows[0];
    });

    return json({
      ok: true,
      import: "Seattle verified graph",
      source: "bundled FixLine seed",
      destination: "Neon PostgreSQL via Hyperdrive",
      counts: result
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

  if (url.pathname === "/api/admin/import-seattle") {
    return importSeattle(env);
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

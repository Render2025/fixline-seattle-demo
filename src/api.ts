import { Client } from "pg";
import { pilotStats } from "./core";
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

function queryTerms(query: string) {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map(x => x.trim())
    .filter(x => x.length > 2);
}

async function findOrganizationsForTerms(
  client: Client,
  terms: string[],
  limit = 10
) {
  if (!terms.length) return [];

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

    LIMIT $2
    `,
    [terms, limit]
  );

  return result.rows;
}

async function existingRelationship(
  client: Client,
  a: string,
  b: string
) {
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

  return result.rows[0] ?? null;
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
    const terms = queryTerms(query);

    const matches = await withDatabase(
      env,
      client => findOrganizationsForTerms(client, terms, 20)
    );

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
    const relationship = await withDatabase(
      env,
      client => existingRelationship(client, a, b)
    );

    if (!relationship) {
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
      relationship,
      interpretation:
        "FixLine found an existing relationship record. Do not present this pair as a novel introduction."
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

async function whoShouldTalk(
  env: Env,
  query: string
) {
  try {
    const terms = queryTerms(query);

    if (!terms.length) {
      return json({
        query,
        source: "PostgreSQL civic graph",
        candidates: []
      });
    }

    const candidates = await withDatabase(
      env,
      async client => {
        /*
          Keep the first demonstration intentionally bounded.

          We retrieve the six strongest matching organizations,
          then evaluate every unique pair.
        */
        const organizations =
          await findOrganizationsForTerms(
            client,
            terms,
            6
          );

        const pairs: any[] = [];

        for (let i = 0; i < organizations.length; i++) {
          for (
            let j = i + 1;
            j < organizations.length;
            j++
          ) {
            const a = organizations[i];
            const b = organizations[j];

            const relationship =
              await existingRelationship(
                client,
                a.id,
                b.id
              );

            const scoreA = Number(a.match_count);
            const scoreB = Number(b.match_count);

            let classification:
              | "REDUNDANT_ALREADY_EXISTS"
              | "NOVEL_CANDIDATE"
              | "NEEDS_MORE_EVIDENCE";

            let explanation: string;

            if (relationship) {
              classification =
                "REDUNDANT_ALREADY_EXISTS";

              explanation =
                "FixLine already contains evidence of a relationship between these organizations. Do not present this as a novel introduction.";
            } else if (
              scoreA >= 2 &&
              scoreB >= 2
            ) {
              classification =
                "NOVEL_CANDIDATE";

              explanation =
                "Both organizations strongly match the civic need and FixLine currently has no relationship record between them. Novelty is not yet independently verified.";
            } else {
              classification =
                "NEEDS_MORE_EVIDENCE";

              explanation =
                "Both organizations have some relevance, but the current evidence is not strong enough to recommend an introduction without additional review.";
            }

            pairs.push({
              classification,

              organization_a: {
                id: a.id,
                name: a.display_name,
                relevance_score: scoreA,
                current_capacity:
                  a.current_capacity,
                capabilities:
                  a.verified_capabilities
              },

              organization_b: {
                id: b.id,
                name: b.display_name,
                relevance_score: scoreB,
                current_capacity:
                  b.current_capacity,
                capabilities:
                  b.verified_capabilities
              },

              existing_relationship:
                relationship,

              explanation,

              safety_and_uncertainty: {
                capability_is_not_capacity: true,
                absence_of_relationship_record_does_not_prove_novelty:
                  true,
                human_review_required: true
              }
            });
          }
        }

        const rank = {
          NOVEL_CANDIDATE: 1,
          NEEDS_MORE_EVIDENCE: 2,
          REDUNDANT_ALREADY_EXISTS: 3
        };

        pairs.sort((x, y) => {
          const classDifference =
            rank[x.classification] -
            rank[y.classification];

          if (classDifference !== 0) {
            return classDifference;
          }

          const xScore =
            x.organization_a.relevance_score +
            x.organization_b.relevance_score;

          const yScore =
            y.organization_a.relevance_score +
            y.organization_b.relevance_score;

          return yScore - xScore;
        });

        return pairs;
      }
    );

    const summary = {
      novel_candidates:
        candidates.filter(
          x =>
            x.classification ===
            "NOVEL_CANDIDATE"
        ).length,

      needs_more_evidence:
        candidates.filter(
          x =>
            x.classification ===
            "NEEDS_MORE_EVIDENCE"
        ).length,

      redundant_existing:
        candidates.filter(
          x =>
            x.classification ===
            "REDUNDANT_ALREADY_EXISTS"
        ).length
    };

    return json({
      query,
      source: "PostgreSQL civic graph",
      engine:
        "FixLine Who Should Talk v0.1",
      interpretation:
        "These are advisory civic-intelligence hypotheses, not instructions or confirmed partnerships.",
      summary,
      candidates
    });
  } catch (error) {
    return json(
      {
        ok: false,
        query,
        error:
          error instanceof Error
            ? error.message
            : String(error)
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

  if (
    url.pathname.startsWith(
      "/api/organizations/"
    )
  ) {
    const id = decodeURIComponent(
      url.pathname.split("/").pop()!
    );

    return databaseOrganization(env, id);
  }

  if (url.pathname === "/api/matches") {
    const q =
      url.searchParams.get("q")?.trim() ??
      "";

    if (!q) {
      return json(
        { error: "QUERY_REQUIRED" },
        400
      );
    }

    return databaseMatches(env, q);
  }

  if (
    url.pathname ===
    "/api/relationship"
  ) {
    const a =
      url.searchParams.get("a");

    const b =
      url.searchParams.get("b");

    if (!a || !b) {
      return json(
        {
          error:
            "A_AND_B_REQUIRED"
        },
        400
      );
    }

    return databaseRelationship(
      env,
      a,
      b
    );
  }

  /*
    FIRST CIVIC-INTELLIGENCE ENDPOINT.
  */

  if (
    url.pathname ===
    "/api/who-should-talk"
  ) {
    const q =
      url.searchParams.get("q")?.trim() ??
      "";

    if (!q) {
      return json(
        {
          error:
            "QUERY_REQUIRED"
        },
        400
      );
    }

    return whoShouldTalk(env, q);
  }

  return json(
    { error: "NOT_FOUND" },
    404
  );
}

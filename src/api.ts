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

async function getProblemByNumber(
  client: Client,
  problemNumber: number
) {
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
    const counts = await withDatabase(env, async client => {
      const result = await client.query(`
        SELECT
          (SELECT COUNT(*) FROM organizations) AS organizations,
          (SELECT COUNT(*) FROM capabilities) AS capabilities,
          (SELECT COUNT(*) FROM organization_capabilities) AS capability_edges,
          (SELECT COUNT(*) FROM relationships) AS relationships,
          (SELECT COUNT(*) FROM problems) AS problems,
          (SELECT COUNT(*) FROM problem_capabilities) AS problem_capability_edges,
          (SELECT COUNT(*) FROM projects) AS projects,
          (SELECT COUNT(*) FROM outcomes) AS outcomes,
          (SELECT COUNT(*) FROM ledger_records) AS ledger_records
      `);

      return result.rows[0];
    });

    return json({
      ok: true,
      source: "persistent PostgreSQL",
      connection: "Cloudflare Worker -> Hyperdrive -> Neon",
      counts
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

async function databaseProblems(env: Env) {
  try {
    const problems = await withDatabase(env, async client => {
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

    return json({
      source: "PostgreSQL unfinished-work registry",
      count: problems.length,
      problems
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

async function databaseProblem(
  env: Env,
  problemNumber: number
) {
  try {
    const problem = await withDatabase(
      env,
      client => getProblemByNumber(client, problemNumber)
    );

    if (!problem) {
      return json(
        { error: "PROBLEM_NOT_FOUND" },
        404
      );
    }

    return json({
      source: "PostgreSQL unfinished-work registry",
      problem
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

async function problemCapabilities(
  env: Env,
  problemNumber: number
) {
  try {
    const result = await withDatabase(
      env,
      async client => {
        const problem =
          await getProblemByNumber(
            client,
            problemNumber
          );

        if (!problem) {
          return null;
        }

        const capabilities =
          await client.query(
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
          capabilities: capabilities.rows
        };
      }
    );

    if (!result) {
      return json(
        { error: "PROBLEM_NOT_FOUND" },
        404
      );
    }

    return json({
      source: "PostgreSQL problem-capability graph",
      problem: result.problem,
      capability_count:
        result.capabilities.length,
      capabilities: result.capabilities
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

async function suggestProblemCapabilities(
  env: Env,
  problemNumber: number
) {
  try {
    const result = await withDatabase(
      env,
      async client => {
        const problem =
          await getProblemByNumber(
            client,
            problemNumber
          );

        if (!problem) {
          return null;
        }

        const problemTerms =
          queryTerms(problem.name);

        const capabilities =
          await client.query(
            `
            SELECT
              c.id,
              c.name,
              c.category,

              (
                SELECT COUNT(*)
                FROM unnest($1::text[]) AS term
                WHERE LOWER(
                  COALESCE(c.name, '') || ' ' ||
                  COALESCE(c.category, '')
                )
                LIKE '%' || term || '%'
              ) AS lexical_score

            FROM capabilities c

            WHERE (
              SELECT COUNT(*)
              FROM unnest($1::text[]) AS term
              WHERE LOWER(
                COALESCE(c.name, '') || ' ' ||
                COALESCE(c.category, '')
              )
              LIKE '%' || term || '%'
            ) > 0

            ORDER BY
              lexical_score DESC,
              c.name ASC
            `,
            [problemTerms]
          );

        return {
          problem,
          problemTerms,
          suggestions:
            capabilities.rows
        };
      }
    );

    if (!result) {
      return json(
        { error: "PROBLEM_NOT_FOUND" },
        404
      );
    }

    return json({
      source:
        "review-only lexical suggestion engine",
      writes_database: false,
      problem: result.problem,
      terms: result.problemTerms,
      suggestion_count:
        result.suggestions.length,
      suggestions:
        result.suggestions.map(
          (row: any) => ({
            capability_id: row.id,
            capability_name: row.name,
            category: row.category,
            lexical_score:
              Number(row.lexical_score),
            classification:
              "REVIEW_REQUIRED",
            note:
              "This is only a lexical candidate. It has not been approved as relevant to the problem."
          })
        )
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
      client =>
        findOrganizationsForTerms(
          client,
          terms,
          20
        )
    );

    return json({
      query,
      source:
        "PostgreSQL civic graph",
      terms,
      results: matches.map(
        (row: any) => ({
          organization: {
            id: row.id,
            display_name:
              row.display_name,
            organization_type:
              row.organization_type,
            website: row.website,
            verified_capabilities:
              row.verified_capabilities,
            current_capacity:
              row.current_capacity
          },
          score:
            Number(row.match_count)
        })
      )
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
    const relationship =
      await withDatabase(
        env,
        client =>
          existingRelationship(
            client,
            a,
            b
          )
      );

    if (!relationship) {
      return json({
        source:
          "PostgreSQL civic graph",
        relationship_found: false,
        relationship: null,
        interpretation:
          "No relationship is recorded in the bounded FixLine graph. This does not prove that no real-world relationship exists."
      });
    }

    return json({
      source:
        "PostgreSQL civic graph",
      relationship_found: true,
      novelty_allowed: false,
      relationship
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
    const terms =
      queryTerms(query);

    const candidates =
      await withDatabase(
        env,
        async client => {
          const organizations =
            await findOrganizationsForTerms(
              client,
              terms,
              6
            );

          const pairs: any[] = [];

          for (
            let i = 0;
            i < organizations.length;
            i++
          ) {
            for (
              let j = i + 1;
              j < organizations.length;
              j++
            ) {
              const a =
                organizations[i];
              const b =
                organizations[j];

              const relationship =
                await existingRelationship(
                  client,
                  a.id,
                  b.id
                );

              const scoreA =
                Number(a.match_count);
              const scoreB =
                Number(b.match_count);

              let classification =
                "NEEDS_MORE_EVIDENCE";

              if (relationship) {
                classification =
                  "REDUNDANT_ALREADY_EXISTS";
              } else if (
                scoreA >= 2 &&
                scoreB >= 2
              ) {
                classification =
                  "NOVEL_CANDIDATE";
              }

              pairs.push({
                classification,
                organization_a: {
                  id: a.id,
                  name:
                    a.display_name,
                  relevance_score:
                    scoreA
                },
                organization_b: {
                  id: b.id,
                  name:
                    b.display_name,
                  relevance_score:
                    scoreB
                },
                existing_relationship:
                  relationship,
                human_review_required:
                  true
              });
            }
          }

          return pairs;
        }
      );

    return json({
      query,
      source:
        "PostgreSQL civic graph",
      engine:
        "FixLine Who Should Talk v0.1",
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
  const url =
    new URL(request.url);

  if (url.pathname === "/health") {
    return json({
      ok: true,
      service: "FixLine",
      mode: env.FIXLINE_MODE,
      time:
        new Date().toISOString()
    });
  }

  if (
    url.pathname ===
    "/api/db-health"
  ) {
    return dbHealth(env);
  }

  if (
    url.pathname ===
    "/api/database"
  ) {
    return databaseSummary(env);
  }

  if (
    url.pathname ===
    "/api/stats"
  ) {
    return json(pilotStats());
  }

  if (
    url.pathname ===
    "/api/problems"
  ) {
    return databaseProblems(env);
  }

  const capabilityMatch =
    url.pathname.match(
      /^\/api\/problems\/(\d+)\/capabilities$/
    );

  if (capabilityMatch) {
    return problemCapabilities(
      env,
      Number(capabilityMatch[1])
    );
  }

  const suggestionMatch =
    url.pathname.match(
      /^\/api\/problems\/(\d+)\/suggest-capabilities$/
    );

  if (suggestionMatch) {
    return suggestProblemCapabilities(
      env,
      Number(suggestionMatch[1])
    );
  }

  const problemMatch =
    url.pathname.match(
      /^\/api\/problems\/(\d+)$/
    );

  if (problemMatch) {
    return databaseProblem(
      env,
      Number(problemMatch[1])
    );
  }

  if (
    url.pathname ===
    "/api/organizations"
  ) {
    return databaseOrganizations(env);
  }

  if (
    url.pathname.startsWith(
      "/api/organizations/"
    )
  ) {
    const id =
      decodeURIComponent(
        url.pathname
          .split("/")
          .pop()!
      );

    return databaseOrganization(
      env,
      id
    );
  }

  if (
    url.pathname ===
    "/api/matches"
  ) {
    const q =
      url.searchParams
        .get("q")
        ?.trim() ?? "";

    if (!q) {
      return json(
        {
          error:
            "QUERY_REQUIRED"
        },
        400
      );
    }

    return databaseMatches(
      env,
      q
    );
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

  if (
    url.pathname ===
    "/api/who-should-talk"
  ) {
    const q =
      url.searchParams
        .get("q")
        ?.trim() ?? "";

    if (!q) {
      return json(
        {
          error:
            "QUERY_REQUIRED"
        },
        400
      );
    }

    return whoShouldTalk(
      env,
      q
    );
  }

  return json(
    { error: "NOT_FOUND" },
    404
  );
}

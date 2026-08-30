import { pilotStats } from "./core";
import { withDatabase } from "./db";

import {
  getProblemByNumber,
  listProblems,
  getProblemCapabilities,
  getProblemIntelligence
} from "./problem-intelligence";

import {
  listProjects,
  getProject,
  listFundingGaps
} from "./projects";

import {
  listOutcomes,
  getOutcome,
  listRechecks
} from "./outcomes";

import {
  listLedger,
  getLedgerRecord,
  listOpenUnfinishedWork
} from "./ledger";

import {
  getProblemOrganizationMatches
} from "./admin-food-intelligence";

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

function queryTerms(query: string) {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map(x => x.trim())
    .filter(x => x.length > 2);
}

function combinations<T>(
  values: T[],
  size: number
): T[][] {
  if (size <= 0) return [[]];
  if (values.length < size) return [];

  if (size === 1) {
    return values.map(value => [value]);
  }

  const result: T[][] = [];

  for (let i = 0; i <= values.length - size; i++) {
    const head = values[i];
    const tail = values.slice(i + 1);

    for (const rest of combinations(tail, size - 1)) {
      result.push([head, ...rest]);
    }
  }

  return result;
}

async function getCollaborationCandidates(
  env: Env,
  problemNumber: number
) {
  const result =
    await getProblemOrganizationMatches(
      env,
      problemNumber
    );

  const organizations = result.organizations
    .map((match: any) => {
      const explanationPaths =
        Array.isArray(match.explanation_paths)
          ? match.explanation_paths
          : [];

      return {
        id: match.organization_id,
        name: match.organization,
        explanation_paths: explanationPaths,
        capability_coverage: [
          ...new Set(
            explanationPaths
              .map((path: any) => path.capability)
              .filter(Boolean)
          )
        ],
        capability_family_coverage: [
          ...new Set(
            explanationPaths
              .map((path: any) => path.capability_family)
              .filter(Boolean)
          )
        ],
        need_dimension_coverage: [
          ...new Set(
            explanationPaths
              .map((path: any) => path.need_dimension)
              .filter(Boolean)
          )
        ]
      };
    })
    .filter((organization: any) =>
      organization.explanation_paths.length > 0
    );

  if (!organizations.length) return [];

  const candidateGroups: any[] = [];
  const seenKeys = new Set<string>();

  for (const size of [5, 4, 3]) {
    for (const combo of combinations(organizations, size)) {
      const ids = combo
        .map((organization: any) => organization.id)
        .sort();

      const key = ids.join("|");
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const allCapabilities = new Set<string>();
      const allCapabilityFamilies = new Set<string>();
      const allNeedDimensions = new Set<string>();

      for (const organization of combo) {
        for (const capability of organization.capability_coverage) {
          allCapabilities.add(capability);
        }

        for (const family of organization.capability_family_coverage) {
          allCapabilityFamilies.add(family);
        }

        for (const need of organization.need_dimension_coverage) {
          allNeedDimensions.add(need);
        }
      }

      const structuralScore = {
        organization_count: combo.length,
        distinct_capabilities: allCapabilities.size,
        distinct_capability_families: allCapabilityFamilies.size,
        distinct_need_dimensions: allNeedDimensions.size
      };

      candidateGroups.push({
        organizations: combo.map((organization: any) => ({
          id: organization.id,
          name: organization.name,
          explanation_paths: organization.explanation_paths
        })),
        structural_score: structuralScore,
        rationale: {
          capability_coverage: [
            ...allCapabilities
          ],
          capability_family_coverage: [
            ...allCapabilityFamilies
          ],
          need_dimension_coverage: [
            ...allNeedDimensions
          ]
        },
        relationship_status:
          "NOT_EVALUATED_FOR_GROUP",
        current_capacity_status:
          "UNKNOWN",
        current_availability_status:
          "UNKNOWN",
        human_review_required: true
      });
    }
  }

  return candidateGroups
    .sort((a, b) => {
      const aScore = a.structural_score;
      const bScore = b.structural_score;

      if (bScore.distinct_capabilities !== aScore.distinct_capabilities) {
        return bScore.distinct_capabilities - aScore.distinct_capabilities;
      }

      if (bScore.distinct_capability_families !== aScore.distinct_capability_families) {
        return bScore.distinct_capability_families - aScore.distinct_capability_families;
      }

      if (bScore.distinct_need_dimensions !== aScore.distinct_need_dimensions) {
        return bScore.distinct_need_dimensions - aScore.distinct_need_dimensions;
      }

      return aScore.organization_count - bScore.organization_count;
    })
    .slice(0, 10);
}

async function findOrganizationsForTerms(
  env: Env,
  terms: string[],
  limit = 10
) {
  if (!terms.length) return [];

  return withDatabase(env, async client => {
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
  });
}

async function existingRelationship(
  env: Env,
  a: string,
  b: string
) {
  return withDatabase(env, async client => {
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
  });
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
        error:
          error instanceof Error
            ? error.message
            : String(error)
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
          (SELECT COUNT(*) FROM funding_commitments) AS funding_commitments,
          (SELECT COUNT(*) FROM outcomes) AS outcomes,
          (SELECT COUNT(*) FROM outcome_verifications) AS outcome_verifications,
          (SELECT COUNT(*) FROM rechecks) AS rechecks,
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
        error:
          error instanceof Error
            ? error.message
            : String(error)
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
        error:
          error instanceof Error
            ? error.message
            : String(error)
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
    const organization = await withDatabase(env, async client => {
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
    });

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
        error:
          error instanceof Error
            ? error.message
            : String(error)
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
    const problem = await withDatabase(
      env,
      async client => {
        const result = await client.query(
          `
          SELECT
            problem_number,
            name
          FROM problems
          WHERE
            LOWER(TRIM(name)) = LOWER(TRIM($1))
            OR problem_number::text = TRIM($1)
          ORDER BY problem_number
          LIMIT 1;
          `,
          [query]
        );

        return result.rows[0] ?? null;
      }
    );

    if (problem) {
      const ontology =
        await getProblemOrganizationMatches(
          env,
          Number(problem.problem_number)
        );

      return json({
        query,
        source: "PostgreSQL FixLine ontology graph",
        engine: "FixLine Explainable Problem Matcher v0.1",
        mode: "ONTOLOGY_PROBLEM_MATCH",
        problem: {
          problem_number:
            Number(problem.problem_number),
          name: problem.name
        },
        safeguards: {
          organization_name_exceptions: false,
          relationship_absence_proves_novelty: false,
          capability_implies_current_capacity: false,
          capability_implies_current_availability: false
        },
        results: ontology.organizations.map((match: any) => ({
          organization: {
            id: match.organization_id,
            display_name: match.organization,
            current_capacity: match.current_capacity
          },
          score: match.explanation_paths.length,
          score_basis: "EXPLANATION_PATH_COUNT",
          relationship_knowledge_status:
            match.relationship_knowledge_status,
          availability_statuses:
            match.availability_statuses,
          explanation_paths:
            match.explanation_paths
        }))
      });
    }

    const terms = queryTerms(query);

    const matches =
      await findOrganizationsForTerms(
        env,
        terms,
        20
      );

    return json({
      query,
      source: "PostgreSQL civic graph",
      mode: "LEGACY_TEXT_DISCOVERY",
      warning:
        "This query did not resolve to a canonical FixLine problem. These are text-discovery results, not ontology problem matches.",
      terms,
      results: matches.map((row: any) => ({
        organization: {
          id: row.id,
          display_name: row.display_name,
          organization_type:
            row.organization_type,
          website: row.website,
          verified_capabilities:
            row.verified_capabilities,
          current_capacity:
            row.current_capacity
        },
        score: Number(row.match_count)
      }))
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

async function whoShouldTalk(
  env: Env,
  query: string
) {
  try {
    const problem = await withDatabase(
      env,
      async client => {
        const result = await client.query(
          `
          SELECT
            problem_number,
            name
          FROM problems
          WHERE
            LOWER(TRIM(name)) = LOWER(TRIM($1))
            OR problem_number::text = TRIM($1)
          ORDER BY problem_number
          LIMIT 1;
          `,
          [query]
        );

        return result.rows[0] ?? null;
      }
    );

    let organizations: any[] = [];

    if (problem) {
      const ontology =
        await getProblemOrganizationMatches(
          env,
          Number(problem.problem_number)
        );

      organizations = ontology.organizations.map(
        (match: any) => ({
          id: match.organization_id,
          display_name: match.organization,
          explanation_paths:
            match.explanation_paths
        })
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
          const a = organizations[i];
          const b = organizations[j];

          const relationship =
            await existingRelationship(
              env,
              a.id,
              b.id
            );

          pairs.push({
            classification:
              relationship
                ? "KNOWN_RELATIONSHIP"
                : "NOT_ESTABLISHED_IN_FIXLINE",

            organization_a: {
              id: a.id,
              name: a.display_name,
              explanation_paths:
                a.explanation_paths
            },

            organization_b: {
              id: b.id,
              name: b.display_name,
              explanation_paths:
                b.explanation_paths
            },

            existing_relationship:
              relationship || null,

            human_review_required: true
          });
        }
      }

      return json({
        query,
        source: "PostgreSQL FixLine ontology graph",
        engine: "FixLine Who Should Talk v0.2",
        mode: "ONTOLOGY_PAIR_DISCOVERY",
        problem: {
          problem_number:
            Number(problem.problem_number),
          name: problem.name
        },
        safeguards: {
          relationship_absence_proves_novelty: false,
          match_suggestion_proves_partnership: false,
          overlap_proves_partnership: false,
          human_review_required: true
        },
        candidates: pairs
      });
    }

    const terms = queryTerms(query);
    organizations =
      await findOrganizationsForTerms(
        env,
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
        const a = organizations[i];
        const b = organizations[j];

        const relationship =
          await existingRelationship(
            env,
            a.id,
            b.id
          );

        pairs.push({
          classification:
            relationship
              ? "KNOWN_RELATIONSHIP"
              : "NOT_ESTABLISHED_IN_FIXLINE",

          organization_a: {
            id: a.id,
            name: a.display_name
          },

          organization_b: {
            id: b.id,
            name: b.display_name
          },

          existing_relationship:
            relationship || null,

          human_review_required: true
        });
      }
    }

    return json({
      query,
      source: "PostgreSQL civic graph",
      engine:
        "FixLine Who Should Talk v0.1",
      mode: "TEXT_PAIR_DISCOVERY",
      safeguards: {
        relationship_absence_proves_novelty: false,
        match_suggestion_proves_partnership: false,
        overlap_proves_partnership: false,
        human_review_required: true
      },
      candidates: pairs
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

  /*
    PROBLEMS
  */

  if (
    url.pathname ===
    "/api/problems"
  ) {
    try {
      const problems =
        await listProblems(env);

      return json({
        source:
          "PostgreSQL unfinished-work registry",
        count: problems.length,
        problems
      });
    } catch (error) {
      return json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : String(error)
        },
        500
      );
    }
  }

  const intelligenceMatch =
    url.pathname.match(
      /^\/api\/problems\/(\d+)\/intelligence$/
    );

  if (intelligenceMatch) {
    try {
      const result =
        await getProblemIntelligence(
          env,
          Number(intelligenceMatch[1])
        );

      if (!result) {
        return json(
          {
            error:
              "PROBLEM_NOT_FOUND"
          },
          404
        );
      }

      return json({
        source:
          "PostgreSQL FixLine civic-intelligence graph",
        engine:
          "FixLine Problem Intelligence v0.1",
        ...result
      });
    } catch (error) {
      return json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : String(error)
        },
        500
      );
    }
  }

  const capabilityMatch =
    url.pathname.match(
      /^\/api\/problems\/(\d+)\/capabilities$/
    );

  if (capabilityMatch) {
    try {
      const result =
        await getProblemCapabilities(
          env,
          Number(capabilityMatch[1])
        );

      if (!result) {
        return json(
          {
            error:
              "PROBLEM_NOT_FOUND"
          },
          404
        );
      }

      return json({
        source:
          "PostgreSQL problem-capability graph",
        problem:
          result.problem,
        capability_count:
          result.capabilities.length,
        capabilities:
          result.capabilities
      });
    } catch (error) {
      return json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : String(error)
        },
        500
      );
    }
  }

  /*
    GENERIC ONTOLOGY MATCHER

    This is the acceptance-test endpoint for the repaired matcher.

    Example:
      /api/problems/5/matches

    It traverses:
      Problem
      â†’ Need Dimension
      â†’ Capability Family
      â†’ Capability
      â†’ Organization

    It does not use organization-name exceptions.
  */

  const ontologyMatch =
    url.pathname.match(
      /^\/api\/problems\/(\d+)\/matches$/
    );

  if (ontologyMatch) {
    try {
      const problemNumber =
        Number(ontologyMatch[1]);

      const result =
        await getProblemOrganizationMatches(
          env,
          problemNumber
        );

      return json({
        source:
          "PostgreSQL FixLine ontology graph",

        engine:
          "FixLine Explainable Problem Matcher v0.1",

        method:
          "Problem â†’ Need Dimension â†’ Capability Family â†’ Capability â†’ Organization",

        safeguards: {
          organization_name_exceptions:
            false,

          relationship_absence_proves_novelty:
            false,

          capability_implies_current_capacity:
            false,

          capability_implies_current_availability:
            false
        },

        matched_organization_count:
          result.organizations.length,

        ...result
      });
    } catch (error) {
      return json(
        {
          ok: false,

          error:
            error instanceof Error
              ? error.message
              : String(error)
        },
        500
      );
    }
  }

  const collaborationCandidatesMatch =
    url.pathname.match(
      /^\/api\/problems\/(\d+)\/collaboration-candidates$/
    );

  if (collaborationCandidatesMatch) {
    try {
      const problemNumber =
        Number(collaborationCandidatesMatch[1]);

      const problem =
        await getProblemByNumber(
          env,
          problemNumber
        );

      const candidates =
        await getCollaborationCandidates(
          env,
          problemNumber
        );

      return json({
        problem: {
          problem_number:
            problemNumber,
          name:
            problem?.name ?? null
        },
        source:
          "PostgreSQL FixLine ontology graph",
        engine:
          "FixLine Collaboration Candidate Engine v0.1",
        mode:
          "STRUCTURAL_COMPLEMENTARITY",
        safeguards: {
          organization_name_exceptions:
            false,
          partnership_inferred:
            false,
          relationship_absence_proves_novelty:
            false,
          capability_implies_capacity:
            false,
          capability_implies_availability:
            false,
          human_review_required:
            true
        },
        candidates
      });
    } catch (error) {
      return json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : String(error)
        },
        500
      );
    }
  }

  const problemMatch =
    url.pathname.match(
      /^\/api\/problems\/(\d+)$/
    );

  if (problemMatch) {
    try {
      const problem =
        await getProblemByNumber(
          env,
          Number(problemMatch[1])
        );

      if (!problem) {
        return json(
          {
            error:
              "PROBLEM_NOT_FOUND"
          },
          404
        );
      }

      return json({
        source:
          "PostgreSQL unfinished-work registry",
        problem
      });
    } catch (error) {
      return json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : String(error)
        },
        500
      );
    }
  }

  /*
    PROJECTS + FUNDING
  */

  if (
    url.pathname ===
    "/api/projects"
  ) {
    try {
      const projects =
        await listProjects(env);

      return json({
        source:
          "PostgreSQL project registry",
        count:
          projects.length,
        projects
      });
    } catch (error) {
      return json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : String(error)
        },
        500
      );
    }
  }

  if (
    url.pathname ===
    "/api/funding-gaps"
  ) {
    try {
      const gaps =
        await listFundingGaps(env);

      return json({
        source:
          "PostgreSQL funding-gap registry",
        count:
          gaps.length,
        funding_gaps:
          gaps
      });
    } catch (error) {
      return json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : String(error)
        },
        500
      );
    }
  }

  const projectMatch =
    url.pathname.match(
      /^\/api\/projects\/(.+)$/
    );

  if (projectMatch) {
    try {
      const projectId =
        decodeURIComponent(
          projectMatch[1]
        );

      const project =
        await getProject(
          env,
          projectId
        );

      if (!project) {
        return json(
          {
            error:
              "PROJECT_NOT_FOUND"
          },
          404
        );
      }

      return json({
        source:
          "PostgreSQL project intelligence",
        ...project
      });
    } catch (error) {
      return json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : String(error)
        },
        500
      );
    }
  }

  /*
    OUTCOMES + VERIFICATION + RECHECK
  */

  if (
    url.pathname ===
    "/api/outcomes"
  ) {
    try {
      const outcomes =
        await listOutcomes(env);

      return json({
        source:
          "PostgreSQL outcome registry",
        count:
          outcomes.length,
        outcomes
      });
    } catch (error) {
      return json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : String(error)
        },
        500
      );
    }
  }

  const outcomeMatch =
    url.pathname.match(
      /^\/api\/outcomes\/(.+)$/
    );

  if (outcomeMatch) {
    try {
      const outcomeId =
        decodeURIComponent(
          outcomeMatch[1]
        );

      const outcome =
        await getOutcome(
          env,
          outcomeId
        );

      if (!outcome) {
        return json(
          {
            error:
              "OUTCOME_NOT_FOUND"
          },
          404
        );
      }

      return json({
        source:
          "PostgreSQL outcome intelligence",
        ...outcome
      });
    } catch (error) {
      return json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : String(error)
        },
        500
      );
    }
  }

  if (
    url.pathname ===
    "/api/rechecks"
  ) {
    try {
      const rechecks =
        await listRechecks(env);

      return json({
        source:
          "PostgreSQL recheck registry",
        count:
          rechecks.length,
        rechecks
      });
    } catch (error) {
      return json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : String(error)
        },
        500
      );
    }
  }

  /*
    UNFINISHED-WORK LEDGER
  */

  if (
    url.pathname ===
    "/api/ledger"
  ) {
    try {
      const records =
        await listLedger(env);

      return json({
        source:
          "PostgreSQL unfinished-work ledger",
        count:
          records.length,
        records
      });
    } catch (error) {
      return json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : String(error)
        },
        500
      );
    }
  }

  if (
    url.pathname ===
    "/api/unfinished-work"
  ) {
    try {
      const records =
        await listOpenUnfinishedWork(
          env
        );

      return json({
        source:
          "PostgreSQL unfinished-work ledger",
        definition:
          "Records not currently classified as CLOSED, SUSTAINED, or RESOLVED.",
        count:
          records.length,
        unfinished_work:
          records,
        safeguards: {
          open_record_does_not_prove_program_failure:
            true,
          absence_of_record_does_not_prove_problem_solved:
            true,
          durable_resolution_requires_verification_and_recheck:
            true
        }
      });
    } catch (error) {
      return json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : String(error)
        },
        500
      );
    }
  }

  const ledgerMatch =
    url.pathname.match(
      /^\/api\/ledger\/(.+)$/
    );

  if (ledgerMatch) {
    try {
      const ledgerId =
        decodeURIComponent(
          ledgerMatch[1]
        );

      const record =
        await getLedgerRecord(
          env,
          ledgerId
        );

      if (!record) {
        return json(
          {
            error:
              "LEDGER_RECORD_NOT_FOUND"
          },
          404
        );
      }

      return json({
        source:
          "PostgreSQL unfinished-work ledger",
        record
      });
    } catch (error) {
      return json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : String(error)
        },
        500
      );
    }
  }

  /*
    ORGANIZATIONS
  */

  if (
    url.pathname ===
    "/api/organizations"
  ) {
    return databaseOrganizations(
      env
    );
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

  /*
    SEARCH
  */

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

  /*
    RELATIONSHIP CHECK
  */

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

    try {
      const relationship =
        await existingRelationship(
          env,
          a,
          b
        );

      return json({
        source:
          "PostgreSQL civic graph",

        relationship_found:
          Boolean(relationship),

        relationship,

        interpretation:
          relationship
            ? "FixLine contains a relationship record for this pair."
            : "No relationship is recorded in the bounded FixLine graph. This does not prove that no real-world relationship exists."
      });
    } catch (error) {
      return json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : String(error)
        },
        500
      );
    }
  }

  /*
    WHO SHOULD TALK
  */

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
    {
      error:
        "NOT_FOUND"
    },
    404
  );
}

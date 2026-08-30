async function databaseMatches(
  env: Env,
  query: string
) {
  try {
    /*
      Compatibility behavior:

      1. If q resolves to a known FixLine problem, use the ontology matcher.
      2. Otherwise, retain text search only as a discovery fallback.

      The fallback is NOT treated as the problem matcher.
    */

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

      const organizationIds =
        ontology.organizations.map(
          (organization: any) =>
            organization.organization_id
        );

      const metadata = organizationIds.length
        ? await withDatabase(
            env,
            async client => {
              const result = await client.query(
                `
                SELECT
                  o.id,
                  o.display_name,
                  o.organization_type,
                  o.website,
                  o.current_capacity,

                  COALESCE(
                    json_agg(
                      DISTINCT c.name
                      ORDER BY c.name
                    )
                    FILTER (
                      WHERE c.id IS NOT NULL
                    ),
                    '[]'::json
                  ) AS verified_capabilities

                FROM organizations o

                LEFT JOIN organization_capabilities oc
                  ON oc.organization_id = o.id

                LEFT JOIN capabilities c
                  ON c.id = oc.capability_id

                WHERE o.id = ANY($1::text[])

                GROUP BY
                  o.id,
                  o.display_name,
                  o.organization_type,
                  o.website,
                  o.current_capacity;
                `,
                [organizationIds]
              );

              return new Map(
                result.rows.map(
                  (row: any) => [
                    row.id,
                    row
                  ]
                )
              );
            }
          )
        : new Map();

      return json({
        query,

        source:
          "PostgreSQL FixLine ontology graph",

        engine:
          "FixLine Explainable Problem Matcher v0.1",

        mode:
          "ONTOLOGY_PROBLEM_MATCH",

        problem: {
          problem_number:
            Number(problem.problem_number),

          name:
            problem.name
        },

        terms:
          queryTerms(query),

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

        results:
          ontology.organizations.map(
            (match: any) => {
              const row =
                metadata.get(
                  match.organization_id
                ) as any;

              return {
                organization: {
                  id:
                    match.organization_id,

                  display_name:
                    match.organization,

                  organization_type:
                    row?.organization_type ??
                    null,

                  website:
                    row?.website ??
                    null,

                  verified_capabilities:
                    row?.verified_capabilities ??
                    [],

                  current_capacity:
                    match.current_capacity
                },

                /*
                  Compatibility field only.

                  This is NOT an AI relevance score.
                  It is simply the number of explicit
                  ontology explanation paths.
                */
                score:
                  match.explanation_paths.length,

                score_basis:
                  "EXPLANATION_PATH_COUNT",

                relationship_knowledge_status:
                  match.relationship_knowledge_status,

                availability_statuses:
                  match.availability_statuses,

                explanation_paths:
                  match.explanation_paths
              };
            }
          )
      });
    }

    /*
      Non-problem discovery fallback.

      This preserves existing search behavior
      without confusing keyword matches with
      ontology problem matching.
    */

    const terms =
      queryTerms(query);

    const matches =
      await findOrganizationsForTerms(
        env,
        terms,
        20
      );

    return json({
      query,

      source:
        "PostgreSQL civic graph",

      mode:
        "LEGACY_TEXT_DISCOVERY",

      warning:
        "This query did not resolve to a canonical FixLine problem. These are text-discovery results, not ontology problem matches.",

      terms,

      results:
        matches.map((row: any) => ({
          organization: {
            id:
              row.id,

            display_name:
              row.display_name,

            organization_type:
              row.organization_type,

            website:
              row.website,

            verified_capabilities:
              row.verified_capabilities,

            current_capacity:
              row.current_capacity
          },

          score:
            Number(row.match_count),

          score_basis:
            "LEGACY_TEXT_TERM_MATCH_COUNT"
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

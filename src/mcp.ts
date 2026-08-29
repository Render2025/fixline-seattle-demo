import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

import { withDatabase } from "./db";

import {
  listProblems,
  getProblemByNumber,
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

import type { Env } from "./types";

function result(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

async function listOrganizations(env: Env) {
  return withDatabase(env, async client => {
    const query = await client.query(`
      SELECT
        o.id,
        o.display_name,
        o.organization_type,
        o.verification_status,
        o.website,
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
        o.display_name,
        o.organization_type,
        o.verification_status,
        o.website,
        o.current_capacity

      ORDER BY o.display_name
    `);

    return query.rows;
  });
}

async function getOrganization(
  env: Env,
  id: string
) {
  return withDatabase(env, async client => {
    const query = await client.query(
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

    return query.rows[0] ?? null;
  });
}

function queryTerms(query: string) {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map(x => x.trim())
    .filter(x => x.length > 2);
}

async function findOrganizations(
  env: Env,
  query: string
) {
  const terms = queryTerms(query);

  if (!terms.length) {
    return [];
  }

  return withDatabase(env, async client => {
    const result = await client.query(
      `
      WITH org_data AS (
        SELECT
          o.id,
          o.display_name,
          o.organization_type,
          o.website,
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
          o.display_name,
          o.organization_type,
          o.website,
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
        display_name

      LIMIT 20
      `,
      [terms]
    );

    return result.rows;
  });
}

async function checkRelationship(
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

async function getDatabaseStats(env: Env) {
  return withDatabase(env, async client => {
    const result = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM problems) AS problems,
        (SELECT COUNT(*) FROM organizations) AS organizations,
        (SELECT COUNT(*) FROM capabilities) AS capabilities,
        (SELECT COUNT(*) FROM organization_capabilities) AS capability_edges,
        (SELECT COUNT(*) FROM problem_capabilities) AS problem_capability_edges,
        (SELECT COUNT(*) FROM relationships) AS relationships,
        (SELECT COUNT(*) FROM projects) AS projects,
        (SELECT COUNT(*) FROM funding_commitments) AS funding_commitments,
        (SELECT COUNT(*) FROM outcomes) AS outcomes,
        (SELECT COUNT(*) FROM outcome_verifications) AS outcome_verifications,
        (SELECT COUNT(*) FROM rechecks) AS rechecks,
        (SELECT COUNT(*) FROM ledger_records) AS ledger_records
    `);

    return result.rows[0];
  });
}

function createServer(env: Env) {
  const server = new McpServer({
    name: "FixLine Seattle Demo",
    version: "1.1.0"
  });

  server.registerTool(
    "get_pilot_stats",
    {
      description:
        "Get persistent PostgreSQL-backed FixLine pilot counts and core safety rules.",
      inputSchema: {}
    },
    async () => {
      const stats = await getDatabaseStats(env);

      return result({
        location:
          "Seattle / King County bounded demonstration",

        database:
          "PostgreSQL via Cloudflare Hyperdrive -> Neon",

        counts: stats,

        rules: [
          "verified capability does not mean current capacity",
          "match suggestion does not mean partnership",
          "AI proposal does not mean authorization",
          "absence of a relationship record does not prove novelty",
          "project launch does not mean problem solved",
          "measurement does not equal verification",
          "durable claims require recheck"
        ]
      });
    }
  );

  server.registerTool(
    "list_problems",
    {
      description:
        "List the bounded Seattle unfinished-work problem registry.",
      inputSchema: {}
    },
    async () =>
      result(await listProblems(env))
  );

  server.registerTool(
    "get_problem",
    {
      description:
        "Get one FixLine civic problem by problem number.",
      inputSchema: {
        problem_number: z.number().int().min(1)
      }
    },
    async ({ problem_number }) => {
      const problem =
        await getProblemByNumber(
          env,
          problem_number
        );

      return result(
        problem ?? {
          error: "PROBLEM_NOT_FOUND"
        }
      );
    }
  );

  server.registerTool(
    "get_problem_capabilities",
    {
      description:
        "Get approved capability mappings and organizations relevant to a civic problem.",
      inputSchema: {
        problem_number: z.number().int().min(1)
      }
    },
    async ({ problem_number }) => {
      const value =
        await getProblemCapabilities(
          env,
          problem_number
        );

      return result(
        value ?? {
          error: "PROBLEM_NOT_FOUND"
        }
      );
    }
  );

  server.registerTool(
    "get_problem_intelligence",
    {
      description:
        "Traverse a FixLine civic problem through approved capabilities, relevant organizations, known relationships and possible collaboration gaps. Possible gaps are review hypotheses, not proof of novelty.",
      inputSchema: {
        problem_number: z.number().int().min(1)
      }
    },
    async ({ problem_number }) => {
      const value =
        await getProblemIntelligence(
          env,
          problem_number
        );

      return result(
        value ?? {
          error: "PROBLEM_NOT_FOUND"
        }
      );
    }
  );

  server.registerTool(
    "list_verified_organizations",
    {
      description:
        "List source-verified organizations stored in the PostgreSQL civic graph. Capability does not imply current capacity.",
      inputSchema: {}
    },
    async () =>
      result(
        await listOrganizations(env)
      )
  );

  server.registerTool(
    "get_organization",
    {
      description:
        "Get one organization and its verified capabilities from PostgreSQL.",
      inputSchema: {
        id: z.string().min(1)
      }
    },
    async ({ id }) => {
      const organization =
        await getOrganization(env, id);

      return result(
        organization ?? {
          error: "ORGANIZATION_NOT_FOUND"
        }
      );
    }
  );

  server.registerTool(
    "find_matching_organizations",
    {
      description:
        "Find organizations whose verified PostgreSQL capabilities overlap a civic query. Results are advisory.",
      inputSchema: {
        query: z.string().min(1)
      }
    },
    async ({ query }) =>
      result({
        query,
        source:
          "PostgreSQL civic graph",
        results:
          await findOrganizations(
            env,
            query
          )
      })
  );

  server.registerTool(
    "check_existing_relationship",
    {
      description:
        "Check the bounded PostgreSQL relationship graph for an existing organization relationship. No record does not prove no real-world relationship exists.",
      inputSchema: {
        a: z.string().min(1),
        b: z.string().min(1)
      }
    },
    async ({ a, b }) => {
      const relationship =
        await checkRelationship(
          env,
          a,
          b
        );

      return result({
        relationship_found:
          Boolean(relationship),

        relationship,

        interpretation:
          relationship
            ? "The bounded FixLine graph contains a relationship record."
            : "No relationship is recorded in the bounded graph. This does not prove real-world novelty."
      });
    }
  );

  server.registerTool(
    "list_projects",
    {
      description:
        "List projects in the FixLine project registry.",
      inputSchema: {}
    },
    async () =>
      result(
        await listProjects(env)
      )
  );

  server.registerTool(
    "get_project",
    {
      description:
        "Get project intelligence including participating organizations, funding position and outcomes.",
      inputSchema: {
        id: z.string().min(1)
      }
    },
    async ({ id }) => {
      const project =
        await getProject(env, id);

      return result(
        project ?? {
          error: "PROJECT_NOT_FOUND"
        }
      );
    }
  );

  server.registerTool(
    "list_funding_gaps",
    {
      description:
        "List project funding gaps. Proposed or demonstration funders are not treated as verified money.",
      inputSchema: {}
    },
    async () =>
      result(
        await listFundingGaps(env)
      )
  );

  server.registerTool(
    "list_outcomes",
    {
      description:
        "List recorded project outcomes. A recorded measurement is not necessarily verified.",
      inputSchema: {}
    },
    async () =>
      result(
        await listOutcomes(env)
      )
  );

  server.registerTool(
    "get_outcome",
    {
      description:
        "Get an outcome together with verification history and scheduled rechecks.",
      inputSchema: {
        id: z.string().min(1)
      }
    },
    async ({ id }) => {
      const outcome =
        await getOutcome(env, id);

      return result(
        outcome ?? {
          error: "OUTCOME_NOT_FOUND"
        }
      );
    }
  );

  server.registerTool(
    "list_rechecks",
    {
      description:
        "List scheduled and completed FixLine rechecks used to test whether outcomes remain durable.",
      inputSchema: {}
    },
    async () =>
      result(
        await listRechecks(env)
      )
  );

  server.registerTool(
    "list_unfinished_work",
    {
      description:
        "List open unfinished-work ledger records. Open does not automatically mean program failure, and absence of a record does not prove resolution.",
      inputSchema: {}
    },
    async () =>
      result(
        await listOpenUnfinishedWork(env)
      )
  );

  server.registerTool(
    "list_ledger",
    {
      description:
        "List the full bounded FixLine unfinished-work ledger.",
      inputSchema: {}
    },
    async () =>
      result(
        await listLedger(env)
      )
  );

  server.registerTool(
    "get_ledger_record",
    {
      description:
        "Get one FixLine unfinished-work ledger record.",
      inputSchema: {
        id: z.string().min(1)
      }
    },
    async ({ id }) => {
      const record =
        await getLedgerRecord(
          env,
          id
        );

      return result(
        record ?? {
          error:
            "LEDGER_RECORD_NOT_FOUND"
        }
      );
    }
  );

  return server;
}

export function mcpHandler(
  request: Request,
  env: Env
) {
  return createMcpHandler(
    () => createServer(env)
  )(request, env);
}

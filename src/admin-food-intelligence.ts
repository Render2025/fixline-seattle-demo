import { withDatabase } from "./db";
import type { Env } from "./types";

/**
 * FixLine ontology layer
 *
 * Generic traversal:
 *
 * Problem
 *   → Need Dimension
 *   → Capability Family
 *   → Capability
 *   → Organization Capability
 *   → Organization
 *
 * IMPORTANT:
 * - No organization names are encoded in the ontology.
 * - Organizations surface only because they possess a verified capability.
 * - An organization match does NOT imply capacity, eligibility, availability,
 *   partnership, or willingness to collaborate.
 * - Relationship absence is NOT evidence of novelty.
 */

export async function installFoodIntelligenceModel(env: Env) {
  return withDatabase(env, async client => {
    await client.query("BEGIN");

    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS problem_need_dimensions (
          id TEXT PRIMARY KEY,
          problem_id TEXT NOT NULL
            REFERENCES problems(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          description TEXT,
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          UNIQUE(problem_id, name)
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS capability_families (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          description TEXT,
          status TEXT NOT NULL DEFAULT 'ACTIVE'
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS capability_family_members (
          capability_family_id TEXT NOT NULL
            REFERENCES capability_families(id) ON DELETE CASCADE,
          capability_id TEXT NOT NULL
            REFERENCES capabilities(id) ON DELETE CASCADE,
          relationship_type TEXT NOT NULL DEFAULT 'MEMBER',
          PRIMARY KEY (
            capability_family_id,
            capability_id
          )
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS problem_need_capability_families (
          problem_need_dimension_id TEXT NOT NULL
            REFERENCES problem_need_dimensions(id) ON DELETE CASCADE,
          capability_family_id TEXT NOT NULL
            REFERENCES capability_families(id) ON DELETE CASCADE,
          relevance TEXT NOT NULL DEFAULT 'DIRECT',
          PRIMARY KEY (
            problem_need_dimension_id,
            capability_family_id
          )
        );
      `);

      const problemResult = await client.query(`
        SELECT id, problem_number, name
        FROM problems
        WHERE problem_number = 5
        LIMIT 1;
      `);

      if (!problemResult.rows.length) {
        throw new Error(
          "Problem #5 Food Insecurity was not found."
        );
      }

      const problemId = problemResult.rows[0].id;

      const needDimensions = [
        {
          id: "need-food-immediate-access",
          name: "Immediate Food Access",
          description:
            "People need timely access to sufficient groceries, distributed food, prepared meals, or other direct food assistance."
        },
        {
          id: "need-food-nutrition-benefits",
          name: "Nutrition and Specialized Food Support",
          description:
            "People may require public nutrition benefits or specialized nutrition support such as WIC and maternal-child nutrition services."
        }
      ];

      for (const need of needDimensions) {
        await client.query(
          `
          INSERT INTO problem_need_dimensions (
            id,
            problem_id,
            name,
            description,
            status
          )
          VALUES ($1, $2, $3, $4, 'ACTIVE')
          ON CONFLICT (id)
          DO UPDATE SET
            problem_id = EXCLUDED.problem_id,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            status = 'ACTIVE';
          `,
          [
            need.id,
            problemId,
            need.name,
            need.description
          ]
        );
      }

      const capabilityFamilies = [
        {
          id: "family-direct-food-provision",
          name: "Direct Food Provision",
          description:
            "Capabilities that directly provide, distribute, prepare, deliver, or otherwise make food available to people."
        },
        {
          id: "family-nutrition-specialized-support",
          name: "Nutrition Benefits and Specialized Food Support",
          description:
            "Capabilities providing nutrition-benefit access or specialized nutrition assistance."
        }
      ];

      for (const family of capabilityFamilies) {
        await client.query(
          `
          INSERT INTO capability_families (
            id,
            name,
            description,
            status
          )
          VALUES ($1, $2, $3, 'ACTIVE')
          ON CONFLICT (id)
          DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            status = 'ACTIVE';
          `,
          [
            family.id,
            family.name,
            family.description
          ]
        );
      }

      const foodFamilyIds = [
        "family-food-emergency-access",
        "family-food-prepared-meals",
        "family-food-home-delivery",
        "family-food-benefits",
        "family-food-cultural-access",
        "family-food-clinical",
        "family-food-system",
        "family-food-navigation",
        "family-direct-food-provision",
        "family-nutrition-specialized-support"
      ];

      await client.query(
        `
        DELETE FROM capability_family_members
        WHERE capability_family_id = ANY($1::text[]);
        `,
        [foodFamilyIds]
      );

      await client.query(
        `
        DELETE FROM problem_need_capability_families
        WHERE problem_need_dimension_id IN (
          SELECT id
          FROM problem_need_dimensions
          WHERE problem_id = $1
        );
        `,
        [problemId]
      );

      await client.query(
        `
        UPDATE problem_need_dimensions
        SET status = 'INACTIVE'
        WHERE problem_id = $1
          AND id NOT IN (
            'need-food-immediate-access',
            'need-food-nutrition-benefits'
          );
        `,
        [problemId]
      );

      await client.query(`
        UPDATE capability_families
        SET status = 'INACTIVE'
        WHERE id IN (
          'family-food-emergency-access',
          'family-food-prepared-meals',
          'family-food-home-delivery',
          'family-food-benefits',
          'family-food-cultural-access',
          'family-food-clinical',
          'family-food-system',
          'family-food-navigation'
        );
      `);

      const directFoodCapabilityIds = [
        "cap-food-security",
        "cap-food-assistance",
        "cap-food-distribution",
        "cap-food-access",
        "cap-food-and-nutrition-programs",
        "cap-meal-preparation-distribution",
        "cap-meals-on-wheels",
        "cap-community-dining"
      ];

      const nutritionCapabilityIds = [
        "cap-wic-first-steps"
      ];

      async function addExistingCapabilitiesToFamily(
        familyId: string,
        capabilityIds: string[]
      ) {
        for (const capabilityId of capabilityIds) {
          const capabilityResult = await client.query(
            `
            SELECT id
            FROM capabilities
            WHERE id = $1
            LIMIT 1;
            `,
            [capabilityId]
          );

          if (!capabilityResult.rows.length) {
            continue;
          }

          await client.query(
            `
            INSERT INTO capability_family_members (
              capability_family_id,
              capability_id,
              relationship_type
            )
            VALUES ($1, $2, 'MEMBER')
            ON CONFLICT (
              capability_family_id,
              capability_id
            )
            DO UPDATE SET
              relationship_type = 'MEMBER';
            `,
            [
              familyId,
              capabilityId
            ]
          );
        }
      }

      await addExistingCapabilitiesToFamily(
        "family-direct-food-provision",
        directFoodCapabilityIds
      );

      await addExistingCapabilitiesToFamily(
        "family-nutrition-specialized-support",
        nutritionCapabilityIds
      );

      const needFamilyMap = [
        {
          needId: "need-food-immediate-access",
          familyId: "family-direct-food-provision"
        },
        {
          needId: "need-food-nutrition-benefits",
          familyId: "family-nutrition-specialized-support"
        }
      ];

      for (const mapping of needFamilyMap) {
        await client.query(
          `
          INSERT INTO problem_need_capability_families (
            problem_need_dimension_id,
            capability_family_id,
            relevance
          )
          VALUES ($1, $2, 'DIRECT')
          ON CONFLICT (
            problem_need_dimension_id,
            capability_family_id
          )
          DO UPDATE SET
            relevance = 'DIRECT';
          `,
          [
            mapping.needId,
            mapping.familyId
          ]
        );
      }

      await client.query(`
        INSERT INTO schema_version (
          version,
          description
        )
        VALUES (
          'fixline-core-015',
          'Generic explainable ontology matcher and frozen Food Insecurity acceptance-test mapping'
        )
        ON CONFLICT DO NOTHING;
      `);

      await client.query("COMMIT");

      const verification = await queryProblemOrganizationMatches(
        client,
        5
      );

      return {
        ok: true,
        migration: "fixline-core-015",
        problem: problemResult.rows[0],
        model:
          "Problem → Need Dimension → Capability Family → Capability → Organization",
        matched_organizations:
          verification.organizations.length,
        organizations:
          verification.organizations,
        paths:
          verification.paths
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function getProblemOrganizationMatches(
  env: Env,
  problemNumber: number
) {
  return withDatabase(env, async client => {
    return queryProblemOrganizationMatches(
      client,
      problemNumber
    );
  });
}

async function queryProblemOrganizationMatches(
  client: any,
  problemNumber: number
) {
  const result = await client.query(
    `
    SELECT DISTINCT
      p.id AS problem_id,
      p.problem_number,
      p.name AS problem_name,

      nd.id AS need_dimension_id,
      nd.name AS need_dimension,

      cf.id AS capability_family_id,
      cf.name AS capability_family,

      c.id AS capability_id,
      c.name AS capability,

      o.id AS organization_id,
      o.display_name AS organization,

      oc.availability_status,

      o.current_capacity,

      'NOT_EVALUATED_FOR_SPECIFIC_PAIR'::text
        AS relationship_knowledge_status

    FROM problems p

    JOIN problem_need_dimensions nd
      ON nd.problem_id = p.id
     AND nd.status = 'ACTIVE'

    JOIN problem_need_capability_families pncf
      ON pncf.problem_need_dimension_id = nd.id
     AND pncf.relevance = 'DIRECT'

    JOIN capability_families cf
      ON cf.id = pncf.capability_family_id
     AND cf.status = 'ACTIVE'

    JOIN capability_family_members cfm
      ON cfm.capability_family_id = cf.id

    JOIN capabilities c
      ON c.id = cfm.capability_id

    JOIN organization_capabilities oc
      ON oc.capability_id = c.id

    JOIN organizations o
      ON o.id = oc.organization_id

    WHERE p.problem_number = $1

    ORDER BY
      o.display_name,
      nd.name,
      cf.name,
      c.name;
    `,
    [problemNumber]
  );

  const organizationMap = new Map<
    string,
    {
      organization_id: string;
      organization: string;
      relationship_knowledge_status: string;
      current_capacity: unknown;
      availability_statuses: string[];
      explanation_paths: Array<{
        problem: string;
        need_dimension: string;
        capability_family: string;
        capability: string;
        capability_id: string;
      }>;
    }
  >();

  for (const row of result.rows) {
    if (!organizationMap.has(row.organization_id)) {
      organizationMap.set(
        row.organization_id,
        {
          organization_id:
            row.organization_id,

          organization:
            row.organization,

          relationship_knowledge_status:
            row.relationship_knowledge_status,

          current_capacity:
            row.current_capacity,

          availability_statuses: [],

          explanation_paths: []
        }
      );
    }

    const organization =
      organizationMap.get(row.organization_id)!;

    if (
      row.availability_status &&
      !organization.availability_statuses.includes(
        row.availability_status
      )
    ) {
      organization.availability_statuses.push(
        row.availability_status
      );
    }

    organization.explanation_paths.push({
      problem:
        row.problem_name,

      need_dimension:
        row.need_dimension,

      capability_family:
        row.capability_family,

      capability:
        row.capability,

      capability_id:
        row.capability_id
    });
  }

  return {
    problem_number: problemNumber,

    organizations:
      Array.from(organizationMap.values()),

    paths:
      result.rows.map((row: any) => ({
        problem_id:
          row.problem_id,

        problem_number:
          row.problem_number,

        problem:
          row.problem_name,

        need_dimension_id:
          row.need_dimension_id,

        need_dimension:
          row.need_dimension,

        capability_family_id:
          row.capability_family_id,

        capability_family:
          row.capability_family,

        capability_id:
          row.capability_id,

        capability:
          row.capability,

        organization_id:
          row.organization_id,

        organization:
          row.organization,

        availability_status:
          row.availability_status,

        current_capacity:
          row.current_capacity,

        relationship_knowledge_status:
          row.relationship_knowledge_status
      }))
  };
}

import { withDatabase } from "./db";
import type { Env } from "./types";

export async function installFoodIntelligenceModel(env: Env) {
  return withDatabase(env, async client => {
    await client.query("BEGIN");

    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS problem_need_dimensions (
          id TEXT PRIMARY KEY,
          problem_id TEXT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
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
          PRIMARY KEY (capability_family_id, capability_id)
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

      /*
        Problem #5 in the current FixLine registry.
        This assumes the existing problem id follows the seeded registry.
        We resolve it by problem_number instead of hard-coding the id.
      */
      const problemResult = await client.query(`
        SELECT id
        FROM problems
        WHERE problem_number = 5
        LIMIT 1;
      `);

      if (!problemResult.rows.length) {
        throw new Error("Problem #5 Food Insecurity was not found.");
      }

      const problemId = problemResult.rows[0].id;

      const needDimensions = [
        {
          id: "need-food-immediate-access",
          name: "Immediate Food Access",
          description:
            "Households need timely access to sufficient food for immediate consumption."
        },
        {
          id: "need-food-prepared-meals",
          name: "Prepared Meals",
          description:
            "Residents may require prepared or ready-to-eat meals rather than groceries alone."
        },
        {
          id: "need-food-home-delivery",
          name: "Home Delivery and Mobility",
          description:
            "Residents may be unable to reach food resources because of age, disability, transportation or mobility barriers."
        },
        {
          id: "need-food-benefits",
          name: "Nutrition Benefits",
          description:
            "Residents may need enrollment or navigation support for public nutrition benefits."
        },
        {
          id: "need-food-cultural",
          name: "Culturally Appropriate Food",
          description:
            "Food access may require culturally familiar, linguistically accessible and culturally responsive services."
        },
        {
          id: "need-food-clinical",
          name: "Clinical and Health Nutrition",
          description:
            "Food insecurity may intersect with maternal health, chronic disease and clinical nutrition needs."
        },
        {
          id: "need-food-system",
          name: "Food-System Infrastructure",
          description:
            "Food access depends on distribution, logistics, procurement and broader food-system infrastructure."
        },
        {
          id: "need-food-navigation",
          name: "Navigation and Wraparound Support",
          description:
            "Residents may need case management, referrals and broader basic-needs navigation."
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

      const families = [
        {
          id: "family-food-emergency-access",
          name: "Emergency Food Access",
          description:
            "Capabilities directly supporting immediate access to groceries or distributed food."
        },
        {
          id: "family-food-prepared-meals",
          name: "Prepared Meals",
          description:
            "Capabilities related to preparing and distributing ready-to-eat meals."
        },
        {
          id: "family-food-home-delivery",
          name: "Home Delivery and Mobility",
          description:
            "Capabilities helping food reach residents who cannot easily travel to food resources."
        },
        {
          id: "family-food-benefits",
          name: "Nutrition Benefits",
          description:
            "Capabilities supporting access to nutrition assistance and related public programs."
        },
        {
          id: "family-food-cultural-access",
          name: "Culturally Appropriate Food Access",
          description:
            "Capabilities supporting culturally and linguistically responsive food access."
        },
        {
          id: "family-food-clinical",
          name: "Clinical and Health Nutrition",
          description:
            "Capabilities connecting nutrition assistance with health and clinical needs."
        },
        {
          id: "family-food-system",
          name: "Food-System Infrastructure",
          description:
            "Capabilities supporting distribution systems, logistics and food-system operations."
        },
        {
          id: "family-food-navigation",
          name: "Navigation and Wraparound Support",
          description:
            "Capabilities helping residents navigate food and broader basic-needs systems."
        }
      ];

      for (const family of families) {
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

      /*
        IMPORTANT:
        These mappings use only capability names already expected
        in the current bounded FixLine vocabulary.

        Missing capability names are skipped rather than invented.
      */
      const familyCapabilityNames: Record<string, string[]> = {
        "family-food-emergency-access": [
          "food assistance",
          "food distribution",
          "food access",
          "food security"
        ],

        "family-food-prepared-meals": [
          "meal preparation and distribution",
          "meal preparation/distribution",
          "community dining",
          "Meals on Wheels"
        ],

        "family-food-home-delivery": [
          "Meals on Wheels",
          "senior transportation",
          "transportation",
          "accessible transportation"
        ],

        "family-food-benefits": [
          "WIC / First Steps",
          "benefits navigation",
          "resource navigation"
        ],

        "family-food-cultural-access": [
          "multilingual culturally responsive",
          "language access",
          "language support"
        ],

        "family-food-clinical": [
          "WIC / First Steps",
          "parent-child health",
          "healthcare outreach",
          "health/wellness"
        ],

        "family-food-system": [
          "food distribution",
          "food security",
          "human-services funding"
        ],

        "family-food-navigation": [
          "resource navigation",
          "case management",
          "wraparound basic needs",
          "food assistance"
        ]
      };

      for (const [familyId, capabilityNames] of Object.entries(
        familyCapabilityNames
      )) {
        for (const capabilityName of capabilityNames) {
          const capabilityResult = await client.query(
            `
            SELECT id
            FROM capabilities
            WHERE LOWER(name) = LOWER($1)
            LIMIT 1;
            `,
            [capabilityName]
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
            ON CONFLICT DO NOTHING;
            `,
            [
              familyId,
              capabilityResult.rows[0].id
            ]
          );
        }
      }

      const needFamilyMap = [
        [
          "need-food-immediate-access",
          "family-food-emergency-access"
        ],
        [
          "need-food-prepared-meals",
          "family-food-prepared-meals"
        ],
        [
          "need-food-home-delivery",
          "family-food-home-delivery"
        ],
        [
          "need-food-benefits",
          "family-food-benefits"
        ],
        [
          "need-food-cultural",
          "family-food-cultural-access"
        ],
        [
          "need-food-clinical",
          "family-food-clinical"
        ],
        [
          "need-food-system",
          "family-food-system"
        ],
        [
          "need-food-navigation",
          "family-food-navigation"
        ]
      ];

      for (const [needId, familyId] of needFamilyMap) {
        await client.query(
          `
          INSERT INTO problem_need_capability_families (
            problem_need_dimension_id,
            capability_family_id,
            relevance
          )
          VALUES ($1, $2, 'DIRECT')
          ON CONFLICT DO NOTHING;
          `,
          [needId, familyId]
        );
      }

      await client.query(`
        INSERT INTO schema_version (
          version,
          description
        )
        VALUES (
          'fixline-core-011',
          'Food Insecurity need dimensions and capability-family model'
        )
        ON CONFLICT DO NOTHING;
      `);

      await client.query("COMMIT");

      const verification = await client.query(
        `
        SELECT
          p.problem_number,
          p.name AS problem_name,

          nd.name AS need_dimension,

          cf.name AS capability_family,

          c.name AS capability,

          o.display_name AS organization,

          o.current_capacity

        FROM problems p

        JOIN problem_need_dimensions nd
          ON nd.problem_id = p.id

        JOIN problem_need_capability_families pncf
          ON pncf.problem_need_dimension_id = nd.id

        JOIN capability_families cf
          ON cf.id = pncf.capability_family_id

        LEFT JOIN capability_family_members cfm
          ON cfm.capability_family_id = cf.id

        LEFT JOIN capabilities c
          ON c.id = cfm.capability_id

        LEFT JOIN organization_capabilities oc
          ON oc.capability_id = c.id

        LEFT JOIN organizations o
          ON o.id = oc.organization_id

        WHERE p.problem_number = 5

        ORDER BY
          nd.name,
          cf.name,
          c.name,
          o.display_name;
        `
      );

      return {
        ok: true,
        migration:
          "fixline-core-011",
        problem:
          "Food Insecurity",
        model:
          "Problem → Need Dimension → Capability Family → Capability → Organization",
        rows:
          verification.rows.length,
        verification:
          verification.rows
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

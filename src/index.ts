import { handleApi } from "./api";
import { mcpHandler } from "./mcp";
import { buildReviewBundle } from "./review-bundle";
import { installFoodIntelligenceModel } from "./admin-food-intelligence";
import { installPublicRecordsIngestionModel } from "./public-records-ingestion";
import { installLocationBootstrapModel } from "./location-bootstrap";
import {
  installBootstrapReadinessPersistence,
  getProblemBootstrapReadiness,
  calculateAndPersistProblemReadiness
} from "./bootstrap-readiness-db";
import type { Env } from "./types";

export default {
  async fetch(
    request: Request,
    env: Env
  ): Promise<Response> {
    const url = new URL(request.url);

    /*
      Temporary architecture review bundle.
    */
    if (url.pathname === "/api/review-bundle") {
      try {
        const bundle = await buildReviewBundle(env);

        return new Response(
          JSON.stringify(bundle, null, 2),
          {
            status: 200,
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store"
            }
          }
        );
      } catch (error) {
        return jsonError(
          "Unable to construct review bundle.",
          error
        );
      }
    }

    /*
      TEMPORARY MIGRATION:
      Food Intelligence.
    */
    if (
      url.pathname ===
      "/api/admin/install-food-intelligence"
    ) {
      try {
        return jsonResponse(
          await installFoodIntelligenceModel(env)
        );
      } catch (error) {
        return jsonError(
          "Food intelligence migration failed.",
          error
        );
      }
    }

    /*
      TEMPORARY MIGRATION:
      Public-record ingestion schema.
    */
    if (
      url.pathname ===
      "/api/admin/install-public-records-ingestion"
    ) {
      try {
        return jsonResponse(
          await installPublicRecordsIngestionModel(env)
        );
      } catch (error) {
        return jsonError(
          "Public-record ingestion migration failed.",
          error
        );
      }
    }

    /*
      TEMPORARY MIGRATION:
      Location Bootstrap.
    */
    if (
      url.pathname ===
      "/api/admin/install-location-bootstrap"
    ) {
      try {
        return jsonResponse(
          await installLocationBootstrapModel(env)
        );
      } catch (error) {
        return jsonError(
          "Location bootstrap migration failed.",
          error
        );
      }
    }

    /*
      TEMPORARY MIGRATION:
      Bootstrap Readiness persistence.
    */
    if (
      url.pathname ===
      "/api/admin/install-bootstrap-readiness"
    ) {
      try {
        return jsonResponse(
          await installBootstrapReadinessPersistence(env)
        );
      } catch (error) {
        return jsonError(
          "Bootstrap readiness migration failed.",
          error
        );
      }
    }

    /*
      READ-ONLY:
      Calculate readiness for one local problem without
      changing the stored readiness record.

      Example:
      /api/bootstrap/readiness?id=<local-problem-priority-id>
    */
    if (
      url.pathname ===
      "/api/bootstrap/readiness"
    ) {
      const id =
        url.searchParams.get("id");

      if (!id) {
        return jsonResponse(
          {
            ok: false,
            error:
              "Missing required query parameter: id"
          },
          400
        );
      }

      try {
        const result =
          await getProblemBootstrapReadiness(
            env,
            id
          );

        if (!result) {
          return jsonResponse(
            {
              ok: false,
              error:
                "Local problem priority not found.",
              id
            },
            404
          );
        }

        return jsonResponse({
          ok: true,
          ...result
        });
      } catch (error) {
        return jsonError(
          "Unable to calculate bootstrap readiness.",
          error
        );
      }
    }

    /*
      ADMIN:
      Calculate and persist readiness.

      Example:
      /api/admin/calculate-readiness?id=<local-problem-priority-id>
    */
    if (
      url.pathname ===
      "/api/admin/calculate-readiness"
    ) {
      const id =
        url.searchParams.get("id");

      if (!id) {
        return jsonResponse(
          {
            ok: false,
            error:
              "Missing required query parameter: id"
          },
          400
        );
      }

      try {
        const result =
          await calculateAndPersistProblemReadiness(
            env,
            id
          );

        if (!result) {
          return jsonResponse(
            {
              ok: false,
              error:
                "Local problem priority not found.",
              id
            },
            404
          );
        }

        return jsonResponse(result);
      } catch (error) {
        return jsonError(
          "Unable to calculate and persist readiness.",
          error
        );
      }
    }

    /*
      Normal FixLine API.
    */
    if (
      url.pathname === "/health" ||
      url.pathname.startsWith("/api/")
    ) {
      return handleApi(request, env);
    }

    /*
      Remote MCP.
    */
    if (
      url.pathname === "/mcp" ||
      url.pathname.startsWith("/mcp/")
    ) {
      return mcpHandler(request, env);
    }

    /*
      Public interface.
    */
    return env.ASSETS.fetch(request);
  }
};

function jsonResponse(
  data: unknown,
  status = 200
): Response {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=utf-8",
        "cache-control":
          "no-store"
      }
    }
  );
}

function jsonError(
  message: string,
  error: unknown
): Response {
  return jsonResponse(
    {
      ok: false,
      error: message,
      detail:
        error instanceof Error
          ? error.message
          : String(error)
    },
    500
  );
}

import { handleApi } from "./api";
import { mcpHandler } from "./mcp";
import { buildReviewBundle } from "./review-bundle";
import { installFoodIntelligenceModel } from "./admin-food-intelligence";
import { installPublicRecordsIngestionModel } from "./public-records-ingestion";
import type { Env } from "./types";

export default {
  async fetch(
    request: Request,
    env: Env
  ): Promise<Response> {
    const url = new URL(request.url);

    /*
      Temporary read-only architecture review bundle.
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
        return new Response(
          JSON.stringify(
            {
              ok: false,
              error: "Unable to construct review bundle.",
              detail:
                error instanceof Error
                  ? error.message
                  : String(error)
            },
            null,
            2
          ),
          {
            status: 500,
            headers: {
              "content-type": "application/json; charset=utf-8"
            }
          }
        );
      }
    }

    /*
      TEMPORARY ADMIN ROUTE:
      Food Intelligence migration.
    */
    if (
      url.pathname ===
      "/api/admin/install-food-intelligence"
    ) {
      try {
        const result =
          await installFoodIntelligenceModel(env);

        return new Response(
          JSON.stringify(result, null, 2),
          {
            status: 200,
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store"
            }
          }
        );
      } catch (error) {
        return new Response(
          JSON.stringify(
            {
              ok: false,
              error:
                "Food intelligence migration failed.",
              detail:
                error instanceof Error
                  ? error.message
                  : String(error)
            },
            null,
            2
          ),
          {
            status: 500,
            headers: {
              "content-type": "application/json; charset=utf-8"
            }
          }
        );
      }
    }

    /*
      TEMPORARY ADMIN ROUTE:
      Public-record ingestion schema migration.
    */
    if (
      url.pathname ===
      "/api/admin/install-public-records-ingestion"
    ) {
      try {
        const result =
          await installPublicRecordsIngestionModel(env);

        return new Response(
          JSON.stringify(result, null, 2),
          {
            status: 200,
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store"
            }
          }
        );
      } catch (error) {
        return new Response(
          JSON.stringify(
            {
              ok: false,
              error:
                "Public-record ingestion migration failed.",
              detail:
                error instanceof Error
                  ? error.message
                  : String(error)
            },
            null,
            2
          ),
          {
            status: 500,
            headers: {
              "content-type": "application/json; charset=utf-8"
            }
          }
        );
      }
    }

    /*
      FixLine API routes
    */
    if (
      url.pathname === "/health" ||
      url.pathname.startsWith("/api/")
    ) {
      return handleApi(request, env);
    }

    /*
      Remote MCP endpoint
    */
    if (
      url.pathname === "/mcp" ||
      url.pathname.startsWith("/mcp/")
    ) {
      return mcpHandler(request, env);
    }

    /*
      Public static interface
    */
    return env.ASSETS.fetch(request);
  }
};

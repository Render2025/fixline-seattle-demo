import { handleApi } from "./api";
import { mcpHandler } from "./mcp";
import { buildReviewBundle } from "./review-bundle";
import type { Env } from "./types";

export default {
  async fetch(
    request: Request,
    env: Env
  ): Promise<Response> {
    const url = new URL(request.url);

    /*
      Temporary read-only architecture review bundle.
      This combines selected live FixLine datasets into
      one response for external pilot review.
    */
    if (url.pathname === "/api/review-bundle") {
      try {
        const bundle = await buildReviewBundle(env);

        return new Response(
          JSON.stringify(bundle, null, 2),
          {
            status: 200,
            headers: {
              "content-type":
                "application/json; charset=utf-8",
              "cache-control":
                "no-store"
            }
          }
        );
      } catch (error) {
        console.error(
          "FixLine review bundle error:",
          error
        );

        return new Response(
          JSON.stringify(
            {
              ok: false,
              error:
                "Unable to construct review bundle.",
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
              "content-type":
                "application/json; charset=utf-8"
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
      Public static interface.

      Cloudflare's ASSETS binding serves files
      from the top-level ./public directory.
    */
    return env.ASSETS.fetch(request);
  }
};

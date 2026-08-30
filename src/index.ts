import { handleApi } from "./api";
import { mcpHandler } from "./mcp";
import type { Env } from "./types";

export default {
  async fetch(
    request: Request,
    env: Env
  ): Promise<Response> {
    const url = new URL(request.url);

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

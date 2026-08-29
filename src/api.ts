
import { listOrganizations, getOrganization, findMatches, knownRelationship, pilotStats } from "./core";
import type { Env } from "./types";

function json(data: unknown, status=200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type":"application/json; charset=utf-8",
      "cache-control":"no-store",
      "access-control-allow-origin":"*"
    }
  });
}

export async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/health") {
    return json({ ok:true, service:"FixLine", mode:env.FIXLINE_MODE, time:new Date().toISOString() });
  }
  if (url.pathname === "/api/stats") return json(pilotStats());
  if (url.pathname === "/api/organizations") return json(listOrganizations());

  if (url.pathname.startsWith("/api/organizations/")) {
    const id = decodeURIComponent(url.pathname.split("/").pop()!);
    const org = getOrganization(id);
    return org ? json(org) : json({error:"NOT_FOUND"},404);
  }

  if (url.pathname === "/api/matches") {
    const q = url.searchParams.get("q")?.trim() ?? "";
    if (!q) return json({error:"QUERY_REQUIRED"},400);
    return json({ query:q, results:findMatches(q) });
  }

  if (url.pathname === "/api/relationship") {
    const a=url.searchParams.get("a"), b=url.searchParams.get("b");
    if (!a || !b) return json({error:"A_AND_B_REQUIRED"},400);
    return json({ relationship:knownRelationship(a,b) });
  }

  return json({error:"NOT_FOUND"},404);
}

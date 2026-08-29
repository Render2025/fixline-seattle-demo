
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import { listOrganizations, getOrganization, findMatches, knownRelationship, pilotStats } from "./core";

function result(value: unknown) {
  return { content: [{ type:"text" as const, text:JSON.stringify(value,null,2) }] };
}

function createServer() {
  const server = new McpServer({ name:"FixLine Seattle Demo", version:"1.0.0" });

  server.registerTool("get_pilot_stats", {
    description:"Get bounded FixLine Seattle demonstration statistics and safety rules.",
    inputSchema:{}
  }, async () => result(pilotStats()));

  server.registerTool("list_verified_organizations", {
    description:"List source-verified organizations in the bounded Seattle demonstration. Current capacity remains UNKNOWN unless separately verified.",
    inputSchema:{}
  }, async () => result(listOrganizations()));

  server.registerTool("get_organization", {
    description:"Get one organization and its verified capabilities. Do not interpret capability as current capacity.",
    inputSchema:{ id:z.string() }
  }, async ({id}) => result(getOrganization(id) ?? {error:"NOT_FOUND"}));

  server.registerTool("find_matching_organizations", {
    description:"Find bounded-demo organizations whose names or verified capabilities overlap a civic query. This is advisory, not proof a partnership should exist.",
    inputSchema:{ query:z.string().min(1) }
  }, async ({query}) => result({query,results:findMatches(query)}));

  server.registerTool("check_existing_relationship", {
    description:"Check whether the bounded seed already records a relationship between two organization IDs, to reduce false novelty.",
    inputSchema:{ a:z.string(), b:z.string() }
  }, async ({a,b}) => result({relationship:knownRelationship(a,b)}));

  return server;
}

export const mcpHandler = createMcpHandler(createServer);

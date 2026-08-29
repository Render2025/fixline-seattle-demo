
import { organizations, capabilities, organizationCapabilities, relationships, benchmarkCases, benchmarkResult } from "./seed";

const capNameById = new Map(capabilities.map(c => [c.id, c.name]));
const orgCaps = new Map<string, string[]>();
for (const edge of organizationCapabilities) {
  const name = capNameById.get(edge.capability_id);
  if (!name) continue;
  const list = orgCaps.get(edge.organization_id) ?? [];
  list.push(name);
  orgCaps.set(edge.organization_id, list);
}

export function listOrganizations() {
  return organizations.map(o => ({
    ...o,
    verified_capabilities: orgCaps.get(o.id) ?? [],
    current_capacity: "UNKNOWN"
  }));
}

export function getOrganization(id: string) {
  const org = organizations.find(o => o.id === id);
  if (!org) return null;
  return {
    ...org,
    verified_capabilities: orgCaps.get(org.id) ?? [],
    current_capacity: "UNKNOWN"
  };
}

export function findMatches(query: string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return listOrganizations()
    .map(org => {
      const hay = [org.display_name, ...(org.verified_capabilities ?? [])].join(" ").toLowerCase();
      const hits = terms.filter(t => hay.includes(t)).length;
      return {
        organization: org,
        score: terms.length ? hits / terms.length : 0,
        reason: hits ? "Capability/name terms overlap with the query." : "No direct term overlap."
      };
    })
    .filter(x => x.score > 0)
    .sort((a,b) => b.score-a.score);
}

export function knownRelationship(a: string, b: string) {
  return relationships.find(r =>
    (r.subject_a_id === a && r.subject_b_id === b) ||
    (r.subject_a_id === b && r.subject_b_id === a)
  ) ?? null;
}

export function pilotStats() {
  return {
    location: "Seattle / King County demonstration",
    problems: 32,
    verified_organizations: organizations.length,
    capability_nodes: capabilities.length,
    capability_edges: organizationCapabilities.length,
    known_relationship_records: relationships.length,
    benchmark_cases: benchmarkCases.length,
    benchmark_metrics: benchmarkResult.metrics,
    rules: [
      "verified capability != current capacity",
      "match suggestion != partnership",
      "AI proposal != authorization",
      "unsafe person-level matching is blocked"
    ]
  };
}

/*
  FixLine Bootstrap Readiness v0.1

  This module defines the hard gates between:

  DISCOVERY
      and
  CIVIC-INTELLIGENCE RECOMMENDATIONS.

  Core principle:

  FixLine may identify and describe pressing problems with independent
  need evidence before the service ecosystem is fully mapped.

  FixLine may NOT make strong claims about missing services,
  collaboration gaps, new projects, duplication, or scarcity until the
  relevant ecosystem has reached sufficient coverage.

  Seattle / King County is the first test location, not a universal
  problem taxonomy.
*/

export type CoverageLevel =
  | "UNKNOWN"
  | "VERY_LOW"
  | "LOW"
  | "MEDIUM"
  | "HIGH";

export type ValidationStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "FAILED"
  | "PASSED";

export type RecommendationReadiness =
  | "NOT_READY"
  | "READY_FOR_INVESTIGATION"
  | "READY_WITH_LIMITATIONS"
  | "READY";

export interface NeedEvidenceState {
  /*
    The priority problem must be established independently from
    the service-provider ecosystem.

    Allowed evidence:
    Census / ACS
    public-health outcomes
    HUD / homelessness indicators
    school-system indicators
    labor statistics
    eviction / housing indicators
    food-security indicators
    mortality / hospitalization / overdose indicators
    statistically defensible surveys
    other direct need/outcome measurements

    Provider counts, media coverage, and political attention
    MUST NOT establish problem priority.
  */

  independentNeedEvidence: CoverageLevel;

  evidenceSourceCount: number;

  usesProviderCountsToEstablishNeed: boolean;

  usesMediaSalienceToEstablishNeed: boolean;

  usesPoliticalPriorityToEstablishNeed: boolean;
}

export interface ServiceEcosystemState {
  /*
    211 is the preferred broad discovery layer where licensed/
    authorized bulk access exists.

    FixLine must still support bootstrapping without 211 using
    government registries, public contracts, specialist directories,
    and organization-primary records.
  */

  broadServiceRegistryStatus:
    | "NOT_FOUND"
    | "ACCESS_PENDING"
    | "ACCESS_AVAILABLE"
    | "INGESTING"
    | "INGESTED";

  broadServiceRegistryName?: string;

  organizationsMapped: number;

  programsMapped: number;

  sourceCoverage: CoverageLevel;

  providerCoverage: CoverageLevel;

  geographicCoverage: CoverageLevel;

  populationCoverage: CoverageLevel;

  freshnessCoverage: CoverageLevel;

  capacityCoverage: CoverageLevel;
}

export interface TaxonomyValidationState {
  /*
    Prevents a repeat of the early Food Insecurity problem,
    where exact-string capability mappings surfaced only
    a fraction of obviously relevant organizations.

    AI may PROPOSE taxonomy translations.

    Validated production mappings require benchmark testing.
  */

  status: ValidationStatus;

  benchmarkCaseCount: number;

  expectedRelevantItems: number;

  retrievedRelevantItems: number;

  falsePositiveItems: number;

  unexplainedMappings: number;
}

export interface RelationshipState {
  /*
    No recorded relationship does NOT equal a novel relationship.

    Relationship intelligence is gated by actual evidence coverage.
  */

  relationshipCoverage: CoverageLevel;

  documentedRelationshipCount: number;

  fundingRelationshipCount: number;

  contractingRelationshipCount: number;

  coalitionRelationshipCount: number;
}

export interface ProblemBootstrapState {
  problemId: string;

  problemName: string;

  needEvidence: NeedEvidenceState;

  ecosystem: ServiceEcosystemState;

  taxonomy: TaxonomyValidationState;

  relationships: RelationshipState;
}

export interface ReadinessCheck {
  id: string;

  label: string;

  passed: boolean;

  blocking: boolean;

  explanation: string;
}

export interface ReadinessResult {
  problemId: string;

  problemName: string;

  readiness: RecommendationReadiness;

  checks: ReadinessCheck[];

  permissions: {
    describeProblem: boolean;

    listDiscoveredProviders: boolean;

    produceCoverageHypotheses: boolean;

    produceServiceGapClaims: boolean;

    produceCollaborationHypotheses: boolean;

    produceStrongCollaborationRecommendations: boolean;

    produceProjectHypotheses: boolean;

    produceStrongProjectRecommendations: boolean;
  };

  safeguards: string[];
}

function atLeast(
  actual: CoverageLevel,
  required: CoverageLevel
): boolean {
  const rank: Record<CoverageLevel, number> = {
    UNKNOWN: 0,
    VERY_LOW: 1,
    LOW: 2,
    MEDIUM: 3,
    HIGH: 4
  };

  return rank[actual] >= rank[required];
}

function taxonomyRecall(
  taxonomy: TaxonomyValidationState
): number | null {
  if (taxonomy.expectedRelevantItems <= 0) {
    return null;
  }

  return (
    taxonomy.retrievedRelevantItems /
    taxonomy.expectedRelevantItems
  );
}

function taxonomyFalsePositiveRate(
  taxonomy: TaxonomyValidationState
): number | null {
  const totalReturned =
    taxonomy.retrievedRelevantItems +
    taxonomy.falsePositiveItems;

  if (totalReturned <= 0) {
    return null;
  }

  return (
    taxonomy.falsePositiveItems /
    totalReturned
  );
}

export function assessProblemReadiness(
  state: ProblemBootstrapState
): ReadinessResult {
  const checks: ReadinessCheck[] = [];

  /*
    GATE 1:
    Problem existence / priority must be grounded independently
    of provider ecosystem data.
  */
  const independentNeedEvidencePassed =
    atLeast(
      state.needEvidence.independentNeedEvidence,
      "MEDIUM"
    ) &&
    state.needEvidence.evidenceSourceCount >= 2 &&
    !state.needEvidence.usesProviderCountsToEstablishNeed &&
    !state.needEvidence.usesMediaSalienceToEstablishNeed &&
    !state.needEvidence.usesPoliticalPriorityToEstablishNeed;

  checks.push({
    id: "independent-need-evidence",

    label:
      "Independent local need evidence",

    passed:
      independentNeedEvidencePassed,

    blocking:
      true,

    explanation:
      independentNeedEvidencePassed
        ? "The problem is supported by multiple independent need/outcome indicators rather than provider counts, media salience, or political priority."
        : "Problem priority is not yet sufficiently established from independent local need/outcome evidence."
  });

  /*
    GATE 2:
    Broad service ecosystem must have been ingested.

    211 is preferred where available, but the architecture
    explicitly permits an equivalent broad registry assembled
    from multiple authoritative sources.
  */
  const broadRegistryPassed =
    state.ecosystem.broadServiceRegistryStatus ===
      "INGESTED" &&
    atLeast(
      state.ecosystem.sourceCoverage,
      "MEDIUM"
    ) &&
    atLeast(
      state.ecosystem.providerCoverage,
      "MEDIUM"
    );

  checks.push({
    id: "broad-service-ecosystem",

    label:
      "Broad service ecosystem ingested",

    passed:
      broadRegistryPassed,

    blocking:
      true,

    explanation:
      broadRegistryPassed
        ? `Broad service ecosystem ingestion is sufficient for analysis${
            state.ecosystem.broadServiceRegistryName
              ? ` using ${state.ecosystem.broadServiceRegistryName}`
              : ""
          }.`
        : "FixLine does not yet have sufficient broad provider/program coverage. Missing records must not be interpreted as missing real-world services."
  });

  /*
    GATE 3:
    Taxonomy translation must be benchmarked.

    Initial conservative threshold:

      >= 90% recall
      <= 10% false-positive rate
      zero unexplained production mappings

    Thresholds can later become configurable by domain.
  */
  const recall =
    taxonomyRecall(state.taxonomy);

  const falsePositiveRate =
    taxonomyFalsePositiveRate(
      state.taxonomy
    );

  const taxonomyPassed =
    state.taxonomy.status === "PASSED" &&
    state.taxonomy.benchmarkCaseCount >= 20 &&
    recall !== null &&
    recall >= 0.9 &&
    falsePositiveRate !== null &&
    falsePositiveRate <= 0.1 &&
    state.taxonomy.unexplainedMappings === 0;

  checks.push({
    id: "taxonomy-validation",

    label:
      "Service taxonomy mapping validated",

    passed:
      taxonomyPassed,

    blocking:
      true,

    explanation:
      taxonomyPassed
        ? `Taxonomy benchmark passed with ${(recall! * 100).toFixed(
            1
          )}% recall and ${(
            falsePositiveRate! * 100
          ).toFixed(1)}% false positives.`
        : "Taxonomy/capability mapping has not yet passed the production benchmark. Provider matching may still omit obvious actors or introduce irrelevant ones."
  });

  /*
    GATE 4:
    Geography and population coverage matter independently
    from raw provider counts.
  */
  const distributionCoveragePassed =
    atLeast(
      state.ecosystem.geographicCoverage,
      "MEDIUM"
    ) &&
    atLeast(
      state.ecosystem.populationCoverage,
      "MEDIUM"
    );

  checks.push({
    id: "distribution-coverage",

    label:
      "Geographic and population coverage",

    passed:
      distributionCoveragePassed,

    blocking:
      true,

    explanation:
      distributionCoveragePassed
        ? "The service graph has sufficient geographic and population coverage for bounded comparisons."
        : "The service graph does not yet represent the geography and affected populations well enough for strong gap claims."
  });

  /*
    GATE 5:
    Relationship graph coverage is a separate requirement.

    Without it, FixLine may identify pairs for investigation,
    but must not label them novel collaborations.
  */
  const relationshipCoveragePassed =
    atLeast(
      state.relationships.relationshipCoverage,
      "MEDIUM"
    );

  checks.push({
    id: "relationship-coverage",

    label:
      "Relationship graph coverage",

    passed:
      relationshipCoveragePassed,

    blocking:
      true,

    explanation:
      relationshipCoveragePassed
        ? "Documented relationship coverage is sufficient for bounded collaboration analysis."
        : "Relationship coverage is too sparse to interpret absent edges as evidence of novel collaboration opportunities."
  });

  /*
    Capacity is intentionally NOT a universal hard blocker.

    Capacity information is difficult and highly dynamic.

    Low capacity coverage limits what FixLine may claim about
    true resource scarcity, but does not prevent investigation.
  */
  const capacityStrongEnough =
    atLeast(
      state.ecosystem.capacityCoverage,
      "MEDIUM"
    );

  checks.push({
    id: "capacity-coverage",

    label:
      "Current service capacity coverage",

    passed:
      capacityStrongEnough,

    blocking:
      false,

    explanation:
      capacityStrongEnough
        ? "Current capacity information is sufficient for stronger scarcity analysis."
        : "Current capacity information remains limited. FixLine may identify coverage questions but must not equate provider counts with available capacity."
  });

  const blockingChecks =
    checks.filter(
      check => check.blocking
    );

  const allBlockingPassed =
    blockingChecks.every(
      check => check.passed
    );

  const coreEvidencePassed =
    independentNeedEvidencePassed &&
    broadRegistryPassed &&
    taxonomyPassed &&
    distributionCoveragePassed;

  let readiness:
    RecommendationReadiness =
      "NOT_READY";

  if (
    independentNeedEvidencePassed &&
    !coreEvidencePassed
  ) {
    readiness =
      "READY_FOR_INVESTIGATION";
  }

  if (
    coreEvidencePassed &&
    !relationshipCoveragePassed
  ) {
    readiness =
      "READY_WITH_LIMITATIONS";
  }

  if (
    allBlockingPassed &&
    !capacityStrongEnough
  ) {
    readiness =
      "READY_WITH_LIMITATIONS";
  }

  if (
    allBlockingPassed &&
    capacityStrongEnough
  ) {
    readiness =
      "READY";
  }

  return {
    problemId:
      state.problemId,

    problemName:
      state.problemName,

    readiness,

    checks,

    permissions: {
      /*
        Problem description requires independent problem evidence,
        but does not require complete provider ingestion.
      */
      describeProblem:
        independentNeedEvidencePassed,

      /*
        Discovery lists may be shown whenever records exist,
        provided coverage limitations are visible.
      */
      listDiscoveredProviders:
        state.ecosystem.programsMapped > 0 ||
        state.ecosystem.organizationsMapped > 0,

      /*
        Coverage hypotheses require need evidence + some ecosystem.
      */
      produceCoverageHypotheses:
        independentNeedEvidencePassed &&
        atLeast(
          state.ecosystem.providerCoverage,
          "LOW"
        ),

      /*
        Strong claims of actual service gaps require substantially
        better ecosystem and capacity knowledge.
      */
      produceServiceGapClaims:
        allBlockingPassed &&
        capacityStrongEnough,

      /*
        Investigation hypotheses are intentionally easier to produce
        than strong recommendations.
      */
      produceCollaborationHypotheses:
        coreEvidencePassed,

      produceStrongCollaborationRecommendations:
        allBlockingPassed,

      produceProjectHypotheses:
        coreEvidencePassed,

      produceStrongProjectRecommendations:
        allBlockingPassed &&
        capacityStrongEnough
    },

    safeguards: [
      "No provider record does not mean no provider exists.",
      "No relationship record does not mean no relationship exists.",
      "Organization count does not equal service capacity.",
      "Provider concentration does not establish duplication.",
      "Sparse provider coverage does not establish scarcity.",
      "Taxonomy adjacency does not establish program equivalence.",
      "AI-generated collaboration and project ideas remain hypotheses until reviewed.",
      "Media salience and political attention do not establish problem priority.",
      "Service-provider counts do not establish underlying local need.",
      "Every consequential recommendation must retain provenance and coverage context."
    ]
  };
}

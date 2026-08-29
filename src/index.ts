<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta
    name="viewport"
    content="width=device-width,initial-scale=1"
  />

  <title>FixLine — Seattle / King County Demo</title>

  <style>
    :root {
      --bg: #f6f8fb;
      --card: #ffffff;
      --text: #172033;
      --muted: #667085;
      --line: #e4e7ec;
      --accent: #155eef;
      --accent-soft: #eef4ff;
      --success: #067647;
      --warning: #b54708;
      --danger: #b42318;
      --shadow: 0 4px 18px rgba(16, 24, 40, 0.08);
      --radius: 14px;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family:
        Inter,
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;
    }

    a {
      color: var(--accent);
    }

    button,
    input,
    select {
      font: inherit;
    }

    button {
      cursor: pointer;
    }

    .shell {
      width: min(1200px, calc(100% - 28px));
      margin: 0 auto;
      padding: 28px 0 60px;
    }

    .hero {
      background:
        linear-gradient(
          135deg,
          #0f172a 0%,
          #172554 55%,
          #1d4ed8 100%
        );
      color: white;
      padding: 28px;
      border-radius: 18px;
      box-shadow: var(--shadow);
      margin-bottom: 20px;
    }

    .hero h1 {
      margin: 0 0 6px;
      font-size: clamp(34px, 7vw, 56px);
      letter-spacing: -0.04em;
    }

    .hero .subtitle {
      font-size: 18px;
      opacity: 0.92;
      margin-bottom: 18px;
    }

    .notice {
      padding: 14px 16px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.12);
      line-height: 1.45;
    }

    .notice strong {
      display: block;
      margin-bottom: 4px;
    }

    .stats {
      display: grid;
      grid-template-columns:
        repeat(auto-fit, minmax(135px, 1fr));
      gap: 12px;
      margin: 18px 0 24px;
    }

    .stat {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 16px;
      box-shadow: var(--shadow);
    }

    .stat-value {
      font-size: 27px;
      font-weight: 750;
      letter-spacing: -0.03em;
    }

    .stat-label {
      color: var(--muted);
      margin-top: 4px;
      font-size: 13px;
    }

    .tabs {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin: 0 0 18px;
    }

    .tab {
      border: 1px solid var(--line);
      background: white;
      color: var(--text);
      padding: 10px 14px;
      border-radius: 999px;
    }

    .tab.active {
      background: var(--accent);
      border-color: var(--accent);
      color: white;
    }

    .panel {
      display: none;
    }

    .panel.active {
      display: block;
    }

    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 18px;
      margin-bottom: 14px;
      box-shadow: var(--shadow);
    }

    .card h2,
    .card h3 {
      margin-top: 0;
    }

    .muted {
      color: var(--muted);
    }

    .grid {
      display: grid;
      grid-template-columns:
        repeat(auto-fit, minmax(280px, 1fr));
      gap: 14px;
    }

    .controls {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }

    input,
    select {
      min-height: 44px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: white;
      padding: 0 12px;
      color: var(--text);
    }

    input {
      min-width: min(100%, 300px);
      flex: 1;
    }

    .primary {
      border: 0;
      background: var(--accent);
      color: white;
      min-height: 44px;
      padding: 0 16px;
      border-radius: 10px;
    }

    .secondary {
      border: 1px solid var(--line);
      background: white;
      color: var(--text);
      min-height: 44px;
      padding: 0 16px;
      border-radius: 10px;
    }

    .pill {
      display: inline-block;
      padding: 5px 9px;
      background: var(--accent-soft);
      color: #1849a9;
      border-radius: 999px;
      font-size: 12px;
      margin: 2px 4px 2px 0;
    }

    .pill.warning {
      background: #fff4e5;
      color: var(--warning);
    }

    .pill.success {
      background: #ecfdf3;
      color: var(--success);
    }

    .pill.danger {
      background: #fef3f2;
      color: var(--danger);
    }

    .problem-list,
    .org-list,
    .project-list,
    .ledger-list {
      display: grid;
      gap: 10px;
      margin-top: 14px;
    }

    .row-button {
      width: 100%;
      text-align: left;
      background: white;
      border: 1px solid var(--line);
      padding: 13px;
      border-radius: 11px;
    }

    .row-button:hover {
      border-color: #98a2b3;
    }

    .row-title {
      font-weight: 700;
      margin-bottom: 4px;
    }

    .mini {
      font-size: 13px;
      color: var(--muted);
    }

    .detail {
      margin-top: 16px;
    }

    .section-title {
      font-size: 17px;
      font-weight: 750;
      margin: 20px 0 10px;
    }

    .empty {
      color: var(--muted);
      padding: 18px 0;
    }

    .error {
      background: #fef3f2;
      color: #912018;
      padding: 12px;
      border-radius: 10px;
      margin-top: 10px;
      white-space: pre-wrap;
    }

    .success-box {
      background: #ecfdf3;
      color: #05603a;
      padding: 12px;
      border-radius: 10px;
    }

    pre {
      white-space: pre-wrap;
      word-break: break-word;
      overflow-wrap: anywhere;
      background: #101828;
      color: #f2f4f7;
      padding: 14px;
      border-radius: 12px;
      font-size: 12px;
      line-height: 1.45;
    }

    .footer {
      margin-top: 40px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.6;
    }

    .loading {
      color: var(--muted);
      font-style: italic;
    }

    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }

    @media (max-width: 780px) {
      .two-col {
        grid-template-columns: 1fr;
      }

      .hero {
        padding: 22px;
      }
    }
  </style>
</head>

<body>
  <main class="shell">

    <section class="hero">
      <h1>FixLine</h1>

      <div class="subtitle">
        Seattle / King County bounded civic-intelligence demonstration
      </div>

      <div class="notice">
        <strong>Pilot candidate, not production.</strong>

        This demo uses a bounded verified dataset.
        Capability does not mean current capacity.
        A suggested connection does not mean an existing
        or appropriate partnership.
        A project does not mean a problem is solved.
        Missing relationship evidence does not prove novelty.
      </div>
    </section>

    <section id="stats" class="stats">
      <div class="stat">
        <div class="stat-value" id="statProblems">—</div>
        <div class="stat-label">Problems</div>
      </div>

      <div class="stat">
        <div class="stat-value" id="statOrgs">—</div>
        <div class="stat-label">Organizations</div>
      </div>

      <div class="stat">
        <div class="stat-value" id="statCapabilities">—</div>
        <div class="stat-label">Capabilities</div>
      </div>

      <div class="stat">
        <div class="stat-value" id="statEdges">—</div>
        <div class="stat-label">Capability edges</div>
      </div>

      <div class="stat">
        <div class="stat-value" id="statProjects">—</div>
        <div class="stat-label">Projects</div>
      </div>

      <div class="stat">
        <div class="stat-value" id="statOutcomes">—</div>
        <div class="stat-label">Outcomes</div>
      </div>

      <div class="stat">
        <div class="stat-value" id="statRechecks">—</div>
        <div class="stat-label">Rechecks</div>
      </div>

      <div class="stat">
        <div class="stat-value" id="statLedger">—</div>
        <div class="stat-label">Ledger records</div>
      </div>
    </section>

    <nav class="tabs">
      <button class="tab active" data-panel="problems">
        Problems
      </button>

      <button class="tab" data-panel="organizations">
        Organizations
      </button>

      <button class="tab" data-panel="matching">
        Find Matches
      </button>

      <button class="tab" data-panel="projects">
        Projects & Funding
      </button>

      <button class="tab" data-panel="outcomes">
        Outcomes & Rechecks
      </button>

      <button class="tab" data-panel="ledger">
        Unfinished Work
      </button>

      <button class="tab" data-panel="mcp">
        MCP
      </button>
    </nav>

    <!-- PROBLEMS -->

    <section id="panel-problems" class="panel active">

      <div class="card">
        <h2>Civic problem registry</h2>

        <p class="muted">
          Select a civic domain to traverse the current
          FixLine graph from problem to capabilities,
          organizations, relationships and possible
          collaboration gaps.
        </p>

        <div id="problemList" class="problem-list">
          <span class="loading">Loading problems…</span>
        </div>
      </div>

      <div
        id="problemDetail"
        class="card detail"
        style="display:none"
      ></div>
    </section>

    <!-- ORGANIZATIONS -->

    <section id="panel-organizations" class="panel">

      <div class="card">
        <h2>Verified organizations</h2>

        <p class="muted">
          These organizations have verified capabilities
          in the bounded demonstration dataset.
          Verified capability does not mean current capacity.
        </p>

        <div id="organizationList" class="org-list">
          <span class="loading">
            Loading organizations…
          </span>
        </div>
      </div>

      <div
        id="organizationDetail"
        class="card detail"
        style="display:none"
      ></div>
    </section>

    <!-- MATCHING -->

    <section id="panel-matching" class="panel">

      <div class="card">
        <h2>Find organizations by civic need</h2>

        <div class="controls">
          <input
            id="matchQuery"
            type="text"
            placeholder="Example: job training"
            value="job training"
          />

          <button
            class="primary"
            id="matchButton"
          >
            Find matches
          </button>
        </div>

        <div
          id="matchResults"
          style="margin-top:16px"
        ></div>
      </div>

      <div class="card">
        <h2>Who should talk?</h2>

        <p class="muted">
          This produces review hypotheses only.
          It does not prove novelty and does not authorize contact.
        </p>

        <div class="controls">
          <input
            id="talkQuery"
            type="text"
            placeholder="Example: job training"
            value="job training"
          />

          <button
            class="primary"
            id="talkButton"
          >
            Analyze candidate pairs
          </button>
        </div>

        <div
          id="talkResults"
          style="margin-top:16px"
        ></div>
      </div>
    </section>

    <!-- PROJECTS -->

    <section id="panel-projects" class="panel">

      <div class="two-col">

        <div class="card">
          <h2>Projects</h2>

          <div id="projectList" class="project-list">
            <span class="loading">
              Loading projects…
            </span>
          </div>
        </div>

        <div class="card">
          <h2>Funding gaps</h2>

          <div id="fundingGapList">
            <span class="loading">
              Loading funding gaps…
            </span>
          </div>
        </div>

      </div>

      <div
        id="projectDetail"
        class="card detail"
        style="display:none"
      ></div>
    </section>

    <!-- OUTCOMES -->

    <section id="panel-outcomes" class="panel">

      <div class="two-col">

        <div class="card">
          <h2>Outcomes</h2>

          <div id="outcomeList">
            <span class="loading">
              Loading outcomes…
            </span>
          </div>
        </div>

        <div class="card">
          <h2>Scheduled rechecks</h2>

          <div id="recheckList">
            <span class="loading">
              Loading rechecks…
            </span>
          </div>
        </div>

      </div>

      <div
        id="outcomeDetail"
        class="card detail"
        style="display:none"
      ></div>
    </section>

    <!-- LEDGER -->

    <section id="panel-ledger" class="panel">

      <div class="card">
        <h2>Open unfinished work</h2>

        <p class="muted">
          A ledger record remains open until the underlying
          work is sufficiently verified and sustained.
          Open does not automatically mean program failure.
        </p>

        <div id="unfinishedList" class="ledger-list">
          <span class="loading">
            Loading unfinished work…
          </span>
        </div>
      </div>

      <div
        id="ledgerDetail"
        class="card detail"
        style="display:none"
      ></div>
    </section>

    <!-- MCP -->

    <section id="panel-mcp" class="panel">

      <div class="card">
        <h2>Remote MCP endpoint</h2>

        <p>
          This Worker exposes FixLine through:
        </p>

        <pre id="mcpUrl"></pre>

        <p class="muted">
          A normal browser GET may return
          “Method not allowed.” That is expected because
          the endpoint expects MCP protocol requests.
        </p>

        <div class="section-title">
          Core MCP capabilities
        </div>

        <div>
          <span class="pill">get_pilot_stats</span>
          <span class="pill">list_problems</span>
          <span class="pill">get_problem</span>
          <span class="pill">get_problem_capabilities</span>
          <span class="pill">get_problem_intelligence</span>
          <span class="pill">list_verified_organizations</span>
          <span class="pill">get_organization</span>
          <span class="pill">find_matching_organizations</span>
          <span class="pill">check_existing_relationship</span>
          <span class="pill">list_projects</span>
          <span class="pill">get_project</span>
          <span class="pill">list_funding_gaps</span>
          <span class="pill">list_outcomes</span>
          <span class="pill">get_outcome</span>
          <span class="pill">list_rechecks</span>
          <span class="pill">list_unfinished_work</span>
          <span class="pill">list_ledger</span>
          <span class="pill">get_ledger_record</span>
        </div>
      </div>
    </section>

    <footer class="footer">
      <strong>FixLine bounded demonstration.</strong><br />

      Seattle / King County is a demonstration environment,
      not a universal civic taxonomy.

      FixLine is designed as a vendor-neutral intelligence,
      participation, collaboration, funding and accountability
      layer for unfinished civic work.
    </footer>

  </main>

  <script>
    const api = async path => {
      const response = await fetch(path, {
        headers: {
          "accept": "application/json"
        }
      });

      const text = await response.text();

      let data;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          `Expected JSON but received:\n${text}`
        );
      }

      if (!response.ok) {
        throw new Error(
          data?.error ||
          data?.message ||
          `HTTP ${response.status}`
        );
      }

      return data;
    };

    const esc = value => {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    };

    const money = value => {
      if (
        value === null ||
        value === undefined ||
        value === ""
      ) {
        return "Unknown";
      }

      return new Intl.NumberFormat(
        "en-US",
        {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0
        }
      ).format(Number(value));
    };

    const pills = items => {
      if (!items?.length) {
        return `<span class="muted">None recorded</span>`;
      }

      return items
        .map(
          x =>
            `<span class="pill">${esc(
              typeof x === "string"
                ? x
                : x.name ?? x
            )}</span>`
        )
        .join("");
    };

    function errorBox(element, error) {
      element.innerHTML =
        `<div class="error">${esc(error.message)}</div>`;
    }

    /* Tabs */

    document
      .querySelectorAll(".tab")
      .forEach(button => {
        button.addEventListener(
          "click",
          () => {
            document
              .querySelectorAll(".tab")
              .forEach(x =>
                x.classList.remove("active")
              );

            document
              .querySelectorAll(".panel")
              .forEach(x =>
                x.classList.remove("active")
              );

            button.classList.add("active");

            document
              .getElementById(
                `panel-${button.dataset.panel}`
              )
              .classList.add("active");
          }
        );
      });

    /* Stats */

    async function loadStats() {
      try {
        const data =
          await api("/api/database");

        const c =
          data.counts ?? {};

        document.getElementById(
          "statProblems"
        ).textContent =
          c.problems ?? "0";

        document.getElementById(
          "statOrgs"
        ).textContent =
          c.organizations ?? "0";

        document.getElementById(
          "statCapabilities"
        ).textContent =
          c.capabilities ?? "0";

        document.getElementById(
          "statEdges"
        ).textContent =
          c.capability_edges ?? "0";

        document.getElementById(
          "statProjects"
        ).textContent =
          c.projects ?? "0";

        document.getElementById(
          "statOutcomes"
        ).textContent =
          c.outcomes ?? "0";

        document.getElementById(
          "statRechecks"
        ).textContent =
          c.rechecks ?? "0";

        document.getElementById(
          "statLedger"
        ).textContent =
          c.ledger_records ?? "0";
      } catch (error) {
        console.error(error);
      }
    }

    /* Problems */

    async function loadProblems() {
      const el =
        document.getElementById("problemList");

      try {
        const data =
          await api("/api/problems");

        el.innerHTML = "";

        data.problems.forEach(problem => {
          const button =
            document.createElement("button");

          button.className =
            "row-button";

          button.innerHTML = `
            <div class="row-title">
              ${esc(problem.problem_number)}.
              ${esc(problem.name)}
            </div>

            <div class="mini">
              ${esc(problem.status)}
              · confidence ${esc(problem.confidence)}
            </div>
          `;

          button.onclick =
            () =>
              loadProblemIntelligence(
                problem.problem_number
              );

          el.appendChild(button);
        });
      } catch (error) {
        errorBox(el, error);
      }
    }

    async function loadProblemIntelligence(
      problemNumber
    ) {
      const el =
        document.getElementById(
          "problemDetail"
        );

      el.style.display = "block";
      el.innerHTML =
        `<div class="loading">Loading intelligence…</div>`;

      try {
        const data =
          await api(
            `/api/problems/${problemNumber}/intelligence`
          );

        const p =
          data.problem;

        const capabilities =
          data.approved_capabilities?.items ?? [];

        const orgs =
          data.relevant_organizations?.items ?? [];

        const gaps =
          data.collaboration_analysis
            ?.possible_collaboration_gaps ?? [];

        const known =
          data.collaboration_analysis
            ?.known_relationships ?? [];

        el.innerHTML = `
          <h2>
            ${esc(p.problem_number)}.
            ${esc(p.name)}
          </h2>

          <div>
            <span class="pill">
              ${esc(p.status)}
            </span>

            <span class="pill warning">
              Confidence: ${esc(p.confidence)}
            </span>

            <span class="pill warning">
              Severity:
              ${esc(p.severity ?? "UNKNOWN")}
            </span>
          </div>

          <div class="section-title">
            Evidence state
          </div>

          <p>
            ${
              p.evidence_summary
                ? esc(p.evidence_summary)
                : '<span class="muted">No evidence summary has yet been entered for this problem.</span>'
            }
          </p>

          <div class="section-title">
            Approved capabilities
          </div>

          ${
            capabilities.length
              ? capabilities
                  .map(
                    c => `
                    <div class="card">
                      <strong>${esc(c.name)}</strong>
                      <div class="mini">
                        ${esc(c.relevance_type)}
                      </div>
                      <p class="muted">
                        ${esc(c.evidence_note ?? "")}
                      </p>
                    </div>
                  `
                  )
                  .join("")
              : `
                <div class="empty">
                  No approved capability mappings yet.
                  This represents a coverage gap,
                  not proof that no capable organization exists.
                </div>
              `
          }

          <div class="section-title">
            Relevant verified organizations
          </div>

          ${
            orgs.length
              ? orgs
                  .map(
                    org => `
                    <div class="card">
                      <h3>${esc(
                        org.organization_name
                      )}</h3>

                      <div>
                        <span class="pill">
                          ${esc(
                            org.verification_status
                          )}
                        </span>

                        <span class="pill warning">
                          Capacity:
                          ${esc(
                            org.current_capacity
                          )}
                        </span>
                      </div>

                      <p>
                        ${pills(
                          org.relevant_capabilities
                        )}
                      </p>

                      ${
                        org.website
                          ? `
                          <a
                            href="${esc(org.website)}"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Organization source
                          </a>
                          `
                          : ""
                      }
                    </div>
                  `
                  )
                  .join("")
              : `
                <div class="empty">
                  No relevant organizations are currently
                  reachable through approved mappings.
                </div>
              `
          }

          <div class="section-title">
            Collaboration analysis
          </div>

          <p>
            Known relationships:
            <strong>${known.length}</strong>
            &nbsp; · &nbsp;
            Possible collaboration gaps:
            <strong>${gaps.length}</strong>
          </p>

          ${
            gaps.length
              ? gaps
                  .map(
                    gap => `
                    <div class="card">
                      <strong>
                        ${esc(
                          gap.organization_a_name
                        )}
                        ↔
                        ${esc(
                          gap.organization_b_name
                        )}
                      </strong>

                      <div class="pill warning">
                        POSSIBLE_COLLABORATION_GAP
                      </div>

                      <p class="muted">
                        No relationship is recorded in
                        the bounded graph. This does not
                        prove these organizations have
                        never worked together.
                      </p>
                    </div>
                  `
                  )
                  .join("")
              : `
                <div class="empty">
                  No collaboration gaps are currently
                  generated for this problem.
                </div>
              `
          }

          <div class="section-title">
            Safeguards
          </div>

          <ul>
            <li>
              Capability does not mean current capacity.
            </li>
            <li>
              Missing relationship evidence does not prove novelty.
            </li>
            <li>
              AI output is not authorization.
            </li>
            <li>
              Consequential action requires human review.
            </li>
          </ul>
        `;

        el.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      } catch (error) {
        errorBox(el, error);
      }
    }

    /* Organizations */

    async function loadOrganizations() {
      const el =
        document.getElementById(
          "organizationList"
        );

      try {
        const orgs =
          await api("/api/organizations");

        el.innerHTML = "";

        orgs.forEach(org => {
          const button =
            document.createElement("button");

          button.className =
            "row-button";

          button.innerHTML = `
            <div class="row-title">
              ${esc(org.display_name)}
            </div>

            <div class="mini">
              ${esc(org.organization_type)}
              · capacity ${esc(org.current_capacity)}
            </div>
          `;

          button.onclick =
            () =>
              loadOrganization(org.id);

          el.appendChild(button);
        });
      } catch (error) {
        errorBox(el, error);
      }
    }

    async function loadOrganization(id) {
      const el =
        document.getElementById(
          "organizationDetail"
        );

      el.style.display = "block";
      el.innerHTML =
        `<div class="loading">Loading organization…</div>`;

      try {
        const org =
          await api(
            `/api/organizations/${encodeURIComponent(id)}`
          );

        el.innerHTML = `
          <h2>${esc(org.display_name)}</h2>

          <p>
            ${esc(
              org.organization_type ??
              "Organization"
            )}
          </p>

          <div>
            <span class="pill">
              ${esc(org.verification_status)}
            </span>

            <span class="pill warning">
              Capacity:
              ${esc(org.current_capacity)}
            </span>
          </div>

          <div class="section-title">
            Verified capabilities
          </div>

          <p>
            ${pills(org.verified_capabilities)}
          </p>

          <div class="section-title">
            Evidence
          </div>

          <p>
            ${esc(org.evidence_note ?? "None recorded")}
          </p>

          <p class="muted">
            ${esc(
              org.availability_or_constraints ??
              ""
            )}
          </p>

          ${
            org.website
              ? `
              <a
                href="${esc(org.website)}"
                target="_blank"
                rel="noreferrer"
              >
                Primary source
              </a>
              `
              : ""
          }
        `;
      } catch (error) {
        errorBox(el, error);
      }
    }

    /* Matching */

    async function runMatches() {
      const query =
        document
          .getElementById("matchQuery")
          .value
          .trim();

      const el =
        document.getElementById(
          "matchResults"
        );

      if (!query) return;

      el.innerHTML =
        `<div class="loading">Searching…</div>`;

      try {
        const data =
          await api(
            `/api/matches?q=${encodeURIComponent(query)}`
          );

        if (!data.results?.length) {
          el.innerHTML =
            `<div class="empty">No matches found.</div>`;
          return;
        }

        el.innerHTML =
          data.results
            .map(
              item => `
              <div class="card">
                <h3>
                  ${esc(
                    item.organization.display_name
                  )}
                </h3>

                <div class="mini">
                  Match score:
                  ${esc(item.score)}
                  · capacity
                  ${esc(
                    item.organization.current_capacity
                  )}
                </div>

                <p>
                  ${pills(
                    item.organization
                      .verified_capabilities
                  )}
                </p>
              </div>
            `
            )
            .join("");
      } catch (error) {
        errorBox(el, error);
      }
    }

    async function runWhoShouldTalk() {
      const query =
        document
          .getElementById("talkQuery")
          .value
          .trim();

      const el =
        document.getElementById(
          "talkResults"
        );

      if (!query) return;

      el.innerHTML =
        `<div class="loading">Analyzing…</div>`;

      try {
        const data =
          await api(
            `/api/who-should-talk?q=${encodeURIComponent(query)}`
          );

        if (!data.candidates?.length) {
          el.innerHTML =
            `<div class="empty">No candidate pairs generated.</div>`;
          return;
        }

        el.innerHTML =
          data.candidates
            .map(
              pair => {
                let cls = "warning";

                if (
                  pair.classification ===
                  "REDUNDANT_ALREADY_EXISTS"
                ) {
                  cls = "success";
                }

                return `
                  <div class="card">
                    <h3>
                      ${esc(
                        pair.organization_a.name
                      )}
                      ↔
                      ${esc(
                        pair.organization_b.name
                      )}
                    </h3>

                    <span class="pill ${cls}">
                      ${esc(
                        pair.classification
                      )}
                    </span>

                    <p class="muted">
                      Human review required.
                      A missing relationship record does
                      not prove this is a novel connection.
                    </p>
                  </div>
                `;
              }
            )
            .join("");
      } catch (error) {
        errorBox(el, error);
      }
    }

    /* Projects */

    async function loadProjects() {
      const el =
        document.getElementById(
          "projectList"
        );

      try {
        const data =
          await api("/api/projects");

        if (!data.projects?.length) {
          el.innerHTML =
            `<div class="empty">No projects recorded.</div>`;
          return;
        }

        el.innerHTML = "";

        data.projects.forEach(project => {
          const button =
            document.createElement("button");

          button.className =
            "row-button";

          button.innerHTML = `
            <div class="row-title">
              ${esc(project.name)}
            </div>

            <div class="mini">
              ${esc(project.status)}
              · gap ${money(project.funding_gap)}
            </div>
          `;

          button.onclick =
            () =>
              loadProject(project.id);

          el.appendChild(button);
        });
      } catch (error) {
        errorBox(el, error);
      }
    }

    async function loadFundingGaps() {
      const el =
        document.getElementById(
          "fundingGapList"
        );

      try {
        const data =
          await api("/api/funding-gaps");

        if (!data.funding_gaps?.length) {
          el.innerHTML =
            `<div class="empty">No funding gaps recorded.</div>`;
          return;
        }

        el.innerHTML =
          data.funding_gaps
            .map(
              gap => `
              <div class="card">
                <strong>
                  ${esc(gap.project_name)}
                </strong>

                <div class="mini">
                  Needed:
                  ${money(gap.funding_needed)}
                  · Gap:
                  ${money(gap.funding_gap)}
                </div>
              </div>
            `
            )
            .join("");
      } catch (error) {
        errorBox(el, error);
      }
    }

    async function loadProject(id) {
      const el =
        document.getElementById(
          "projectDetail"
        );

      el.style.display = "block";
      el.innerHTML =
        `<div class="loading">Loading project…</div>`;

      try {
        const data =
          await api(
            `/api/projects/${encodeURIComponent(id)}`
          );

        const p =
          data.project;

        el.innerHTML = `
          <h2>${esc(p.name)}</h2>

          <span class="pill">
            ${esc(p.status)}
          </span>

          <p>${esc(p.description ?? "")}</p>

          <div class="section-title">
            Target outcome
          </div>

          <p>
            ${esc(
              p.target_outcome ??
              "Not specified"
            )}
          </p>

          <div class="section-title">
            Funding
          </div>

          <p>
            Needed:
            <strong>${money(
              data.funding.needed
            )}</strong><br />

            Committed:
            <strong>${money(
              data.funding.committed
            )}</strong><br />

            Gap:
            <strong>${money(
              data.funding.gap
            )}</strong>
          </p>

          <div class="section-title">
            Participating organizations
          </div>

          ${
            data.participating_organizations
              .items.length
              ? data.participating_organizations
                  .items.map(
                    org => `
                    <div class="card">
                      <strong>
                        ${esc(org.display_name)}
                      </strong>

                      <div class="mini">
                        ${esc(org.role)}
                        ·
                        ${esc(
                          org.participation_status
                        )}
                      </div>
                    </div>
                  `
                  )
                  .join("")
              : `<div class="empty">None recorded.</div>`
          }

          <p class="muted">
            Proposed participation does not mean
            an organization has agreed to participate.
          </p>
        `;
      } catch (error) {
        errorBox(el, error);
      }
    }

    /* Outcomes */

    async function loadOutcomes() {
      const el =
        document.getElementById(
          "outcomeList"
        );

      try {
        const data =
          await api("/api/outcomes");

        if (!data.outcomes?.length) {
          el.innerHTML =
            `<div class="empty">No outcomes recorded.</div>`;
          return;
        }

        el.innerHTML = "";

        data.outcomes.forEach(outcome => {
          const button =
            document.createElement("button");

          button.className =
            "row-button";

          button.innerHTML = `
            <div class="row-title">
              ${esc(outcome.description)}
            </div>

            <div class="mini">
              ${esc(outcome.verification_status)}
              · measured
              ${esc(
                outcome.measured_value ??
                "UNKNOWN"
              )}
              ${esc(
                outcome.measured_unit ??
                ""
              )}
            </div>
          `;

          button.onclick =
            () =>
              loadOutcome(outcome.id);

          el.appendChild(button);
        });
      } catch (error) {
        errorBox(el, error);
      }
    }

    async function loadOutcome(id) {
      const el =
        document.getElementById(
          "outcomeDetail"
        );

      el.style.display = "block";
      el.innerHTML =
        `<div class="loading">Loading outcome…</div>`;

      try {
        const data =
          await api(
            `/api/outcomes/${encodeURIComponent(id)}`
          );

        const o =
          data.outcome;

        el.innerHTML = `
          <h2>Outcome</h2>

          <p>${esc(o.description)}</p>

          <div>
            <span class="pill warning">
              ${esc(o.verification_status)}
            </span>

            <span class="pill warning">
              Confidence:
              ${esc(o.confidence)}
            </span>
          </div>

          <div class="section-title">
            Measurement
          </div>

          <p>
            Baseline:
            ${esc(o.baseline_value ?? "UNKNOWN")}
            <br />

            Target:
            ${esc(o.target_value ?? "UNKNOWN")}
            <br />

            Latest:
            ${esc(o.measured_value ?? "UNKNOWN")}
            ${esc(o.measured_unit ?? "")}
          </p>

          <div class="section-title">
            Verification records
          </div>

          ${
            data.verifications.items.length
              ? data.verifications.items
                  .map(
                    v => `
                    <div class="card">
                      <strong>
                        ${esc(
                          v.verification_status
                        )}
                      </strong>

                      <div class="mini">
                        ${esc(
                          v.measured_value
                        )}
                        ${esc(
                          v.measured_unit
                        )}
                      </div>

                      <p>
                        ${esc(
                          v.evidence_note ??
                          ""
                        )}
                      </p>
                    </div>
                  `
                  )
                  .join("")
              : `<div class="empty">No verification records.</div>`
          }

          <div class="section-title">
            Rechecks
          </div>

          ${
            data.rechecks.items.length
              ? data.rechecks.items
                  .map(
                    r => `
                    <div class="card">
                      <strong>
                        ${esc(r.status)}
                      </strong>

                      <div class="mini">
                        ${esc(
                          r.scheduled_for
                        )}
                      </div>

                      <p>
                        ${esc(
                          r.reason ?? ""
                        )}
                      </p>
                    </div>
                  `
                  )
                  .join("")
              : `<div class="empty">No rechecks recorded.</div>`
          }
        `;
      } catch (error) {
        errorBox(el, error);
      }
    }

    async function loadRechecks() {
      const el =
        document.getElementById(
          "recheckList"
        );

      try {
        const data =
          await api("/api/rechecks");

        if (!data.rechecks?.length) {
          el.innerHTML =
            `<div class="empty">No rechecks scheduled.</div>`;
          return;
        }

        el.innerHTML =
          data.rechecks
            .map(
              r => `
              <div class="card">
                <strong>
                  ${esc(r.problem_name)}
                </strong>

                <div>
                  <span class="pill warning">
                    ${esc(r.status)}
                  </span>
                </div>

                <p class="mini">
                  ${esc(r.scheduled_for)}
                </p>

                <p>
                  ${esc(r.reason ?? "")}
                </p>
              </div>
            `
            )
            .join("");
      } catch (error) {
        errorBox(el, error);
      }
    }

    /* Ledger */

    async function loadUnfinishedWork() {
      const el =
        document.getElementById(
          "unfinishedList"
        );

      try {
        const data =
          await api(
            "/api/unfinished-work"
          );

        if (
          !data.unfinished_work?.length
        ) {
          el.innerHTML =
            `<div class="empty">No open ledger records.</div>`;
          return;
        }

        el.innerHTML = "";

        data.unfinished_work.forEach(record => {
          const button =
            document.createElement("button");

          button.className =
            "row-button";

          button.innerHTML = `
            <div class="row-title">
              ${esc(
                record.problem_name ??
                "Unfinished civic work"
              )}
            </div>

            <div class="mini">
              ${esc(record.status)}
              ·
              ${esc(record.record_type)}
            </div>

            <p>
              ${esc(record.summary)}
            </p>
          `;

          button.onclick =
            () =>
              loadLedgerRecord(
                record.id
              );

          el.appendChild(button);
        });
      } catch (error) {
        errorBox(el, error);
      }
    }

    async function loadLedgerRecord(id) {
      const el =
        document.getElementById(
          "ledgerDetail"
        );

      el.style.display = "block";
      el.innerHTML =
        `<div class="loading">Loading ledger record…</div>`;

      try {
        const data =
          await api(
            `/api/ledger/${encodeURIComponent(id)}`
          );

        const r =
          data.record;

        el.innerHTML = `
          <h2>Unfinished-work record</h2>

          <div>
            <span class="pill warning">
              ${esc(r.status)}
            </span>

            <span class="pill">
              ${esc(r.record_type)}
            </span>

            <span class="pill warning">
              Confidence:
              ${esc(r.confidence)}
            </span>
          </div>

          <div class="section-title">
            Problem
          </div>

          <p>
            ${esc(
              r.problem_number ??
              ""
            )}
            ${r.problem_name
              ? "— " +
                esc(r.problem_name)
              : ""}
          </p>

          <div class="section-title">
            Summary
          </div>

          <p>
            ${esc(r.summary)}
          </p>

          <div class="section-title">
            Provenance
          </div>

          <p>
            ${esc(
              r.provenance ??
              "Not recorded"
            )}
          </p>

          <div class="section-title">
            Recheck
          </div>

          <p>
            ${esc(
              r.recheck_at ??
              "Not scheduled"
            )}
          </p>
        `;
      } catch (error) {
        errorBox(el, error);
      }
    }

    /* Events */

    document
      .getElementById("matchButton")
      .addEventListener(
        "click",
        runMatches
      );

    document
      .getElementById("talkButton")
      .addEventListener(
        "click",
        runWhoShouldTalk
      );

    document
      .getElementById("matchQuery")
      .addEventListener(
        "keydown",
        event => {
          if (event.key === "Enter") {
            runMatches();
          }
        }
      );

    document
      .getElementById("talkQuery")
      .addEventListener(
        "keydown",
        event => {
          if (event.key === "Enter") {
            runWhoShouldTalk();
          }
        }
      );

    /* MCP URL */

    document.getElementById(
      "mcpUrl"
    ).textContent =
      `${window.location.origin}/mcp`;

    /* Initial load */

    Promise.allSettled([
      loadStats(),
      loadProblems(),
      loadOrganizations(),
      loadProjects(),
      loadFundingGaps(),
      loadOutcomes(),
      loadRechecks(),
      loadUnfinishedWork()
    ]);
  </script>
</body>
</html>

const BUILDER_STORAGE_KEY = "cvtailor-builder-draft-v1";
const TAB_ORDER = ["basics", "links", "experience", "education", "skills"];
const TAB_LABELS = {
  basics: "Basics",
  links: "Links",
  experience: "Experience",
  education: "Education",
  skills: "Skills",
};

const LAYOUT_DESCRIPTIONS = {
  chronological: "Summary, Experience, Skills, Education — best for standard industry roles.",
  hybrid: "Summary, Core Skills, Experience, Education — highlights capabilities first.",
  technical: "Summary, Projects, Skills, Experience — built for engineering & portfolio roles.",
  academic: "Education, Research, Publications, Teaching — tailored for academic & R&D CVs.",
};

function cleanStr(value) {
  return String(value == null ? "" : value).trim();
}

function escapeAttr(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function splitLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}

export function normalizeDates(value) {
  const s = cleanStr(value);
  if (!s) return "";
  return s
    .replace(/\s+-\s+/g, " – ")
    .replace(/(\b(?:19|20)\d{2})\s*-\s*(\b(?:19|20)\d{2}|Present|Current|Now)\b/gi, "$1 – $2");
}

export function defaultBuilderState() {
  return {
    layout: "chronological",
    name: "",
    title: "",
    email: "",
    phone: "",
    location: "",
    summary: "",
    linkedin: "",
    github: "",
    portfolio: "",
    links: [],
    experience: [{ role: "", company: "", dates: "", kind: "industry", bullets: "" }],
    education: [{ degree: "", institution: "", dates: "", details: "" }],
    projects: [{ title: "", tech: "", description: "" }],
    skills: [
      { category: "Languages & Tools", items: "" },
      { category: "Core Competencies", items: "" },
    ],
    certifications: "",
    awards: "",
    publications: "",
  };
}

export function sampleBuilderState() {
  return {
    layout: "chronological",
    name: "Sara Ahmed",
    title: "Senior Backend Engineer",
    email: "sara.ahmed@example.com",
    phone: "+20 10 1234 5678",
    location: "",
    summary:
      "Backend engineer with 5+ years of experience designing high-throughput APIs, distributed job queues, and cloud-native services in Node.js, TypeScript, and PostgreSQL.",
    linkedin: "linkedin.com/in/sara-ahmed",
    github: "github.com/sara-ahmed",
    portfolio: "saraahmed.dev",
    links: [{ label: "Medium", url: "https://medium.com/@sara-ahmed" }],
    experience: [
      {
        role: "Senior Backend Engineer",
        company: "PayFlow Technologies",
        dates: "2023 - Present",
        kind: "industry",
        bullets:
          "Architected an idempotent settlement pipeline processing 1.4M daily transactions at 99.98% uptime\n" +
          "Reduced p95 checkout API latency by 42% by introducing Redis read-through caching and query indexing\n" +
          "Mentored 4 engineers and standardized CI/CD automated contract testing across 9 microservices",
      },
      {
        role: "Backend Engineer",
        company: "NileCloud Systems",
        dates: "2020 - 2023",
        kind: "industry",
        bullets:
          "Built multi-tenant webhook delivery workers with exponential backoff and dead-letter recovery\n" +
          "Migrated core reporting queries to partitioned PostgreSQL tables, cutting report generation from 18s to 1.2s",
      },
    ],
    education: [
      {
        degree: "B.Sc. in Computer Engineering",
        institution: "Cairo University",
        dates: "2016 - 2020",
        details: "Very Good with Honors",
      },
    ],
    projects: [
      {
        title: "EdgeRateLimiter",
        tech: "TypeScript, Cloudflare Workers, Durable Objects",
        description: "Open-source sliding-window rate limiter handling 25k req/s with sub-millisecond edge overhead.",
      },
    ],
    skills: [
      { category: "Languages & Runtimes", items: "TypeScript, JavaScript, Node.js, Python, SQL" },
      { category: "Databases & Messaging", items: "PostgreSQL, Redis, RabbitMQ, Kafka" },
      { category: "Infrastructure", items: "Cloudflare Workers, Docker, Kubernetes, GitHub Actions" },
    ],
    certifications: "AWS Certified Solutions Architect – Associate (2024)",
    awards: "First Place, FinTech Innovation Hackathon (2023)",
    publications: "",
  };
}

export function cvDataToBuilderState(data = {}) {
  const d = data || {};
  const c = d.contact || {};
  const layoutKey = ["chronological", "hybrid", "technical", "academic"].includes(d.layout?.recommended || d.layout)
    ? (d.layout?.recommended || d.layout)
    : "chronological";

  const expList = [
    ...(Array.isArray(d.experience) ? d.experience : []),
    ...(Array.isArray(d.research) ? d.research : []),
    ...(Array.isArray(d.teaching) ? d.teaching : []),
  ];

  return {
    layout: layoutKey,
    name: cleanStr(d.name),
    title: cleanStr(d.title),
    email: cleanStr(c.email),
    phone: cleanStr(c.phone),
    location: cleanStr(c.location),
    summary: cleanStr(d.summary),
    linkedin: cleanStr(c.linkedin),
    github: cleanStr(c.github),
    portfolio: cleanStr(c.portfolio),
    links: Array.isArray(d.links)
      ? d.links.map((l) => ({ label: cleanStr(l?.label), url: cleanStr(l?.url) })).filter((l) => l.url)
      : [],
    experience: expList.length
      ? expList.map((e) => ({
          role: cleanStr(e?.role),
          company: cleanStr(e?.company),
          dates: cleanStr(e?.dates),
          kind: ["industry", "research", "teaching"].includes(e?.kind) ? e.kind : "industry",
          bullets: Array.isArray(e?.bullets) ? e.bullets.join("\n") : cleanStr(e?.bullets),
        }))
      : defaultBuilderState().experience,
    education: Array.isArray(d.education) && d.education.length
      ? d.education.map((ed) => ({
          degree: cleanStr(ed?.degree),
          institution: cleanStr(ed?.institution),
          dates: cleanStr(ed?.dates),
          details: cleanStr(ed?.details),
        }))
      : defaultBuilderState().education,
    projects: Array.isArray(d.projects) && d.projects.length
      ? d.projects.map((p) => ({
          title: cleanStr(p?.title),
          tech: cleanStr(p?.tech),
          description: cleanStr(p?.description),
        }))
      : defaultBuilderState().projects,
    skills: Array.isArray(d.skills) && d.skills.length
      ? d.skills.map((sk) => ({
          category: typeof sk === "object" ? cleanStr(sk?.category) : "",
          items: typeof sk === "object"
            ? (Array.isArray(sk?.items) ? sk.items.join(", ") : cleanStr(sk?.items))
            : cleanStr(sk),
        }))
      : defaultBuilderState().skills,
    certifications: Array.isArray(d.certifications) ? d.certifications.join("\n") : cleanStr(d.certifications),
    awards: Array.isArray(d.awards) ? d.awards.join("\n") : cleanStr(d.awards),
    publications: Array.isArray(d.publications) ? d.publications.join("\n") : cleanStr(d.publications),
  };
}

export function buildCvDataFromState(state = {}) {
  const s = state || {};
  const links = (Array.isArray(s.links) ? s.links : [])
    .map((item) => ({ label: cleanStr(item?.label), url: cleanStr(item?.url) }))
    .filter((item) => item.url);

  const experience = (Array.isArray(s.experience) ? s.experience : [])
    .map((item) => ({
      role: cleanStr(item?.role),
      company: cleanStr(item?.company),
      dates: normalizeDates(item?.dates),
      kind: ["industry", "research", "teaching"].includes(item?.kind) ? item.kind : "industry",
      bullets: Array.isArray(item?.bullets)
        ? item.bullets.map(cleanStr).filter(Boolean)
        : splitLines(item?.bullets),
    }))
    .filter((item) => item.role || item.company || item.dates || item.bullets.length > 0);

  const education = (Array.isArray(s.education) ? s.education : [])
    .map((item) => ({
      degree: cleanStr(item?.degree),
      institution: cleanStr(item?.institution),
      dates: normalizeDates(item?.dates),
      details: cleanStr(item?.details),
    }))
    .filter((item) => item.degree || item.institution || item.dates || item.details);

  const projects = (Array.isArray(s.projects) ? s.projects : [])
    .map((item) => ({
      title: cleanStr(item?.title),
      tech: cleanStr(item?.tech),
      description: cleanStr(item?.description),
    }))
    .filter((item) => item.title || item.tech || item.description);

  const skills = (Array.isArray(s.skills) ? s.skills : [])
    .map((item) => ({
      category: cleanStr(item?.category),
      items: Array.isArray(item?.items)
        ? item.items.map(cleanStr).filter(Boolean)
        : String(item?.items || "").split(/[,;\n•]+/).map((x) => x.trim()).filter(Boolean),
    }))
    .filter((item) => item.items.length > 0);

  const layoutKey = ["chronological", "hybrid", "technical", "academic"].includes(s.layout)
    ? s.layout
    : "chronological";

  return {
    fromBuilder: true,
    name: cleanStr(s.name),
    title: cleanStr(s.title),
    layout: {
      recommended: layoutKey,
      reason: "",
    },
    contact: {
      email: cleanStr(s.email),
      phone: cleanStr(s.phone),
      location: cleanStr(s.location),
      linkedin: cleanStr(s.linkedin),
      github: cleanStr(s.github),
      portfolio: cleanStr(s.portfolio),
    },
    links,
    summary: cleanStr(s.summary),
    skills,
    experience,
    projects,
    education,
    certifications: splitLines(s.certifications),
    awards: splitLines(s.awards),
    publications: splitLines(s.publications),
  };
}

export function builderCvToPlainText(data = {}) {
  const lines = [];
  if (data.name) lines.push(data.name);
  if (data.title) lines.push(data.title);

  const c = data.contact || {};
  const contactParts = [c.email, c.phone, c.location, c.linkedin, c.github, c.portfolio]
    .filter(Boolean)
    .concat((data.links || []).map((l) => (l.label ? `${l.label}: ${l.url}` : l.url)));
  if (contactParts.length) lines.push(contactParts.join(" | "));

  if (data.summary) lines.push("", "SUMMARY", data.summary);

  if (Array.isArray(data.skills) && data.skills.length) {
    lines.push("", "SKILLS");
    for (const s of data.skills) {
      const items = Array.isArray(s.items) ? s.items.join(", ") : String(s.items || "");
      lines.push(s.category ? `${s.category}: ${items}` : items);
    }
  }

  if (Array.isArray(data.experience) && data.experience.length) {
    lines.push("", "EXPERIENCE");
    for (const exp of data.experience) {
      const head = [exp.role, exp.company, exp.dates].filter(Boolean).join(" | ");
      if (head) lines.push(head);
      for (const b of exp.bullets || []) lines.push(`- ${b}`);
    }
  }

  if (Array.isArray(data.projects) && data.projects.length) {
    lines.push("", "PROJECTS");
    for (const proj of data.projects) {
      const head = [proj.title, proj.tech ? `(${proj.tech})` : ""].filter(Boolean).join(" ");
      if (head) lines.push(head);
      if (proj.description) lines.push(proj.description);
    }
  }

  if (Array.isArray(data.education) && data.education.length) {
    lines.push("", "EDUCATION");
    for (const edu of data.education) {
      const head = [edu.degree, edu.institution, edu.dates].filter(Boolean).join(" | ");
      if (head) lines.push(head);
      if (edu.details) lines.push(edu.details);
    }
  }

  for (const [label, arr] of [
    ["CERTIFICATIONS", data.certifications],
    ["AWARDS", data.awards],
    ["PUBLICATIONS", data.publications],
  ]) {
    if (Array.isArray(arr) && arr.length) {
      lines.push("", label, ...arr.map((item) => `- ${item}`));
    }
  }

  return lines.join("\n").trim();
}

export function initCvBuilder({ renderResume, onFinish, onDownloadPdf, onTailor, onBack, confirmDialog, showToast }) {
  const viewBuilder = document.getElementById("viewBuilder");
  if (!viewBuilder) return null;

  const previewStage = document.getElementById("builderPreviewStage");
  const previewSheet = document.getElementById("builderPreviewSheet");
  const previewPaper = document.getElementById("builderPreviewPaper");
  const prevTabBtn = document.getElementById("builderPrevTabBtn");
  const nextTabBtn = document.getElementById("builderNextTabBtn");

  const scalarFieldMap = [
    ["bName", "name"],
    ["bTitle", "title"],
    ["bEmail", "email"],
    ["bPhone", "phone"],
    ["bLocation", "location"],
    ["bSummary", "summary"],
    ["bLinkedin", "linkedin"],
    ["bGithub", "github"],
    ["bPortfolio", "portfolio"],
    ["bCertifications", "certifications"],
    ["bAwards", "awards"],
    ["bPublications", "publications"],
  ];

  let state = loadState();
  let activeTab = "basics";
  let tabAnimToken = 0;

  function loadState() {
    try {
      const raw = localStorage.getItem(BUILDER_STORAGE_KEY);
      if (!raw) return defaultBuilderState();
      const parsed = JSON.parse(raw);
      return { ...defaultBuilderState(), ...parsed };
    } catch {
      return defaultBuilderState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(BUILDER_STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore storage errors */
    }
  }

  function syncScalarsToDom() {
    for (const [id, key] of scalarFieldMap) {
      const input = document.getElementById(id);
      if (input) input.value = state[key] || "";
    }
  }

  function syncLayoutButtons() {
    viewBuilder.querySelectorAll("[data-builder-layout]").forEach((btn) => {
      const active = btn.dataset.builderLayout === state.layout;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
    const descEl = document.getElementById("builderLayoutDesc");
    if (descEl) descEl.textContent = LAYOUT_DESCRIPTIONS[state.layout] || LAYOUT_DESCRIPTIONS.chronological;
  }

  function syncTabCounts() {
    const data = buildCvDataFromState(state);
    const linkCount = [data.contact.linkedin, data.contact.github, data.contact.portfolio].filter(Boolean).length + data.links.length;
    const counts = {
      basics: 0,
      links: linkCount,
      experience: data.experience.length,
      education: data.education.length + data.projects.length,
      skills: data.skills.length + data.certifications.length + data.awards.length + data.publications.length,
    };
    viewBuilder.querySelectorAll("[data-builder-tab]").forEach((btn) => {
      const tab = btn.dataset.builderTab;
      const base = TAB_LABELS[tab] || tab;
      const n = counts[tab] || 0;
      btn.textContent = n > 0 ? `${base} (${n})` : base;
    });
  }

  function setActiveTab(tab, { immediate = false } = {}) {
    if (!TAB_ORDER.includes(tab)) return;
    const prevTab = activeTab;
    activeTab = tab;
    viewBuilder.querySelectorAll("[data-builder-tab]").forEach((btn) => {
      const active = btn.dataset.builderTab === tab;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", String(active));
    });
    const idx = TAB_ORDER.indexOf(tab);
    if (prevTabBtn) prevTabBtn.hidden = idx === 0;
    if (nextTabBtn) nextTabBtn.hidden = idx === TAB_ORDER.length - 1;

    const token = ++tabAnimToken;
    const panes = [...viewBuilder.querySelectorAll("[data-builder-pane]")];
    const nextPane = panes.find((p) => p.dataset.builderPane === tab);
    const oldPane = panes.find((p) => !p.hidden && p.dataset.builderPane !== tab);
    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (immediate || reduceMotion || !oldPane || prevTab === tab) {
      panes.forEach((pane) => {
        pane.removeAttribute("data-pane-anim");
        pane.hidden = pane.dataset.builderPane !== tab;
      });
      autoResizeTextareas();
      return;
    }

    oldPane.setAttribute("data-pane-anim", "collapse");
    setTimeout(() => {
      if (token !== tabAnimToken) return;
      panes.forEach((pane) => {
        pane.removeAttribute("data-pane-anim");
        pane.hidden = pane.dataset.builderPane !== tab;
      });
      if (nextPane) {
        nextPane.setAttribute("data-pane-anim", "expand");
        autoResizeTextareas();
      }
    }, 150);
  }

  function cardActionsHtml(listName, index, length, allowRemove = true) {
    const upDisabled = index === 0 ? " disabled" : "";
    const downDisabled = index >= length - 1 ? " disabled" : "";
    return `
      <div class="builder-card__actions">
        ${length > 1 ? `<button type="button" class="builder-move-btn" data-move="up" data-list="${listName}" data-index="${index}" aria-label="Move up" title="Move up"${upDisabled}>&#8593;</button><button type="button" class="builder-move-btn" data-move="down" data-list="${listName}" data-index="${index}" aria-label="Move down" title="Move down"${downDisabled}>&#8595;</button>` : ""}
        ${allowRemove ? `<button type="button" class="builder-remove-btn" data-remove="${listName}" data-index="${index}">Remove</button>` : ""}
      </div>
    `;
  }

  function renderList(containerId, items, cardHtmlFn) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = items.map(cardHtmlFn).join("");
  }

  function renderAllLists() {
    renderList("bLinksList", state.links, (item, i) => `
      <div class="builder-card" data-list="links" data-index="${i}">
        <div class="builder-card__head">
          <span>Link ${i + 1}</span>
          ${cardActionsHtml("links", i, state.links.length, true)}
        </div>
        <div class="builder-grid">
          <label class="form-field"><span>Platform / label</span><input type="text" data-field="label" value="${escapeAttr(item.label)}" placeholder="e.g. Behance"></label>
          <label class="form-field"><span>URL</span><input type="text" data-field="url" value="${escapeAttr(item.url)}" placeholder="https://behance.net/username"></label>
        </div>
      </div>
    `);

    renderList("bExperienceList", state.experience, (item, i) => `
      <div class="builder-card" data-list="experience" data-index="${i}">
        <div class="builder-card__head">
          <span>Position ${i + 1}</span>
          ${cardActionsHtml("experience", i, state.experience.length, state.experience.length > 1)}
        </div>
        <div class="builder-grid">
          <label class="form-field"><span>Job title</span><input type="text" data-field="role" value="${escapeAttr(item.role)}" placeholder="e.g. Software Engineer"></label>
          <label class="form-field"><span>Company</span><input type="text" data-field="company" value="${escapeAttr(item.company)}" placeholder="e.g. Acme Corp"></label>
          <label class="form-field"><span>Dates</span><input type="text" data-field="dates" value="${escapeAttr(item.dates)}" placeholder="e.g. Jan 2023 - Present"></label>
          <label class="form-field"><span>Category <small class="field-hint-inline">(for Academic)</small></span>
            <select data-field="kind" title="Controls grouping in the Academic layout">
              <option value="industry"${item.kind === "industry" ? " selected" : ""}>Industry</option>
              <option value="research"${item.kind === "research" ? " selected" : ""}>Research</option>
              <option value="teaching"${item.kind === "teaching" ? " selected" : ""}>Teaching</option>
            </select>
          </label>
          <label class="form-field builder-span-2"><span>Achievements &amp; responsibilities (one per line)</span>
            <textarea rows="3" data-field="bullets" placeholder="Built payment pipeline reducing checkout latency by 35%&#10;Led migration of 12 microservices to Node.js 20">${escapeAttr(item.bullets)}</textarea>
          </label>
        </div>
      </div>
    `);

    renderList("bEducationList", state.education, (item, i) => `
      <div class="builder-card" data-list="education" data-index="${i}">
        <div class="builder-card__head">
          <span>Degree ${i + 1}</span>
          ${cardActionsHtml("education", i, state.education.length, state.education.length > 1)}
        </div>
        <div class="builder-grid">
          <label class="form-field"><span>Degree</span><input type="text" data-field="degree" value="${escapeAttr(item.degree)}" placeholder="e.g. B.Sc. Computer Science"></label>
          <label class="form-field"><span>University / Institution</span><input type="text" data-field="institution" value="${escapeAttr(item.institution)}" placeholder="e.g. Cairo University"></label>
          <label class="form-field"><span>Dates</span><input type="text" data-field="dates" value="${escapeAttr(item.dates)}" placeholder="e.g. 2018 - 2022"></label>
          <label class="form-field"><span>Honors / Details</span><input type="text" data-field="details" value="${escapeAttr(item.details)}" placeholder="e.g. GPA 3.8, Very Good with Honors"></label>
        </div>
      </div>
    `);

    renderList("bProjectsList", state.projects, (item, i) => `
      <div class="builder-card" data-list="projects" data-index="${i}">
        <div class="builder-card__head">
          <span>Project ${i + 1}</span>
          ${cardActionsHtml("projects", i, state.projects.length, true)}
        </div>
        <div class="builder-grid">
          <label class="form-field"><span>Project name</span><input type="text" data-field="title" value="${escapeAttr(item.title)}" placeholder="e.g. Realtime Order Tracker"></label>
          <label class="form-field"><span>Tech stack</span><input type="text" data-field="tech" value="${escapeAttr(item.tech)}" placeholder="e.g. TypeScript, PostgreSQL, Redis"></label>
          <label class="form-field builder-span-2"><span>Description</span>
            <textarea rows="2" data-field="description" placeholder="Short summary of what you built and its measurable result">${escapeAttr(item.description)}</textarea>
          </label>
        </div>
      </div>
    `);

    renderList("bSkillsList", state.skills, (item, i) => `
      <div class="builder-card" data-list="skills" data-index="${i}">
        <div class="builder-card__head">
          <span>Skill group ${i + 1}</span>
          ${cardActionsHtml("skills", i, state.skills.length, state.skills.length > 1)}
        </div>
        <div class="builder-grid">
          <label class="form-field"><span>Category</span><input type="text" data-field="category" value="${escapeAttr(item.category)}" placeholder="e.g. Backend &amp; APIs"></label>
          <label class="form-field"><span>Skills (comma separated)</span><input type="text" data-field="items" value="${escapeAttr(item.items)}" placeholder="e.g. Node.js, PostgreSQL, Docker"></label>
        </div>
      </div>
    `);
  }

  function autoResizeTextareas() {
    viewBuilder.querySelectorAll("textarea").forEach((ta) => {
      ta.style.height = "auto";
      ta.style.height = `${Math.max(ta.scrollHeight + 2, 68)}px`;
    });
  }

  function fitPreview() {
    if (!previewStage || !previewSheet || !previewPaper || viewBuilder.hidden) return;
    const availableW = previewStage.clientWidth - 24;
    const paperW = previewPaper.offsetWidth;
    if (availableW <= 0 || paperW <= 0) return;
    const scale = Math.min(1, availableW / paperW);
    previewPaper.style.setProperty("--builder-scale", String(scale));
    previewSheet.style.width = `${Math.floor(paperW * scale)}px`;
    previewSheet.style.height = `${Math.ceil(previewPaper.offsetHeight * scale)}px`;
    const pageEl = document.getElementById("builderPageEstimate");
    if (pageEl) {
      const a4H = paperW * (297 / 210);
      const pages = Math.max(1, Math.ceil((previewPaper.scrollHeight - 4) / a4H));
      pageEl.textContent = pages === 1 ? "1 page" : `${pages} pages`;
      pageEl.classList.toggle("is-multi", pages > 1);
    }
  }

  function renderPreview() {
    if (!previewPaper) return;
    const data = buildCvDataFromState(state);
    const hasAnyInput = Boolean(
      data.name || data.title || data.summary || data.contact.email || data.contact.phone ||
      data.contact.linkedin || data.contact.github || data.contact.portfolio || data.links.length ||
      data.experience.length || data.education.length || data.projects.length || data.skills.length
    );

    const previewData = hasAnyInput ? data : {
      fromBuilder: true,
      name: "Your Name",
      title: "Target Role Headline",
      contact: { email: "you@example.com", phone: "+20 10 1234 5678", linkedin: "linkedin.com/in/yourprofile" },
      summary: "Concise 2-3 sentence summary highlighting your core experience and strengths.",
      skills: [{ category: "Core Skills", items: ["Skill 1", "Skill 2", "Skill 3"] }],
      experience: [{ role: "Role Title", company: "Company", dates: "2022 – Present", bullets: ["Key measurable achievement or impact."] }],
      education: [{ degree: "Degree Title", institution: "University", dates: "2018 – 2022" }],
    };

    const html = renderResume(previewData, { linksClickable: false, layout: state.layout });
    previewPaper.className = `resume-paper template-executive layout-${state.layout}`;
    previewPaper.innerHTML = html;
    syncTabCounts();
    autoResizeTextareas();
    requestAnimationFrame(fitPreview);
  }

  for (const [id, key] of scalarFieldMap) {
    const input = document.getElementById(id);
    if (!input) continue;
    input.addEventListener("input", () => {
      state[key] = input.value;
      saveState();
      renderPreview();
    });
  }

  viewBuilder.addEventListener("input", (e) => {
    const card = e.target.closest(".builder-card[data-list]");
    if (!card) return;
    const listName = card.dataset.list;
    const index = Number(card.dataset.index);
    const field = e.target.dataset.field;
    if (!state[listName] || !state[listName][index] || !field) return;
    state[listName][index][field] = e.target.value;
    saveState();
    renderPreview();
  });

  viewBuilder.addEventListener("change", (e) => {
    const card = e.target.closest(".builder-card[data-list]");
    if (!card || e.target.tagName !== "SELECT") return;
    const listName = card.dataset.list;
    const index = Number(card.dataset.index);
    const field = e.target.dataset.field;
    if (!state[listName] || !state[listName][index] || !field) return;
    state[listName][index][field] = e.target.value;
    saveState();
    renderPreview();
  });

  viewBuilder.querySelector(".builder-tabs")?.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const idx = TAB_ORDER.indexOf(activeTab);
    const nextIdx = e.key === "ArrowRight"
      ? (idx + 1) % TAB_ORDER.length
      : (idx - 1 + TAB_ORDER.length) % TAB_ORDER.length;
    setActiveTab(TAB_ORDER[nextIdx]);
    viewBuilder.querySelector(`[data-builder-tab="${TAB_ORDER[nextIdx]}"]`)?.focus();
    e.preventDefault();
  });

  viewBuilder.addEventListener("click", (e) => {
    const tabBtn = e.target.closest("[data-builder-tab]");
    if (tabBtn) {
      setActiveTab(tabBtn.dataset.builderTab);
      return;
    }

    const layoutBtn = e.target.closest("[data-builder-layout]");
    if (layoutBtn) {
      state.layout = layoutBtn.dataset.builderLayout;
      saveState();
      syncLayoutButtons();
      renderPreview();
      return;
    }

    const moveBtn = e.target.closest("[data-move]");
    if (moveBtn) {
      const listName = moveBtn.dataset.list;
      const index = Number(moveBtn.dataset.index);
      const dir = moveBtn.dataset.move === "up" ? -1 : 1;
      const list = state[listName];
      const target = index + dir;
      if (Array.isArray(list) && target >= 0 && target < list.length) {
        [list[index], list[target]] = [list[target], list[index]];
        saveState();
        renderAllLists();
        renderPreview();
      }
      return;
    }

    const removeBtn = e.target.closest("[data-remove]");
    if (removeBtn) {
      const listName = removeBtn.dataset.remove;
      const index = Number(removeBtn.dataset.index);
      if (Array.isArray(state[listName])) {
        state[listName].splice(index, 1);
        saveState();
        renderAllLists();
        renderPreview();
      }
    }
  });

  document.getElementById("bAddLinkBtn")?.addEventListener("click", () => {
    state.links.push({ label: "", url: "" });
    saveState();
    renderAllLists();
  });
  document.getElementById("bAddExperienceBtn")?.addEventListener("click", () => {
    state.experience.push({ role: "", company: "", dates: "", kind: "industry", bullets: "" });
    saveState();
    renderAllLists();
  });
  document.getElementById("bAddEducationBtn")?.addEventListener("click", () => {
    state.education.push({ degree: "", institution: "", dates: "", details: "" });
    saveState();
    renderAllLists();
  });
  document.getElementById("bAddProjectBtn")?.addEventListener("click", () => {
    state.projects.push({ title: "", tech: "", description: "" });
    saveState();
    renderAllLists();
  });
  document.getElementById("bAddSkillBtn")?.addEventListener("click", () => {
    state.skills.push({ category: "", items: "" });
    saveState();
    renderAllLists();
  });

  prevTabBtn?.addEventListener("click", () => {
    const idx = TAB_ORDER.indexOf(activeTab);
    if (idx > 0) setActiveTab(TAB_ORDER[idx - 1]);
  });
  nextTabBtn?.addEventListener("click", () => {
    const idx = TAB_ORDER.indexOf(activeTab);
    if (idx < TAB_ORDER.length - 1) setActiveTab(TAB_ORDER[idx + 1]);
  });

  document.getElementById("builderBackBtn")?.addEventListener("click", () => onBack?.());

  document.getElementById("builderResetBtn")?.addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Clear builder form?",
      message: "This clears all fields in the CV Builder so you can start fresh.",
      confirmLabel: "Clear form",
    });
    if (!ok) return;
    state = defaultBuilderState();
    saveState();
    syncScalarsToDom();
    syncLayoutButtons();
    renderAllLists();
    renderPreview();
    setActiveTab("basics", { immediate: true });
    showToast("CV Builder cleared.");
  });

  function requireName() {
    const data = buildCvDataFromState(state);
    const nameInput = document.getElementById("bName");
    if (!data.name) {
      setActiveTab("basics", { immediate: true });
      if (nameInput) {
        nameInput.setAttribute("aria-invalid", "true");
        nameInput.classList.add("is-invalid");
        nameInput.scrollIntoView({ behavior: "smooth", block: "center" });
        nameInput.addEventListener("input", () => {
          nameInput.removeAttribute("aria-invalid");
          nameInput.classList.remove("is-invalid");
        }, { once: true });
      }
      showToast("Enter your full name to continue.", true);
      return null;
    }
    return data;
  }

  document.getElementById("builderFinishBtn")?.addEventListener("click", () => {
    const data = requireName();
    if (!data) return;
    onFinish?.(data, builderCvToPlainText(data));
  });

  document.getElementById("builderDownloadPdfBtn")?.addEventListener("click", () => {
    const data = requireName();
    if (!data) return;
    onDownloadPdf?.(data, builderCvToPlainText(data));
  });

  document.getElementById("builderTailorBtn")?.addEventListener("click", () => {
    const data = requireName();
    if (!data) return;
    onTailor?.(data, builderCvToPlainText(data));
  });

  if (previewStage && "ResizeObserver" in window) {
    const ro = new ResizeObserver(fitPreview);
    ro.observe(previewStage);
    if (previewPaper) ro.observe(previewPaper);
  } else {
    window.addEventListener("resize", fitPreview);
  }
  document.fonts?.ready.then(() => requestAnimationFrame(fitPreview));

  syncScalarsToDom();
  syncLayoutButtons();
  renderAllLists();
  setActiveTab("basics", { immediate: true });
  renderPreview();

  return {
    open() {
      syncScalarsToDom();
      syncLayoutButtons();
      renderAllLists();
      renderPreview();
      requestAnimationFrame(fitPreview);
    },
    loadFromCvData(data) {
      state = cvDataToBuilderState(data);
      saveState();
      syncScalarsToDom();
      syncLayoutButtons();
      renderAllLists();
      setActiveTab("basics", { immediate: true });
      renderPreview();
      requestAnimationFrame(fitPreview);
    },
    fitPreview,
  };
}

const BUILDER_STORAGE_KEY = "cvtailor-builder-draft-v1";
const TAB_ORDER = ["basics", "links", "experience", "education", "skills"];

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

export function buildCvDataFromState(state = {}) {
  const s = state || {};
  const links = (Array.isArray(s.links) ? s.links : [])
    .map((item) => ({ label: cleanStr(item?.label), url: cleanStr(item?.url) }))
    .filter((item) => item.url);

  const experience = (Array.isArray(s.experience) ? s.experience : [])
    .map((item) => ({
      role: cleanStr(item?.role),
      company: cleanStr(item?.company),
      dates: cleanStr(item?.dates),
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
      dates: cleanStr(item?.dates),
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
        : String(item?.items || "").split(",").map((x) => x.trim()).filter(Boolean),
    }))
    .filter((item) => item.items.length > 0);

  const layoutKey = ["chronological", "hybrid", "technical", "academic"].includes(s.layout)
    ? s.layout
    : "chronological";

  return {
    name: cleanStr(s.name),
    title: cleanStr(s.title),
    layout: {
      recommended: layoutKey,
      reason: "Selected in CV Builder.",
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

export function initCvBuilder({ renderResume, onFinish, onTailor, onBack, confirmDialog, showToast }) {
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
  }

  function setActiveTab(tab) {
    if (!TAB_ORDER.includes(tab)) return;
    activeTab = tab;
    viewBuilder.querySelectorAll("[data-builder-tab]").forEach((btn) => {
      const active = btn.dataset.builderTab === tab;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", String(active));
    });
    viewBuilder.querySelectorAll("[data-builder-pane]").forEach((pane) => {
      pane.hidden = pane.dataset.builderPane !== tab;
    });
    const idx = TAB_ORDER.indexOf(tab);
    if (prevTabBtn) prevTabBtn.hidden = idx === 0;
    if (nextTabBtn) nextTabBtn.hidden = idx === TAB_ORDER.length - 1;
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
          <button type="button" class="builder-remove-btn" data-remove="links" data-index="${i}">Remove</button>
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
          ${state.experience.length > 1 ? `<button type="button" class="builder-remove-btn" data-remove="experience" data-index="${i}">Remove</button>` : ""}
        </div>
        <div class="builder-grid">
          <label class="form-field"><span>Job title</span><input type="text" data-field="role" value="${escapeAttr(item.role)}" placeholder="e.g. Software Engineer"></label>
          <label class="form-field"><span>Company</span><input type="text" data-field="company" value="${escapeAttr(item.company)}" placeholder="e.g. Acme Corp"></label>
          <label class="form-field"><span>Dates</span><input type="text" data-field="dates" value="${escapeAttr(item.dates)}" placeholder="e.g. Jan 2023 - Present"></label>
          <label class="form-field"><span>Category</span>
            <select data-field="kind">
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
          ${state.education.length > 1 ? `<button type="button" class="builder-remove-btn" data-remove="education" data-index="${i}">Remove</button>` : ""}
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
          <button type="button" class="builder-remove-btn" data-remove="projects" data-index="${i}">Remove</button>
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
          ${state.skills.length > 1 ? `<button type="button" class="builder-remove-btn" data-remove="skills" data-index="${i}">Remove</button>` : ""}
        </div>
        <div class="builder-grid">
          <label class="form-field"><span>Category</span><input type="text" data-field="category" value="${escapeAttr(item.category)}" placeholder="e.g. Backend &amp; APIs"></label>
          <label class="form-field"><span>Skills (comma separated)</span><input type="text" data-field="items" value="${escapeAttr(item.items)}" placeholder="e.g. Node.js, PostgreSQL, Docker"></label>
        </div>
      </div>
    `);
  }

  function fitPreview() {
    if (!previewStage || !previewSheet || !previewPaper || viewBuilder.hidden) return;
    const availableW = previewStage.clientWidth - 24;
    const paperW = previewPaper.offsetWidth;
    if (availableW <= 0 || paperW <= 0) return;
    const scale = Math.min(1, availableW / paperW);
    previewPaper.style.transform = `scale(${scale})`;
    previewSheet.style.width = `${Math.round(paperW * scale)}px`;
    previewSheet.style.height = `${Math.round(previewPaper.offsetHeight * scale)}px`;
  }

  function renderPreview() {
    if (!previewPaper) return;
    const data = buildCvDataFromState(state);
    const hasAnyInput = Boolean(
      data.name || data.title || data.summary || data.contact.email || data.contact.phone ||
      data.experience.length || data.education.length || data.projects.length || data.skills.length
    );

    const previewData = hasAnyInput ? data : {
      name: "Your Name",
      title: "Target Role Headline",
      contact: { email: "you@example.com", phone: "+20 10 1234 5678", linkedin: "linkedin.com/in/yourprofile" },
      summary: "Concise 2-3 sentence summary highlighting your core experience and strengths.",
      skills: [{ category: "Core Skills", items: ["Skill 1", "Skill 2", "Skill 3"] }],
      experience: [{ role: "Role Title", company: "Company", dates: "2022 - Present", bullets: ["Key measurable achievement or impact."] }],
      education: [{ degree: "Degree Title", institution: "University", dates: "2018 - 2022" }],
    };

    const html = renderResume(previewData, { linksClickable: false, layout: state.layout });
    const tpl = document.createElement("template");
    tpl.innerHTML = html;
    if (hasAnyInput) {
      tpl.content.querySelectorAll(".cv-placeholder").forEach((node) => node.remove());
      tpl.content.querySelectorAll(".cv-contact-item, .cv-bullets > li").forEach((node) => {
        if (!node.textContent.trim()) node.remove();
      });
      tpl.content.querySelectorAll(".cv-section").forEach((sec) => {
        if (![...sec.children].some((c) => !c.classList.contains("cv-section-title") && c.textContent.trim())) sec.remove();
      });
    }
    previewPaper.className = `resume-paper template-executive layout-${state.layout}`;
    previewPaper.replaceChildren(tpl.content);
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
    setActiveTab("basics");
    showToast("CV Builder cleared.");
  });

  function requireName() {
    const data = buildCvDataFromState(state);
    if (!data.name) {
      setActiveTab("basics");
      const nameInput = document.getElementById("bName");
      nameInput?.focus();
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

  document.getElementById("builderTailorBtn")?.addEventListener("click", () => {
    const data = requireName();
    if (!data) return;
    onTailor?.(data, builderCvToPlainText(data));
  });

  if (previewStage && "ResizeObserver" in window) {
    new ResizeObserver(fitPreview).observe(previewStage);
  } else {
    window.addEventListener("resize", fitPreview);
  }

  syncScalarsToDom();
  syncLayoutButtons();
  renderAllLists();
  setActiveTab("basics");
  renderPreview();

  return {
    open() {
      syncScalarsToDom();
      syncLayoutButtons();
      renderAllLists();
      renderPreview();
      requestAnimationFrame(fitPreview);
    },
    fitPreview,
  };
}

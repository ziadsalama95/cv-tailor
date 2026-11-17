(function () {
  "use strict";

  const SECTIONS = ["summary", "skills", "experience", "projects", "education"];

  const SHARED_TITLES = {
    highlights: "Selected Achievements",
    research: "Research Experience",
    publications: "Publications",
    teaching: "Teaching Experience",
    certifications: "Certifications",
    awards: "Awards",
  };

  const LAYOUTS = {
    chronological: {
      key: "chronological",
      name: "Career",
      tagline: "A focused career story",
      order: ["summary", "experience", "education", "skills", "certifications", "projects"],
      titles: {
        summary: "Summary",
        experience: "Experience",
        education: "Education",
        skills: "Skills",
        projects: "Projects",
        ...SHARED_TITLES,
      },
    },
    hybrid: {
      key: "hybrid",
      name: "Skills",
      tagline: "Strengths backed by achievements",
      order: ["summary", "skills", "highlights", "experience", "education", "certifications", "projects"],
      titles: {
        summary: "Summary",
        skills: "Core Skills",
        experience: "Experience",
        projects: "Projects",
        education: "Education",
        ...SHARED_TITLES,
      },
    },
    technical: {
      key: "technical",
      name: "Portfolio",
      tagline: "Projects and practical expertise",
      order: ["skills", "projects", "experience", "education", "certifications"],
      titles: {
        summary: "Summary",
        skills: "Technical Skills",
        projects: "Selected Projects",
        experience: "Experience",
        education: "Education",
        ...SHARED_TITLES,
      },
    },
    academic: {
      key: "academic",
      name: "Academic",
      tagline: "Education, research and teaching",
      order: ["education", "research", "publications", "teaching", "experience", "projects", "skills", "awards"],
      titles: {
        summary: "Research Profile",
        education: "Education",
        projects: "Projects",
        experience: "Additional Experience",
        skills: "Technical & Research Skills",
        ...SHARED_TITLES,
      },
    },
  };

  const DEFAULT_LAYOUT = "chronological";

  function adapt(data, key) {
    const copy = JSON.parse(JSON.stringify(data));
    const profile = data.layoutProfiles?.[key];
    if (profile && typeof profile === "object") {
      if (typeof profile.title === "string" && profile.title.trim()) copy.title = profile.title;
      if (typeof profile.summary === "string" && profile.summary.trim()) copy.summary = profile.summary;
    }
    const experience = Array.isArray(copy.experience) ? copy.experience : [];
    if (key === "chronological" && experience.length >= 2) copy.projects = [];
    if (key === "hybrid") {
      if (!profile?.summary) copy.summary = "";
      copy.highlights = experience.flatMap(entry => (entry.bullets || []).filter(b => typeof b === "string" && b.trim() && !b.includes("["))
        .slice(0, 1).map(b => `${b} (${[entry.role, entry.company].filter(Boolean).join(", ")})`)).slice(0, 3);
      // Evidence sits above the dated history without being repeated below it.
      let promoted = 0;
      for (const entry of experience) {
        const bullets = (entry.bullets || []).filter(b => typeof b === "string" && b.trim() && !b.includes("["));
        entry.bullets = (bullets.length && promoted++ < 3 ? bullets.slice(1) : bullets).slice(0, 2);
      }
      copy.projects = experience.length ? [] : copy.projects;
    }
    if (key === "technical") {
      copy.summary = "";
      for (const entry of experience) entry.bullets = (entry.bullets || []).slice(0, 2);
      if (!profile?.title) copy.title = (copy.skills || []).slice(0, 3).map(s => s.category).filter(Boolean).join(" · ") || copy.title;
    }
    if (key === "academic") {
      copy.summary = "";
      copy.title = "";
      // Only explicitly classified roles move into specialist sections.
      copy.research = experience.filter(e => e.kind === "research");
      copy.teaching = experience.filter(e => e.kind === "teaching");
      copy.experience = experience.filter(e => !["research", "teaching"].includes(e.kind));
    }
    return copy;
  }
  const ORDER = ["chronological", "hybrid", "technical", "academic"];

  function get(key) {
    return LAYOUTS[key] || LAYOUTS[DEFAULT_LAYOUT];
  }

  function list() {
    return ORDER.map((key) => LAYOUTS[key]);
  }

  /** The heading a given section carries under a given layout. */
  function titleFor(layoutKey, section) {
    return get(layoutKey).titles[section] || "";
  }

  function knownTitles(section) {
    return ORDER.map((key) => LAYOUTS[key].titles[section]).filter(Boolean);
  }

  const ACADEMIC_RE = /\b(professor|lecturer|faculty|tenure|postdoc|post-doctoral|ph\.?d|doctoral|dissertation|research (?:scientist|fellow|associate|assistant|group)|principal investigator|teaching (?:fellow|assistant)|curriculum|publication|peer[- ]reviewed|grant funding|academia|university department)\b/i;
  const TECHNICAL_RE = /\b(engineer|developer|programmer|software|data scien|machine learning|deep learning|\bml\b|\bai\b|devops|\bsre\b|full[- ]?stack|back[- ]?end|front[- ]?end|mobile developer|android|ios|cloud|kubernetes|security engineer|qa engineer|analyst|designer|ux|ui)\b/i;

  const count = (value) => (Array.isArray(value) ? value.length : 0);

  function recommend({ jobTitle = "", jobDescription = "", data = null } = {}) {
    const role = String(jobTitle || "").trim();
    const haystack = `${role} ${String(jobDescription || "").slice(0, 4000)}`;
    const roleLabel = role ? `“${role}”` : "this role";

    const experience = count(data && data.experience);
    const projects = count(data && data.projects);
    const skills = count(data && data.skills);

    if (ACADEMIC_RE.test(haystack)) {
      return {
        key: "academic",
        reason: `${roleLabel} reads as a research or teaching post, and those are assessed on the qualification first — this puts your degrees and publications above your appointments.`,
      };
    }

    if (experience <= 1 && projects >= 1) {
      const key = TECHNICAL_RE.test(haystack) ? "technical" : "hybrid";
      return {
        key,
        reason: `With ${experience === 0 ? "no" : "one"} role on the résumé and ${projects} project${projects === 1 ? "" : "s"}, your strongest evidence isn't a job title — this leads with what you can do and what you've built.`,
      };
    }

    if (TECHNICAL_RE.test(haystack) && projects >= 2) {
      return {
        key: "technical",
        reason: `${roleLabel} is a technical role and you have ${projects} projects worth showing — this puts your stack and your portfolio ahead of the job history.`,
      };
    }

    if (TECHNICAL_RE.test(haystack) && skills >= 3) {
      return {
        key: "hybrid",
        reason: `${roleLabel} is screened on the toolset as much as the titles, so your ${skills} skill groups are promoted above the experience — the history stays underneath, dated and intact.`,
      };
    }

    return {
      key: "chronological",
      reason: experience >= 2
        ? `You have ${experience} roles in a clear sequence, which is exactly what recruiters and parsers read fastest — recent experience leads.`
        : `The safest default for ${roleLabel}: recent experience leads, and every applicant tracking system parses it cleanly.`,
    };
  }

  window.CvLayouts = {
    LAYOUTS, DEFAULT_LAYOUT, SECTIONS, order: ORDER,
    get, list, titleFor, knownTitles, recommend, adapt,
  };
})();

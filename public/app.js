// app.js - CV Tailor AI 2.0 Executive Engine & Smooth Progress Controller
import { createLiveResume } from "./live-resume.js";
import { initCvBuilder } from "./cv-builder.js";

const el = (id) => document.getElementById(id);

const VISITOR_ID_KEY = "cvtailor-visitor-id";
const SESSION_ID_KEY = "cvtailor-session-id";
const VISIT_COUNT_KEY = "cvtailor-visit-count";
const FIRST_SEEN_KEY = "cvtailor-first-seen";

let fallbackSessionId = null;
function getOrCreateSessionId() {
  if (fallbackSessionId) return fallbackSessionId;
  try {
    let id = sessionStorage.getItem(SESSION_ID_KEY);
    if (!id) {
      id = ((crypto.randomUUID && crypto.randomUUID()) || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`).slice(0, 8);
      sessionStorage.setItem(SESSION_ID_KEY, id);
    }
    fallbackSessionId = id;
    return id;
  } catch (e) {
    fallbackSessionId = ((crypto.randomUUID && crypto.randomUUID()) || `${Date.now().toString(36)}`).slice(0, 8);
    return fallbackSessionId;
  }
}

function getOrCreateVisitorId() {
  try {
    let id = localStorage.getItem(VISITOR_ID_KEY);
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(VISITOR_ID_KEY, id);
    }
    return id;
  } catch (e) {
    return "unknown"; // private-browsing / storage disabled - still logs, just without persistence
  }
}

function bumpVisitCount() {
  try {
    const prev = parseInt(localStorage.getItem(VISIT_COUNT_KEY) || "0", 10) || 0;
    const next = prev + 1;
    localStorage.setItem(VISIT_COUNT_KEY, String(next));
    let firstSeen = localStorage.getItem(FIRST_SEEN_KEY);
    if (!firstSeen) {
      firstSeen = new Date().toISOString();
      localStorage.setItem(FIRST_SEEN_KEY, firstSeen);
    }
    return { visitCount: next, isNewVisitor: prev === 0, firstSeen };
  } catch (e) {
    return { visitCount: 1, isNewVisitor: true, firstSeen: new Date().toISOString() };
  }
}

function getUtmParams() {
  try {
    const params = new URLSearchParams(location.search);
    const utm = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((k) => {
      if (params.get(k)) utm[k] = params.get(k);
    });
    return utm;
  } catch (e) {
    return {};
  }
}

function getVisitorContext() {
  const { visitCount, isNewVisitor, firstSeen } = bumpVisitCount();
  let connectionType = null;
  try {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (c) connectionType = c.effectiveType || null;
  } catch (e) {
    /* Network Information API isn't available everywhere - non-fatal */
  }
  let timezone = null;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (e) {
    /* non-fatal */
  }
  return {
    visitorId: getOrCreateVisitorId(),
    isNewVisitor,
    visitCount,
    firstSeen,
    timezone,
    timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
    language: navigator.language || null,
    languages: (navigator.languages || []).join(", ") || null,
    screen: screen ? `${screen.width}x${screen.height}` : null,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    devicePixelRatio: window.devicePixelRatio || 1,
    platform: navigator.platform || null,
    userAgent: navigator.userAgent || null,
    hardwareConcurrency: navigator.hardwareConcurrency || null,
    deviceMemory: navigator.deviceMemory || null,
    isTouchDevice: "ontouchstart" in window || navigator.maxTouchPoints > 0,
    prefersDarkMode: !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches),
    connectionType,
    referrer: document.referrer || null,
    pageUrl: location.href,
    utm: getUtmParams(),
  };
}

let cachedVisitorContext = null;
function currentVisitorContext() {
  if (!cachedVisitorContext) cachedVisitorContext = getVisitorContext();
  return cachedVisitorContext;
}

(function logVisitOnce() {
  try {
    fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentVisitorContext()),
      keepalive: true,
    }).catch(() => {});
  } catch (e) {
    /* non-fatal */
  }
})();

const THEME_STORAGE_KEY = "cvtailor-theme";
const themeToggleBtn = el("themeToggleBtn");

function getSiteTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}
function setSiteTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch (e) { /* private-browsing etc. - non-fatal */ }
  if (themeToggleBtn) {
    themeToggleBtn.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
  }
}
if (themeToggleBtn) {
  setSiteTheme(getSiteTheme());
  themeToggleBtn.addEventListener("click", () => {
    setSiteTheme(getSiteTheme() === "dark" ? "light" : "dark");
  });
}

// Interactive hero showcase is managed in hero-lab.js.

function initButtonRipples() {
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) return;
  document.querySelectorAll(".cta, .topbar__cta").forEach((btn) => {
    btn.addEventListener("click", (evt) => {
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 1.6;
      const ripple = document.createElement("span");
      ripple.className = "ripple";
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${(evt.clientX ?? rect.left + rect.width / 2) - rect.left - size / 2}px`;
      ripple.style.top = `${(evt.clientY ?? rect.top + rect.height / 2) - rect.top - size / 2}px`;
      btn.appendChild(ripple);
      ripple.addEventListener("animationend", () => ripple.remove());
    });
  });
}
initButtonRipples();

function initScrollReveal() {
  const targets = document.querySelectorAll("[data-reveal]");
  if (!targets.length) return;
  if (!("IntersectionObserver" in window)) {
    targets.forEach((t) => t.classList.add("is-revealed"));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );
  targets.forEach((t) => observer.observe(t));
}
initScrollReveal();

// Element References
const viewInput = el("viewInput");
const viewBuilder = el("viewBuilder");
const viewProcessing = el("viewProcessing");
const viewWorkbench = el("viewWorkbench");
const siteTopbar = el("siteTopbar");

function syncHeaderHeight() {
  if (!siteTopbar) return;
  const h = siteTopbar.hidden ? 0 : siteTopbar.getBoundingClientRect().bottom + 20;
  document.documentElement.style.setProperty("--header-h", `${h}px`);
}
if (siteTopbar) {
  syncHeaderHeight();
  window.addEventListener("resize", syncHeaderHeight);
  if (window.ResizeObserver) {
    new ResizeObserver(syncHeaderHeight).observe(siteTopbar);
  }
  window.addEventListener(
    "scroll",
    () => siteTopbar.classList.toggle("is-scrolled", window.scrollY > 4),
    { passive: true }
  );
}

const cvDropZone = el("cvDropZone");
const cvFile = el("cvFile");
const cvFileInfo = el("cvFileInfo");
const cvFileName = el("cvFileName");
const cvFileStatus = el("cvFileStatus");
const cvFileRemove = el("cvFileRemove");
const cvText = el("cvText"); // holds extracted resume text or user-pasted text

const jobTitle = el("jobTitle");
const jobCompany = el("jobCompany");
const jobLocation = el("jobLocation");
const jobDescription = el("jobDescription");

const intensitySeg = el("intensitySeg");
const intensityHint = el("intensityHint");
const tailorBtn = el("tailorBtn");

// Processing View References
const processingMainHeading = el("processingMainHeading");
const processingStatusText = el("processingStatusText");
const btnCancelTailoring = el("btnCancelTailoring");

// Workbench References
const cvDocumentPaper = el("cvDocumentPaper");
const paperCanvas = el("paperCanvas");
const documentWorkbench = el("documentWorkbench");
const downloadPdfBtn = el("downloadPdfBtn");
const downloadPdfBtnTitle = el("downloadPdfBtnTitle");
const btnStartOver = el("btnStartOver");

// Confirmation dialog (used anywhere an action would silently discard work)
const confirmModal = el("confirmModal");
const confirmModalBackdrop = el("confirmModalBackdrop");
const confirmModalTitle = el("confirmModalTitle");
const confirmModalMessage = el("confirmModalMessage");
const confirmModalCancel = el("confirmModalCancel");
const confirmModalConfirm = el("confirmModalConfirm");

function confirmDialog({ title, message, confirmLabel = "Continue", cancelLabel = "Cancel" }) {
  return new Promise((resolve) => {
    if (!confirmModal) { resolve(true); return; }

    confirmModalTitle.textContent = title;
    confirmModalMessage.textContent = message;
    confirmModalConfirm.textContent = confirmLabel;
    confirmModalCancel.textContent = cancelLabel;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    confirmModal.hidden = false;
    document.body.style.overflow = "hidden";
    Object.values(VIEW_ELS).forEach((view) => { view.inert = true; });
    if (siteTopbar) siteTopbar.inert = true;
    requestAnimationFrame(() => confirmModalCancel.focus());

    function cleanup(result) {
      confirmModal.hidden = true;
      document.body.style.overflow = previousOverflow;
      Object.values(VIEW_ELS).forEach((view) => { view.inert = false; });
      if (siteTopbar) siteTopbar.inert = false;
      previousFocus?.focus();
      confirmModalConfirm.removeEventListener("click", onConfirm);
      confirmModalCancel.removeEventListener("click", onCancel);
      confirmModalBackdrop.removeEventListener("click", onCancel);
      document.removeEventListener("keydown", onKeydown);
      resolve(result);
    }
    function onConfirm() { cleanup(true); }
    function onCancel() { cleanup(false); }
    function onKeydown(e) {
      if (e.key === "Escape") cleanup(false);
      if (e.key === "Tab") {
        e.preventDefault();
        (document.activeElement === confirmModalCancel ? confirmModalConfirm : confirmModalCancel).focus();
      }
    }

    confirmModalConfirm.addEventListener("click", onConfirm);
    confirmModalCancel.addEventListener("click", onCancel);
    confirmModalBackdrop.addEventListener("click", onCancel);
    document.addEventListener("keydown", onKeydown);
  });
}

// Formatting Tools
const btnUndo = el("btnUndo");
const btnRedo = el("btnRedo");
const btnReset = el("btnReset");

// Canvas status bar: edit status, page-fit estimate, zoom controls
const editStatusDot = el("editStatusDot");
const editStatusText = el("editStatusText");
const btnZoomOut = el("btnZoomOut");
const btnZoomIn = el("btnZoomIn");
const btnZoomReset = el("btnZoomReset");
const btnZoomFit = el("btnZoomFit");

const DEFAULT_TEMPLATE = "executive";
const MAX_CV_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

// State
let isTailoring = false;
let isProcessingFile = false;
let cvType = "text"; // "text" | "pdf-images"
let cvPagesData = [];
let cvImages = [];
let uploadedFileName = null;
let uploadedFileBase64 = null; // exact bytes of the last uploaded CV file
let uploadedFileMime = null;
let parsedCvData = null;
let pdfFontsReady = false;

let extractedCvLinks = []; // [{ text, url }]

let originalCvData = null;
let originalTemplate = DEFAULT_TEMPLATE;
let activeLayout = (window.CvLayouts && window.CvLayouts.DEFAULT_LAYOUT) || "chronological";
let layoutRecommendation = null;
let activeTailorController = null; // AbortController for the current /api/tailor request, if any

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
}

// Prepare pdfMake fonts
function ensurePdfFontsRegistered() {
  if (pdfFontsReady || !window.pdfMake) return;
  if (window.PDF_STANDARD_FONTS_VFS) {
    window.pdfMake.vfs = Object.assign({}, window.pdfMake.vfs || {}, window.PDF_STANDARD_FONTS_VFS);
  }
  if (window.PDF_BRAND_FONTS_VFS) {
    window.pdfMake.vfs = Object.assign({}, window.pdfMake.vfs || {}, window.PDF_BRAND_FONTS_VFS);
  }
  if (window.PDF_ICON_FONT_VFS) {
    window.pdfMake.vfs = Object.assign({}, window.pdfMake.vfs || {}, window.PDF_ICON_FONT_VFS);
  }
  window.pdfMake.fonts = {
    Times: { normal: "Times-Roman", bold: "Times-Bold", italics: "Times-Italic", bolditalics: "Times-BoldItalic" },
    Helvetica: { normal: "Helvetica", bold: "Helvetica-Bold", italics: "Helvetica-Oblique", bolditalics: "Helvetica-BoldOblique" },
  };
  if (window.PDF_BRAND_FONTS_VFS) {
    Object.assign(window.pdfMake.fonts, {
      PTSerif: {
        normal: "PTSerif-Regular.ttf",
        bold: "PTSerif-Bold.ttf",
        italics: "PTSerif-Italic.ttf",
        bolditalics: "PTSerif-BoldItalic.ttf",
      },
      PTSans: {
        normal: "PTSans-Regular.ttf",
        bold: "PTSans-Bold.ttf",
        italics: "PTSans-Italic.ttf",
        bolditalics: "PTSans-BoldItalic.ttf",
      },
      Barlow: {
        normal: "Barlow-Regular.ttf",
        bold: "Barlow-Bold.ttf",
        italics: "Barlow-Italic.ttf",
        bolditalics: "Barlow-BoldItalic.ttf",
      },
    });
  }
  if (window.PDF_ICON_FONT_VFS) {
    window.pdfMake.fonts.CvIcons = {
      normal: "CVIcons-Regular.ttf",
      bold: "CVIcons-Regular.ttf",
      italics: "CVIcons-Regular.ttf",
      bolditalics: "CVIcons-Regular.ttf",
    };
  }
  pdfFontsReady = true;
}
ensurePdfFontsRegistered();

// Reuse the embedded export fonts on screen, including when Google Fonts is blocked.
if (window.PDF_BRAND_FONTS_VFS && window.FontFace) {
  const faces = [];
  for (const [family, prefix] of [["PT Serif", "PTSerif"], ["PT Sans", "PTSans"]]) {
    for (const [variant, weight, style] of [["Regular", "400", "normal"], ["Bold", "700", "normal"], ["Italic", "400", "italic"], ["BoldItalic", "700", "italic"]]) {
      const data = window.PDF_BRAND_FONTS_VFS[`${prefix}-${variant}.ttf`];
      if (!data) continue;
      const face = new FontFace(family, `url(data:font/ttf;base64,${data})`, { weight, style });
      document.fonts.add(face);
      faces.push(face.load());
    }
  }
  Promise.allSettled(faces).then(() => scheduleLayoutRealPages());
}

const VIEW_ELS = { viewInput, viewBuilder, viewProcessing, viewWorkbench };
function showView(viewId) {
  const next = VIEW_ELS[viewId];
  if (!next) return;
  const current = Object.values(VIEW_ELS).find((v) => !v.hidden);

  const reveal = () => {
    Object.entries(VIEW_ELS).forEach(([id, v]) => {
      v.hidden = id !== viewId;
      v.removeAttribute("data-transition");
    });
    if (siteTopbar) siteTopbar.hidden = viewId === "viewProcessing";
    document.body.classList.toggle("no-header", !!(siteTopbar && siteTopbar.hidden));
    document.body.classList.toggle("on-workbench", viewId === "viewWorkbench");
    const skipLink = document.querySelector(".skip-link");
    skipLink.href = viewId === "viewWorkbench" ? "#cvDocumentPaper" : viewId === "viewProcessing" ? "#processingMainHeading" : viewId === "viewBuilder" ? "#builderHeading" : "#tailorWorkspace";
    skipLink.textContent = viewId === "viewWorkbench" ? "Skip to resume editor" : viewId === "viewProcessing" ? "Skip to processing status" : viewId === "viewBuilder" ? "Skip to CV builder" : "Skip to resume workspace";
    syncHeaderHeight();
    void next.offsetWidth;
    next.setAttribute("data-transition", "enter");
    window.scrollTo({ top: 0, behavior: "smooth" });
    const focusTarget = next.querySelector("h1, h2");
    if (focusTarget) {
      focusTarget.setAttribute("tabindex", "-1");
      focusTarget.focus({ preventScroll: true });
    }
    if (viewId === "viewWorkbench") requestAnimationFrame(() => fitToView());
    if (viewId === "viewBuilder") requestAnimationFrame(() => cvBuilder?.fitPreview());
  };

  // Switch immediately so cancellation cannot race a delayed outgoing animation.
  reveal();
}

if (btnCancelTailoring) {
  btnCancelTailoring.addEventListener("click", () => {
    if (activeTailorController) activeTailorController.abort();
  });
}

let navigationConfirmationOpen = false;
async function goToMainPage() {
  if (navigationConfirmationOpen) return;
  const hasDraft = viewWorkbench && !viewWorkbench.hidden && !!parsedCvData;
  if (hasDraft || isTailoring) {
    navigationConfirmationOpen = true;
    let ok;
    try {
    ok = await confirmDialog({
      title: isTailoring ? "Leave this resume?" : "Leave your draft?",
      message: isTailoring
        ? "This will stop tailoring. Your resume and job details will stay in the form."
        : "Your draft won’t be saved when you leave. Download it first if you want to keep it. Your resume and job details will stay in the form.",
      confirmLabel: isTailoring ? "Stop & leave" : "Leave draft",
    });
    } finally { navigationConfirmationOpen = false; }
    if (!ok) return;
  }
  if (activeTailorController) activeTailorController.abort();
  stopMeasuredProgress();
  showView("viewInput");
}

if (btnStartOver) {
  btnStartOver.addEventListener("click", goToMainPage);
}

const brandLogo = el("brandLogo");
if (brandLogo) {
  const activateBrandLogo = () => {
    if (viewInput && !viewInput.hidden) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    goToMainPage();
  };
  brandLogo.addEventListener("click", activateBrandLogo);
  brandLogo.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activateBrandLogo();
    }
  });
}

const REASONING_EFFORT_BY_INTENSITY = { light: "none", balanced: "none", aggressive: "none" };

const MAX_TOKENS_BY_INTENSITY = { light: 8192, balanced: 12288, aggressive: 16384 };
const INTENSITY_HINT = {
  light: "Small wording changes that keep your original voice.",
  balanced: "Sharper wording that brings relevant skills and achievements forward.",
  aggressive: "A fresh rewrite built around your experience and the role.",
};
function updateIntensityHint(val) {
  if (intensityHint) intensityHint.textContent = INTENSITY_HINT[val] || "";
}
updateIntensityHint(intensitySeg.dataset.value);

// Segmented Controls
document.querySelectorAll(".segmented-control").forEach((ctrl) => {
  ctrl.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-val]");
    if (!btn) return;
    ctrl.querySelectorAll("button").forEach((b) => {
      b.classList.remove("active");
      b.setAttribute("aria-pressed", "false");
      if (b.hasAttribute("aria-checked")) b.setAttribute("aria-checked", "false");
    });
    btn.classList.add("active");
    btn.setAttribute("aria-pressed", "true");
    if (btn.hasAttribute("aria-checked")) btn.setAttribute("aria-checked", "true");
    ctrl.dataset.value = btn.dataset.val;

    if (ctrl.id === "intensitySeg") {
      updateIntensityHint(btn.dataset.val);
    }
  });
});

const FONT_VARIANTS = {
  executive: {
    "serif-sans": {
      css: { heading: "'PT Serif', Georgia, serif", body: "'PT Sans', -apple-system, sans-serif" },
      pdf: { headingFont: "PTSerif", bodyFont: "PTSans" },
    },
  },
};
const DEFAULT_FONT_VARIANT = { executive: "serif-sans" };
const selectedFontVariant = { ...DEFAULT_FONT_VARIANT };

function applyFontVariantToCss(template, variantKey) {
  const variant = FONT_VARIANTS[template] && FONT_VARIANTS[template][variantKey];
  if (!variant) return;
  const root = document.documentElement.style;
  if (variant.css.heading) root.setProperty("--font-tmpl-executive-heading", variant.css.heading);
  if (variant.css.body) root.setProperty("--font-tmpl-executive-body", variant.css.body);
}

function getFontVariantPdfOverride(template) {
  const variantKey = selectedFontVariant[template];
  const variant = FONT_VARIANTS[template] && FONT_VARIANTS[template][variantKey];
  return variant ? variant.pdf : {};
}

Object.keys(DEFAULT_FONT_VARIANT).forEach((template) => {
  applyFontVariantToCss(template, DEFAULT_FONT_VARIANT[template]);
});

// Drop Zone & File Upload
cvDropZone.addEventListener("click", () => cvFile.click());
cvDropZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    cvFile.click();
  }
});

["dragenter", "dragover", "dragleave", "drop"].forEach((evt) => {
  cvDropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
});
["dragenter", "dragover"].forEach((evt) => {
  cvDropZone.addEventListener(evt, () => cvDropZone.classList.add("drag-over"));
});
["dragleave", "drop"].forEach((evt) => {
  cvDropZone.addEventListener(evt, () => cvDropZone.classList.remove("drag-over"));
});

cvDropZone.addEventListener("drop", (e) => {
  if (e.dataTransfer.files.length) handleCvFile(e.dataTransfer.files[0]);
});

cvFile.addEventListener("change", () => {
  if (cvFile.files.length) handleCvFile(cvFile.files[0]);
});

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error || new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

async function handleCvFile(file) {
  if (isProcessingFile || isTailoring) return;
  const ext = file.name.split(".").pop().toLowerCase();
  uploadedFileName = file.name;
  uploadedFileMime = file.type || (ext === "pdf" ? "application/pdf" : "application/octet-stream");
  markFieldValid(cvDropZone);

  if (file.size > MAX_CV_FILE_SIZE_BYTES) {
    showError(
      `That file is ${formatFileSize(file.size)}. Please upload a resume under ${formatFileSize(MAX_CV_FILE_SIZE_BYTES)}.`
    );
    removeFile();
    return;
  }

  if (ext !== "pdf" && ext !== "docx") {
    showError(ext === "doc" ? "Please save this older Word document as .docx or PDF, then upload it again." : "Please upload a PDF or Word (.docx) resume, or use Paste text.");
    removeFile();
    return;
  }

  isProcessingFile = true;
  setSourceControlsBusy(true);
  setTailorBtnBusy(true, "Reading file…");

  try {
    uploadedFileBase64 = await fileToBase64(file);
  } catch (err) {
    uploadedFileBase64 = null;
  }

  try {
    if (ext === "pdf") {
      showFileInfo(file.name, "Opening your resume…");
      await processPdf(file);
    } else {
      showFileInfo(file.name, "Reading Word document…");
      await processDocx(file);
    }
  } catch (err) {
    const label = ext === "pdf" ? "PDF" : "Word document";
    console.error(`${label} Read Error:`, err);
    reportClientActivity("file_read_failed", err);
    showError(describeFileReadError(err, ext));
    removeFile();
  } finally {
    isProcessingFile = false;
    setSourceControlsBusy(false);
    setTailorBtnBusy(false);
    updateReadiness();
  }
}

function resetExtractedLinks() {
  extractedCvLinks = [];
}

function recordExtractedLink(text, url) {
  const cleanUrl = (url || "").trim();
  if (!cleanUrl) return;
  const cleanText = (text || "").replace(/\s+/g, " ").trim();
  const already = extractedCvLinks.some(
    (l) => l.url === cleanUrl && l.text.toLowerCase() === cleanText.toLowerCase()
  );
  if (!already) extractedCvLinks.push({ text: cleanText, url: cleanUrl });
}

function describeLinksFound(baseMsg) {
  const n = extractedCvLinks.length;
  if (!n) return baseMsg;
  return `${baseMsg} · ${n} link${n === 1 ? "" : "s"} found`;
}

function formatFileSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}

function setTailorBtnBusy(busy, label) {
  tailorBtn.disabled = busy;
  tailorBtn.setAttribute("aria-busy", String(busy));
  tailorBtn.querySelector("span").textContent = busy ? label : "Tailor my resume";
}

function describeFileReadError(err, ext) {
  const raw = String((err && err.message) || err || "");
  const rawLower = raw.toLowerCase();

  if (ext === "pdf") {
    if (rawLower.includes("password") || err?.name === "PasswordException") {
      return "This PDF is password-protected. Please remove the password and re-upload it.";
    }
    if (rawLower.includes("fake worker") || rawLower.includes("worker")) {
      return "We couldn’t open this PDF. Try refreshing the page, or paste your resume text.";
    }
    if (rawLower.includes("invalid pdf") || err?.name === "InvalidPDFException") {
      return "This file doesn't look like a valid PDF. Please check the file and try again.";
    }
    if (rawLower.includes("missing pdf") || rawLower.includes("failed to fetch") || err?.name === "MissingPDFException") {
      return "The PDF couldn't be loaded. Please check your connection and try again.";
    }
    if (rawLower.includes("initializing")) {
      return "The PDF reader is still loading. Please wait a moment and try again.";
    }
    return "We couldn’t read this PDF. Please save a fresh copy and upload it again, or paste your resume text.";
  }

  if (rawLower.includes("no readable text")) {
    return "This Word document appears to be empty. Please check the file and try again.";
  }
  if (rawLower.includes("initializing")) {
    return "The Word document reader is still loading. Please wait a moment and try again.";
  }
  return "We couldn’t read this Word document. Please save a fresh copy and upload it again, or paste your resume text.";
}

// WORD (.doc/.docx) TEXT EXTRACTION via mammoth.js
async function processDocx(file) {
  if (!window.mammoth) throw new Error("Word document library initializing. Try again.");

  const arrayBuffer = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer });
  const text = (result && result.value ? result.value : "").trim();

  if (!text) throw new Error("No readable text found in this document.");

  cvText.value = text;
  cvType = "text";
  cvPagesData = [];
  cvImages = [];

  resetExtractedLinks();
  try {
    const htmlArrayBuffer = await file.arrayBuffer();
    const htmlResult = await window.mammoth.convertToHtml({ arrayBuffer: htmlArrayBuffer });
    const htmlDoc = new DOMParser().parseFromString(htmlResult && htmlResult.value ? htmlResult.value : "", "text/html");
    htmlDoc.querySelectorAll("a[href]").forEach((a) => recordExtractedLink(a.textContent, a.getAttribute("href")));
  } catch (err) {
    console.warn("Could not extract embedded links from Word document:", err);
  }

  showFileInfo(file.name, describeLinksFound("Word resume loaded"));
}

const MIN_CHARS_PER_PAGE_FOR_TEXT_MODE = 25;

async function processPdf(file) {
  if (!window.pdfjsLib) throw new Error("PDF library initializing. Try again.");

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  if (!pdf.numPages) throw new Error("This PDF appears to have no pages.");

  cvPagesData = [];
  cvImages = [];
  resetExtractedLinks();
  const scale = 1.5;
  const extractedPages = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    if (pdf.numPages > 1) {
      showFileInfo(file.name, `Opening your resume… (${i} of ${pdf.numPages})`);
    }

    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;

    const imgUrl = canvas.toDataURL("image/png");
    cvImages.push(imgUrl);
    cvPagesData.push({ imgUrl, width: viewport.width, height: viewport.height });

    // Pull the selectable text layer for this page, if any.
    let textContent = null;
    try {
      textContent = await page.getTextContent();
      const pageText = textContent.items.map((it) => it.str).join(" ").replace(/\s+/g, " ").trim();
      extractedPages.push(pageText);
    } catch {
      extractedPages.push("");
    }

    try {
      const annotations = await page.getAnnotations({ intent: "display" });
      const linkAnnots = annotations.filter((a) => a.subtype === "Link" && (a.url || a.unsafeUrl));
      if (linkAnnots.length && textContent) {
        linkAnnots.forEach((link) => {
          const url = link.url || link.unsafeUrl;
          const rect = Array.isArray(link.rect) ? link.rect : null;
          if (!rect || rect.length !== 4) {
            recordExtractedLink(url, url);
            return;
          }
          const x1 = Math.min(rect[0], rect[2]) - 1;
          const x2 = Math.max(rect[0], rect[2]) + 1;
          const y1 = Math.min(rect[1], rect[3]) - 1;
          const y2 = Math.max(rect[1], rect[3]) + 1;
          let matched = "";
          textContent.items.forEach((item) => {
            const ix = item.transform && item.transform[4];
            const iy = item.transform && item.transform[5];
            if (typeof ix === "number" && typeof iy === "number" && ix >= x1 && ix <= x2 && iy >= y1 && iy <= y2) {
              matched += item.str;
            }
          });
          recordExtractedLink(matched || url, url);
        });
      }
    } catch (err) {
      console.warn("Could not read link annotations on PDF page", i, err);
    }
  }

  const combinedText = extractedPages.join("\n\n").trim();
  const hasUsableTextLayer = combinedText.length >= MIN_CHARS_PER_PAGE_FOR_TEXT_MODE * pdf.numPages;

  if (hasUsableTextLayer) {
    cvType = "text";
    cvText.value = combinedText;
    showFileInfo(file.name, describeLinksFound(`PDF ready (${pdf.numPages} page${pdf.numPages > 1 ? "s" : ""})`));
  } else {
    cvType = "pdf-images";
    cvText.value = "";
    showFileInfo(file.name, describeLinksFound(`PDF ready (${pdf.numPages} page${pdf.numPages > 1 ? "s" : ""})`));
  }

}

// EFFICIENT SINGLE-PAGE CAROUSEL

function showFileInfo(name, statusText) {
  cvFileName.textContent = name;
  cvFileStatus.textContent = statusText;
  cvFileInfo.hidden = false;
  cvDropZone.hidden = true;
  cvText.hidden = true;
  updateReadiness();
}

function removeFile() {
  cvFile.value = "";
  cvText.value = "";
  cvImages = [];
  cvPagesData = [];
  cvType = "text";
  uploadedFileName = null;
  uploadedFileBase64 = null;
  uploadedFileMime = null;
  resetExtractedLinks();
  cvFileInfo.hidden = true;
  cvDropZone.hidden = false;
  updateReadiness();
}
cvFileRemove.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  removeFile();
});

// Workspace and workbench error banners & transient toast notifications.
function showError(msg) {
  el("workspaceErrorText").textContent = msg;
  el("workspaceError").hidden = false;
  if (!viewInput.hidden) el("workspaceError").scrollIntoView({ behavior: "smooth", block: "center" });
}

function showWorkbenchError(html) {
  el("workbenchErrorText").innerHTML = html;
  el("workbenchError").hidden = false;
}
function hideWorkbenchError() {
  el("workbenchError").hidden = true;
}

function showToast(msg, isError) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.setAttribute("role", isError ? "alert" : "status");
  toast.setAttribute("aria-live", isError ? "assertive" : "polite");
  toast.classList.toggle("toast--error", !!isError);
  toast.classList.add("show");
  clearTimeout(toast._hideTimer);
  const hide = () => toast.classList.remove("show");
  toast._hideTimer = setTimeout(hide, isError ? 6000 : 2800);
  toast.onclick = () => {
    clearTimeout(toast._hideTimer);
    hide();
  };
}

function markFieldInvalid(node) {
  if (!node || node.classList.contains("field-invalid")) return;
  node.classList.add("field-invalid");
  node.setAttribute("aria-invalid", "true");
  const error = el(node === cvDropZone || node === cvText ? "resumeError" : `${node.id}Error`);
  if (error) error.hidden = false;
  const clear = () => {
    if (node.value !== undefined && !node.value.trim()) return;
    markFieldValid(node);
    node.removeEventListener("input", clear);
    node.removeEventListener("change", clear);
  };
  node.addEventListener("input", clear);
  node.addEventListener("change", clear);
}
function markFieldValid(node) {
  if (!node) return;
  node.classList.remove("field-invalid");
  node.removeAttribute("aria-invalid");
  const error = el(node === cvDropZone || node === cvText ? "resumeError" : `${node.id}Error`);
  if (error) error.hidden = true;
}

let editHistory = [];
let initialDocumentHtml = "";
let historyIndex = -1;
let historyDebounceTimer = null;
let isRestoringHistory = false;
const HISTORY_LIMIT = 100;
const HISTORY_DEBOUNCE_MS = 400;

function resetHistory() {
  clearTimeout(historyDebounceTimer);
  editHistory = [cvDocumentPaper.innerHTML];
  initialDocumentHtml = cvDocumentPaper.innerHTML;
  historyIndex = 0;
  updateUndoRedoButtons();
}

function commitHistory() {
  if (isRestoringHistory) return;
  const current = cvDocumentPaper.innerHTML;
  if (editHistory[historyIndex] === current) return;
  editHistory = editHistory.slice(0, historyIndex + 1);
  editHistory.push(current);
  if (editHistory.length > HISTORY_LIMIT) editHistory.shift();
  historyIndex = editHistory.length - 1;
  updateUndoRedoButtons();
}

function scheduleHistoryCommit() {
  if (isRestoringHistory) return;
  clearTimeout(historyDebounceTimer);
  historyDebounceTimer = setTimeout(commitHistory, HISTORY_DEBOUNCE_MS);
  if (btnUndo) btnUndo.disabled = false;
}

function updateUndoRedoButtons() {
  if (btnUndo) btnUndo.disabled = historyIndex <= 0;
  if (btnRedo) btnRedo.disabled = historyIndex >= editHistory.length - 1;
}
updateUndoRedoButtons();

function performUndo() {
  commitHistory();
  if (historyIndex <= 0) return;
  clearTimeout(historyDebounceTimer);
  isRestoringHistory = true;
  historyIndex--;
  cvDocumentPaper.innerHTML = editHistory[historyIndex];
  restoreLayoutIdentity();
  isRestoringHistory = false;
  updateUndoRedoButtons();
  markEdited();
}

function performRedo() {
  if (historyIndex >= editHistory.length - 1) return;
  clearTimeout(historyDebounceTimer);
  isRestoringHistory = true;
  historyIndex++;
  cvDocumentPaper.innerHTML = editHistory[historyIndex];
  restoreLayoutIdentity();
  isRestoringHistory = false;
  updateUndoRedoButtons();
  markEdited();
}

cvDocumentPaper.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  const key = e.key.toLowerCase();
  if (key === "z" && e.shiftKey) {
    e.preventDefault();
    performRedo();
  } else if (key === "z") {
    e.preventDefault();
    performUndo();
  } else if (key === "y") {
    e.preventDefault();
    performRedo();
  }
});

btnUndo.addEventListener("click", () => {
  cvDocumentPaper.focus();
  performUndo();
});
btnRedo.addEventListener("click", () => {
  cvDocumentPaper.focus();
  performRedo();
});
const selectionToolbar = el("selectionToolbar");
const selBoldBtn = el("selBoldBtn");
const selLinkBtn = el("selLinkBtn");

function findLinkAncestor(node) {
  let n = node;
  while (n && n !== cvDocumentPaper) {
    if (n.nodeType === Node.ELEMENT_NODE && n.tagName === "A") return n;
    n = n.parentNode;
  }
  return null;
}

function getSelectionRangeWithinPaper() {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!cvDocumentPaper.contains(range.commonAncestorContainer)) return null;
  return range;
}

function syncBoldButtonState() {
  let isBold = false;
  try {
    isBold = document.queryCommandState("bold");
  } catch (e) {
    isBold = false;
  }
  selBoldBtn.classList.toggle("active", isBold);
  selBoldBtn.setAttribute("aria-pressed", isBold ? "true" : "false");
}

function positionFloatingElement(targetEl, rect) {
  const margin = 8;
  targetEl.style.top = `${Math.max(margin, rect.top - 10)}px`;
  const halfWidth = targetEl.offsetWidth / 2;
  const left = Math.min(
    window.innerWidth - halfWidth - margin,
    Math.max(halfWidth + margin, rect.left + rect.width / 2)
  );
  targetEl.style.left = `${left}px`;
}

function showSelectionToolbar(rect) {
  selectionToolbar.hidden = false;
  positionFloatingElement(selectionToolbar, rect);
}

function hideSelectionToolbar() {
  selectionToolbar.hidden = true;
}

document.addEventListener("selectionchange", () => {
  if (linkPopoverOpen) return; // the popover owns the floating UI while open
  if (selectionToolbar.contains(document.activeElement)) return;
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0 || document.activeElement !== cvDocumentPaper) {
    hideSelectionToolbar();
    return;
  }
  const anchor = sel.anchorNode;
  if (!anchor || !cvDocumentPaper.contains(anchor)) {
    hideSelectionToolbar();
    return;
  }
  syncBoldButtonState();
  const range = sel.getRangeAt(0);
  const hasSelectedText = !sel.isCollapsed && sel.toString().trim().length > 0;
  const caretInLink = sel.isCollapsed && !!findLinkAncestor(anchor);
  selBoldBtn.hidden = !hasSelectedText;
  el("selItalicBtn").hidden = !hasSelectedText;
  el("selClearBtn").hidden = !hasSelectedText;
  selectionToolbar.querySelector(".selection-toolbar__divider").hidden = !hasSelectedText;
  selLinkBtn.setAttribute("aria-label", caretInLink ? "Edit link" : "Insert link");
  if (!hasSelectedText && !caretInLink) {
    hideSelectionToolbar();
    return;
  }
  const rect = range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0 && !caretInLink)) {
    hideSelectionToolbar();
    return;
  }
  showSelectionToolbar(rect);
});
window.addEventListener(
  "scroll",
  (event) => {
    if (linkPopoverOpen && linkPopover.contains(event.target)) return;
    const range = getSelectionRangeWithinPaper();
    if (!selectionToolbar.hidden && range) positionFloatingElement(selectionToolbar, range.getBoundingClientRect());
  },
  true
);
window.addEventListener("resize", () => {
  hideSelectionToolbar();
});

selBoldBtn.addEventListener("mousedown", (e) => e.preventDefault());
selBoldBtn.addEventListener("click", () => {
  if (!getSelectionRangeWithinPaper() || getSelectionRangeWithinPaper().collapsed) return;
  cvDocumentPaper.focus();
  commitHistory();
  document.execCommand("bold", false, null);
  commitHistory();
  syncBoldButtonState();
});

for (const [id, command] of [["selItalicBtn", "italic"], ["selClearBtn", "removeFormat"]]) {
  const button = el(id);
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => {
    const range = getSelectionRangeWithinPaper();
    if (!range || range.collapsed) return;
    commitHistory();
    document.execCommand(command, false, null);
    commitHistory();
    markEdited();
    scheduleLayoutRealPages();
  });
}
cvDocumentPaper.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    selLinkBtn.click();
  }
});

const linkPopover = el("linkPopover");
const linkPopoverText = el("linkPopoverText");
const linkPopoverInput = el("linkPopoverInput");
const linkPopoverApply = el("linkPopoverApply");
const linkPopoverRemove = el("linkPopoverRemove");
const linkPopoverCancel = el("linkPopoverCancel");
let savedLinkRange = null;
let linkPopoverOpen = false;
linkPopover.addEventListener("keydown", (event) => {
  if (event.key === "Escape") { event.preventDefault(); closeLinkPopover(); }
  if (event.key !== "Tab") return;
  const focusable = [...linkPopover.querySelectorAll("input, button")].filter(node => !node.hidden && !node.disabled);
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

function openLinkPopover(rect, existingUrl, existingText, isEditing) {
  linkPopoverOpen = true;
  linkPopoverText.value = existingText || "";
  linkPopoverInput.value = existingUrl || "";
  linkPopoverInput.classList.remove("is-invalid");
  linkPopoverInput.removeAttribute("aria-invalid");
  el("linkPopoverError").hidden = true;
  linkPopover.setAttribute("aria-label", isEditing ? "Edit link" : "Insert link");
  linkPopoverRemove.hidden = !isEditing;
  linkPopover.hidden = false;
  const margin = 8;
  const halfWidth = linkPopover.offsetWidth / 2;
  const left = Math.min(
    window.innerWidth - halfWidth - margin,
    Math.max(halfWidth + margin, rect.left + rect.width / 2)
  );
  linkPopover.style.left = `${left}px`;
  linkPopover.style.transform = "translateX(-50%)";
  const top = Math.min(window.innerHeight - linkPopover.offsetHeight - margin, rect.bottom + 12);
  linkPopover.style.top = `${Math.max(margin, top)}px`;
  hideSelectionToolbar();
  if (existingText) {
    linkPopoverInput.focus();
    linkPopoverInput.select();
  } else {
    linkPopoverText.focus();
  }
}

function closeLinkPopover() {
  linkPopover.hidden = true;
  linkPopoverOpen = false;
  cvDocumentPaper.focus({ preventScroll: true });
  if (savedLinkRange && cvDocumentPaper.contains(savedLinkRange.commonAncestorContainer)) {
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(savedLinkRange);
  }
  savedLinkRange = null;
}

if (selLinkBtn) {
  selLinkBtn.addEventListener("mousedown", (e) => e.preventDefault());
  selLinkBtn.addEventListener("click", () => {
    const range = getSelectionRangeWithinPaper();
    const existingLink = range ? findLinkAncestor(range.startContainer) : null;
    if (!range || (range.collapsed && !existingLink)) {
      showToast("Select some text first, then click the link icon.", true);
      return;
    }
    const rect = range.getBoundingClientRect();
    savedLinkRange = range.cloneRange();
    const displayText = existingLink ? existingLink.textContent : range.toString();
    openLinkPopover(rect, existingLink ? existingLink.getAttribute("href") : "", displayText, !!existingLink);
  });
}

function applyLinkToSavedRange(url, text) {
  if (!savedLinkRange) return;
  const existingLink = findLinkAncestor(savedLinkRange.startContainer);
  commitHistory();
  if (existingLink) {
    if (text && text !== existingLink.textContent) existingLink.textContent = text;
    existingLink.setAttribute("href", url);
    existingLink.classList.add("cv-link");
    existingLink.setAttribute("target", "_blank");
    existingLink.setAttribute("rel", "noopener");
    existingLink.title = url;
  } else {
    const finalText = text || savedLinkRange.toString() || url;
    savedLinkRange.deleteContents();
    const a = document.createElement("a");
    a.setAttribute("href", url);
    a.textContent = finalText;
    a.classList.add("cv-link");
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener");
    a.title = url;
    savedLinkRange.insertNode(a);
    const sel = document.getSelection();
    const after = document.createRange();
    after.setStartAfter(a);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);
  }
  commitHistory();
  markEdited();
  scheduleLayoutRealPages();
  syncContactIconsNow();
}

function removeLinkFromSavedRange() {
  if (!savedLinkRange) return;
  const existingLink = findLinkAncestor(savedLinkRange.startContainer);
  if (!existingLink) return;
  commitHistory();
  const r = document.createRange();
  r.selectNodeContents(existingLink);
  const sel = document.getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
  document.execCommand("unlink");
  commitHistory();
  markEdited();
  scheduleLayoutRealPages();
}

if (linkPopoverApply) {
  linkPopoverApply.addEventListener("click", () => {
    const url = normalizeLinkUrl(linkPopoverInput.value.trim());
    if (!url) {
      linkPopoverInput.classList.add("is-invalid");
      linkPopoverInput.setAttribute("aria-invalid", "true");
      el("linkPopoverError").hidden = false;
      linkPopoverInput.focus();
      return;
    }
    applyLinkToSavedRange(url, linkPopoverText.value.trim());
    closeLinkPopover();
  });
}
if (linkPopoverRemove) {
  linkPopoverRemove.addEventListener("click", () => {
    removeLinkFromSavedRange();
    closeLinkPopover();
  });
}
if (linkPopoverCancel) {
  linkPopoverCancel.addEventListener("click", () => closeLinkPopover());
}
if (linkPopoverInput) {
  linkPopoverInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      linkPopoverApply.click();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeLinkPopover();
    }
  });
  linkPopoverInput.addEventListener("input", () => linkPopoverInput.classList.remove("is-invalid"));
}
if (linkPopoverText) {
  linkPopoverText.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      linkPopoverApply.click();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeLinkPopover();
    }
  });
}
document.addEventListener("mousedown", (e) => {
  if (
    linkPopover &&
    !linkPopover.hidden &&
    !linkPopover.contains(e.target) &&
    e.target !== selLinkBtn &&
    !selLinkBtn.contains(e.target)
  ) {
    closeLinkPopover();
  }
});

btnReset.addEventListener("click", async () => {
  if (!originalCvData) {
    showToast("There's nothing to reset yet.", true);
    return;
  }
  const hasEdits = editStatusDot && editStatusDot.classList.contains("is-edited");
  if (hasEdits) {
    const ok = await confirmDialog({
      title: "Discard your edits?",
      message: "This clears everything you've changed in the editor and restores the original draft.",
      confirmLabel: "Discard edits",
    });
    if (!ok) return;
  }
  renderExecutiveResume(originalCvData, originalTemplate);
  Object.keys(DEFAULT_FONT_VARIANT).forEach((template) => {
    selectedFontVariant[template] = DEFAULT_FONT_VARIANT[template];
    applyFontVariantToCss(template, DEFAULT_FONT_VARIANT[template]);
  });
  hideWorkbenchError();
  hideIconChip();
  hideIconPopover();
  hideLayoutPopover();
  hidePlaceholderPopover();
  resetEditStatus();
  fitToView();
  showToast("Reset to your original draft.");
});

function markEdited() {
  if (!editStatusText) return;
  if (cvDocumentPaper.innerHTML === initialDocumentHtml) {
    resetEditStatus();
    return;
  }
  editStatusDot.classList.add("is-edited");
  editStatusText.textContent = "Edited. Download to save changes.";
}
function resetEditStatus() {
  if (!editStatusText) return;
  editStatusDot.classList.remove("is-edited");
  editStatusText.textContent = "No edits yet";
}
cvDocumentPaper.addEventListener("input", markEdited);
cvDocumentPaper.addEventListener("input", scheduleHistoryCommit);

const PLACEHOLDER_FIELD_SELECTOR =
  ".cv-name, .cv-title, .cv-contact-item, .cv-summary, .cv-entry-role, .cv-entry-company, .cv-entry-dates, .cv-entry-sub, .cv-skill-row, .cv-bullets > li";

function getPlaceholderFieldContainer(node) {
  let el = node && node.nodeType === Node.ELEMENT_NODE ? node : node && node.parentElement;
  while (el && el !== cvDocumentPaper) {
    if (el.matches && el.matches(PLACEHOLDER_FIELD_SELECTOR)) return el;
    el = el.parentElement;
  }
  return null;
}

function textOffsetWithin(root, node, offset) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let total = 0;
  let current;
  while ((current = walker.nextNode())) {
    if (current === node) return total + offset;
    total += current.textContent.length;
  }
  return total;
}

function setCaretAtTextOffset(root, targetOffset) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = targetOffset;
  let lastNode = null;
  let current;
  while ((current = walker.nextNode())) {
    lastNode = current;
    const len = current.textContent.length;
    if (remaining <= len) {
      const range = document.createRange();
      range.setStart(current, remaining);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    remaining -= len;
  }
  if (lastNode) {
    const range = document.createRange();
    range.setStart(lastNode, lastNode.textContent.length);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

function refreshPlaceholderHighlightAt(caretNode) {
  const container = getPlaceholderFieldContainer(caretNode);
  if (!container) return;

  const sel = window.getSelection();
  let caretOffset = null;
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    if (container.contains(range.startContainer)) {
      caretOffset = textOffsetWithin(container, range.startContainer, range.startOffset);
    }
  }

  const stripped = container.innerHTML.replace(/<span class="cv-placeholder">([\s\S]*?)<\/span>/g, "$1");
  const rehighlighted = highlightPlaceholders(stripped);
  if (rehighlighted === container.innerHTML) return;

  container.innerHTML = rehighlighted;
  if (caretOffset !== null) setCaretAtTextOffset(container, caretOffset);
}

cvDocumentPaper.addEventListener("input", () => {
  const sel = window.getSelection();
  const caretNode = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).startContainer : null;
  if (caretNode) refreshPlaceholderHighlightAt(caretNode);
  if (!el("workbenchError").hidden && !cvDocumentPaper.querySelector(".cv-placeholder")) hideWorkbenchError();
});

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.1;
let zoomLevel = 1;

function applyZoom(next) {
  zoomLevel = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
  cvDocumentPaper.style.transform = `scale(${zoomLevel})`;
  if (btnZoomReset) btnZoomReset.textContent = `${Math.round(zoomLevel * 100)}%`;
  scheduleLayoutRealPages();
}

if (btnZoomOut) btnZoomOut.addEventListener("click", () => applyZoom(zoomLevel - ZOOM_STEP));
if (btnZoomIn) btnZoomIn.addEventListener("click", () => applyZoom(zoomLevel + ZOOM_STEP));
if (btnZoomReset) btnZoomReset.addEventListener("click", () => applyZoom(1));
function fitToView() {
  if (!documentWorkbench || !cvDocumentPaper || viewWorkbench.hidden) return;
  const availableW = documentWorkbench.clientWidth - (window.innerWidth < 700 ? 20 : 64);
  if (cvDocumentPaper.offsetWidth > 0) applyZoom(Math.min(1, availableW / cvDocumentPaper.offsetWidth));
}
let lastWindowWidth = window.innerWidth;
window.addEventListener("resize", () => {
  if (window.innerWidth !== lastWindowWidth) {
    lastWindowWidth = window.innerWidth;
    fitToView();
  }
});
if (btnZoomFit) {
  btnZoomFit.addEventListener("click", () => {
    if (!documentWorkbench || !cvDocumentPaper) return;
    if (window.innerWidth <= 880) {
      fitToView();
      return;
    }
    const naturalH = cvDocumentPaper.offsetHeight;
    const availableH = documentWorkbench.clientHeight - 64;
    const availableW = documentWorkbench.clientWidth - 32;
    if (naturalH > 0 && availableH > 0) applyZoom(Math.min(availableH / naturalH, availableW / cvDocumentPaper.offsetWidth));
  });
}

let isLayingOutPages = false;
let pageLayoutRaf = null;

function scheduleLayoutRealPages() {
  if (pageLayoutRaf) cancelAnimationFrame(pageLayoutRaf);
  pageLayoutRaf = requestAnimationFrame(() => {
    pageLayoutRaf = null;
    layoutRealPages();
  });
}

let a4MeasurePaper = null;
function estimateA4PageCount() {
  if (!cvDocumentPaper) return 1;
  const w = cvDocumentPaper.offsetWidth;
  // 210mm at 96dpi is ~793.7px; only use offscreen A4 mirror when responsive CSS narrows the paper
  if (w >= 785) {
    const singlePageH = w * (297 / 210);
    return Math.max(1, Math.ceil((cvDocumentPaper.scrollHeight - 12) / singlePageH));
  }
  if (!a4MeasurePaper) {
    a4MeasurePaper = document.createElement("div");
    a4MeasurePaper.id = "a4MeasurePaper";
    a4MeasurePaper.setAttribute("aria-hidden", "true");
    a4MeasurePaper.style.cssText =
      "position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;z-index:-1;";
    document.body.appendChild(a4MeasurePaper);
  }
  a4MeasurePaper.className = cvDocumentPaper.className;
  a4MeasurePaper.style.setProperty("width", "210mm", "important");
  a4MeasurePaper.style.setProperty("max-width", "none", "important");
  a4MeasurePaper.style.setProperty("min-height", "0", "important");
  a4MeasurePaper.style.setProperty("height", "auto", "important");
  a4MeasurePaper.style.setProperty("padding", "13mm 14.5mm", "important");
  a4MeasurePaper.style.setProperty("transform", "none", "important");
  a4MeasurePaper.innerHTML = cvDocumentPaper.innerHTML;
  const a4W = a4MeasurePaper.offsetWidth || 794;
  const singlePageH = a4W * (297 / 210);
  return Math.max(1, Math.ceil((a4MeasurePaper.scrollHeight - 12) / singlePageH));
}

function layoutRealPages() {
  if (!cvDocumentPaper || !paperCanvas || isLayingOutPages) return;
  isLayingOutPages = true;

  const finalW = cvDocumentPaper.offsetWidth;
  const finalH = cvDocumentPaper.offsetHeight;
  paperCanvas.style.width = `${finalW * zoomLevel}px`;
  paperCanvas.style.height = `${finalH * zoomLevel}px`;

  const pageEstimateEl = el("pageEstimate");
  if (pageEstimateEl && finalW > 0) {
    const pages = estimateA4PageCount();
    pageEstimateEl.textContent = pages === 1 ? "1 page" : `${pages} pages`;
    pageEstimateEl.classList.toggle("is-multi", pages > 1);
  }

  isLayingOutPages = false;
}

let paperResizeObserver = null;
if ("ResizeObserver" in window) {
  paperResizeObserver = new ResizeObserver(() => scheduleLayoutRealPages());
  paperResizeObserver.observe(cvDocumentPaper);
} else {
  window.addEventListener("resize", scheduleLayoutRealPages);
}
cvDocumentPaper.addEventListener("input", scheduleLayoutRealPages);

const CONTACT_SYNC_DELAY = 550;
let contactSyncTimer = null;
let iconChipTarget = null;
let iconPopoverTarget = null;
const iconChip = el("iconChip");
const iconPopover = el("iconPopover");
const btnToggleIcons = el("btnToggleIcons");

function contactRoot() {
  return cvDocumentPaper.querySelector(".cv-contact");
}

function syncContactIconsNow() {
  contactSyncTimer = null;
  if (!window.CvIcons) return;
  const contact = contactRoot();
  if (!contact) return;
  if (window.CvIcons.sync(contact)) scheduleLayoutRealPages();
  offerIconForCaret();
}
function scheduleContactIconSync() {
  if (!window.CvIcons) return;
  clearTimeout(contactSyncTimer);
  contactSyncTimer = setTimeout(syncContactIconsNow, CONTACT_SYNC_DELAY);
}
cvDocumentPaper.addEventListener("input", scheduleContactIconSync);
cvDocumentPaper.addEventListener("focusout", (event) => {
  if (event.target && event.target.closest && event.target.closest(".cv-contact")) syncContactIconsNow();
});

// 2. Suggestion chip
function hideIconChip() {
  iconChipTarget = null;
  if (iconChip) iconChip.hidden = true;
}

function offerIconForCaret() {
  if (!iconChip || !window.CvIcons || iconsHidden()) return hideIconChip();
  const selection = document.getSelection();
  const node = selection && selection.rangeCount ? selection.getRangeAt(0).startContainer : null;
  const item = window.CvIcons.itemOf(node);
  if (!item || !cvDocumentPaper.contains(item)) return hideIconChip();
  const key = window.CvIcons.suggestFor(item);
  if (!key) return hideIconChip();
  if (iconChipTarget === item && !iconChip.hidden) return;

  iconChipTarget = item;
  const icon = window.CvIcons.paths[key];
  el("iconChipPreview").innerHTML = window.CvIcons.markup(key);
  el("iconChipText").textContent = `Add the ${icon.label} icon?`;
  iconChip.hidden = false;
  const rect = item.getBoundingClientRect();
  const margin = 8;
  const left = Math.min(window.innerWidth - iconChip.offsetWidth - margin, Math.max(margin, rect.left));
  const top = rect.bottom + 10 + iconChip.offsetHeight > window.innerHeight
    ? rect.top - iconChip.offsetHeight - 10
    : rect.bottom + 10;
  iconChip.style.left = `${left}px`;
  iconChip.style.top = `${Math.max(margin, top)}px`;
}

document.addEventListener("selectionchange", () => {
  if (!cvDocumentPaper.contains(document.activeElement) && document.activeElement !== cvDocumentPaper) return;
  offerIconForCaret();
});

if (iconChip) {
  el("iconChipAdd").addEventListener("mousedown", (event) => event.preventDefault());
  el("iconChipAdd").addEventListener("click", () => {
    const item = iconChipTarget;
    if (!item) return hideIconChip();
    const key = window.CvIcons.suggestFor(item);
    commitHistory();
    if (window.CvIcons.addTo(item, key)) {
      markEdited();
      scheduleLayoutRealPages();
    }
    commitHistory();
    hideIconChip();
  });
  el("iconChipDismiss").addEventListener("mousedown", (event) => event.preventDefault());
  el("iconChipDismiss").addEventListener("click", () => {
    if (iconChipTarget) window.CvIcons.decline(iconChipTarget);
    hideIconChip();
  });
}

// 3. Managing marks that are already there
function hideIconPopover() {
  iconPopoverTarget = null;
  if (iconPopover) iconPopover.hidden = true;
  if (btnToggleIcons) btnToggleIcons.setAttribute("aria-expanded", "false");
}

function openIconMenu(anchorRect, item) {
  if (!iconPopover) return;
  hideIconChip();
  iconPopoverTarget = item || null;
  const iconEl = item && item.querySelector(":scope > svg.cv-icon");
  const label = iconEl ? (window.CvIcons.paths[iconEl.dataset.icon] || {}).label : "";
  el("iconPopoverTitle").textContent = label ? `${label} icon` : "Link icons";
  el("iconPopoverRemove").hidden = !iconEl;
  const addAllBtn = el("iconPopoverAddAll");
  const hideAllBtn = el("iconPopoverHideAll");
  const hidden = iconsHidden();
  if (addAllBtn) {
    addAllBtn.classList.toggle("is-active", !hidden);
    addAllBtn.textContent = !hidden ? "✓ Show link icons" : "Show link icons";
  }
  if (hideAllBtn) {
    hideAllBtn.classList.toggle("is-active", hidden);
    hideAllBtn.textContent = hidden ? "✓ Hide link icons" : "Hide link icons";
  }
  iconPopover.hidden = false;
  if (btnToggleIcons && !item) btnToggleIcons.setAttribute("aria-expanded", "true");
  const margin = 8;
  iconPopover.style.left = `${Math.min(window.innerWidth - iconPopover.offsetWidth - margin, Math.max(margin, anchorRect.left - 6))}px`;
  const below = anchorRect.bottom + 8;
  iconPopover.style.top = `${below + iconPopover.offsetHeight > window.innerHeight ? Math.max(margin, anchorRect.top - iconPopover.offsetHeight - 8) : below}px`;
}

cvDocumentPaper.addEventListener("click", (event) => {
  const icon = event.target.closest && event.target.closest("svg.cv-icon");
  if (!icon) return;
  event.preventDefault();
  openIconMenu(icon.getBoundingClientRect(), icon.closest(".cv-contact-item"));
});

// Applies a change across every contact item and books it as one undo step.
function editAllContactItems(mutate) {
  const contact = contactRoot();
  if (!contact) return;
  const items = Array.from(contact.querySelectorAll(".cv-contact-item"));
  commitHistory();
  let changed = false;
  for (const item of items) changed = mutate(item) || changed;
  commitHistory();
  if (changed) {
    markEdited();
    scheduleLayoutRealPages();
  }
}

if (iconPopover) {
  el("iconPopoverRemove").addEventListener("click", () => {
    const item = iconPopoverTarget;
    if (item) {
      commitHistory();
      if (window.CvIcons.removeFrom(item)) {
        markEdited();
        scheduleLayoutRealPages();
      }
      commitHistory();
    }
    hideIconPopover();
  });
  el("iconPopoverAddAll").addEventListener("click", () => {
    editAllContactItems((item) => {
      delete item.dataset.iconDeclined;
      const key = window.CvIcons.suggestFor(item);
      return key ? window.CvIcons.addTo(item, key) : false;
    });
    if (iconsHidden()) setIconsHidden(false);
    hideIconPopover();
  });
  el("iconPopoverHideAll").addEventListener("click", () => {
    setIconsHidden(true);
    hideIconPopover();
  });
}

document.addEventListener("mousedown", (event) => {
  const onOpener = event.target.closest && (event.target.closest(".cv-icon") || event.target.closest("#btnToggleIcons"));
  if (iconPopover && !iconPopover.hidden && !iconPopover.contains(event.target) && !onOpener) hideIconPopover();
  if (iconChip && !iconChip.hidden && !iconChip.contains(event.target)) hideIconChip();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  hideIconPopover();
  hideIconChip();
});

function iconsHidden() {
  return cvDocumentPaper.classList.contains("icons-hidden");
}
function setIconsHidden(hidden) {
  cvDocumentPaper.classList.toggle("icons-hidden", hidden);
  if (btnToggleIcons) {
    btnToggleIcons.setAttribute("aria-pressed", String(!hidden));
    el("btnToggleIconsLabel").textContent = hidden ? "Link icons off" : "Link icons";
  }
  if (hidden) hideIconChip();
  markEdited();
  scheduleLayoutRealPages();
}
if (btnToggleIcons) {
  btnToggleIcons.addEventListener("click", () => {
    if (iconPopover && !iconPopover.hidden) return hideIconPopover();
    openIconMenu(btnToggleIcons.getBoundingClientRect(), null);
  });
}

const layoutPopover = el("layoutPopover");
const btnLayout = el("btnLayout");

function syncLayoutButtonLabel() {
  const label = el("btnLayoutLabel");
  if (label && window.CvLayouts) label.textContent = window.CvLayouts.get(activeLayout).name;
}

function applyLayout(key, { record = true } = {}) {
  if (!window.CvLayouts) return;
  const layout = window.CvLayouts.get(key);
  const sections = Array.from(cvDocumentPaper.querySelectorAll(":scope > .cv-section"));
  if (!sections.length) { activeLayout = layout.key; return; }

  if (record) commitHistory();

  const order = layout.sections || [];
  const existingSections = [...cvDocumentPaper.querySelectorAll(":scope > .cv-section")];
  if (existingSections.length) {
    const byKey = new Map(existingSections.map((sec) => [sec.dataset.section, sec]));
    const ordered = [];
    for (const key of order) {
      const sec = byKey.get(key);
      if (sec) {
        ordered.push(sec);
        byKey.delete(key);
      }
    }
    for (const sec of byKey.values()) ordered.push(sec);
    cvDocumentPaper.append(...ordered);
  }
  const headerEl = cvDocumentPaper.querySelector(".cv-header");
  if (headerEl) headerEl.dataset.layout = layout.key;
  activeLayout = layout.key;
  restoreLayoutIdentity();
  if (record) { markEdited(); commitHistory(); }
  scheduleLayoutRealPages();
}

function restoreLayoutIdentity() {
  const key = cvDocumentPaper.querySelector(".cv-header")?.dataset.layout || "chronological";
  activeLayout = window.CvLayouts.get(key).key;
  cvDocumentPaper.classList.remove(...window.CvLayouts.order.map(k => `layout-${k}`));
  cvDocumentPaper.classList.add(`layout-${activeLayout}`);
  cvDocumentPaper.dataset.layout = activeLayout;
  syncLayoutButtonLabel();
  scheduleLayoutRealPages();
}

function resolveLayoutRecommendation(data) {
  if (!window.CvLayouts) return null;
  const local = window.CvLayouts.recommend({
    jobTitle: jobTitle.value.trim(),
    jobDescription: jobDescription.value.trim(),
    data,
  });
  const fromModel = data && data.layout;
  const suggested = fromModel && typeof fromModel === "object" ? fromModel.recommended : fromModel;
  if (typeof suggested === "string" && window.CvLayouts.LAYOUTS[suggested]) {
    const reason = fromModel && typeof fromModel === "object" && typeof fromModel.reason === "string" && fromModel.reason.trim()
      ? fromModel.reason.trim()
      : local.reason;
    return { key: suggested, reason, source: "model" };
  }
  return { ...local, source: "local" };
}

function renderLayoutOptions() {
  const listEl = el("layoutPopoverList");
  if (!listEl || !window.CvLayouts) return;
  const rec = layoutRecommendation || resolveLayoutRecommendation(parsedCvData);
  const recommended = rec?.key;
  const whyEl = el("layoutPopoverWhy");
  if (whyEl) {
    if (rec?.reason) {
      whyEl.textContent = rec.reason;
      whyEl.hidden = false;
    } else {
      whyEl.hidden = true;
    }
  }
  listEl.innerHTML = window.CvLayouts.list().sort((a, b) => Number(b.key === recommended) - Number(a.key === recommended)).map((layout) => {
    const isActive = layout.key === activeLayout;
    const isRecommended = layout.key === recommended;
    return `<button type="button" class="layout-option${isActive ? " is-active" : ""}${isRecommended ? " is-recommended" : ""}" data-layout="${layout.key}" aria-pressed="${isActive}">
      <span class="layout-mini layout-mini--${layout.key}" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      <span class="layout-option__copy">
      <span class="layout-option__head">
        <span class="layout-option__name">${escapeHtml(layout.name)}</span>
        ${isRecommended ? `<span class="layout-option__badge">Recommended</span>` : ""}
      </span>
      <span class="layout-option__tagline">${escapeHtml(layout.tagline)}</span>
      </span><span class="layout-option__check" aria-hidden="true">${isActive ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' : ""}</span>
    </button>`;
  }).join("");
}

function openLayoutPopover() {
  if (!layoutPopover || !btnLayout) return;
  renderLayoutOptions();
  layoutPopover.hidden = false;
  btnLayout.setAttribute("aria-expanded", "true");
  const rect = btnLayout.getBoundingClientRect();
  const margin = 8;
  layoutPopover.style.left = `${Math.min(window.innerWidth - layoutPopover.offsetWidth - margin, Math.max(margin, rect.left))}px`;
  const below = rect.bottom + 8;
  layoutPopover.style.top = `${below + layoutPopover.offsetHeight > window.innerHeight
    ? Math.max(margin, window.innerHeight - layoutPopover.offsetHeight - margin)
    : below}px`;
  layoutPopover.querySelector(".is-active")?.focus({ preventScroll: true });
}

function hideLayoutPopover() {
  if (layoutPopover) layoutPopover.hidden = true;
  btnLayout?.setAttribute("aria-expanded", "false");
}

if (btnLayout) {
  btnLayout.addEventListener("click", () => {
    if (layoutPopover && !layoutPopover.hidden) return hideLayoutPopover();
    openLayoutPopover();
  });
}

if (layoutPopover) {
  layoutPopover.addEventListener("keydown", event => {
    const options = [...layoutPopover.querySelectorAll("button[data-layout]")];
    const index = options.indexOf(document.activeElement);
    let next;
    if (event.key === "ArrowDown") next = (index + 1) % options.length;
    if (event.key === "ArrowUp") next = (index - 1 + options.length) % options.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = options.length - 1;
    if (next !== undefined) { event.preventDefault(); options[next]?.focus(); }
  });
  layoutPopover.addEventListener("focusout", event => {
    if (event.relatedTarget && !layoutPopover.contains(event.relatedTarget) && event.relatedTarget !== btnLayout) hideLayoutPopover();
  });
  layoutPopover.addEventListener("click", (event) => {
    const option = event.target.closest("button[data-layout]");
    if (!option) return;
    const key = option.dataset.layout;
    if (key !== activeLayout) {
      applyLayout(key);
      showToast(`${window.CvLayouts.get(key).name} layout applied.`);
    }
    hideLayoutPopover();
    btnLayout.focus({ preventScroll: true });
  });
}

document.addEventListener("mousedown", (event) => {
  if (!layoutPopover || layoutPopover.hidden) return;
  if (layoutPopover.contains(event.target)) return;
  if (btnLayout && btnLayout.contains(event.target)) return;
  hideLayoutPopover();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !layoutPopover.hidden) { hideLayoutPopover(); btnLayout.focus(); }
});

const placeholderPopover = el("placeholderPopover");
let placeholderTarget = null;

function placeholderRemovalTarget(node) {
  const bullet = node.closest("li");
  if (bullet && bullet.closest(".cv-bullets")) {
    return { node: bullet, label: "Remove this bullet point", note: "The line and its bullet marker both go." };
  }
  const contact = node.closest(".cv-contact-item");
  if (contact) {
    return { node: contact, label: "Remove this contact line", note: "The rest of the header closes up around it." };
  }
  const dates = node.closest(".cv-entry-dates");
  if (dates) return { node: dates, label: "Remove the dates", note: "The role and company stay." };
  const sub = node.closest(".cv-entry-sub");
  if (sub) return { node: sub, label: "Remove this line", note: "Only this line goes." };
  const summary = node.closest(".cv-summary");
  if (summary && summary.parentElement && summary.parentElement.dataset.section === "summary") {
    return { node: summary.closest(".cv-section"), label: "Remove the summary section", note: "Heading included." };
  }
  if (summary) return { node: summary, label: "Remove this description", note: "The entry above it stays." };
  const entry = node.closest(".cv-entry");
  if (entry) return { node: entry, label: "Remove this whole entry", note: "Everything under this heading goes." };
  return { node, label: "Remove this placeholder", note: "Just the highlighted text." };
}

function pruneEmptyContainers(from) {
  let node = from;
  while (node && node !== cvDocumentPaper) {
    const parent = node.parentElement;
    const isContainer = node.matches && node.matches(".cv-bullets, .cv-entry, .cv-section, .cv-contact");
    if (isContainer && !node.textContent.trim() && !node.querySelector("img, svg")) {
      node.remove();
      node = parent;
      continue;
    }
    if (node.matches && node.matches(".cv-section")) {
      const children = Array.from(node.children).filter((child) => !child.classList.contains("cv-section-title"));
      if (!children.length) {
        node.remove();
        node = parent;
        continue;
      }
    }
    node = parent;
  }
}

function hidePlaceholderPopover() {
  placeholderTarget = null;
  if (placeholderPopover) placeholderPopover.hidden = true;
}

function openPlaceholderPopover(placeholderNode) {
  if (!placeholderPopover) return;
  const target = placeholderRemovalTarget(placeholderNode);
  placeholderTarget = { placeholder: placeholderNode, ...target };
  el("placeholderPopoverText").textContent = placeholderNode.textContent.trim();
  el("placeholderPopoverRemove").textContent = target.label;
  el("placeholderPopoverNote").textContent = target.note;
  placeholderPopover.hidden = false;

  const rect = placeholderNode.getBoundingClientRect();
  const margin = 8;
  placeholderPopover.style.left = `${Math.min(window.innerWidth - placeholderPopover.offsetWidth - margin, Math.max(margin, rect.left))}px`;
  const below = rect.bottom + 8;
  placeholderPopover.style.top = `${below + placeholderPopover.offsetHeight > window.innerHeight
    ? Math.max(margin, rect.top - placeholderPopover.offsetHeight - 8)
    : below}px`;
}

cvDocumentPaper.addEventListener("click", (event) => {
  const node = event.target.closest && event.target.closest(".cv-placeholder");
  if (!node) {
    if (placeholderPopover && !placeholderPopover.hidden) hidePlaceholderPopover();
    return;
  }
  openPlaceholderPopover(node);
});

if (placeholderPopover) {
  el("placeholderPopoverRemove").addEventListener("mousedown", (event) => event.preventDefault());
  el("placeholderPopoverRemove").addEventListener("click", () => {
    const target = placeholderTarget;
    if (!target || !target.node || !target.node.parentElement) return hidePlaceholderPopover();
    commitHistory();
    const parent = target.node.parentElement;
    target.node.remove();
    pruneEmptyContainers(parent);
    markEdited();
    commitHistory();
    scheduleLayoutRealPages();
    if (!cvDocumentPaper.querySelector(".cv-placeholder")) hideWorkbenchError();
    hidePlaceholderPopover();
    showToast("Removed. Undo with Ctrl+Z if that wasn't what you wanted.");
  });
  el("placeholderPopoverKeep").addEventListener("click", hidePlaceholderPopover);
}

document.addEventListener("mousedown", (event) => {
  if (!placeholderPopover || placeholderPopover.hidden) return;
  if (placeholderPopover.contains(event.target)) return;
  if (event.target.closest && event.target.closest(".cv-placeholder")) return;
  hidePlaceholderPopover();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") hidePlaceholderPopover();
});

function linkOrSpan(href, text, { clickable = true, target, title } = {}) {
  const attrs = [`class="cv-link"`];
  if (title) attrs.push(`title="${escapeHtml(title)}"`);
  if (!clickable) return `<span ${attrs.join(" ")}>${text}</span>`;
  attrs.push(`href="${escapeHtml(href)}"`);
  if (target) attrs.push(`target="_blank" rel="noopener"`);
  return `<a ${attrs.join(" ")}>${text}</a>`;
}

function withIcon(key, html) {
  const icon = window.CvIcons ? window.CvIcons.markup(key) : "";
  return icon ? `${icon}${html}` : html;
}

function displayUrl(value, hint) {
  return window.CvIcons ? window.CvIcons.pretty(value, hint) : String(value || "");
}

function iconFor(value, hint) {
  return window.CvIcons ? window.CvIcons.detect(value, hint) : "";
}

function formatContactLink(val, type, clickable = true) {
  if (!val) return "";
  const trimmed = val.trim();

  if (type === "phone") {
    const cleanNum = trimmed.replace(/\D/g, "");
    if (cleanNum.length >= 7) {
      const waUrl = `https://wa.me/${cleanNum}`;
      return withIcon("phone", linkOrSpan(waUrl, escapeHtml(trimmed), { clickable, target: true, title: "Chat on WhatsApp" }));
    }
    return withIcon("phone", linkOrSpan(`tel:${trimmed.replace(/\s+/g, "")}`, escapeHtml(trimmed), { clickable }));
  }

  if (type === "email") {
    return withIcon("email", linkOrSpan(`mailto:${trimmed}`, escapeHtml(trimmed), { clickable }));
  }

  if (type === "location") {
    return withIcon("location", escapeHtml(trimmed));
  }

  let url = trimmed;
  if (type === "linkedin" && !/linkedin\.com/i.test(url) && !/^https?:\/\//i.test(url)) {
    url = `https://linkedin.com/in/${url.replace(/^\/+/, "")}`;
  } else if (type === "github" && !/github\.com/i.test(url) && !/^https?:\/\//i.test(url)) {
    url = `https://github.com/${url.replace(/^\/+/, "")}`;
  } else if (!/^https?:\/\//i.test(url)) {
    if (url.includes("@") && !url.includes("/")) {
      return withIcon("email", linkOrSpan(`mailto:${url}`, escapeHtml(url), { clickable }));
    }
    url = `https://${url.replace(/^\/+/, "")}`;
  }

  return withIcon(iconFor(url), linkOrSpan(url, escapeHtml(displayUrl(url)), { clickable, target: true }));
}

const EXTRA_LINK_URL_MAX = 48;
function formatExtraLink(link, clickable = true) {
  if (!link || !link.url) return "";
  const label = link.label ? link.label.trim() : "";
  const url = normalizeLinkUrl(link.url);
  if (!url) return escapeHtml(label || link.url);
  const bare = displayUrl(url);
  const text = label && bare.length > EXTRA_LINK_URL_MAX ? label : bare;
  return withIcon(iconFor(url), linkOrSpan(url, escapeHtml(text), { clickable, target: true, title: label || url }));
}

const PLACEHOLDER_PATTERN = /\[[^\[\]\n]+\]/g;

function placeholder(label) {
  return `[${label}]`;
}

function fieldOrPlaceholder(value, label) {
  return value && String(value).trim() ? escapeHtml(String(value).trim()) : escapeHtml(placeholder(label));
}

function isPlaceholderText(value) {
  if (!value) return false;
  const v = String(value).trim();
  const re = new RegExp(`^${PLACEHOLDER_PATTERN.source}$`);
  return re.test(v);
}

function highlightPlaceholders(html) {
  return html.replace(PLACEHOLDER_PATTERN, (m) => `<span class="cv-placeholder">${m}</span>`);
}

function normalizeLinkUrl(rawUrl) {
  const u = (rawUrl || "").trim();
  if (!u) return "";
  if (/^javascript:/i.test(u) || /^data:/i.test(u) || /^vbscript:/i.test(u)) return "";
  if (/^(https?|mailto|tel):/i.test(u)) return u;
  if (u.includes("@") && !u.includes("/") && !u.includes(" ")) return `mailto:${u}`;
  return `https://${u.replace(/^\/+/, "")}`;
}

function escapeAndAutoLink(text, clickable = true) {
  const raw = text == null ? "" : String(text);
  if (!raw.trim() || !extractedCvLinks.length || isPlaceholderText(raw)) return escapeHtml(raw);

  const rawLower = raw.toLowerCase();
  const match = extractedCvLinks
    .filter((l) => l.text && l.text.length >= 3 && rawLower.includes(l.text.toLowerCase()))
    .sort((a, b) => b.text.length - a.text.length)[0];
  if (!match) return escapeHtml(raw);

  const url = normalizeLinkUrl(match.url);
  if (!url) return escapeHtml(raw);

  const idx = rawLower.indexOf(match.text.toLowerCase());
  const before = raw.slice(0, idx);
  const matchedOriginal = raw.slice(idx, idx + match.text.length);
  const after = raw.slice(idx + match.text.length);
  return (
    escapeHtml(before) +
    linkOrSpan(url, escapeHtml(matchedOriginal), { clickable, target: true, title: url }) +
    escapeHtml(after)
  );
}

function fieldOrPlaceholderLinked(value, label, clickable = true) {
  return value && String(value).trim() ? escapeAndAutoLink(String(value).trim(), clickable) : escapeHtml(placeholder(label));
}

function buildContactHtml(data, clickable = true) {
  const items = [];
  const c = data.contact || {};
  const fromBuilder = Boolean(data.fromBuilder);
  const push = (html, field) => { if (html) items.push({ html, field }); };
  const emailVal = c.email && String(c.email).trim();
  if (!fromBuilder || (emailVal && !isPlaceholderText(emailVal))) {
    push(!emailVal ? placeholder("YOUR EMAIL ADDRESS") : isPlaceholderText(emailVal) ? escapeHtml(emailVal) : formatContactLink(emailVal, "email", clickable), "email");
  }
  const phoneVal = c.phone && String(c.phone).trim();
  if (!fromBuilder || (phoneVal && !isPlaceholderText(phoneVal))) {
    push(!phoneVal ? placeholder("YOUR PHONE NUMBER") : isPlaceholderText(phoneVal) ? escapeHtml(phoneVal) : formatContactLink(phoneVal, "phone", clickable), "phone");
  }
  const locationVal = c.location && String(c.location).trim();
  if (locationVal && !isPlaceholderText(locationVal)) {
    push(formatContactLink(locationVal, "location", clickable), "location");
  }
  if (c.linkedin) {
    const v = String(c.linkedin).trim();
    push(isPlaceholderText(v) ? escapeHtml(v) : formatContactLink(v, "linkedin", clickable), "");
  }
  if (c.github) {
    const v = String(c.github).trim();
    push(isPlaceholderText(v) ? escapeHtml(v) : formatContactLink(v, "github", clickable), "");
  }
  if (c.portfolio) {
    const v = String(c.portfolio).trim();
    push(isPlaceholderText(v) ? escapeHtml(v) : formatContactLink(v, "portfolio", clickable), "");
  }
  if (Array.isArray(data.links)) {
    for (const link of data.links) {
      if (!link || !link.url) continue;
      const url = String(link.url).trim();
      push(isPlaceholderText(url) ? escapeHtml(link.label || url) : formatExtraLink(link, clickable), "");
    }
  }
  const rendered = items
    .map(({ html, field }) => `<span class="cv-contact-item"${field ? ` data-contact-field="${field}"` : ""}>${html}</span>`)
    .join("");
  return `<div class="cv-contact">${rendered}</div>`;
}

function getActiveTemplate() {
  const cls = Array.from(cvDocumentPaper.classList).find((c) => c.startsWith("template-"));
  return cls ? cls.replace("template-", "") : DEFAULT_TEMPLATE;
}

function getActivePdfTheme() {
  const header = cvDocumentPaper.querySelector(":scope > .cv-header");
  return {
    ...(PDF_THEMES[getActiveTemplate()] || PDF_THEMES[DEFAULT_TEMPLATE]),
    // Export the document's resolved alignment, including layout overrides.
    headerAlign: header && getComputedStyle(header).textAlign === "center" ? "center" : "left",
  };
}

downloadPdfBtn.addEventListener("click", async () => {
  if (downloadPdfBtn.disabled) return;
  ensurePdfFontsRegistered();
  if (!window.pdfMake || !pdfFontsReady) {
    return showWorkbenchError("<strong>Still getting ready.</strong> Give it a moment, then click Download again.");
  }
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();

  const remainingPlaceholders = [...cvDocumentPaper.querySelectorAll(".cv-placeholder")];
  if (remainingPlaceholders.length) {
    const uniqueTexts = [...new Set(remainingPlaceholders.map((node) => node.textContent.trim()))];
    const items = uniqueTexts.map((text) => `<li><code>${escapeHtml(text)}</code></li>`).join("");
    showWorkbenchError(
      `<strong>Fill in ${uniqueTexts.length === 1 ? "this placeholder" : "these placeholders"} before downloading:</strong><ul class="workspace-error__list">${items}</ul>`
    );
    el("workbenchError").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  hideWorkbenchError();

  try {
    downloadPdfBtn.disabled = true;
    downloadPdfBtn.classList.add("is-building");
    if (downloadPdfBtnTitle) downloadPdfBtnTitle.textContent = "Preparing PDF…";

    const activeTemplate = getActiveTemplate();
    const theme = getActivePdfTheme();
    const content = buildPdfContentFromDom(cvDocumentPaper, theme);
    const docDefinition = {
      pageSize: "A4",
      pageMargins: [40, 36, 40, 36],
      defaultStyle: { font: theme.bodyFont, fontSize: 9.75, lineHeight: 1.32, color: INK_BODY },
      content: normalizePdfStyle(content, theme),
    };

    const baseNameSource = (isExample ? "Example_Resume" : uploadedFileName) || parsedCvData?.name || "Tailored_Resume";
    const filenameBase = `${baseNameSource.replace(/\.[a-z0-9]+$/i, "").replace(/\s+/g, "_")}_tailored`;

    const pdfDoc = window.pdfMake.createPdf(docDefinition);

    const base64 = await new Promise((resolve, reject) => {
      const exportTimeout = setTimeout(() => reject(new Error("PDF export timed out")), 30000);
      try {
        pdfDoc.getBase64((result) => {
          clearTimeout(exportTimeout);
          resolve(result);
        });
      } catch (error) {
        clearTimeout(exportTimeout);
        reject(error);
      }
    });
      try {
        const byteChars = atob(base64);
        const bytes = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
        const blob = new Blob([bytes], { type: "application/pdf" });
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = `${filenameBase}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
      } catch (err) {
        console.error("Blob download failed, falling back to pdfMake's own download:", err);
        pdfDoc.download(`${filenameBase}.pdf`);
      }

      showToast("Your resume PDF is ready to send.");

      // Reliable audit log of the exact same bytes just downloaded, with retry + error reporting.
      if (!isExample) {
        logPdfDownloadWithRetry({
          sessionId: getOrCreateSessionId(),
          requestId: activeRequestId,
          pdfBase64: base64,
          filename: `${filenameBase}.pdf`,
          jobTitle: jobTitle.value.trim(),
          location: jobLocation.value.trim(),
          candidateName: parsedCvData?.name || "",
          template: activeLayout || activeTemplate,
          ...currentVisitorContext(),
        });
      }
  } catch (err) {
    console.error("PDF export failed:", err);
    reportClientActivity("export_failed", err);
    showWorkbenchError("<strong>Couldn't create the PDF.</strong> Your edits are still here. Please try downloading again.");
  } finally {
    downloadPdfBtn.disabled = false;
    downloadPdfBtn.classList.remove("is-building");
    if (downloadPdfBtnTitle) downloadPdfBtnTitle.textContent = "Download PDF";
  }
});

const INK = "#111827";
const INK_BODY = "#1f2937";
const INK_SOFT = "#374151";
const INK_MUTE = "#4b5563";
const INK_FAINT = "#6b7280";
const RULE_LIGHT = "#cbd5e1";

const PDF_THEMES = {
  executive: {
    bodyFont: "PTSans",
    headingFont: "PTSerif",
    accent: "#111827",
    ink: "#111827",
    headerAlign: "center",
    nameSize: 22,
    titleUppercase: true,
    titleColor: "#374151",
    sectionTitleColor: "#111827",
    sectionRuleColor: "#111827",
    sectionHairlineColor: "#cbd5e1",
    headerRuleColor: "#111827",
    headerRuleWeight: 1.25,
    companyColor: "#4b5563",
    ruleWeight: 0.75,
    sectionTitleAlign: "left",
  },
};

function normalizePdfStyle(value) {
  if (Array.isArray(value)) return value.map((item) => normalizePdfStyle(item));
  if (!value || typeof value !== "object") return value;
  const result = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizePdfStyle(item)]));
  if (result.x2 > 515) result.x2 = 515;
  return result;
}

function inlineRuns(node, baseStyle) {
  const runs = [];
  function walk(n, style) {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = n.textContent;
      if (t) runs.push({ text: t, ...style });
      return;
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const tag = n.tagName.toLowerCase();

    if (tag === "svg") {
      if (cvDocumentPaper.classList.contains("icons-hidden")) return;
      const glyphs = window.CvIcons ? window.CvIcons.glyph(n.getAttribute("data-icon")) : "";
      const fontReady = !!(window.pdfMake && window.pdfMake.fonts && window.pdfMake.fonts.CvIcons);
      if (glyphs && fontReady) {
        runs.push({ text: glyphs, font: "CvIcons", fontSize: (style.fontSize || 9) * 1.02, color: INK });
      }
      return;
    }

    if (tag === "a") {
      Array.from(n.childNodes).forEach(child => walk(child, {
        ...style,
        link: n.getAttribute("href") || "",
        color: style.linkColor || style.color || INK,
        decoration: "underline",
      }));
      return;
    }

    const nextStyle = { ...style };
    if (tag === "b" || tag === "strong") nextStyle.bold = true;
    if (tag === "i" || tag === "em") nextStyle.italics = true;

    Array.from(n.childNodes).forEach((c) => walk(c, nextStyle));
  }
  Array.from(node.childNodes).forEach((c) => walk(c, baseStyle));
  if (runs.length === 0) runs.push({ text: node.textContent || "", ...baseStyle });
  return runs;
}

function ruleLine(width = 515, color = INK, thickness = 1) {
  return { canvas: [{ type: "line", x1: 0, y1: 0, x2: width, y2: 0, lineWidth: thickness, lineColor: color }] };
}

function sectionRuleCanvas(width = 515, hairlineColor = "#d8dbe0", accentColor = INK, thickness = 0.75) {
  return {
    canvas: [
      { type: "line", x1: 0, y1: 0, x2: width, y2: 0, lineWidth: thickness, lineColor: hairlineColor },
    ],
  };
}

const SAFE_GLUE_CHARS = 700;

function buildPdfHeader(headerEl, theme) {
  const stack = [];
  const name = headerEl.querySelector(":scope > .cv-name");
  const title = headerEl.querySelector(":scope > .cv-title");
  const contact = headerEl.querySelector(":scope > .cv-contact");
  const align = theme.headerAlign || "center";

  if (name) {
    stack.push({
      text: inlineRuns(name, { font: theme.headingFont, bold: true, fontSize: theme.nameSize || 22 }),
      alignment: align,
      margin: [0, 0, 0, 3],
    });
  }
  if (title) {
    const titleText = theme.titleUppercase ? title.textContent.toUpperCase() : title.textContent;
    stack.push({
      text: titleText,
      font: theme.bodyFont,
      bold: !theme.titleItalic,
      italics: !!theme.titleItalic,
      fontSize: 9.5,
      color: theme.titleColor,
      alignment: align,
      margin: [0, 0, 0, 5],
      characterSpacing: theme.titleUppercase ? 0.6 : 0,
    });
  }
  if (contact) {
    const items = Array.from(contact.querySelectorAll(":scope > .cv-contact-item"));
    const runs = [];
    items.forEach((item, idx) => {
      runs.push(...inlineRuns(item, { font: theme.bodyFont, fontSize: 9, color: INK_SOFT, linkColor: theme.accent }));
      if (idx < items.length - 1) runs.push({ text: "   •   ", color: INK_FAINT, fontSize: 9, font: theme.bodyFont });
    });
    stack.push({ text: runs, alignment: align });
  }

  const ruleWidth = 515;
  // Single full-width rule beneath the header.
  const ruleBlocks = [ruleLine(ruleWidth, theme.headerRuleColor || theme.accent, theme.headerRuleWeight || 1.25)];

  return {
    stack: [{ stack, margin: [0, 0, 0, 8] }, { stack: ruleBlocks, margin: [0, 0, 0, 10] }],
    unbreakable: true,
  };
}

function buildPdfEntry(entryEl, theme) {
  const head = entryEl.querySelector(":scope > .cv-entry-head");
  const sub = entryEl.querySelector(":scope > .cv-entry-sub");
  const bullets = entryEl.querySelector(":scope > .cv-bullets");
  // Project entries store their description in a direct `.cv-summary` child.
  const summary = entryEl.querySelector(":scope > .cv-summary");

  const coreHeadBlocks = [];
  let longTextChars = 0;
  if (head) {
    const roleEl = head.querySelector(".cv-entry-role");
    const companyEl = head.querySelector(".cv-entry-company");
    const inlineSubEl = head.querySelector(".cv-entry-sub");
    const datesEl = head.querySelector(".cv-entry-dates");
    const leftRuns = [];
    if (roleEl) leftRuns.push(...inlineRuns(roleEl, { font: theme.headingFont, bold: true, fontSize: 10.5, color: theme.ink, linkColor: theme.accent }));
    if (companyEl) {
      leftRuns.push({ text: " ", font: theme.bodyFont, fontSize: 9.5 });
      leftRuns.push(
        ...inlineRuns(companyEl, {
          font: theme.bodyFont,
          italics: theme.companyItalic !== false,
          fontSize: 9.5,
          color: theme.companyColor || INK_MUTE,
          linkColor: theme.accent,
        })
      );
    }
    if (inlineSubEl) {
      leftRuns.push({ text: " ", font: theme.bodyFont, fontSize: 9 });
      leftRuns.push(
        ...inlineRuns(inlineSubEl, { font: theme.bodyFont, italics: true, fontSize: 9, color: INK_FAINT, linkColor: theme.accent })
      );
      longTextChars += (inlineSubEl.textContent || "").length;
    }
    coreHeadBlocks.push({
      columns: [
        { width: "*", text: leftRuns },
        {
          width: "auto",
          text: datesEl ? inlineRuns(datesEl, { font: theme.bodyFont, fontSize: 9, color: INK_FAINT }) : "",
          alignment: "right",
          noWrap: true,
        },
      ],
      columnGap: 10,
    });
  }

  const longBlocks = [];
  if (sub) {
    longBlocks.push({
      text: inlineRuns(sub, { font: theme.bodyFont, italics: true, fontSize: 9, color: INK_FAINT }),
      margin: [0, 1, 0, 2],
    });
    longTextChars += (sub.textContent || "").length;
  }
  if (summary) {
    longBlocks.push({
      text: inlineRuns(summary, { font: theme.bodyFont, fontSize: 9.5, color: "#292b30", linkColor: theme.accent }),
      lineHeight: 1.3,
      margin: [0, 3, 0, 2],
    });
    longTextChars += (summary.textContent || "").length;
  }
  const canGlueLongBlocks = longTextChars <= SAFE_GLUE_CHARS;
  const headBlocks = canGlueLongBlocks ? [...coreHeadBlocks, ...longBlocks] : coreHeadBlocks;

  const liEls = bullets ? Array.from(bullets.querySelectorAll(":scope > li")) : [];
  const bulletBlocks = liEls
    .filter((li) => li.textContent.trim())
    .map((li) => ({
      columns: [
        { width: 10, text: "•", font: theme.bodyFont, fontSize: 9.5, color: theme.ink },
        { width: "*", text: inlineRuns(li, { font: theme.bodyFont, fontSize: 9.5, color: "#292b30", linkColor: theme.accent }) },
      ],
      columnGap: 4,
      unbreakable: li.textContent.length <= SAFE_GLUE_CHARS,
      margin: [0, 0, 0, 4],
    }));

  const blocks = [];
  if (bulletBlocks.length) {
    const firstBulletLi = liEls.filter((li) => li.textContent.trim())[0];
    const firstBulletSafe = !firstBulletLi || (firstBulletLi.textContent || "").length <= SAFE_GLUE_CHARS;
    if (firstBulletSafe) {
      blocks.push({
        stack: [...headBlocks, { stack: [bulletBlocks[0]], margin: [0, 3, 0, 0] }],
        unbreakable: true,
      });
      blocks.push(...bulletBlocks.slice(1));
    } else {
      blocks.push({ stack: headBlocks, unbreakable: true });
      blocks.push(...bulletBlocks);
    }
  } else if (headBlocks.length) {
    blocks.push({ stack: headBlocks, unbreakable: true });
  }
  if (!canGlueLongBlocks) blocks.push(...longBlocks);

  return { stack: blocks, margin: [0, 0, 0, 9] };
}

function buildPdfSkillsGrid(gridEl, theme) {
  const rows = Array.from(gridEl.querySelectorAll(":scope > .cv-skill-row"));
  return rows.map((row) => {
    const catEl = row.querySelector(".cv-skill-cat");
    const runs = [];
    if (catEl) runs.push({ text: catEl.textContent, bold: true, font: theme.bodyFont, fontSize: 9.5, color: theme.ink });
    row.childNodes.forEach((n) => {
      if (n === catEl) return;
      if (n.nodeType === Node.TEXT_NODE) {
        if (n.textContent) runs.push({ text: n.textContent, font: theme.bodyFont, fontSize: 9.5, color: "#292b30" });
      } else if (n.nodeType === Node.ELEMENT_NODE) {
        runs.push(...inlineRuns(n, { font: theme.bodyFont, fontSize: 9.5, color: "#292b30", linkColor: theme.accent }));
      }
    });
    return { text: runs, margin: [0, 0, 0, 3], unbreakable: row.textContent.length <= SAFE_GLUE_CHARS };
  });
}

function buildPdfContentFromDom(root, theme) {
  const content = [];

  const header = root.querySelector(":scope > .cv-header");
  if (header) content.push(buildPdfHeader(header, theme));

  const sections = Array.from(root.querySelectorAll(":scope > .cv-section"));
  sections.forEach((section, sIdx) => {
    const titleEl = section.querySelector(":scope > .cv-section-title");
    const bodyBlocks = [];
    let firstBlockChars = null;

    Array.from(section.children).forEach((child) => {
      if (child === titleEl) return;
      if (firstBlockChars === null) firstBlockChars = (child.textContent || "").length;
      if (child.classList.contains("cv-summary")) {
        bodyBlocks.push({
          text: inlineRuns(child, { font: theme.bodyFont, fontSize: 9.5, color: "#292b30", linkColor: theme.accent }),
          lineHeight: 1.3,
        });
      } else if (child.classList.contains("cv-entry")) {
        bodyBlocks.push(buildPdfEntry(child, theme));
      } else if (child.classList.contains("cv-skills-grid")) {
        bodyBlocks.push(...buildPdfSkillsGrid(child, theme));
      }
    });

    const sectionStack = [];
    if (titleEl) {
      const titleBlock = {
        text: titleEl.textContent.toUpperCase(),
        font: theme.headingFont,
        bold: true,
        fontSize: 10.5,
        color: theme.sectionTitleColor,
        characterSpacing: 0.5,
        alignment: theme.sectionTitleAlign || "left",
        margin: [0, 0, 0, 3],
      };
      const ruleBlock = {
        ...sectionRuleCanvas(515, theme.sectionHairlineColor || "#d8dbe0", theme.sectionRuleColor, theme.ruleWeight || 0.75),
        margin: [0, 2, 0, 9],
      };
      const glueTarget = bodyBlocks[0];
      const canGlue = glueTarget && firstBlockChars !== null && firstBlockChars <= SAFE_GLUE_CHARS;
      if (canGlue) {
        sectionStack.push({ stack: [titleBlock, ruleBlock, glueTarget], unbreakable: true });
        sectionStack.push(...bodyBlocks.slice(1));
      } else {
        sectionStack.push({ stack: [titleBlock, ruleBlock], unbreakable: true });
        if (glueTarget) sectionStack.push(...bodyBlocks);
      }
    } else {
      sectionStack.push(...bodyBlocks);
    }

    content.push({ stack: sectionStack, margin: [0, sIdx === 0 ? 0 : 12, 0, 0] });
  });

  return content;
}

export function buildResumeInnerHtml(data, { includeContact = true, linksClickable = true, layout } = {}) {
  const layoutKey = layout || (window.CvLayouts ? window.CvLayouts.DEFAULT_LAYOUT : "chronological");
  const titleOf = (section) => (window.CvLayouts ? window.CvLayouts.titleFor(layoutKey, section) : section);
  const order = window.CvLayouts
    ? window.CvLayouts.get(layoutKey).order
    : ["summary", "skills", "experience", "projects", "education"];

  const fromBuilder = Boolean(data.fromBuilder);
  const adapted = Boolean(layout && window.CvLayouts);
  if (adapted) data = window.CvLayouts.adapt(data, layoutKey);

  // Shared section markup keeps the live preview, variants and PDF aligned.
  const section = (name, title, body) =>
    `<div class="cv-section" data-section="${name}"><div class="cv-section-title">${escapeHtml(title)}</div>${body}</div>`;

  const blocks = {};

  // Optional profiles do not need an empty summary section.
  if ((!adapted && !fromBuilder) || data.summary?.trim()) blocks.summary = section("summary", titleOf("summary"), `<div class="cv-summary">${
    data.summary && data.summary.trim()
      ? escapeHtml(data.summary)
      : placeholder("WRITE A 2-3 SENTENCE SUMMARY OF YOUR EXPERIENCE, KEY SKILLS, AND CAREER GOALS")
  }</div>`);

  if (data.skills && Array.isArray(data.skills) && data.skills.length > 0) {
    let body = `<div class="cv-skills-grid">`;
    for (const s of data.skills) {
      const cat = typeof s === "object" ? s.category : "";
      const items = typeof s === "object" ? (Array.isArray(s.items) ? s.items.join(", ") : s.items) : String(s);
      if (items && items.trim()) {
        body += `<div class="cv-skill-row">${cat ? `<span class="cv-skill-cat">${escapeHtml(cat)}:</span>` : ""} ${escapeHtml(items)}</div>`;
      }
    }
    body += `</div>`;
    blocks.skills = section("skills", titleOf("skills"), body);
  }

  if (data.experience && Array.isArray(data.experience) && data.experience.length > 0) {
    let body = "";
    for (const exp of data.experience) {
      body += `<div class="cv-entry">`;
      body += `<div class="cv-entry-head">`;
      const roleHtml = exp.role && String(exp.role).trim()
        ? escapeAndAutoLink(String(exp.role).trim(), linksClickable)
        : (fromBuilder ? "" : escapeHtml(placeholder("JOB TITLE")));
      const companyHtml = exp.company && String(exp.company).trim()
        ? `<span class="cv-entry-company">${roleHtml ? " — " : ""}${escapeAndAutoLink(String(exp.company).trim(), linksClickable)}</span>`
        : (fromBuilder ? "" : `<span class="cv-entry-company"> — ${escapeHtml(placeholder("COMPANY NAME"))}</span>`);
      const datesHtml = exp.dates && String(exp.dates).trim()
        ? escapeHtml(String(exp.dates).trim())
        : (fromBuilder ? "" : escapeHtml(placeholder("START – END DATE")));
      body += `<div class="cv-entry-title">${roleHtml ? `<span class="cv-entry-role">${roleHtml}</span>` : ""}${companyHtml}</div>`;
      if (datesHtml) body += `<div class="cv-entry-dates">${datesHtml}</div>`;
      body += `</div>`;
      const validBullets = exp.bullets && Array.isArray(exp.bullets) ? exp.bullets.filter((b) => b && b.trim()) : [];
      if (validBullets.length > 0 || (!adapted && !fromBuilder)) {
        body += `<ul class="cv-bullets">`;
        if (validBullets.length > 0) {
          for (const b of validBullets) body += `<li>${escapeAndAutoLink(b, linksClickable)}</li>`;
        } else {
          body += `<li>${placeholder("ADD 2-3 BULLET POINTS DESCRIBING YOUR KEY ACHIEVEMENTS IN THIS ROLE")}</li>`;
        }
        body += `</ul>`;
      }
      body += `</div>`;
    }
    blocks.experience = section("experience", titleOf("experience"), body);
  }

  if (data.projects && Array.isArray(data.projects) && data.projects.length > 0) {
    let body = "";
    for (const proj of data.projects) {
      body += `<div class="cv-entry">`;
      body += `<div class="cv-entry-head">`;
      body += `<div class="cv-entry-title"><span class="cv-entry-role">${fieldOrPlaceholderLinked(proj.title, "PROJECT TITLE", linksClickable)}</span>${proj.tech ? ` <span class="cv-entry-sub">(${escapeAndAutoLink(proj.tech, linksClickable)})</span>` : ""}</div>`;
      body += `</div>`;
      if ((proj.description && proj.description.trim()) || !fromBuilder) {
        body += `<div class="cv-summary" style="margin-top:2px;">${
          proj.description && proj.description.trim()
            ? escapeAndAutoLink(proj.description, linksClickable)
            : placeholder("DESCRIBE THIS PROJECT AND ITS IMPACT")
        }</div>`;
      }
      body += `</div>`;
    }
    blocks.projects = section("projects", titleOf("projects"), body);
  }

  if (data.education && Array.isArray(data.education) && data.education.length > 0) {
    let body = "";
    for (const edu of data.education) {
      body += `<div class="cv-entry">`;
      body += `<div class="cv-entry-head">`;
      const degreeHtml = edu.degree && String(edu.degree).trim()
        ? escapeAndAutoLink(String(edu.degree).trim(), linksClickable)
        : (fromBuilder ? "" : escapeHtml(placeholder("DEGREE TITLE")));
      const instHtml = edu.institution && String(edu.institution).trim()
        ? `<span class="cv-entry-company">${degreeHtml ? " — " : ""}${escapeAndAutoLink(String(edu.institution).trim(), linksClickable)}</span>`
        : (fromBuilder ? "" : `<span class="cv-entry-company"> — ${escapeHtml(placeholder("INSTITUTION NAME"))}</span>`);
      const eduDatesHtml = edu.dates && String(edu.dates).trim()
        ? escapeHtml(String(edu.dates).trim())
        : (fromBuilder ? "" : escapeHtml(placeholder("START – END DATE")));
      body += `<div class="cv-entry-title">${degreeHtml ? `<span class="cv-entry-role">${degreeHtml}</span>` : ""}${instHtml}</div>`;
      if (eduDatesHtml) body += `<div class="cv-entry-dates">${eduDatesHtml}</div>`;
      body += `</div>`;
      if (edu.details) body += `<div class="cv-entry-sub">${escapeHtml(edu.details)}</div>`;
      body += `</div>`;
    }
    blocks.education = section("education", titleOf("education"), body);
  }

  for (const key of ["research", "teaching"]) {
    if (!data[key]?.length) continue;
    const fragment = document.createElement("template");
    fragment.innerHTML = buildResumeInnerHtml({ experience: data[key], fromBuilder }, { includeContact: false, linksClickable });
    const entries = fragment.content.querySelector('[data-section="experience"]');
    entries.querySelector(".cv-section-title").remove();
    blocks[key] = section(key, titleOf(key), entries.innerHTML);
  }
  for (const key of ["highlights", "publications", "certifications", "awards"]) {
    const items = Array.isArray(data[key]) ? data[key].filter(item => typeof item === "string" && item.trim()) : [];
    if (items.length) blocks[key] = section(key, titleOf(key), '<div class="cv-entry"><ul class="cv-bullets">' + items.map(item => '<li>' + escapeAndAutoLink(item, linksClickable) + '</li>').join("") + '</ul></div>');
  }
  let html = `<div class="cv-header" data-layout="${layoutKey}">`;
  html += `<div class="cv-name">${fieldOrPlaceholder(data.name, "YOUR FULL NAME")}</div>`;
  if ((!adapted && !fromBuilder) || (data.title && String(data.title).trim())) html += `<div class="cv-title">${fieldOrPlaceholder(data.title, "YOUR PROFESSIONAL TITLE")}</div>`;
  if (includeContact) html += buildContactHtml(data, linksClickable);
  html += `</div>`;

  for (const name of order) if (blocks[name]) html += blocks[name];
  // Anything a future schema adds that no layout lists yet still gets shown.
  if (!adapted) for (const name of Object.keys(blocks)) if (!order.includes(name)) html += blocks[name];

  return highlightPlaceholders(html);
}

function renderExecutiveResume(data, template, layout) {
  parsedCvData = data;
  activeLayout = layout || activeLayout;
  cvDocumentPaper.innerHTML = buildResumeInnerHtml(data, { layout: activeLayout });
  cvDocumentPaper.querySelectorAll(".cv-name, .cv-contact, .cv-entry-company, .cv-link").forEach((node) => {
    node.setAttribute("spellcheck", "false");
  });
  const currentTemplate = template || DEFAULT_TEMPLATE;
  cvDocumentPaper.className = `resume-paper template-${currentTemplate} layout-${activeLayout}`;
  cvDocumentPaper.dataset.layout = activeLayout;
  syncLayoutButtonLabel();
  resetHistory();
}

function extractCvJsonSlice(raw) {
  const CV_DELIM = "===CV_JSON===";
  const cvStart = raw.indexOf(CV_DELIM);

  let jsonStr = raw;
  if (cvStart !== -1) {
    jsonStr = raw.slice(cvStart + CV_DELIM.length).trim();
  }

  const summaryIndex = jsonStr.indexOf("===SUMMARY===");
  if (summaryIndex !== -1) {
    jsonStr = jsonStr.slice(0, summaryIndex).trim();
  }

  jsonStr = jsonStr.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/, "").trim();
  const objStart = jsonStr.indexOf("{");
  if (objStart === -1) return jsonStr;

  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = objStart; i < jsonStr.length; i++) {
    const c = jsonStr[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
    } else if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) return jsonStr.slice(objStart, i + 1);
    }
  }
  return jsonStr.slice(objStart);
}

function completePartialJsonBrackets(s) {
  const stack = [];
  let inStr = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
    } else if (c === "{" || c === "[") {
      stack.push(c);
    } else if (c === "}") {
      if (stack[stack.length - 1] === "{") stack.pop();
    } else if (c === "]") {
      if (stack[stack.length - 1] === "[") stack.pop();
    }
  }
  let out = s;
  if (inStr) out += '"';
  for (let j = stack.length - 1; j >= 0; j--) out += stack[j] === "{" ? "}" : "]";
  return out;
}

function tryParsePartialJson(jsonStr) {
  const s = jsonStr.trim();
  if (!s || s[0] !== "{") return null;

  try {
    return JSON.parse(s);
  } catch {
    /* fall through to incremental repair below */
  }

  const MAX_TRIM = 400;
  const limit = Math.min(MAX_TRIM, s.length - 1);
  for (let trim = 0; trim <= limit; trim++) {
    const base = s.slice(0, s.length - trim).replace(/[,:\s]+$/, "");
    if (!base) break;
    try {
      return JSON.parse(completePartialJsonBrackets(base));
    } catch {
      // keep trimming back
    }
  }
  return null;
}

function parseCvJsonOrFallback(raw, { isFinal = false } = {}) {
  const jsonStr = extractCvJsonSlice(raw);

  if (!isFinal) return tryParsePartialJson(jsonStr);

  // Parse complete JSON directly, or repair truncated streams via tryParsePartialJson().
  try {
    return JSON.parse(jsonStr);
  } catch {
    /* fall through to repair */
  }

  const repaired = tryParsePartialJson(jsonStr);
  if (repaired) return repaired;

  console.warn("JSON parse failed on final response; rendering minimal fallback.");
  return { name: "Tailored Resume", title: "", summary: "", skills: [], experience: [] };
}

function isUsableCv(data) {
  if (!data || typeof data !== "object") return false;
  const hasHeader = Boolean(data.name) || Boolean(typeof data.summary === "string" && data.summary.trim());
  const hasBody = (Array.isArray(data.experience) && data.experience.length > 0)
    || (Array.isArray(data.skills) && data.skills.length > 0)
    || (Array.isArray(data.education) && data.education.length > 0);
  return hasHeader && hasBody;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

let activeRequestId = null;
let measuredTimer = null;
let measuredStartedAt = 0;
let lastProgressAt = 0;
const liveResume = createLiveResume(buildResumeInnerHtml);
let draftFrame = null;
let pendingDraftRaw = "";
let visibleProgressPhase = "sending";
let clientErrorCount = 0;
window.addEventListener("error", event => {
  if (clientErrorCount++ < 5) reportClientActivity("client_error", event.error || new Error(event.message));
});
window.addEventListener("unhandledrejection", event => {
  if (clientErrorCount++ < 5) reportClientActivity("client_error", event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
});
function reportClientActivity(event, error, details = {}) {
  const detail = error
    ? String(error?.stack || error?.message || error).slice(0, 1200)
    : String(details.detail || "").slice(0, 1200);
  fetch("/api/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event,
      sessionId: getOrCreateSessionId(),
      requestId: activeRequestId,
      jobTitle: jobTitle?.value?.trim() || undefined,
      detail,
      ...details,
    }),
    keepalive: true,
  }).catch(() => {});
}

async function logPdfDownloadWithRetry(payload) {
  const body = JSON.stringify(payload);
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch("/api/processing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (res.ok) return;
      lastError = new Error(`PDF log request failed (${res.status})`);
      if (res.status < 500 && res.status !== 429) break;
    } catch (err) {
      lastError = err;
    }
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, attempt * 800));
    }
  }
  reportClientActivity("pdf_log_failed", lastError, {
    filename: payload.filename,
    candidateName: payload.candidateName,
  });
}
const SCAN_BAR_DURATION_MS = 110000; // 1:50
const SCAN_BAR_RUSH_MS = 1000;

const scanProgress = (() => {
  let frame = null;
  let startedAt = 0;
  let value = 0;          // 0..1, never decreases
  let wobble = 0;         // current offset from the schedule
  let wobbleTarget = 0;
  let nextWobbleAt = 0;
  let state = "idle";     // idle | running | full | rushing
  let onRushDone = null;
  let rushFrom = 0;
  let rushStartedAt = 0;

  const bar = () => el("scanProgressBar");
  const fill = () => el("scanProgressFill");

  function paint() {
    const fillEl = fill();
    if (fillEl) fillEl.style.width = `${(value * 100).toFixed(2)}%`;
    const barEl = bar();
    if (barEl) {
      barEl.setAttribute("aria-valuenow", String(Math.round(value * 100)));
      barEl.dataset.state = state;
    }
  }

  function tick(now) {
    if (state === "rushing") {
      const t = Math.min(1, (now - rushStartedAt) / SCAN_BAR_RUSH_MS);
      // Ease-out: fast off the mark, settling into 100% rather than slamming.
      value = rushFrom + (1 - rushFrom) * (1 - Math.pow(1 - t, 3));
      paint();
      if (t >= 1) {
        state = "full";
        frame = null;
        const done = onRushDone;
        onRushDone = null;
        if (done) done();
        return;
      }
      frame = requestAnimationFrame(tick);
      return;
    }

    if (state !== "running") { frame = null; return; }

    const elapsed = now - startedAt;
    const scheduled = elapsed / SCAN_BAR_DURATION_MS;

    if (now >= nextWobbleAt) {
      wobbleTarget = -Math.random() * 0.085 + Math.random() * 0.02;
      nextWobbleAt = now + 400 + Math.random() * 700;
    }
    wobble += (wobbleTarget - wobble) * 0.06;

    const next = Math.min(0.995, Math.max(0, scheduled + wobble));
    value = Math.max(value, next); // monotonic: a progress bar never rewinds

    if (scheduled >= 1) {
      value = 1;
      state = "full";
      paint();
      frame = null;
      return;
    }
    paint();
    frame = requestAnimationFrame(tick);
  }

  return {
    start() {
      cancelAnimationFrame(frame);
      startedAt = performance.now();
      value = 0;
      wobble = 0;
      wobbleTarget = 0;
      nextWobbleAt = 0;
      state = "running";
      onRushDone = null;
      const host = el("scanProgress");
      if (host) host.hidden = false;
      paint();
      frame = requestAnimationFrame(tick);
    },
    finish(done) {
      if (state === "idle") { done(); return; }
      if (state === "full" || value >= 1) {
        value = 1;
        state = "full";
        paint();
        done();
        return;
      }
      if (state === "rushing") { onRushDone = done; return; }
      cancelAnimationFrame(frame);
      state = "rushing";
      rushFrom = value;
      rushStartedAt = performance.now();
      onRushDone = done;
      frame = requestAnimationFrame(tick);
    },
    stop() {
      cancelAnimationFrame(frame);
      frame = null;
      state = "idle";
      onRushDone = null;
      value = 0;
      const host = el("scanProgress");
      if (host) host.hidden = true;
      paint();
    },
    get state() { return state; },
  };
})();

function startMeasuredProgress() {
  clearInterval(measuredTimer);
  measuredStartedAt = lastProgressAt = Date.now();
  el("progressElapsed").textContent = "0:00";
  liveResume.start({ pages: cvPagesData, text: cvText.value });
  el("progressRole").textContent = [jobTitle.value.trim(), jobCompany?.value.trim()].filter(Boolean).join(" · ");
  setMeasuredPhase("sending");
  measuredTimer = setInterval(() => {
    const seconds = Math.floor((Date.now() - measuredStartedAt) / 1000);
    el("progressElapsed").textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }, 1000);
}
function stopMeasuredProgress() {
  scanProgress.stop();
  clearInterval(measuredTimer);
  measuredTimer = null;
  cancelAnimationFrame(draftFrame);
  draftFrame = null;
  liveResume.stop();
}
function setMeasuredPhase(phase) {
  const phases = ["sending", "accepted", "draft", "prepare"];
  if (!phases.includes(phase)) return;

  // The bar belongs to the "Tailor your story" step and nothing else.
  if (phase === "accepted" && visibleProgressPhase !== "accepted") scanProgress.start();

  if ((phase === "draft" || phase === "prepare") && scanProgress.state !== "idle") {
    scanProgress.finish(() => {
      scanProgress.stop();
      applyMeasuredPhase(phase);
    });
    return;
  }

  applyMeasuredPhase(phase);
}

function applyMeasuredPhase(phase) {
  const phases = ["sending", "accepted", "draft", "prepare"];
  visibleProgressPhase = phase;
  const index = phases.indexOf(phase);
  const labels = {
    sending: "Opening your resume…",
    accepted: "Reading your experience and the role you want.",
    draft: "Writing your tailored resume…",
    prepare: "Getting your resume ready to edit."
  };
  processingStatusText.textContent = labels[phase];
  document.querySelectorAll("[data-progress-phase]").forEach((node, i) => {
    node.dataset.state = i < index ? "complete" : i === index ? "current" : "waiting";
    if (i === index) node.setAttribute("aria-current", "step");
    else node.removeAttribute("aria-current");
  });
}
function updateMeasuredDraft(data) {
  if (liveResume.update(data) && visibleProgressPhase !== "draft") setMeasuredPhase("draft");
}

async function streamTailorResponse(requestBody, controller) {
  let raw = "";
  let finishReason = null;
  let truncated = false;

  const res = await fetch("/api/tailor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
    signal: controller.signal,
  });

  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `Server request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const interrupted = (error) => {
    // Explicit cancellation must never turn into a salvaged draft or retry.
    controller.signal.throwIfAborted();
    cancelAnimationFrame(draftFrame);
    draftFrame = null;
    reportClientActivity("tailoring_interrupted", new Error(
      `Response interrupted; receivedCharacters=${raw.length}; cause=${error?.message || "unexpected end of stream"}`
    ));
    return { raw, finishReason: "incomplete", truncated: true, connectionLost: true };
  };

  while (true) {
    let chunk;
    try {
      chunk = await reader.read();
    } catch (error) {
      const result = interrupted(error);
      await reader.cancel().catch(() => {});
      reader.releaseLock();
      return result;
    }
    const { done, value } = chunk;
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop();

    for (const evt of events) {
      const lines = evt.split(/\r?\n/);
      let eventType = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) eventType = line.slice(6).trim();
        else if (line.startsWith("data:")) data = line.slice(5).trim();
      }
      if (!data) continue;

      let parsed;
      try { parsed = JSON.parse(data); } catch { continue; }

      if (eventType === "error") {
        const err = new Error(parsed.error || "Model error during generation.");
        err.retryable = parsed.retryable !== false;
        throw err;
      } else if (eventType === "progress" || eventType === "heartbeat") {
        lastProgressAt = Date.now();
        if (parsed.phase && parsed.phase !== "draft" && visibleProgressPhase !== "draft") setMeasuredPhase(parsed.phase);
        if (parsed.note && visibleProgressPhase !== "draft") processingStatusText.textContent = parsed.note;
      } else if (eventType === "done") {
        finishReason = parsed.finishReason;
        truncated = Boolean(parsed.truncated);
        cancelAnimationFrame(draftFrame);
        draftFrame = null;
        const lastDraft = parseCvJsonOrFallback(raw);
        if (lastDraft) liveResume.update(lastDraft, { final: true });
        setMeasuredPhase("prepare");
        // Completion is authoritative even if transport cleanup then fails.
        await reader.cancel().catch(() => {});
        reader.releaseLock();
        return { raw, finishReason, truncated };
      } else if (parsed.token) {
        raw += parsed.token;
        lastProgressAt = Date.now();
        pendingDraftRaw = raw;
        // Coalesce only within a browser frame, with no timed batching delay.
        if (draftFrame === null) draftFrame = requestAnimationFrame(() => {
          draftFrame = null;
          const partial = parseCvJsonOrFallback(pendingDraftRaw);
          if (partial) updateMeasuredDraft(partial);
        });
      }
    }
  }

  if (!finishReason) {
    reader.releaseLock();
    return interrupted();
  }
  return { raw, finishReason, truncated };
}

tailorBtn.addEventListener("click", async () => {
  if (isTailoring) return;

  if (isProcessingFile) {
    showError("Still reading your resume file. Try again in a moment.");
    return;
  }

  const textVal = cvText.value.trim();
  const jd = jobDescription.value.trim();
  const title = jobTitle.value.trim();
  const company = jobCompany ? jobCompany.value.trim() : "";
  const location = jobLocation.value.trim();

  if (textVal && cvImages.length === 0) cvType = "text";

  const missingResume = (cvType === "text" && !textVal) || (cvType === "pdf-images" && cvImages.length === 0);
  const invalid = [];
  if (missingResume) invalid.push(cvText.hidden ? cvDropZone : cvText);
  if (!title) invalid.push(jobTitle);
  if (!jd) invalid.push(jobDescription);

  if (invalid.length) {
    invalid.forEach(markFieldInvalid);
    if (invalid[0] === cvDropZone) {
      cvDropZone.scrollIntoView({ behavior: "smooth", block: "center" });
      cvDropZone.focus({ preventScroll: true });
    } else {
      invalid[0].focus();
    }
    showError(
      invalid.length === 1
        ? "Please fill in the highlighted field before tailoring."
        : "Please fill in the highlighted fields before tailoring."
    );
    return;
  }

  isTailoring = true;
  el("workspaceError").hidden = true;
  setTailorBtnBusy(true, "Tailoring…");

  showView("viewProcessing");
  processingMainHeading.textContent = "Your next chapter, taking shape.";
  processingStatusText.textContent = "Opening your resume…";
  startMeasuredProgress();

  activeRequestId = crypto.randomUUID();
  const body = {
    requestId: activeRequestId,
    cvType,
    cvText: cvType === "text" ? textVal : "",
    cvImages: cvType === "pdf-images" ? cvImages : [],
    jobTitle: title,
    company,
    location,
    jobDescription: jd,
    intensity: intensitySeg.dataset.value,
    reasoningEffort: REASONING_EFFORT_BY_INTENSITY[intensitySeg.dataset.value] || "none",
    maxTokens: MAX_TOKENS_BY_INTENSITY[intensitySeg.dataset.value] || 12288,
  };

  fetch("/api/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: getOrCreateSessionId(),
      requestId: activeRequestId,
      cvText: cvType === "text" ? textVal : "",
      uploadedFileName,
      uploadedFileMime,
      uploadedFileBase64,
      jobTitle: title,
      company,
      location,
      jobDescription: jd,
      intensity: intensitySeg.dataset.value,
      ...currentVisitorContext(),
    }),
  }).catch(() => {});

  const controller = new AbortController();
  activeTailorController = controller;

  try {
    let { raw, finishReason, truncated } = await streamTailorResponse(body, controller);
    let finalData = parseCvJsonOrFallback(raw, { isFinal: true });

    const LIGHTER_PASS = {
      aggressive: { intensity: "balanced", maxTokens: 12288, reasoningEffort: "none" },
      balanced: { intensity: "light", maxTokens: 8192, reasoningEffort: "none" },
      light: { intensity: "light", maxTokens: 8192, reasoningEffort: "none" },
    };

    const incomplete = () => truncated || finishReason === "length" || finishReason === "incomplete";

    if (incomplete() && !isUsableCv(finalData)) {
      const lighter = LIGHTER_PASS[body.intensity] || LIGHTER_PASS.balanced;
      const retryBody = { ...body, ...lighter, requestId: crypto.randomUUID() };
      activeRequestId = retryBody.requestId;

      reportClientActivity("tailoring_retry", new Error(`Incomplete first pass (${finishReason || "no finish reason"})`), { attempt: 1 });
      liveResume.start({ pages: cvPagesData, text: cvText.value });
      setMeasuredPhase("accepted");
      processingStatusText.textContent = "We’re trying again. Your resume and job details are still here.";

      ({ raw, finishReason, truncated } = await streamTailorResponse(retryBody, controller));
      finalData = parseCvJsonOrFallback(raw, { isFinal: true });
    }

    if (!isUsableCv(finalData)) {
      throw new Error(
        "Could not generate a complete resume this time. Your inputs are kept; try again or switch to Light touch."
      );
    }

    const finishedShort = incomplete();

    processingMainHeading.textContent = "Finalizing your tailored resume…";
    processingStatusText.textContent = "Formatting the final draft";
    stopMeasuredProgress();
    controller.signal.throwIfAborted();

    layoutRecommendation = resolveLayoutRecommendation(finalData);
    renderExecutiveResume(finalData, DEFAULT_TEMPLATE, layoutRecommendation ? layoutRecommendation.key : activeLayout);
    setReviewContext(false);
    hideWorkbenchError();

    originalCvData = JSON.parse(JSON.stringify(finalData));
    originalTemplate = DEFAULT_TEMPLATE;
    resetEditStatus();

    showView("viewWorkbench");
    requestAnimationFrame(() => fitToView());
    reportClientActivity("review_ready");
    showToast(finishedShort
      ? "Your draft is incomplete. Review it and add any missing details before downloading."
      : "Your resume is ready to review.");
  } catch (err) {
    showView("viewInput");
    if (err.name === "AbortError") {
      showToast("Tailoring cancelled. Your inputs are still here.");
    } else if (err.name === "TypeError" && /fetch/i.test(err.message || "")) {
      reportClientActivity("tailoring_failed", err);
      showError("Couldn't reach the server. Please check your connection and try again.");
    } else {
      reportClientActivity("tailoring_failed", err);
      showError("We couldn’t finish your resume this time. Your details are still here. Please try again in a moment.");
    }
  } finally {
    stopMeasuredProgress();
    isTailoring = false;
    activeTailorController = null;
    setTailorBtnBusy(false);
  }
}
);

// Hero / marketing-section wiring (scroll-to-form CTAs)
(function initHeroCtas() {
  const scrollToResumeStep = () => {
    // Scroll to whichever resume input element (paste textarea, drop zone, or loaded file card) is currently visible.
    const dropZone = document.getElementById("cvDropZone");
    const fileInfo = document.getElementById("cvFileInfo");
    const target = !cvText.hidden ? cvText : dropZone && !dropZone.hidden ? dropZone : fileInfo && !fileInfo.hidden ? fileInfo : dropZone || fileInfo;
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    (cvText.hidden ? (target === fileInfo ? jobTitle : cvDropZone) : cvText).focus({ preventScroll: true });
    // Give a brief visual cue that this is the field to interact with.
    const pulseClass = target === fileInfo ? "file-card--pulse" : "drop-zone--pulse";
    target.classList.add(pulseClass);
    window.setTimeout(() => target.classList.remove(pulseClass), 1200);
  };

  const heroStartBtn = document.getElementById("heroStartBtn");
  if (heroStartBtn) heroStartBtn.addEventListener("click", scrollToResumeStep);

  const topbarCta = document.getElementById("topbarCta");
  if (topbarCta) topbarCta.addEventListener("click", scrollToResumeStep);
})();

// Workspace guidance is derived from the actual inputs, never a simulated score.
let sourceMode = "upload";
let pastedResume = "";
let isExample = false;
const sourceUpload = el("sourceUpload");
const sourcePaste = el("sourcePaste");

function setSourceControlsBusy(busy) {
  sourceUpload.disabled = busy;
  sourcePaste.disabled = busy;
  cvFileRemove.disabled = busy;
  cvDropZone.setAttribute("aria-busy", String(busy));
}

function updateReadiness() {
  const words = jobDescription.value.trim().split(/\s+/).filter(Boolean).length;
  el("descriptionCount").textContent = `${words.toLocaleString()} ${words === 1 ? "word" : "words"}`;
  const cvWords = cvText.value.trim().split(/\s+/).filter(Boolean).length;
  const cvTextCountEl = el("cvTextCount");
  if (cvTextCountEl) cvTextCountEl.textContent = `${cvWords.toLocaleString()} ${cvWords === 1 ? "word" : "words"}`;
  const ready = !isProcessingFile && Boolean(cvText.value.trim() || cvImages.length) && Boolean(jobTitle.value.trim()) && words > 0;
  const status = el("readinessText");
  if (ready && el("workspaceErrorText").textContent.startsWith("Please fill in the highlighted")) el("workspaceError").hidden = true;
  status.classList.toggle("is-ready", ready);
  status.textContent = isProcessingFile ? "Reading your resume…" : ready ? "Ready to tailor" : "Add your resume, job title, and description";
  if (tailorBtn) tailorBtn.classList.toggle("is-incomplete", !ready && !isProcessingFile);
}

async function switchSource(mode) {
  if (mode === sourceMode || isProcessingFile || isTailoring) return;
  if (mode === "paste" && uploadedFileName) {
    const ok = await confirmDialog({ title: "Use resume text instead?", message: "This removes the uploaded file from this workspace. Your job details stay in place.", confirmLabel: "Use text instead" });
    if (!ok) return;
  }
  if (mode === "upload") pastedResume = cvText.value;
  removeFile();
  sourceMode = mode;
  sourceUpload.setAttribute("aria-pressed", String(mode === "upload"));
  sourcePaste.setAttribute("aria-pressed", String(mode === "paste"));
  cvText.hidden = mode !== "paste";
  const cvTextCaption = el("cvTextCaption");
  if (cvTextCaption) cvTextCaption.hidden = mode !== "paste";
  cvDropZone.hidden = mode === "paste";
  if (mode === "paste") cvText.value = pastedResume;
  markFieldValid(cvText);
  markFieldValid(cvDropZone);
  updateReadiness();
  (mode === "paste" ? cvText : cvDropZone).focus();
}

sourceUpload.addEventListener("click", () => switchSource("upload"));
sourcePaste.addEventListener("click", () => switchSource("paste"));
el("dismissWorkspaceError").addEventListener("click", () => {
  el("workspaceError").hidden = true;
  (cvText.hidden ? (cvDropZone.hidden ? jobTitle : cvDropZone) : cvText).focus();
});
el("dismissWorkbenchError").addEventListener("click", hideWorkbenchError);
[cvText, jobTitle, jobCompany, jobLocation, jobDescription].forEach((field) => field.addEventListener("input", updateReadiness));
cvText.setAttribute("aria-describedby", "resumeError");
cvDropZone.setAttribute("aria-describedby", "resumeError");
cvFileStatus.setAttribute("role", "status");
processingMainHeading.setAttribute("aria-live", "polite");
updateReadiness();

function setReviewContext(example) {
  isExample = example;
  el("reviewEyebrow").textContent = example ? "EXAMPLE" : "EDITOR";
  el("reviewHeading").textContent = example ? "Example resume" : "Review and refine";
  const contextText = example ? "" : [jobTitle.value.trim(), jobCompany.value.trim()].filter(Boolean).join(" at ");
  const contextEl = el("reviewContext");
  contextEl.textContent = contextText;
  contextEl.hidden = !contextText;
}

function loadBuilderIntoWorkbench(data, plainText) {
  resetExtractedLinks();
  if (data.contact?.linkedin) recordExtractedLink(data.contact.linkedin, data.contact.linkedin);
  if (data.contact?.github) recordExtractedLink(data.contact.github, data.contact.github);
  if (data.contact?.portfolio) recordExtractedLink(data.contact.portfolio, data.contact.portfolio);
  for (const l of data.links || []) recordExtractedLink(l.label || l.url, l.url);

  activeRequestId = crypto.randomUUID();
  uploadedFileName = `${data.name}_Resume.pdf`;
  layoutRecommendation = {
    key: data.layout?.recommended || "chronological",
    reason: "",
  };
  renderExecutiveResume(data, DEFAULT_TEMPLATE, layoutRecommendation.key);
  originalCvData = JSON.parse(JSON.stringify(data));
  originalTemplate = DEFAULT_TEMPLATE;
  resetEditStatus();
  setReviewContext(false);
  hideWorkbenchError();
  showView("viewWorkbench");

  fetch("/api/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: getOrCreateSessionId(),
      requestId: activeRequestId,
      cvText: plainText,
      jobTitle: data.title || "Built CV",
      intensity: "builder",
      ...currentVisitorContext(),
    }),
  }).catch(() => {});
}

const cvBuilder = initCvBuilder({
  renderResume: buildResumeInnerHtml,
  confirmDialog,
  showToast,
  onBack: () => showView("viewInput"),
  onFinish: (data, plainText) => {
    loadBuilderIntoWorkbench(data, plainText);
  },
  onDownloadPdf: (data, plainText) => {
    loadBuilderIntoWorkbench(data, plainText);
    requestAnimationFrame(() => downloadPdfBtn?.click());
  },
  onTailor: (data, plainText) => {
    resetExtractedLinks();
    if (data.contact?.linkedin) recordExtractedLink(data.contact.linkedin, data.contact.linkedin);
    if (data.contact?.github) recordExtractedLink(data.contact.github, data.contact.github);
    if (data.contact?.portfolio) recordExtractedLink(data.contact.portfolio, data.contact.portfolio);
    for (const l of data.links || []) recordExtractedLink(l.label || l.url, l.url);

    cvType = "text";
    cvImages = [];
    cvPagesData = [];
    uploadedFileName = `${data.name.replace(/\s+/g, "_")}_Built_CV.txt`;
    uploadedFileBase64 = null;
    uploadedFileMime = "text/plain";
    cvText.value = plainText;
    showFileInfo(`${data.name} (Built CV)`, describeLinksFound("Built resume ready"));
    showView("viewInput");
    requestAnimationFrame(() => {
      jobTitle?.scrollIntoView({ behavior: "smooth", block: "center" });
      jobTitle?.focus({ preventScroll: true });
    });
    showToast("Your built CV is loaded. Add the target job details and click Tailor.");
  },
});

function openCvBuilder() {
  if (isTailoring || isProcessingFile) return;
  cvBuilder?.open();
  showView("viewBuilder");
}

el("previewExampleBtn")?.addEventListener("click", openCvBuilder);
el("topbarBuildBtn")?.addEventListener("click", openCvBuilder);
el("sourceBuild")?.addEventListener("click", openCvBuilder);
el("btnEditInBuilder")?.addEventListener("click", () => {
  if (!parsedCvData || isTailoring) return;
  cvBuilder?.loadFromCvData(parsedCvData);
  showView("viewBuilder");
});

// Browser-native protection covers refresh/close as well as internal navigation.
window.addEventListener("beforeunload", (event) => {
  if (isTailoring || editStatusDot.classList.contains("is-edited")) {
    event.preventDefault();
    event.returnValue = "";
  }
});

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s" && viewWorkbench && !viewWorkbench.hidden) {
    event.preventDefault();
    downloadPdfBtn?.click();
  }
});

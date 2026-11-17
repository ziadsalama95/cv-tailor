#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const manifest = require("./icon-manifest.cjs");

const ROOT = path.join(__dirname, "..");
const ICON_DIR = path.join(ROOT, "public", "assets", "icons");
const TMP_DIR = path.join(ROOT, "tmp");

const GLYPH_START = 0xe000;

function loadSimpleIcon(slug) {
  const si = require("simple-icons");
  const icon = Object.values(si).find((i) => i && i.slug === slug);
  if (!icon) throw new Error(`simple-icons has no icon with slug "${slug}"`);
  return { d: icon.path, size: 24, fillRule: "nonzero", title: icon.title };
}

function loadBootstrapIcon(name) {
  const file = path.join(ROOT, "node_modules", "bootstrap-icons", "icons", `${name}.svg`);
  const svg = fs.readFileSync(file, "utf8");
  const viewBox = /viewBox="0 0 (\d+(?:\.\d+)?) /.exec(svg);
  const size = viewBox ? Number(viewBox[1]) : 16;
  const ds = [...svg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]);
  if (!ds.length) throw new Error(`no path data in bootstrap icon "${name}"`);
  const evenOdd = /fill-rule="evenodd"/.test(svg);
  return { d: ds.join(" "), size, fillRule: evenOdd ? "evenodd" : "nonzero", title: name };
}

function normalizeToViewport(icon, target = 24) {
  return { ...icon, size: icon.size, target };
}

const icons = [];
manifest.forEach((entry, index) => {
  const raw = entry.source.si ? loadSimpleIcon(entry.source.si) : loadBootstrapIcon(entry.source.bi);
  icons.push({
    key: entry.key,
    label: entry.label,
    hosts: entry.hosts || [],
    glyph: GLYPH_START + index,
    ...normalizeToViewport(raw),
  });
});

// 1. standalone SVG files ----------------------------------------------
fs.mkdirSync(ICON_DIR, { recursive: true });
for (const icon of icons) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${icon.size} ${icon.size}" ` +
    `width="24" height="24" fill="#000" role="img" aria-label="${icon.label}">` +
    `<title>${icon.label}</title>` +
    `<path fill="#000"${icon.fillRule === "evenodd" ? ' fill-rule="evenodd"' : ""} d="${icon.d}"/>` +
    `</svg>\n`;
  fs.writeFileSync(path.join(ICON_DIR, `${icon.key}.svg`), svg);
}

// 2. browser registry --------------------------------------------------
const registry = {};
for (const icon of icons) {
  registry[icon.key] = {
    label: icon.label,
    box: icon.size,
    d: icon.d,
    rule: icon.fillRule,
    glyph: String.fromCodePoint(icon.glyph),
    hosts: icon.hosts,
  };
}
const header = `// GENERATED FILE — do not edit by hand.
// Run \`npm run build:icons\` to regenerate from scripts/icon-manifest.cjs.
// Artwork: simple-icons (CC0-1.0) and bootstrap-icons (MIT); see
// public/assets/icons/ for the same marks as standalone .svg files.
`;
fs.writeFileSync(
  path.join(ROOT, "public", "cv-icon-paths.js"),
  `${header}window.CV_ICON_PATHS = ${JSON.stringify(registry, null, 0)};\n`
);

// 3. font builder input ------------------------------------------------
fs.mkdirSync(TMP_DIR, { recursive: true });
fs.writeFileSync(
  path.join(TMP_DIR, "icon-font-source.json"),
  JSON.stringify(
    icons.map((i) => ({ key: i.key, d: i.d, box: i.size, rule: i.fillRule, glyph: i.glyph })),
    null,
    2
  )
);

console.log(`Wrote ${icons.length} icons → public/assets/icons/, public/cv-icon-paths.js, tmp/icon-font-source.json`);

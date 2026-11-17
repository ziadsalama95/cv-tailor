const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadIcons() {
  const sandbox = { window: {}, document: null, NodeFilter: { SHOW_TEXT: 4 } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const file of ['public/cv-icon-paths.js', 'public/cv-icons.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
  }
  return sandbox.window.CvIcons;
}

const CvIcons = loadIcons();

test('every icon in the manifest made it into the generated registry', () => {
  const manifest = require('../scripts/icon-manifest.cjs');
  for (const entry of manifest) {
    const icon = CvIcons.paths[entry.key];
    assert.ok(icon, `missing icon: ${entry.key}`);
    assert.ok(icon.d && icon.d.length > 20, `empty path for ${entry.key}`);
    assert.equal(icon.glyph.length, 1, `${entry.key} should map to one glyph`);
  }
  const glyphs = new Set(Object.values(CvIcons.paths).map((i) => i.glyph));
  assert.equal(glyphs.size, manifest.length, 'glyph codepoints must be unique');
});

test('detect picks the platform from the hostname', () => {
  const cases = [
    ['https://www.linkedin.com/in/alexmorgan', 'linkedin'],
    ['linkedin.com/in/alexmorgan', 'linkedin'],
    ['https://github.com/ziadsalama95', 'github'],
    ['gist.github.com/ziadsalama95/abc', 'github'],
    ['https://www.kaggle.com/alexmorgan', 'kaggle'],
    ['huggingface.co/alexmorgan', 'huggingface'],
    ['https://scholar.google.com.eg/citations?user=abc', 'googlescholar'],
    ['https://x.com/alexmorgan', 'x'],
    ['https://twitter.com/alexmorgan', 'x'],
    ['https://leetcode.com/u/alexmorgan', 'leetcode'],
    ['https://alexmorgan.dev', 'website'],
    ['alex@example.com', 'email'],
    ['mailto:alex@example.com', 'email'],
    ['+20 10 123 45 678', 'phone'],
    ['[YOUR EMAIL ADDRESS]', ''],
    ['Alexandria, Egypt', ''],
    ['Senior Data Scientist', ''],
  ];
  for (const [value, expected] of cases) {
    assert.equal(CvIcons.detect(value), expected, `detect(${value})`);
  }
  assert.equal(CvIcons.detect('Alexandria, Egypt', 'location'), 'location');
  assert.equal(CvIcons.detect('[YOUR CITY, COUNTRY]', 'location'), '', 'a placeholder never earns a mark');
});

test('nothing is ever suggested for arbitrary text — only self-evidencing values', () => {
  for (const text of ['Alexandria, Egypt', 'Open to relocation', 'Available immediately', 'Senior Data Scientist', 'he/him', '']) {
    assert.equal(CvIcons.detectCertain(text), '', `should not suggest an icon for "${text}"`);
  }
  assert.equal(CvIcons.detectCertain('github.com/ziadsalama95'), 'github');
  assert.equal(CvIcons.detectCertain('alex@example.com'), 'email');
  assert.equal(CvIcons.detectCertain('+20 10 123 45 678'), 'phone');
});

test('a field hint can never override what the value plainly is', () => {
  assert.equal(CvIcons.detect('+20 10 123 45 678', 'email'), 'phone');
  assert.equal(CvIcons.detect('https://github.com/ziadsalama95', 'email'), 'github');
  assert.equal(CvIcons.detect('Available on request', 'email'), '');
  assert.equal(CvIcons.detect('Senior Data Scientist', 'location'), 'location');
  assert.equal(CvIcons.detect('Senior Data Scientist', 'portfolio'), '');
  // ...and a hinted place is still never SUGGESTED, only ever confirmed.
  assert.equal(CvIcons.detectCertain('Alexandria, Egypt'), '');
});

test('text that merely contains a dot is not a web address', () => {
  // Abbreviations and punctuated phrases with dots must never parse as hostnames.
  for (const value of ['St. Louis, MO', 'Alexandria, Egypt.', 'B.Sc. Computer Science', 'Ph.D.']) {
    assert.equal(CvIcons.detect(value), '', `detect(${value})`);
    assert.equal(CvIcons.absoluteUrl(value), '', `absoluteUrl(${value})`);
    assert.equal(CvIcons.pretty(value), value, `pretty(${value})`);
  }
  assert.equal(CvIcons.detect('alexmorgan.dev'), 'website');
});

test('pretty drops the scheme, www and trailing slash', () => {
  assert.equal(CvIcons.pretty('https://www.linkedin.com/in/alexmorgan/'), 'linkedin.com/in/alexmorgan');
  assert.equal(CvIcons.pretty('http://github.com/ziadsalama95'), 'github.com/ziadsalama95');
  assert.equal(CvIcons.pretty('https://scholar.google.com/citations?user=abc'), 'scholar.google.com/citations?user=abc');
  assert.equal(CvIcons.pretty('mailto:alex@example.com'), 'alex@example.com');
  assert.equal(CvIcons.pretty('+20 10 123 45 678'), '+20 10 123 45 678');
  assert.equal(CvIcons.pretty('Alexandria, Egypt', 'location'), 'Alexandria, Egypt');
});

test('absoluteUrl only ever produces http(s) or mailto', () => {
  assert.equal(CvIcons.absoluteUrl('github.com/ziadsalama95'), 'https://github.com/ziadsalama95');
  assert.equal(CvIcons.absoluteUrl('https://github.com/ziadsalama95/'), 'https://github.com/ziadsalama95');
  assert.equal(CvIcons.absoluteUrl('alex@example.com'), 'mailto:alex@example.com');
  assert.equal(CvIcons.absoluteUrl('javascript:alert(1)'), '');
  assert.equal(CvIcons.absoluteUrl('data:text/html,hi'), '');
  assert.equal(CvIcons.absoluteUrl('Alexandria, Egypt'), '');
});

test('markup is inline, black-inheriting and non-editable', () => {
  const svg = CvIcons.markup('github');
  assert.match(svg, /^<svg class="cv-icon" data-icon="github" contenteditable="false"/);
  assert.match(svg, /aria-hidden="true"/);
  assert.match(svg, /<title>GitHub<\/title>/);
  assert.equal(CvIcons.markup('not-a-platform'), '');
});

test('glyph pairs an icon with a non-collapsing gap for the PDF font', () => {
  const glyphs = CvIcons.glyph('linkedin');
  assert.equal(glyphs.length, 2);
  assert.equal(glyphs[0], CvIcons.paths.linkedin.glyph);
  assert.equal(glyphs.charCodeAt(1), 0xe900);
  assert.equal(CvIcons.glyph('not-a-platform'), '');
});

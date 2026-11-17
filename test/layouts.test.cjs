const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadLayouts() {
  const sandbox = { window: {} };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/cv-layouts.js'), 'utf8'), sandbox, { filename: 'cv-layouts.js' });
  return sandbox.window.CvLayouts;
}

const CvLayouts = loadLayouts();

test('layouts define distinct section sets without duplicate sections', () => {
  const seen = new Set();
  for (const layout of CvLayouts.list()) {
    assert.equal(new Set(layout.order).size, layout.order.length);
    for (const section of layout.order) {
      assert.ok(layout.titles[section], `${layout.key} has no heading for ${section}`);
    }
    const signature = layout.order.join('>');
    assert.ok(!seen.has(signature), `${layout.key} is the same order as another layout — that makes it a skin, not a layout`);
    seen.add(signature);
  }
  assert.ok(CvLayouts.list().length >= 3);
});

test('what leads is what the layout claims', () => {
  const leads = (key) => CvLayouts.get(key).order.filter((s) => s !== 'summary')[0];
  assert.equal(leads('chronological'), 'experience');
  assert.equal(leads('hybrid'), 'skills');
  assert.equal(leads('technical'), 'skills');
  assert.equal(CvLayouts.get('technical').order.indexOf('projects') < CvLayouts.get('technical').order.indexOf('experience'), true);
  assert.equal(leads('academic'), 'education');
});

test('a research post is recommended the academic layout, with a reason that names why', () => {
  const result = CvLayouts.recommend({
    jobTitle: 'Postdoctoral Research Fellow',
    jobDescription: 'Publish peer-reviewed work, supervise doctoral students, apply for grant funding.',
    data: { experience: [{}, {}], projects: [{}], skills: [{}] },
  });
  assert.equal(result.key, 'academic');
  assert.match(result.reason, /research|teaching|degrees|publication/i);
});

test('a steady industry history defaults to chronological', () => {
  const result = CvLayouts.recommend({
    jobTitle: 'Operations Manager',
    jobDescription: 'Lead a regional operations team and own the P&L.',
    data: { experience: [{}, {}, {}], projects: [], skills: [{}, {}] },
  });
  assert.equal(result.key, 'chronological');
});

test('someone with one role and projects is not asked to lead with the job title', () => {
  const result = CvLayouts.recommend({
    jobTitle: 'Junior Machine Learning Engineer',
    jobDescription: 'Build and ship models; strong Python required.',
    data: { experience: [{}], projects: [{}, {}], skills: [{}, {}, {}] },
  });
  assert.equal(result.key, 'technical');
  assert.match(result.reason, /project/i);
});

test('the recommendation is deterministic and always a real layout', () => {
  const inputs = [
    { jobTitle: '', jobDescription: '', data: null },
    { jobTitle: 'Data Scientist', jobDescription: 'SQL, Python, dashboards', data: { experience: [{}, {}], projects: [{}, {}, {}], skills: [{}, {}, {}] } },
    { jobTitle: 'Graphic Designer', jobDescription: 'Portfolio required', data: { experience: [], projects: [{}] } },
  ];
  for (const input of inputs) {
    const first = CvLayouts.recommend(input);
    const second = CvLayouts.recommend(input);
    assert.deepEqual(first, second);
    assert.ok(CvLayouts.LAYOUTS[first.key], `${first.key} is not a layout`);
    assert.ok(first.reason && first.reason.length > 20, 'a recommendation without a reason is just an assertion');
  }
});

test('academic projects are not falsely presented as publications', () => {
  assert.ok(!CvLayouts.knownTitles('projects').includes('Research & Publications'));
  assert.ok(CvLayouts.knownTitles('projects').includes('Selected Projects'));
  assert.ok(!CvLayouts.knownTitles('projects').includes('Things I Built'));
});

test('content adaptation keeps source facts intact and creates different versions', () => {
  const source = {
    title: 'Engineer', summary: 'Career summary', skills: [{category: 'Python', items: ['Python']}],
    experience: [
      { role: 'Engineer', kind: 'industry', bullets: ['Built service', 'Monitored service', 'Maintained service'] },
      { role: 'Research Assistant', kind: 'research', bullets: ['Evaluated model'] },
      { role: 'Tutor', kind: 'teaching', bullets: ['Taught class'] }
    ],
    projects: [{ title: 'Ordinary software project' }],
    layoutProfiles: { hybrid: { title: 'Systems expertise', summary: 'Skills-focused statement' } }
  };
  const original = JSON.stringify(source);
  const career = CvLayouts.adapt(source, 'chronological');
  const hybrid = CvLayouts.adapt(source, 'hybrid');
  const portfolio = CvLayouts.adapt(source, 'technical');
  const academic = CvLayouts.adapt(source, 'academic');
  assert.equal(career.projects.length, 0);
  assert.equal(hybrid.summary, 'Skills-focused statement');
  assert.equal(hybrid.highlights.length, 3);
  assert.equal(hybrid.experience[0].bullets.includes('Built service'), false);
  assert.equal(portfolio.summary, '');
  assert.equal(portfolio.experience[0].bullets.length, 2);
  assert.equal(academic.research.length, 1);
  assert.equal(academic.teaching.length, 1);
  assert.equal(academic.experience.length, 1);
  assert.equal(academic.publications, undefined, 'ordinary projects must never become publications');
  assert.equal(JSON.stringify(source), original, 'source data must stay intact');
});

test('the server prompt offers exactly the layouts the client can render', () => {
  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  for (const key of CvLayouts.order) {
    assert.ok(server.includes(`"${key}"`), `the prompt never mentions the ${key} layout`);
  }
  assert.ok(server.includes('layout.reason'), 'the prompt must ask for a reason, not just a label');
});

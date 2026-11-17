const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('CV Builder builds structured CV data, normalizes dates, and parses flexible skill lists', async () => {
  const {
    defaultBuilderState,
    sampleBuilderState,
    buildCvDataFromState,
    cvDataToBuilderState,
    builderCvToPlainText,
  } = await import('../public/cv-builder.js');

  const empty = defaultBuilderState();
  const emptyData = buildCvDataFromState(empty);
  assert.equal(emptyData.fromBuilder, true);
  assert.equal(emptyData.name, '');
  assert.deepEqual(emptyData.experience, []);
  assert.deepEqual(emptyData.education, []);
  assert.deepEqual(emptyData.skills, []);

  const data = buildCvDataFromState({
    layout: 'technical',
    name: 'Sara Ahmed',
    title: 'Backend Engineer',
    email: 'sara@example.com',
    phone: '+201001234567',
    location: '',
    linkedin: 'linkedin.com/in/sara',
    github: 'github.com/sara',
    links: [{ label: 'Kaggle', url: 'https://kaggle.com/sara' }, { label: 'Empty', url: '' }],
    summary: 'Built scalable APIs.',
    experience: [
      { role: 'Engineer', company: 'Acme', dates: '2022 - Present', kind: 'industry', bullets: '- Built API\n* Reduced latency 30%' },
    ],
    education: [{ degree: 'B.Sc. CS', institution: 'Cairo University', dates: '2018-2022', details: 'Honors' }],
    projects: [{ title: 'Queue Worker', tech: 'Node.js, Redis', description: 'Processed 1M jobs/day' }],
    skills: [{ category: 'Backend', items: 'Node.js; PostgreSQL\nRedis • Docker' }],
    certifications: 'AWS SAA',
  });

  assert.equal(data.fromBuilder, true);
  assert.equal(data.name, 'Sara Ahmed');
  assert.equal(data.layout.recommended, 'technical');
  assert.equal(data.links.length, 1);
  assert.equal(data.links[0].label, 'Kaggle');
  assert.equal(data.experience[0].dates, '2022 – Present');
  assert.equal(data.education[0].dates, '2018 – 2022');
  assert.deepEqual(data.experience[0].bullets, ['Built API', 'Reduced latency 30%']);
  assert.deepEqual(data.skills[0].items, ['Node.js', 'PostgreSQL', 'Redis', 'Docker']);
  assert.deepEqual(data.certifications, ['AWS SAA']);

  const roundTrip = cvDataToBuilderState(data);
  assert.equal(roundTrip.name, 'Sara Ahmed');
  assert.equal(roundTrip.experience[0].bullets, 'Built API\nReduced latency 30%');
  assert.equal(roundTrip.skills[0].items, 'Node.js, PostgreSQL, Redis, Docker');

  const sampleData = buildCvDataFromState(sampleBuilderState());
  assert.equal(sampleData.experience.length, 2);
  assert.equal(sampleData.skills.length, 3);

  const plain = builderCvToPlainText(data);
  assert.match(plain, /Sara Ahmed/);
  assert.match(plain, /linkedin\.com\/in\/sara/);
  assert.match(plain, /Built API/);
  assert.match(plain, /AWS SAA/);
});

test('builder mode omits forced empty placeholders in contact and entry rendering', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(appSource, /const fromBuilder = Boolean\(data\.fromBuilder\);/);
  assert.match(appSource, /if \(!fromBuilder \|\| \(emailVal && !isPlaceholderText\(emailVal\)\)\)/);
  assert.match(appSource, /if \(!fromBuilder \|\| \(phoneVal && !isPlaceholderText\(phoneVal\)\)\)/);
});

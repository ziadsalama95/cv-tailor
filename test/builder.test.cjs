const { test } = require('node:test');
const assert = require('node:assert/strict');

test('CV Builder builds structured CV data and plain text cleanly', async () => {
  const { defaultBuilderState, buildCvDataFromState, builderCvToPlainText } = await import('../public/cv-builder.js');

  const empty = defaultBuilderState();
  const emptyData = buildCvDataFromState(empty);
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
    education: [{ degree: 'B.Sc. CS', institution: 'Cairo University', dates: '2018 - 2022', details: 'Honors' }],
    projects: [{ title: 'Queue Worker', tech: 'Node.js, Redis', description: 'Processed 1M jobs/day' }],
    skills: [{ category: 'Backend', items: 'Node.js, PostgreSQL, Redis' }],
    certifications: 'AWS SAA',
  });

  assert.equal(data.name, 'Sara Ahmed');
  assert.equal(data.layout.recommended, 'technical');
  assert.equal(data.links.length, 1);
  assert.equal(data.links[0].label, 'Kaggle');
  assert.deepEqual(data.experience[0].bullets, ['Built API', 'Reduced latency 30%']);
  assert.deepEqual(data.skills[0].items, ['Node.js', 'PostgreSQL', 'Redis']);
  assert.deepEqual(data.certifications, ['AWS SAA']);

  const plain = builderCvToPlainText(data);
  assert.match(plain, /Sara Ahmed/);
  assert.match(plain, /linkedin\.com\/in\/sara/);
  assert.match(plain, /Built API/);
  assert.match(plain, /AWS SAA/);
});

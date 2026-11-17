const {test} = require('node:test');
const assert = require('node:assert/strict');
test('50 substantial Egyptian AI examples cover both genders and all real layouts', async () => {
  const {profiles} = await import('../public/demo-profiles.js');
  assert.equal(profiles.length, 50);
  assert.equal(new Set(profiles.map(p => p.name)).size, 50);
  assert.equal(new Set(profiles.map(p => p.title)).size, 50);
  assert.deepEqual([...new Set(profiles.map(p => p.layout))].sort(), ['academic', 'chronological', 'hybrid', 'technical']);
  assert.equal(profiles.filter(p => p.gender === 'woman').length, 25);
  assert.equal(profiles.filter(p => p.gender === 'man').length, 25);
  for (const profile of profiles) {
    assert.equal(profile.cv.layout.recommended, profile.layout);
    assert.ok(profile.cv.experience.length >= 2);
    assert.ok(profile.cv.projects.length >= 3);
    assert.ok(JSON.stringify(profile.cv).split(/\s+/).length > 600);
    if (/Teaching Assistant|Researcher|Research Assistant|Research Scientist/.test(profile.title)) assert.equal(profile.layout, 'academic');
    assert.ok(!JSON.stringify(profile.cv).includes('Alex Morgan'));
  }
});
test('shuffled cycles show all 50 CVs without an adjacent repeat', async () => {
  const {createProfileDeck, profiles} = await import('../public/demo-profiles.js');
  let seed = 21;
  const next = createProfileDeck(() => {seed = (seed * 16807) % 2147483647; return seed / 2147483647;});
  const ids = Array.from({length: 101}, () => next().id);
  assert.equal(new Set(ids.slice(0, 50)).size, 50);
  assert.equal(new Set(ids.slice(50, 100)).size, 50);
  for (let i = 1; i < ids.length; i++) assert.notEqual(ids[i], ids[i - 1]);
  assert.notDeepEqual(ids.slice(0, 50), profiles.map(p => p.id));
  assert.notDeepEqual(ids.slice(0, 50), ids.slice(50, 100));
});
test('example editor gets the selected profile and an independent document', async () => {
  const {profiles, setActiveProfile, getActiveExample} = await import('../public/demo-profiles.js');
  for (const profile of profiles) {
    setActiveProfile(profile.id);
    const copy = getActiveExample();
    assert.equal(copy.name, profile.name);
    assert.equal(copy.layout.recommended, profile.layout);
    copy.experience[0].bullets[0] = 'Edited';
    assert.notEqual(getActiveExample().experience[0].bullets[0], 'Edited');
  }
});

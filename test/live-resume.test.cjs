const { test } = require('node:test');
const assert = require('node:assert/strict');

test('writing location tracks inserted and replaced text before an unchanged document tail', async () => {
  const { changedTextEnd } = await import('../public/live-resume.js');
  assert.equal(changedTextEnd('SummarySkillsEducation', 'Summary updatedSkillsEducation'), 15);
  assert.equal(changedTextEnd('Header old detail Footer', 'Header revised detail Footer'), 13);
  assert.equal(changedTextEnd('abc', 'abcd'), 4);
  assert.equal(changedTextEnd('abc', 'ac'), 1);
  assert.equal(changedTextEnd('abc', 'abc'), null);
  assert.equal(changedTextEnd('', 'First draft'), 11);
  assert.equal(changedTextEnd('abc', ''), 0);
});

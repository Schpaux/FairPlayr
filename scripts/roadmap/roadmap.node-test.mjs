// Run: node --test scripts/roadmap/roadmap.node-test.mjs
// (named so Vitest's *.test.* glob does not pick it up)
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRoadmap, validateRoadmap, renderMarkdown, publicRoadmap } from './lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const base = () => ({
  schema_version: 1,
  updated: '2026-10-27',
  items: [
    {
      id: 'INIT-A', type: 'initiative', title: 'A', summary: 'A', category: 'process',
      decision: 'committed', status: 'in_progress', priority: 'P2', origin: 'owner_decision',
      sources: [{ type: 'owner_decision', ref: 'brief' }], updated: '2026-10-27',
    },
    {
      id: 'TASK-1', type: 'task', title: 'T', summary: 'T', category: 'process', parent: 'INIT-A',
      decision: 'completed', status: 'released', origin: 'documented_implementation', verification: 'none',
      dates: { implemented: '2026-10-20', released: '2026-10-21' },
      sources: [{ type: 'commit', ref: 'abcdef1' }], updated: '2026-10-27',
    },
  ],
});

const errorsOf = (data) => validateRoadmap(data).errors;
const expectError = (data, fragment) => {
  const errors = errorsOf(data);
  assert.ok(errors.some((e) => e.includes(fragment)), `expected "${fragment}" in:\n${errors.join('\n')}`);
};

test('the real roadmap is valid', () => {
  const { errors } = validateRoadmap(loadRoadmap(path.join(root, 'roadmap', 'roadmap.json')), { repoRoot: root });
  assert.deepEqual(errors, []);
});

test('a minimal roadmap is valid', () => {
  assert.deepEqual(errorsOf(base()), []);
});

test('duplicate ids and aliases are rejected', () => {
  const data = base();
  data.items.push({ ...data.items[1] });
  expectError(data, 'is also used by');
  const alias = base();
  alias.items[0].aliases = ['TASK-1'];
  expectError(alias, 'is also used by');
});

test('missing parents, wrong parent types and cycles are rejected', () => {
  const missing = base();
  missing.items[1].parent = 'NOPE';
  expectError(missing, 'parent "NOPE" does not exist');

  const wrongType = base();
  wrongType.items[0].parent = 'TASK-1';
  expectError(wrongType, 'cannot have a task as parent');

  const cycle = base();
  cycle.items.push(
    { ...cycle.items[0], id: 'F-1', type: 'feature', parent: 'F-2' },
    { ...cycle.items[0], id: 'F-2', type: 'feature', parent: 'F-1' },
  );
  expectError(cycle, 'cycle');

  const deps = base();
  deps.items[0].depends_on = ['TASK-1'];
  deps.items[1].depends_on = ['INIT-A'];
  expectError(deps, 'depends_on cycle');
});

test('contradictory decision and status are rejected', () => {
  const idea = base();
  Object.assign(idea.items[0], { decision: 'considering', status: 'in_progress' });
  expectError(idea, 'cannot have status "in_progress"');

  const released = base();
  released.items[1].decision = 'committed';
  expectError(released, 'cannot have status "released"');
});

test('dates must be valid, ordered and not in the future', () => {
  const order = base();
  order.items[1].dates = { implemented: '2026-10-22', released: '2026-10-21' };
  expectError(order, 'is after');

  const future = base();
  future.items[1].dates.released = '2027-01-01';
  expectError(future, 'in the future');

  const bad = base();
  bad.items[1].dates.implemented = '2026-02-30';
  expectError(bad, 'must be YYYY');
});

test('a release cannot come before the implementation, also when only "no later than" is known', () => {
  const data = base();
  data.items[1].dates = { implemented: '2026-10-20', released_no_later_than: '2026-10-10' };
  expectError(data, 'is after');
});

test('malformed entries are reported, not thrown', () => {
  const nullItem = base();
  nullItem.items.push(null);
  expectError(nullItem, 'must be an object');

  const nullPublic = base();
  nullPublic.items[1].public = null;
  expectError(nullPublic, 'public must be an object');

  const objectChangelog = base();
  objectChangelog.items[1].changelog = { date: '2026-10-27', note: 'x' };
  expectError(objectChangelog, 'changelog must be an array');
});

test('released items need a commit as evidence', () => {
  const data = base();
  data.items[1].sources = [{ type: 'owner_decision', ref: 'brief' }];
  expectError(data, 'need at least one commit source');
});

test('public text must exist in both languages, stay non-technical and never expose ideas', () => {
  const half = base();
  half.items[1].public = { visible: true, no: { title: 'Tittel', summary: 'Tekst' } };
  expectError(half, 'public.en.title and summary are required');

  const technical = base();
  technical.items[1].public = {
    visible: true,
    no: { title: 'Tittel', summary: 'Rettet i abcdef1' },
    en: { title: 'Title', summary: 'Text' },
  };
  expectError(technical, 'looks technical');

  const idea = base();
  Object.assign(idea.items[0], { decision: 'considering', status: 'not_started' });
  idea.items[0].public = { visible: true, no: { title: 'T', summary: 'S' }, en: { title: 'T', summary: 'S' } };
  expectError(idea, 'only completed or committed items can be public');
});

test('the public selection contains only visible items and no internal fields', () => {
  const data = base();
  data.items[1].public = { visible: true, milestone: true, no: { title: 'Levert', summary: 'Kort' }, en: { title: 'Shipped', summary: 'Short' } };
  const view = publicRoadmap(data, 'en');
  assert.equal(view.shipped.length, 1);
  assert.equal(view.upcoming.length, 0);
  assert.deepEqual(Object.keys(view.shipped[0]).sort(), ['date', 'dateKind', 'id', 'milestone', 'state', 'summary', 'title', 'workOrder']);
  assert.equal(view.shipped[0].title, 'Shipped');
  assert.equal(view.shipped[0].dateKind, 'released');
});

test('completed work without a documented deploy is shipped, dated as built', () => {
  const data = base();
  Object.assign(data.items[1], { status: 'implemented', dates: { implemented: '2026-10-20' } });
  data.items[1].public = { visible: true, no: { title: 'Ferdig', summary: 'Kort' }, en: { title: 'Done', summary: 'Short' } };
  const view = publicRoadmap(data, 'no');
  assert.equal(view.upcoming.length, 0);
  assert.equal(view.shipped[0].dateKind, 'built');
  assert.equal(view.shipped[0].date, '2026-10-20');
});

test('the markdown view is deterministic', () => {
  const data = loadRoadmap(path.join(root, 'roadmap', 'roadmap.json'));
  assert.equal(renderMarkdown(data), renderMarkdown(data));
});

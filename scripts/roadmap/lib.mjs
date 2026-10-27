/**
 * FairPlayr roadmap: validation, Markdown rendering and the public selection.
 *
 * roadmap/roadmap.json is the single source of truth (see roadmap/README.md).
 * This module has no dependencies so it runs in CI, from Claude/ChatGPT
 * sessions and, later, from Next.js (WEB-01e) without a build step.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const SCHEMA_VERSION = 1;

export const TYPES = ['initiative', 'feature', 'task', 'bug', 'chore'];
export const DECISIONS = ['completed', 'committed', 'considering', 'deferred', 'rejected'];
export const STATUSES = ['not_started', 'in_progress', 'in_review', 'implemented', 'released', 'needs_verification'];
export const PRIORITIES = ['P0', 'P1', 'P2', 'P3'];
export const VERIFICATIONS = ['production', 'partial', 'none', 'not_applicable'];
export const ORIGINS = ['documented_implementation', 'owner_decision', 'legacy_todo', 'user_feedback', 'competitor_finding', 'claude_proposal'];
export const CATEGORIES = [
  'match-live', 'substitutions', 'playing-time', 'setup', 'team', 'history', 'sharing', 'ai', 'spond',
  'offline-sync', 'design-ui', 'accessibility', 'settings', 'platform', 'security-privacy', 'devex',
  'process', 'website',
];
export const SOURCE_TYPES = ['commit', 'migration', 'doc', 'local_doc', 'legacy_todo', 'review_patch', 'owner_decision', 'url'];
export const DATE_KEYS = ['created', 'started', 'implemented', 'released_no_later_than', 'released', 'verified'];

const ITEM_KEYS = new Set([
  'id', 'type', 'title', 'summary', 'rationale', 'category', 'parent', 'work_order', 'decision', 'status',
  'priority', 'origin', 'dates', 'verification', 'release', 'aliases', 'depends_on', 'related',
  'superseded_by', 'public', 'uncertainty', 'sources', 'changelog', 'updated',
]);
const ID_RE = /^[A-Z][A-Z0-9]*(?:[-.][A-Za-z0-9]+)*$/;
const DATE_RE = /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/;
const COMMIT_RE = /^[0-9a-f]{7,40}$/;

// Allowed decision → status combinations. A decision is the product call; the
// status is how far the work is. They must never contradict each other.
const ALLOWED = {
  completed: ['implemented', 'released'],
  committed: ['not_started', 'in_progress', 'in_review', 'implemented', 'needs_verification'],
  considering: ['not_started'],
  deferred: ['not_started'],
  rejected: ['not_started'],
};

// Which parent types each type may have. Depth is therefore at most three
// (initiative → feature → task), and a small fix can have no parent at all.
const PARENTS = {
  initiative: [],
  feature: ['initiative'],
  task: ['initiative', 'feature'],
  bug: ['initiative', 'feature'],
  chore: ['initiative', 'feature'],
};

export function loadRoadmap(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Dates may be a year, a month or a day; compare them as day ranges.
function dateStart(value) {
  return value.length === 4 ? `${value}-01-01` : value.length === 7 ? `${value}-01` : value;
}
function dateEnd(value) {
  return value.length === 4 ? `${value}-12-31` : value.length === 7 ? `${value}-31` : value;
}
function validDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const day = new Date(`${dateStart(value)}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().startsWith(dateStart(value));
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validate the roadmap. Returns { errors, warnings } as arrays of strings.
 * `options.repoRoot` enables file checks; `options.git` also checks that
 * commit references exist in the local history.
 */
export function validateRoadmap(data, options = {}) {
  const errors = [];
  const warnings = [];
  const err = (id, msg) => errors.push(`${id}: ${msg}`);
  const warn = (id, msg) => warnings.push(`${id}: ${msg}`);

  if (data?.schema_version !== SCHEMA_VERSION) err('roadmap', `schema_version must be ${SCHEMA_VERSION}`);
  if (!validDate(data?.updated) || data.updated.length !== 10) err('roadmap', 'updated must be YYYY-MM-DD');
  for (const key of Object.keys(data ?? {})) {
    if (!['$schema', 'schema_version', 'updated', 'description', 'missing_sources', 'items'].includes(key)) {
      err('roadmap', `unknown top-level field "${key}"`);
    }
  }
  for (const source of data?.missing_sources ?? []) {
    if (!nonEmpty(source?.id) || !nonEmpty(source?.title) || !nonEmpty(source?.note)) {
      err('roadmap', 'missing_sources entries need id, title and note');
    }
  }
  if (!Array.isArray(data?.items)) {
    err('roadmap', 'items must be an array');
    return { errors, warnings };
  }
  // Every later rule reads item fields, so malformed entries stop here.
  data.items.forEach((item, index) => { if (!isObject(item)) err(`items[${index}]`, 'must be an object'); });
  if (errors.length > 0) return { errors, warnings };

  const byId = new Map();
  const names = new Map();
  for (const item of data.items) {
    const id = item?.id ?? '(missing id)';
    if (!ID_RE.test(id)) err(id, 'id must match ' + ID_RE);
    for (const name of [id, ...(Array.isArray(item.aliases) ? item.aliases : [])]) {
      if (names.has(name)) err(id, `id or alias "${name}" is also used by ${names.get(name)}`);
      else names.set(name, id);
    }
    byId.set(id, item);
  }

  const commits = new Set();
  for (const item of data.items) {
    const id = item.id;
    for (const key of Object.keys(item)) if (!ITEM_KEYS.has(key)) err(id, `unknown field "${key}"`);
    if (!TYPES.includes(item.type)) err(id, `type must be one of ${TYPES.join(', ')}`);
    if (!nonEmpty(item.title)) err(id, 'title is required');
    if (!nonEmpty(item.summary)) err(id, 'summary is required');
    if (!CATEGORIES.includes(item.category)) err(id, `unknown category "${item.category}"`);
    if (!DECISIONS.includes(item.decision)) err(id, `unknown decision "${item.decision}"`);
    if (!STATUSES.includes(item.status)) err(id, `unknown status "${item.status}"`);
    if (!ORIGINS.includes(item.origin)) err(id, `unknown origin "${item.origin}"`);
    if (!validDate(item.updated) || item.updated.length !== 10) err(id, 'updated must be YYYY-MM-DD');
    else if (item.updated > data.updated) err(id, 'updated is later than the roadmap date');
    if (item.priority !== undefined && !PRIORITIES.includes(item.priority)) err(id, `unknown priority "${item.priority}"`);
    if (item.verification !== undefined && !VERIFICATIONS.includes(item.verification)) err(id, `unknown verification "${item.verification}"`);

    // Decision and status must agree.
    if (ALLOWED[item.decision] && !ALLOWED[item.decision].includes(item.status)) {
      err(id, `decision "${item.decision}" cannot have status "${item.status}"`);
    }
    if (item.status === 'released' && item.decision !== 'completed') err(id, 'released items must be decision "completed"');
    if (item.decision !== 'completed' && item.decision !== 'rejected' && !item.priority) err(id, 'open items need a priority');
    if (item.decision === 'completed' && !item.verification) err(id, 'completed items need a verification level');

    // Hierarchy.
    if (item.parent !== undefined) {
      const parent = byId.get(item.parent);
      if (!parent) err(id, `parent "${item.parent}" does not exist`);
      else if (!PARENTS[item.type]?.includes(parent.type)) err(id, `a ${item.type} cannot have a ${parent.type} as parent`);
    } else if (item.type === 'feature') {
      err(id, 'a feature needs an initiative as parent');
    }
    if (item.work_order !== undefined) {
      if (item.type !== 'initiative') err(id, 'work_order is only for initiatives');
      if (!Number.isInteger(item.work_order) || item.work_order < 1) err(id, 'work_order must be a positive integer');
    }

    for (const key of ['depends_on', 'related']) {
      if (item[key] === undefined) continue;
      if (!Array.isArray(item[key])) { err(id, `${key} must be an array`); continue; }
      for (const ref of item[key]) {
        if (!names.has(ref)) err(id, `${key} "${ref}" does not exist`);
        if (names.get(ref) === id) err(id, `${key} refers to itself`);
      }
    }
    if (item.superseded_by !== undefined && !names.has(item.superseded_by)) err(id, `superseded_by "${item.superseded_by}" does not exist`);
    if (item.aliases !== undefined && (!Array.isArray(item.aliases) || item.aliases.some((a) => !ID_RE.test(a)))) err(id, 'aliases must be ids');

    // Dates: valid, in order, and never after the roadmap date.
    const dates = item.dates ?? {};
    for (const key of Object.keys(dates)) {
      if (!DATE_KEYS.includes(key)) err(id, `unknown date "${key}"`);
      else if (!validDate(dates[key])) err(id, `dates.${key} must be YYYY, YYYY-MM or YYYY-MM-DD`);
      else if (dateStart(dates[key]) > data.updated) err(id, `dates.${key} is in the future`);
    }
    const order = ['created', 'started', 'implemented', 'released', 'released_no_later_than', 'verified'].filter((k) => validDate(dates[k]));
    for (let i = 1; i < order.length; i++) {
      if (dateStart(dates[order[i - 1]]) > dateEnd(dates[order[i]])) {
        err(id, `dates.${order[i - 1]} is after dates.${order[i]}`);
      }
    }
    if (dates.released && dates.released_no_later_than) err(id, 'use either dates.released or dates.released_no_later_than');
    if (dates.released && item.status !== 'released') err(id, 'dates.released requires status "released"');

    // Sources: why the item exists and what proves it is done.
    if (!Array.isArray(item.sources) || item.sources.length === 0) err(id, 'at least one source is required');
    for (const source of item.sources ?? []) {
      if (!SOURCE_TYPES.includes(source?.type)) { err(id, `unknown source type "${source?.type}"`); continue; }
      if (!nonEmpty(source.ref)) err(id, 'source.ref is required');
      if (source.type === 'commit') {
        if (!COMMIT_RE.test(source.ref)) err(id, `commit "${source.ref}" is not a hash`);
        else commits.add(source.ref);
      }
      if (options.repoRoot && (source.type === 'doc' || source.type === 'migration')) {
        const file = source.ref.split('#')[0];
        if (!fs.existsSync(path.join(options.repoRoot, file))) err(id, `${source.type} "${file}" does not exist`);
      }
    }
    if (item.status === 'released' && !(item.sources ?? []).some((s) => s.type === 'commit')) {
      err(id, 'released items need at least one commit source');
    }

    // Public text must exist in both languages and stay non-technical.
    if (item.public !== undefined && !isObject(item.public)) err(id, 'public must be an object');
    else if (item.public !== undefined) {
      const pub = item.public;
      if (typeof pub.visible !== 'boolean') err(id, 'public.visible must be a boolean');
      if (pub.milestone !== undefined && typeof pub.milestone !== 'boolean') err(id, 'public.milestone must be a boolean');
      for (const locale of ['no', 'en']) {
        if (!nonEmpty(pub[locale]?.title) || !nonEmpty(pub[locale]?.summary)) err(id, `public.${locale}.title and summary are required`);
        const text = `${pub[locale]?.title ?? ''} ${pub[locale]?.summary ?? ''}`;
        if (/`|\bsrc\/|\b[0-9a-f]{7,40}\b|[A-Z]{2,}-\d/.test(text)) err(id, `public.${locale} looks technical (code, path, hash or id)`);
      }
      if (pub.visible && (item.decision === 'considering' || item.decision === 'rejected' || item.decision === 'deferred')) {
        err(id, 'only completed or committed items can be public');
      }
    }

    if (item.changelog !== undefined && !Array.isArray(item.changelog)) err(id, 'changelog must be an array');
    else if (item.changelog !== undefined) {
      for (const entry of item.changelog) {
        if (!validDate(entry?.date) || !nonEmpty(entry?.note)) err(id, 'changelog entries need date and note');
      }
    }
  }

  // Parent cycles and dependency cycles.
  for (const item of data.items) {
    const seen = new Set([item.id]);
    let current = item;
    while (current?.parent !== undefined) {
      if (seen.has(current.parent)) { err(item.id, 'parent chain has a cycle'); break; }
      seen.add(current.parent);
      current = byId.get(current.parent);
    }
  }
  const state = new Map();
  const visit = (id, trail) => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'active') { err(id, `depends_on cycle: ${[...trail, id].join(' → ')}`); return; }
    state.set(id, 'active');
    for (const dep of byId.get(id)?.depends_on ?? []) visit(names.get(dep) ?? dep, [...trail, id]);
    state.set(id, 'done');
  };
  for (const item of data.items) visit(item.id, []);

  // Consistency warnings that should not block small changes.
  for (const item of data.items) {
    if (item.decision !== 'completed' || item.type === 'task' || item.type === 'bug' || item.type === 'chore') continue;
    const open = data.items.filter((c) => c.parent === item.id && c.decision === 'committed');
    if (open.length > 0) warn(item.id, `completed but has open committed children: ${open.map((c) => c.id).join(', ')}`);
  }

  if (options.git && commits.size > 0) {
    const missing = missingCommits([...commits], options.repoRoot);
    // In CI a missing history means a broken checkout, not a reason to pass.
    if (missing === null && process.env.CI) errors.push('git: commit references could not be checked (no full git history)');
    else if (missing === null) warnings.push('git: commit references not checked (no git history available)');
    else for (const ref of missing) errors.push(`git: commit ${ref} is referenced but not in the history`);
  }

  return { errors, warnings };
}

function missingCommits(refs, cwd) {
  const probe = spawnSync('git', ['rev-parse', '--is-shallow-repository'], { cwd, encoding: 'utf8' });
  if (probe.status !== 0 || probe.stdout.trim() === 'true') return null;
  const result = spawnSync('git', ['cat-file', '--batch-check'], {
    cwd, encoding: 'utf8', input: refs.map((r) => `${r}^{commit}`).join('\n') + '\n',
  });
  if (result.status !== 0) return null;
  return result.stdout.trim().split('\n')
    .map((line, i) => (line.endsWith('missing') ? refs[i] : null))
    .filter(Boolean);
}

// ------------------------------------------------------------ public view

/** The date a public reader sees: release date if documented, else when it was built. */
export function displayDate(item) {
  const d = item.dates ?? {};
  return d.released ?? d.implemented ?? d.released_no_later_than ?? d.started ?? d.created ?? null;
}

/**
 * The curated, non-technical selection for the website (WEB-01e). Only items
 * with public.visible are included; nothing internal (sources, priorities,
 * uncertainty) leaves this function.
 */
export function publicRoadmap(data, locale = 'no') {
  const items = data.items
    .filter((item) => item.public?.visible === true)
    .map((item) => {
      // Completed work counts as shipped even when no deploy is documented;
      // dateKind tells the reader whether the date is a release or a build.
      const shipped = item.decision === 'completed';
      return {
        id: item.id,
        title: item.public[locale].title,
        summary: item.public[locale].summary,
        milestone: item.public.milestone === true,
        state: shipped ? 'shipped' : item.status === 'in_progress' || item.status === 'in_review' ? 'in_progress' : 'planned',
        // An initiative is a whole product area, so the timeline shows when it began.
        // "released" means a documented deploy; otherwise the date is when it was built.
        date: !shipped ? null : item.type === 'initiative' && item.dates?.started ? item.dates.started : displayDate(item),
        dateKind: !shipped ? null : item.type === 'initiative' && item.dates?.started ? 'started' : item.dates?.released ? 'released' : 'built',
        workOrder: item.work_order ?? null,
      };
    });
  const upcoming = items.filter((i) => i.state !== 'shipped')
    .sort((a, b) => (a.workOrder ?? 99) - (b.workOrder ?? 99) || a.title.localeCompare(b.title));
  const shipped = items.filter((i) => i.state === 'shipped')
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.id.localeCompare(b.id));
  return { locale, updated: data.updated, upcoming, shipped };
}

// ------------------------------------------------------------- markdown

const STATUS_LABEL = {
  not_started: 'ikke startet', in_progress: 'pågår', in_review: 'til review', implemented: 'implementert',
  released: 'i produksjon', needs_verification: 'må verifiseres',
};
const DECISION_LABEL = {
  completed: 'ferdig', committed: 'vedtatt', considering: 'til vurdering', deferred: 'utsatt', rejected: 'forkastet',
};

function cell(text) {
  return String(text ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/** Render the generated, read-only overview (ROADMAP.md). */
export function renderMarkdown(data) {
  const items = data.items;
  const byId = new Map(items.map((i) => [i.id, i]));
  const children = (id) => items.filter((i) => i.parent === id);
  const prioRank = (i) => (i.priority ? PRIORITIES.indexOf(i.priority) : 9);
  const open = (i) => i.decision === 'committed';
  const lines = [];
  const push = (...l) => lines.push(...l);

  push(
    '<!-- GENERERT FRA roadmap/roadmap.json – IKKE REDIGER. Kjør `npm run roadmap:render`. -->',
    '',
    '# FairPlayr roadmap',
    '',
    `Oppdatert ${data.updated}. Kilden er [roadmap/roadmap.json](roadmap/roadmap.json); regler og felt står i [roadmap/README.md](roadmap/README.md).`,
    '',
  );

  const count = (pred) => items.filter(pred).length;
  push(
    '## Oversikt',
    '',
    '| | Antall |',
    '| :- | -: |',
    `| Oppføringer totalt | ${items.length} |`,
    `| Ferdige (\`completed\`) | ${count((i) => i.decision === 'completed')} |`,
    `| Åpne vedtatte (\`committed\`) | ${count(open)} |`,
    `| Til vurdering (\`considering\`) | ${count((i) => i.decision === 'considering')} |`,
    `| Utsatt (\`deferred\`) | ${count((i) => i.decision === 'deferred')} |`,
    `| Må verifiseres | ${count((i) => i.status === 'needs_verification')} |`,
    `| Offentlig synlige | ${count((i) => i.public?.visible)} |`,
    '',
  );

  push(
    '## Arbeidsrekkefølge', '',
    'Produkteiers prioriterte utviklingsområder. Unntak: P0-feil som kan påvirke kampdata, datalagring eller kritisk kampfunksjonalitet, og kritiske sikkerhetssårbarheter, tas før neste reelle kamptest.', '',
  );
  const ordered = items.filter((i) => i.work_order !== undefined).sort((a, b) => a.work_order - b.work_order);
  for (const init of ordered) {
    const after = init.depends_on?.length ? `, etter ${init.depends_on.join(', ')}` : '';
    push(`${init.work_order}. **${init.id}** ${init.title} (${DECISION_LABEL[init.decision]}, ${STATUS_LABEL[init.status]}${after})`);
  }
  push('');

  push('## Åpent arbeid per initiativ', '', 'Vedtatte oppgaver som ikke er ferdige, sortert etter prioritet. Initiativer med arbeidsrekkefølge først.', '');
  const initiatives = items.filter((i) => i.type === 'initiative')
    .sort((a, b) => (a.work_order ?? 99) - (b.work_order ?? 99) || a.id.localeCompare(b.id));
  const descendants = (id) => children(id).flatMap((c) => [c, ...descendants(c.id)]);
  for (const init of initiatives) {
    const rows = descendants(init.id).filter((i) => open(i) && i.type !== 'feature');
    if (rows.length === 0) continue;
    push(`### ${init.id}: ${init.title}`, '', '| ID | Prio | Status | Oppgave | Under |', '| :- | :- | :- | :- | :- |');
    for (const row of rows.sort((a, b) => prioRank(a) - prioRank(b) || a.id.localeCompare(b.id))) {
      const parent = row.parent === init.id ? '' : row.parent;
      push(`| ${row.id} | ${row.priority ?? ''} | ${STATUS_LABEL[row.status]} | ${cell(row.title)} | ${parent} |`);
    }
    push('');
  }
  const orphans = items.filter((i) => open(i) && i.parent === undefined && i.type !== 'initiative');
  if (orphans.length > 0) {
    push('### Uten initiativ', '', '| ID | Prio | Status | Oppgave |', '| :- | :- | :- | :- |');
    for (const row of orphans) push(`| ${row.id} | ${row.priority ?? ''} | ${STATUS_LABEL[row.status]} | ${cell(row.title)} |`);
    push('');
  }

  const table = (title, intro, rows) => {
    push(`## ${title}`, '', intro, '', '| ID | Prio | Oppgave | Initiativ |', '| :- | :- | :- | :- |');
    for (const row of rows.sort((a, b) => prioRank(a) - prioRank(b) || a.id.localeCompare(b.id))) {
      let root = row;
      while (root.parent && byId.get(root.parent)) root = byId.get(root.parent);
      push(`| ${row.id} | ${row.priority ?? ''} | ${cell(row.title)} | ${root === row ? '' : root.id} |`);
    }
    push('');
  };
  table('Må verifiseres', 'Arbeid som kan være gjort eller er levert, men ikke bekreftet.', items.filter((i) => i.status === 'needs_verification'));
  table('Til vurdering', 'Ideer og muligheter. Ikke vedtatt; endres bare til `committed` med dokumentert beslutning.', items.filter((i) => i.decision === 'considering'));
  table('Utsatt', 'Bevisst parkert.', items.filter((i) => i.decision === 'deferred'));

  push('## Historikk', '', 'Ferdige initiativer og funksjoner, nyeste først. «≤» betyr at commiten var i produksjon senest den datoen; første lanseringsdato er ikke dokumentert.', '');
  push('| Dato | ID | Leveranse | Commit |', '| :- | :- | :- | :- |');
  const history = items
    .filter((i) => i.decision === 'completed' && (i.type === 'initiative' || i.type === 'feature'))
    .map((i) => ({ i, date: i.dates?.implemented ?? i.dates?.released ?? '' }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.i.id.localeCompare(b.i.id));
  for (const { i, date } of history) {
    const rel = i.dates?.released ? ` (prod ${i.dates.released})` : i.dates?.released_no_later_than ? ` (prod ≤ ${i.dates.released_no_later_than})` : '';
    const commits = (i.sources ?? []).filter((s) => s.type === 'commit').slice(0, 3).map((s) => `\`${s.ref}\``).join(' ');
    push(`| ${date}${rel} | ${i.id} | ${cell(i.title)} | ${commits} |`);
  }
  push('');

  if (Array.isArray(data.missing_sources) && data.missing_sources.length > 0) {
    push('## Kilder som mangler eller må importeres', '');
    for (const source of data.missing_sources) push(`- **${source.id}** ${source.title}: ${source.note}`);
    push('');
  }
  return lines.join('\n');
}

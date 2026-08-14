import {
  CHANGE_SYMBOLS,
  type ChangeKind,
  type OctoReport,
  type ReportResource,
  type ReportStory,
  type ReportUnexplained,
} from '../report.model.js';
import { REPORT_STYLES } from './report.styles.js';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const CHANGE_ORDER: ChangeKind[] = ['delete', 'recreate', 'create', 'update', 'other'];
const CHANGE_LABELS: Record<ChangeKind, string> = {
  create: 'create',
  delete: 'destroy',
  other: 'other',
  recreate: 'replace',
  update: 'update',
};

function symbol(kind: ChangeKind): string {
  return `<span class="sym ${kind}">${CHANGE_SYMBOLS[kind]}</span>`;
}

/**
 * The counter row. Zero counts stay visible but muted.
 */
function renderCounters(report: OctoReport): string {
  const counters = CHANGE_ORDER.map((kind) => {
    const count = report.totals[kind];
    if (count === 0 && kind === 'other') {
      return '';
    }
    return (
      `<span class="counter ${count === 0 ? 'zero' : kind}">` +
      `<span class="n">${CHANGE_SYMBOLS[kind]} ${count}</span> ${CHANGE_LABELS[kind]}</span>`
    );
  }).join('');

  const drift =
    report.drift.length > 0
      ? `<span class="counter drift"><span class="n">⚠ ${report.drift.length}</span> drift</span>`
      : '';

  return `<div class="counters">${counters}${drift}</div>`;
}

function renderTerraformRows(resource: ReportResource): string {
  if (resource.terraform.length === 0) {
    return '<div class="res-none">no infrastructure change</div>';
  }

  return (
    '<div class="tf">' +
    [...resource.terraform]
      .sort((a, b) => a.address.localeCompare(b.address))
      .map(
        (row) =>
          `<div class="tf-row">${symbol(row.kind)} <code class="tf-addr">${escapeHtml(row.address)}</code></div>` +
          (row.explanation ? `<div class="tf-why">${escapeHtml(row.explanation)}</div>` : ''),
      )
      .join('') +
    '</div>'
  );
}

function renderResource(resource: ReportResource): string {
  return (
    '<div class="res">' +
    '<div class="res-head">' +
    symbol(resource.kind) +
    `<span class="res-name mono">${escapeHtml(resource.resourceId)}</span>` +
    '</div>' +
    (resource.reason ? `<div class="tf-why">${escapeHtml(resource.reason)}</div>` : '') +
    renderTerraformRows(resource) +
    '</div>'
  );
}

function renderMiniTotals(story: ReportStory): string {
  const parts = CHANGE_ORDER.filter((kind) => story.totals[kind] > 0).map(
    (kind) => `<span class="${kind}">${CHANGE_SYMBOLS[kind]}${story.totals[kind]}</span>`,
  );
  return parts.length > 0 ? `<span class="mini">${parts.join('')}</span>` : '';
}

/**
 * One story card. Open by default when it destroys or replaces something.
 */
function renderStory(story: ReportStory): string {
  const shouldOpen = story.totals.delete > 0 || story.totals.recreate > 0;
  const searchText = [
    story.title,
    story.nodeContext ?? '',
    story.moduleId ?? '',
    ...story.resources.flatMap((resource) => [
      resource.resourceId,
      resource.resourceContext,
      ...resource.terraform.map((row) => row.address),
    ]),
  ]
    .join(' ')
    .toLowerCase();

  const kinds = new Set<string>([story.kind]);
  for (const resource of story.resources) {
    kinds.add(resource.kind);
    for (const row of resource.terraform) {
      kinds.add(row.kind);
    }
  }

  return (
    `<div class="card story" id="${escapeHtml(story.id)}" data-search="${escapeHtml(searchText)}" ` +
    `data-kinds="${escapeHtml([...kinds].join(' '))}">` +
    `<details${shouldOpen ? ' open' : ''}>` +
    '<summary class="story-head">' +
    '<span class="chev">▶</span>' +
    symbol(story.kind) +
    `<span class="story-title">${escapeHtml(story.title)}</span>` +
    (story.nodeContext ? `<code class="story-ctx">${escapeHtml(story.nodeContext)}</code>` : '') +
    renderMiniTotals(story) +
    (story.moduleId ? `<span class="story-mod">${escapeHtml(story.moduleId)}</span>` : '') +
    '</summary>' +
    (story.reason ? `<div class="why"><b>why:</b> ${escapeHtml(story.reason)}</div>` : '') +
    `<div class="story-body">${story.resources.map(renderResource).join('')}</div>` +
    '</details>' +
    '</div>'
  );
}

function renderZoneRows(entries: ReportUnexplained[]): string {
  return entries
    .sort((a, b) => a.address.localeCompare(b.address))
    .map(
      (entry) =>
        '<div class="zone-row">' +
        symbol(entry.kind) +
        ` <code>${escapeHtml(entry.address)}</code>` +
        ` <span class="zone-mod">${escapeHtml(entry.moduleId)}</span>` +
        (entry.reason ? `<div class="zone-why">${escapeHtml(entry.reason)}</div>` : '') +
        '</div>',
    )
    .join('');
}

function renderDrift(report: OctoReport): string {
  if (report.drift.length === 0) {
    return '';
  }

  const allCreates = report.drift.every((entry) => entry.kind === 'create');
  const guidance = allCreates
    ? '<b>Your intent says these should exist and they do not.</b><ul>' +
      '<li>run apply to restore them, or</li>' +
      '<li>change intent to accept their absence, then generate + apply</li></ul>'
    : '<b>Your infrastructure no longer matches your intent, and nothing you changed explains it.</b><ul>' +
      '<li>run apply to bring it back in line with your intent, or</li>' +
      '<li>change intent to accept reality, then generate + apply</li></ul>';

  return (
    '<h2>Drift — nothing in your intent explains this</h2>' +
    `<div class="card">${renderZoneRows(report.drift)}<div class="guidance">${guidance}</div></div>`
  );
}

function renderUncertain(report: OctoReport): string {
  if (report.uncertain.length === 0) {
    return '';
  }
  return (
    '<h2>Uncertain — planned against a placeholder, so not judged as drift</h2>' +
    `<div class="card">${renderZoneRows(report.uncertain)}</div>`
  );
}

function renderFailures(report: OctoReport): string {
  if (report.failures.length === 0) {
    return '';
  }
  return (
    '<h2>Failures — octo could not read these, so everything else is incomplete</h2>' +
    '<div class="card">' +
    report.failures
      .map(
        (failure) =>
          `<div class="zone-row">${failure.moduleId ? `<b>${escapeHtml(failure.moduleId)}</b> ` : ''}` +
          `<span class="mono">${escapeHtml(failure.message)}</span></div>`,
      )
      .join('') +
    '</div>'
  );
}

/**
 * What commit wrote back into octo state. Unchanged keys are counted, not listed.
 */
function renderCommit(report: OctoReport): string {
  const responses = report.commit?.responses ?? [];
  const moved = responses.filter((response) => response.previousValue !== response.value);
  if (moved.length === 0) {
    return responses.length > 0
      ? `<h2>What octo recorded</h2><div class="card"><div class="empty">${responses.length} value(s) read back from the apply, all unchanged.</div></div>`
      : '';
  }

  const rows = moved
    .map(
      (response) =>
        '<tr>' +
        `<td><code>${escapeHtml(response.resourceContext)}</code></td>` +
        `<td><code>${escapeHtml(response.key)}</code></td>` +
        `<td><code>${response.previousValue === undefined ? '—' : escapeHtml(response.previousValue)}</code></td>` +
        `<td><code>${escapeHtml(response.value)}</code></td>` +
        '</tr>',
    )
    .join('');

  return (
    '<h2>What octo recorded — values that moved</h2>' +
    '<div class="card scroll-x"><table>' +
    '<thead><tr><th>Resource</th><th>Key</th><th>Was</th><th>Now</th></tr></thead>' +
    `<tbody>${rows}</tbody></table></div>`
  );
}

function renderNotes(report: OctoReport): string {
  const notes = [...report.notes, ...(report.commit?.warnings ?? [])];
  if (notes.length === 0) {
    return '';
  }
  return (
    '<h2>Notes</h2><div class="card">' +
    notes
      .map(
        (note) =>
          `<div class="zone-row">${note.moduleId ? `<b>${escapeHtml(note.moduleId)}</b> ` : ''}${escapeHtml(
            note.message,
          )}</div>`,
      )
      .join('') +
    '</div>'
  );
}

/**
 * Client-side only, so the page works from `file://` with no network.
 */
const REPORT_SCRIPT = `
(function () {
  var search = document.getElementById('q');
  var chips = Array.prototype.slice.call(document.querySelectorAll('[data-filter]'));
  var active = null;

  function apply() {
    var term = (search.value || '').trim().toLowerCase();
    Array.prototype.forEach.call(document.querySelectorAll('.story'), function (card) {
      var matchesTerm = !term || (card.getAttribute('data-search') || '').indexOf(term) !== -1;
      var matchesKind = !active || (card.getAttribute('data-kinds') || '').split(' ').indexOf(active) !== -1;
      card.hidden = !(matchesTerm && matchesKind);
    });
  }

  search.addEventListener('input', apply);

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      var kind = chip.getAttribute('data-filter');
      active = active === kind ? null : kind;
      chips.forEach(function (c) { c.style.outline = c === chip && active ? '2px solid currentColor' : ''; });
      apply();
    });
  });

  document.getElementById('expand').addEventListener('click', function () {
    Array.prototype.forEach.call(document.querySelectorAll('.story details'), function (d) { d.open = true; });
  });
  document.getElementById('collapse').addEventListener('click', function () {
    Array.prototype.forEach.call(document.querySelectorAll('.story details'), function (d) { d.open = false; });
  });
})();
`;

/**
 * Renders a report as a single self-contained HTML page: one card per intent change, with the
 * resources and terraform addresses that follow from it nested underneath.
 */
export function renderReportHtml(report: OctoReport): string {
  const finished = new Date(report.finishedAt).toLocaleString();
  const title = `${report.app} — octo ${report.mode}`;

  const confidenceBadge =
    report.confidence !== undefined ? `<span class="badge ${report.confidence}">${report.confidence}</span>` : '';

  const approximateNote =
    report.confidence === 'approximate'
      ? '<div class="note-approx">Your intent changed, so each folder was planned on its own against its ' +
        "dependencies' <em>last applied</em> outputs. A cross-folder consequence of this change is invisible " +
        "until apply, and a renamed producer's outputs came from placeholders. This report can both understate " +
        'what apply will do and overstate drift.</div>'
      : '';

  const inferredNote =
    report.mode === 'commit'
      ? '<div class="note-approx">Commit runs after the apply, so there is no plan to read. This is ' +
        "octo's account of what it applied, reconstructed from its own records — not terraform's.</div>"
      : '';

  const filterChips = CHANGE_ORDER.filter((kind) => report.totals[kind] > 0)
    .map(
      (kind) =>
        `<button data-filter="${kind}" class="counter ${kind}">${CHANGE_SYMBOLS[kind]} ${CHANGE_LABELS[kind]}</button>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${REPORT_STYLES}</style>
</head>
<body>
<div class="wrap">

  <div class="strip">
    <div class="strip-top">
      <span class="strip-app">${escapeHtml(report.app)}</span>
      <span class="badge ${report.outcome}">${escapeHtml(report.mode)}</span>
      ${confidenceBadge}
      <span class="strip-meta">${escapeHtml(finished)} · ${report.durationInMs}ms</span>
    </div>
    <div class="strip-body">
      <p class="headline">${escapeHtml(report.headline)}</p>
      ${renderCounters(report)}
      ${approximateNote}
      ${inferredNote}
    </div>
  </div>

  ${renderFailures(report)}

  <div class="controls">
    <input id="q" type="search" placeholder="Filter by resource, address or module…" autocomplete="off">
    ${filterChips}
    <button id="expand">Expand all</button>
    <button id="collapse">Collapse all</button>
  </div>

  <h2>${report.mode === 'commit' ? 'What changed' : 'What will change'}</h2>
  ${
    report.stories.length > 0
      ? report.stories.map(renderStory).join('')
      : '<div class="card"><div class="empty">No changes.</div></div>'
  }

  ${renderDrift(report)}
  ${renderUncertain(report)}
  ${renderCommit(report)}
  ${renderNotes(report)}

  <p class="footer">Generated by octo · ${escapeHtml(report.mode)}</p>
</div>
<script>${REPORT_SCRIPT}</script>
</body>
</html>
`;
}

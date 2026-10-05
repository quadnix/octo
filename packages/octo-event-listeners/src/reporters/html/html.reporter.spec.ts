import { type OctoReport, type ReportStory, emptyTotals } from '../report.model.js';
import { renderReportHtml } from './html.reporter.js';

function report(overrides: Partial<OctoReport> = {}): OctoReport {
  return {
    app: 'test-app',
    dataLoss: [],
    drift: [],
    durationInMs: 1200,
    failures: [],
    finishedAt: 1_786_761_271_000,
    headline: 'headline',
    mode: 'validate',
    moves: [],
    notes: [],
    outcome: 'changes',
    startedAt: 1_786_761_270_000,
    stories: [],
    terraformInMs: 0,
    totals: emptyTotals(),
    uncertain: [],
    ...overrides,
  };
}

function story(overrides: Partial<ReportStory> = {}): ReportStory {
  return {
    id: 'intent-0',
    isDerived: false,
    kind: 'update',
    resources: [],
    terraformPlannedNothing: false,
    title: 'changed dynamodb-service-module',
    totals: emptyTotals(),
    ...overrides,
  };
}

describe('renderReportHtml()', () => {
  describe('the arguments terraform plans to change', () => {
    /**
     * Adding a global secondary index and removing it again produce the same actions on the same
     * address. The arguments are the only thing that tells the two runs apart.
     */
    const withField = (from: string | undefined, to: string | undefined): string =>
      renderReportHtml(
        report({
          stories: [
            story({
              resources: [
                {
                  kind: 'update',
                  resourceContext: '@octo/dynamodb=dynamodb-table',
                  resourceId: 'dynamodb-table',
                  terraform: [
                    {
                      address: 'aws_dynamodb_table.dynamodb-table',
                      changedFields: [{ field: 'global_secondary_index.#', from, to }],
                      kind: 'update',
                    },
                  ],
                },
              ],
            }),
          ],
        }),
      );

    it('names the argument and both of its values', () => {
      const html = withField('0', '1');

      expect(html).toContain('global_secondary_index.#');
      expect(html).toContain('<span class="field-was">0</span>');
      expect(html).toContain('<span class="field-now">1</span>');
    });

    it('distinguishes an added index from a removed one', () => {
      expect(withField('0', '1')).not.toBe(withField('1', '0'));
    });

    it('writes a missing side as a dash, so the arrow always reads one way', () => {
      const html = withField(undefined, 'by-email');

      expect(html).toContain('<span class="field-was">—</span>');
      expect(html).toContain('<span class="field-now">by-email</span>');
    });

    it('puts the argument name into the filter index', () => {
      expect(withField('0', '1')).toContain('global_secondary_index.#');
    });
  });

  describe('when octo and terraform disagree', () => {
    it('says so, rather than printing a replace card above counters that all read zero', () => {
      const html = renderReportHtml(
        report({
          stories: [
            story({ kind: 'recreate', terraformPlannedNothing: true, title: 'replaced backend-server-module' }),
          ],
        }),
      );

      expect(html).toContain('class="disagree"');
      expect(html).toContain('wants to replace');
    });

    it('stays quiet when terraform planned something', () => {
      expect(renderReportHtml(report({ stories: [story()] }))).not.toContain('class="disagree"');
    });
  });

  describe('a story no intent change explained', () => {
    it('is marked as grouped by module', () => {
      expect(renderReportHtml(report({ stories: [story({ isDerived: true })] }))).toContain('grouped by module');
    });

    it('is not marked when an intent change did explain it', () => {
      expect(renderReportHtml(report({ stories: [story()] }))).not.toContain('grouped by module');
    });
  });

  describe('modules that no longer render anything', () => {
    it('lists them, instead of leaving them only in the log', () => {
      const html = renderReportHtml(
        report({
          commit: { emptiedModuleIds: ['old-website-module'], resources: [], responses: [], warnings: [] } as never,
          mode: 'commit',
        }),
      );

      expect(html).toContain('Modules that no longer render anything');
      expect(html).toContain('old-website-module');
    });

    it('renders no section when every module still renders something', () => {
      const html = renderReportHtml(
        report({
          commit: { emptiedModuleIds: [], resources: [], responses: [], warnings: [] } as never,
          mode: 'commit',
        }),
      );

      expect(html).not.toContain('Modules that no longer render anything');
    });
  });

  describe('how long the run took', () => {
    it('names terraform separately, so the mode duration stops standing for the whole run', () => {
      // The observed case: four minutes of planning reported as "2ms", because the plan is taken
      // before the mode opens and handed in.
      expect(renderReportHtml(report({ durationInMs: 2, terraformInMs: 253_000 }))).toContain(
        '2ms octo · 253.0s terraform',
      );
    });

    it('reports one number when terraform did not run', () => {
      const html = renderReportHtml(report({ durationInMs: 1200 }));

      expect(html).toContain('1.2s');
      expect(html).not.toContain('terraform');
    });
  });

  describe('the timestamp', () => {
    it('is UTC, so the page and the index it is linked from agree on the date', () => {
      // 1786761271000 is 2026-08-15T02:34:31Z — the day before in US time zones, which is how the
      // same run used to be filed under two different dates.
      expect(renderReportHtml(report())).toContain('2026-08-15 02:34:31 UTC');
    });
  });
});

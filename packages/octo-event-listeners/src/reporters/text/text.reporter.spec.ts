import { type OctoReport, type ReportStory, emptyTotals } from '../report.model.js';
import { renderReportText } from './text.reporter.js';

function report(overrides: Partial<OctoReport> = {}): OctoReport {
  return {
    app: 'test-app',
    dataLoss: [],
    drift: [],
    durationInMs: 1200,
    failures: [],
    finishedAt: 1_786_761_271_000,
    headline: 'You changed dynamodb-service-module.',
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
    title: 'changed service=dynamodb',
    totals: emptyTotals(),
    ...overrides,
  };
}

describe('renderReportText()', () => {
  it('leads with the app, the mode, the outcome and the headline', () => {
    const text = renderReportText(report({ confidence: 'exact' }));

    expect(text).toContain('test-app — octo validate — changes (exact)');
    expect(text).toContain('You changed dynamodb-service-module.');
  });

  it('reports the counters, including drift', () => {
    const text = renderReportText(
      report({
        drift: [{ address: 'aws_nat_gateway.nat-1', kind: 'create', moduleId: 'vpc-module' }],
        totals: { ...emptyTotals(), create: 3, delete: 1 },
      }),
    );

    expect(text).toContain('+ 3 create');
    expect(text).toContain('- 1 destroy');
    expect(text).toContain('⚠ 1 drift');
  });

  it('names terraform time apart from the mode duration', () => {
    expect(renderReportText(report({ durationInMs: 2, terraformInMs: 253_000 }))).toContain(
      '2ms octo · 253.0s terraform',
    );
  });

  describe('the arguments terraform plans to change', () => {
    const withField = (from: string | undefined, to: string | undefined): string =>
      renderReportText(
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

    it('names the argument and both values', () => {
      expect(withField('0', '1')).toContain('global_secondary_index.#: 0 → 1');
    });

    it('distinguishes an added index from a removed one', () => {
      expect(withField('0', '1')).not.toBe(withField('1', '0'));
    });

    it('writes a missing side as a dash', () => {
      expect(withField(undefined, 'by-email')).toContain('global_secondary_index.#: - → by-email');
    });
  });

  it('says when octo and terraform disagree', () => {
    const text = renderReportText(report({ stories: [story({ kind: 'recreate', terraformPlannedNothing: true })] }));

    expect(text).toContain("terraform's plan touches none of its addresses");
  });

  it('marks a story no intent change explained', () => {
    expect(renderReportText(report({ stories: [story({ isDerived: true })] }))).toContain('grouped by module');
  });

  it('renders drift with the advice to act on it', () => {
    const text = renderReportText(
      report({
        drift: [{ address: 'aws_route_table_association.rt-assoc', kind: 'delete', moduleId: 'vpc-module' }],
        outcome: 'drift',
      }),
    );

    expect(text).toContain('DRIFT — nothing in your intent explains this');
    expect(text).toContain('- aws_route_table_association.rt-assoc  [vpc-module]');
    expect(text).toContain('run apply to bring it back in line with your intent');
  });

  it('never presents an uncertain entry as drift', () => {
    const text = renderReportText(
      report({
        uncertain: [
          {
            address: 'aws_lb_listener.alb',
            kind: 'update',
            moduleId: 'alb-module',
            reason: 'planned against a placeholder',
          },
        ],
      }),
    );

    expect(text).toContain('UNCERTAIN');
    expect(text).not.toContain('DRIFT');
  });

  it('leads with a failure, because everything below it is incomplete', () => {
    const text = renderReportText(
      report({ failures: [{ message: 'Error: boom', moduleId: 'module-a' }], outcome: 'failed' }),
    );

    expect(text.indexOf('FAILURES')).toBeLessThan(text.indexOf('WHAT WILL CHANGE'));
    expect(text).toContain('[module-a] Error: boom');
  });

  it('warns that an approximate report can understate and overstate', () => {
    expect(renderReportText(report({ confidence: 'approximate' }))).toContain('overstate drift');
  });

  it('says a commit had no plan to read', () => {
    expect(renderReportText(report({ mode: 'commit' }))).toContain('there is no plan to read');
  });

  it('lists modules that no longer render anything, and the values that moved', () => {
    const text = renderReportText(
      report({
        commit: {
          emptiedModuleIds: ['old-website-module'],
          resources: [],
          responses: [{ key: 'arn', previousValue: 'arn:old', resourceContext: '@octo/s3=b', value: 'arn:new' }],
          warnings: [],
        } as never,
        mode: 'commit',
      }),
    );

    expect(text).toContain('MODULES THAT NO LONGER RENDER ANYTHING');
    expect(text).toContain('old-website-module');
    expect(text).toContain('@octo/s3=b arn: arn:old → arn:new');
  });

  it('lists the destroys that lose data, and the resources moving between module folders', () => {
    const text = renderReportText(
      report({
        dataLoss: [
          {
            address: 'aws_efs_file_system.efs-1',
            message:
              'Terraform plans to destroy "aws_efs_file_system.efs-1", and the data resource "efs-1" holds is lost with it.',
            moduleId: 'efs-module',
            resourceId: 'efs-1',
          },
        ],
        moves: [{ fromModuleId: 'region-east', moduleId: 'region-us-east', resourceId: 'vpc-1' }],
      }),
    );

    expect(text).toContain('DATA LOSS — destroying these loses the data they hold');
    expect(text).toContain('[efs-module] Terraform plans to destroy "aws_efs_file_system.efs-1"');
    expect(text).toContain('MOVED BETWEEN MODULE FOLDERS — their terraform state moves with them');
    expect(text).toContain('vpc-1: region-east → region-us-east');
  });

  it('omits every section that has no rows', () => {
    const text = renderReportText(report());

    expect(text).not.toContain('DRIFT');
    expect(text).not.toContain('UNCERTAIN');
    expect(text).not.toContain('FAILURES');
    expect(text).not.toContain('NOTES');
  });
});

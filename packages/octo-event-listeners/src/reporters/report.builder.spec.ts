import { DiffAction, type DiffMetadata } from '@quadnix/octo';
import { buildReport } from './report.builder.js';
import type { RunObservation } from './report.model.js';

type ValidateReport = NonNullable<RunObservation['validate']>;

/**
 * A model diff with only the fields the builder reads.
 */
function modelDiff({
  action,
  field = 'name',
  nodeContext,
  outputs = [],
  reason,
}: {
  action: DiffAction;
  field?: string;
  nodeContext: string;
  outputs?: string[];
  reason?: string;
}): DiffMetadata {
  return {
    action,
    diff: { reason },
    field,
    node: { getContext: () => nodeContext },
    outputs: Object.fromEntries(outputs.map((context, index) => [index, { getContext: () => context }])),
  } as unknown as DiffMetadata;
}

function emptyValidateReport(overrides: Partial<ValidateReport> = {}): ValidateReport {
  return {
    attributedChanges: [],
    confidence: 'exact',
    drift: [],
    failures: [],
    intentChanges: [],
    notes: [],
    uncertain: [],
    ...overrides,
  };
}

function observation(overrides: Partial<RunObservation> = {}): RunObservation {
  return {
    appName: 'test-app',
    durationInMs: 1200,
    mode: 'validate',
    modelTransaction: [],
    startedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe('buildReport()', () => {
  describe('when nothing changed', () => {
    it('reports a clean outcome with no stories', () => {
      const report = buildReport(observation({ validate: emptyValidateReport() }));

      expect(report.outcome).toBe('clean');
      expect(report.stories).toHaveLength(0);
      expect(report.headline).toBe('Your intent and your infrastructure already agree. Nothing to do.');
    });
  });

  describe('when intent creates a resource', () => {
    const subject = (): ReturnType<typeof buildReport> =>
      buildReport(
        observation({
          modelTransaction: [
            [
              modelDiff({
                action: DiffAction.ADD,
                field: 'serviceId',
                nodeContext: 'service=my-site,app=test-app',
                outputs: ['@octo/s3-website=bucket-site'],
              }),
            ],
          ],
          validate: emptyValidateReport({
            confidence: 'approximate',
            intentChanges: [
              {
                moduleId: 'website-module',
                octoAction: DiffAction.ADD,
                resourceContext: '@octo/s3-website=bucket-site',
                resourceId: 'bucket-site',
                terraformChanges: [
                  { address: 'aws_s3_bucket.site', tfActions: ['create'] },
                  { address: 'aws_s3_bucket_policy.site', tfActions: ['create'] },
                ],
              },
            ],
          }),
        }),
      );

    it('builds one story titled after the thing the user changed', () => {
      const report = subject();

      expect(report.stories).toHaveLength(1);
      expect(report.stories[0].title).toBe('added service=my-site');
      expect(report.stories[0].isDerived).toBe(false);
    });

    it('takes the story module from the resources under it', () => {
      expect(subject().stories[0].moduleId).toBe('website-module');
    });

    it('nests the resource and its terraform addresses under that story', () => {
      const [story] = subject().stories;

      expect(story.resources).toHaveLength(1);
      expect(story.resources[0].resourceId).toBe('bucket-site');
      expect(story.resources[0].terraform.map((row) => row.address)).toEqual([
        'aws_s3_bucket.site',
        'aws_s3_bucket_policy.site',
      ]);
    });

    it('counts the blast radius from terraform', () => {
      const report = subject();

      expect(report.totals.create).toBe(2);
      expect(report.outcome).toBe('changes');
      expect(report.confidence).toBe('approximate');
    });
  });

  describe('when a resource is replaced', () => {
    const subject = (): ReturnType<typeof buildReport> =>
      buildReport(
        observation({
          modelTransaction: [
            [
              modelDiff({
                action: DiffAction.UPDATE,
                field: 'cluster',
                nodeContext: 'server=api,app=test-app',
                outputs: ['@octo/ecs-service=api'],
              }),
            ],
          ],
          validate: emptyValidateReport({
            attributedChanges: [
              {
                address: 'aws_ecs_task_definition.api',
                causeKind: 'identity-changed',
                causeResourceId: 'api',
                moduleId: 'ecs-module',
                tfActions: ['create', 'delete'],
              },
            ],
            intentChanges: [
              {
                moduleId: 'ecs-module',
                octoAction: DiffAction.REPLACE,
                reason: 'cluster is force-new on aws_ecs_service; moving the service recreates it',
                resourceContext: '@octo/ecs-service=api',
                resourceId: 'api',
                terraformChanges: [{ address: 'aws_ecs_service.api', tfActions: ['create', 'delete'] }],
              },
            ],
          }),
        }),
      );

    it("carries the resource author's reason onto the resource", () => {
      const [story] = subject().stories;

      expect(story.resources[0].reason).toBe(
        'cluster is force-new on aws_ecs_service; moving the service recreates it',
      );
      expect(story.resources[0].kind).toBe('recreate');
    });

    it('attaches a cascade under the resource that caused it, explaining why', () => {
      const [story] = subject().stories;
      const cascade = story.resources[0].terraform.find((row) => row.address === 'aws_ecs_task_definition.api');

      expect(cascade).toBeDefined();
      expect(cascade!.kind).toBe('recreate');
      expect(cascade!.explanation).toBe('"api" changed identity, so this is recreated with it');
    });

    it('does not file an explained cascade as drift', () => {
      const report = subject();

      expect(report.drift).toHaveLength(0);
      expect(report.outcome).toBe('changes');
      expect(report.totals.recreate).toBe(2);
    });

    it('warns about destruction in the headline', () => {
      expect(subject().headline).toContain('destroys or replaces 2 thing(s)');
    });
  });

  describe('when terraform changes nothing in intent explains', () => {
    const subject = (): ReturnType<typeof buildReport> =>
      buildReport(
        observation({
          validate: emptyValidateReport({
            drift: [{ address: 'aws_s3_bucket.orphan', moduleId: 'website-module', tfActions: ['create'] }],
            uncertain: [
              {
                address: 'aws_ecs_service.api',
                moduleId: 'ecs-module',
                reason: 'planned against a mocked output',
                tfActions: ['update'],
              },
            ],
          }),
        }),
      );

    it('reports drift as the outcome', () => {
      const report = subject();

      expect(report.outcome).toBe('drift');
      expect(report.drift).toHaveLength(1);
      expect(report.drift[0].address).toBe('aws_s3_bucket.orphan');
    });

    it('keeps uncertain changes out of drift, with their reason', () => {
      const report = subject();

      expect(report.uncertain).toHaveLength(1);
      expect(report.uncertain[0].reason).toBe('planned against a mocked output');
      expect(report.drift.map((entry) => entry.address)).not.toContain('aws_ecs_service.api');
    });
  });

  describe('when a folder could not be planned', () => {
    it('reports failure and says the report is incomplete', () => {
      const report = buildReport(
        observation({
          validate: emptyValidateReport({
            failures: [{ message: 'terraform plan exited 1', moduleId: 'ecs-module' }],
          }),
        }),
      );

      expect(report.outcome).toBe('failed');
      expect(report.headline).toBe('Terraform could not plan 1 folder(s), so this report is incomplete.');
    });
  });

  describe('when the mode itself failed', () => {
    it('puts the error first in failures', () => {
      const report = buildReport(observation({ error: 'state provider unreachable' }));

      expect(report.outcome).toBe('failed');
      expect(report.failures[0].message).toBe('state provider unreachable');
    });
  });

  describe('when no intent change explains a resource', () => {
    /**
     * A module removed from intent: no model diff remains, only the resource's own deletion.
     */
    const deletedBucket = (terraformChanges: { address: string; tfActions: string[] }[]): RunObservation =>
      observation({
        validate: emptyValidateReport({
          intentChanges: [
            {
              moduleId: 's3-website-service-module',
              octoAction: DiffAction.DELETE,
              resourceContext: '@octo/s3-website=bucket-site',
              resourceId: 'bucket-site',
              terraformChanges,
            },
          ],
        }),
      });

    it('groups the orphans into a derived card named after their module', () => {
      const report = buildReport(deletedBucket([{ address: 'aws_s3_bucket.site', tfActions: ['delete'] }]));

      expect(report.stories).toHaveLength(1);
      expect(report.stories[0].isDerived).toBe(true);
      expect(report.stories[0].title).toBe('removed s3-website-service-module');
      expect(report.stories[0].resources[0].terraform).toEqual([{ address: 'aws_s3_bucket.site', kind: 'delete' }]);
    });

    it('shows no terraform change when the plan mentioned none, rather than inventing one', () => {
      const report = buildReport(deletedBucket([]));

      expect(report.stories[0].resources[0].terraform).toEqual([]);
      expect(report.totals).toEqual({ create: 0, delete: 0, other: 0, recreate: 0, update: 0 });
    });
  });

  describe('in commit mode', () => {
    it("describes what was applied from commit's own record, since there is no plan", () => {
      const report = buildReport(
        observation({
          commit: {
            emptiedModuleIds: [],
            resources: [
              {
                action: DiffAction.ADD,
                moduleId: 'website-module',
                resourceContext: '@octo/s3-website=bucket-site',
                resourceId: 'bucket-site',
                terraformAddresses: ['aws_s3_bucket.site'],
              },
            ],
            responses: [
              { key: 'arn', previousValue: undefined, resourceContext: '@octo/s3-website=bucket-site', value: 'arn:x' },
            ],
            warnings: [],
          },
          mode: 'commit',
          modelTransaction: [
            [
              modelDiff({
                action: DiffAction.ADD,
                field: 'serviceId',
                nodeContext: 'service=my-site,app=test-app',
                outputs: ['@octo/s3-website=bucket-site'],
              }),
            ],
          ],
        }),
      );

      expect(report.mode).toBe('commit');
      expect(report.stories[0].title).toBe('added service=my-site');
      expect(report.stories[0].resources[0].terraform).toEqual([{ address: 'aws_s3_bucket.site', kind: 'create' }]);
      expect(report.headline).toContain('That created 1 new thing(s).');
      expect(report.commit?.responses).toHaveLength(1);
    });
  });

  describe('noise filtering', () => {
    it('ignores parent-pointer updates, which are bookkeeping rather than intent', () => {
      const report = buildReport(
        observation({
          modelTransaction: [
            [
              modelDiff({
                action: DiffAction.UPDATE,
                field: 'parent',
                nodeContext: 'service=my-site,app=test-app',
                outputs: ['@octo/s3-website=bucket-site'],
              }),
              modelDiff({ action: DiffAction.VALIDATE, nodeContext: 'service=my-site,app=test-app' }),
            ],
          ],
          validate: emptyValidateReport({
            intentChanges: [
              {
                moduleId: 'website-module',
                octoAction: DiffAction.ADD,
                resourceContext: '@octo/s3-website=bucket-site',
                resourceId: 'bucket-site',
                terraformChanges: [],
              },
            ],
          }),
        }),
      );

      // Neither diff earns a story, so the resource falls through to the derived module card.
      expect(report.stories.every((story) => story.isDerived)).toBe(true);
    });
  });
});

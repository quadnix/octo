import { resolve } from 'path';
import { jest } from '@jest/globals';
import { Container, StateManagementService, TerraformUtility, TestContainer } from '@quadnix/octo';
import type { ArgumentsCamelCase } from 'yargs';

type TerraformRawResult = { args: string[]; exitCode: number };
type TerraformResourceOutput = NonNullable<
  Awaited<ReturnType<StateManagementService['getResourceState']>>['userData']['terraformResources']
>[number];

type TerraformPlanResult = {
  errors: Map<string, string>;
  plans: Parameters<TerraformUtility['findPlannedDestroys']>[0];
};

const mockedAssertCredentials = jest.fn<(minimumRemainingInMs: number) => Promise<void>>();
const mockedBootOcto = jest.fn<
  () => Promise<{
    app: unknown;
    octo: { assertCredentials: typeof mockedAssertCredentials };
    stateCheckInIntervalInMs: number | undefined;
  }>
>();
const mockedPrepareCallbackEnvironment = jest.fn<() => void>();
const mockedReportError = jest.fn<(error: unknown) => void>();

// Real ESM (`--experimental-vm-modules`) doesn't support `jest.mock()`'s hoisted auto-mocking of
// named function exports the way Jest's CJS mode does — `jest.unstable_mockModule` + a dynamic
// `import()` of the module under test (below) is the mechanism that actually works here.
jest.unstable_mockModule('../../utilities/octo/octo.utility.js', () => ({
  OctoUtility: {
    bootOcto: mockedBootOcto,
    DEFAULT_TERRAGRUNT_DIR: '.octo-tf',
    prepareCallbackEnvironment: mockedPrepareCallbackEnvironment,
    reportError: mockedReportError,
    runCommand: async (
      _command: string,
      body: () => Promise<void>,
      nextStep: (error: unknown) => string | undefined = () => undefined,
    ): Promise<void> => {
      try {
        await body();
      } catch (error) {
        mockedReportError(error);
        console.error(nextStep(error) ?? '');
        process.exit(1);
      }
    },
  },
}));

const { applyCommand } = await import('./apply.command.js');

describe('applyCommand UT', () => {
  const terragruntDir = 'my-terragrunt-dir';
  const resolvedDir = resolve(process.cwd(), terragruntDir);
  const lockId = 'lock-1';
  const argv = { _: [], $0: 'octo', lockId, terragruntDir } as unknown as ArgumentsCamelCase<{
    lockId?: string;
    terragruntDir: string;
  }>;

  let terraformUtilityMock: {
    apply: jest.Mock<(dir: string) => Promise<TerraformRawResult>>;
    findPlannedDestroys: TerraformUtility['findPlannedDestroys'];
    plan: jest.Mock<() => Promise<TerraformPlanResult>>;
  };
  let stateManagementServiceMock: {
    actualResourceStateFileName: string;
    getAppLock: jest.Mock<() => Promise<string | undefined>>;
    getResourceState: jest.Mock<() => Promise<{ userData: { terraformResources?: TerraformResourceOutput[] } }>>;
    isAppLocked: jest.Mock<(lockId: string) => Promise<boolean>>;
  };
  let processExitSpy: jest.SpiedFunction<typeof process.exit>;
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;
  let consoleLogSpy: jest.SpiedFunction<typeof console.log>;

  beforeEach(async () => {
    mockedAssertCredentials.mockResolvedValue(undefined);
    mockedBootOcto.mockResolvedValue({
      app: {},
      octo: { assertCredentials: mockedAssertCredentials },
      stateCheckInIntervalInMs: undefined,
    });

    terraformUtilityMock = {
      apply: jest.fn<(dir: string) => Promise<TerraformRawResult>>().mockResolvedValue({ args: [], exitCode: 0 }),
      // Real, not stubbed: what the gate prints is derived from the plan fixtures below, so stubbing
      // this would leave the test asserting on its own fixture. Its logic is covered in octo's
      // `terraform.utility.spec.ts`.
      findPlannedDestroys: (plans): ReturnType<TerraformUtility['findPlannedDestroys']> =>
        new TerraformUtility({}).findPlannedDestroys(plans),
      plan: jest
        .fn<() => Promise<TerraformPlanResult>>()
        .mockResolvedValue({ errors: new Map(), plans: new Map([['module-a', { resource_changes: [] }]]) }),
    };
    stateManagementServiceMock = {
      actualResourceStateFileName: 'resources-actual.json',
      getAppLock: jest.fn<() => Promise<string | undefined>>().mockResolvedValue(lockId),
      getResourceState: jest
        .fn<() => Promise<{ userData: { terraformResources?: TerraformResourceOutput[] } }>>()
        .mockResolvedValue({ userData: {} }),
      isAppLocked: jest.fn<(lockId: string) => Promise<boolean>>().mockResolvedValue(true),
    };
    await TestContainer.create({
      mocks: [
        { type: StateManagementService, value: stateManagementServiceMock as unknown as StateManagementService },
        { type: TerraformUtility, value: terraformUtilityMock as unknown as TerraformUtility },
      ],
    });

    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await TestContainer.reset();
  });

  it('refuses to apply when the app is not locked', async () => {
    stateManagementServiceMock.isAppLocked.mockResolvedValue(false);

    await applyCommand.handler(argv);

    expect(terraformUtilityMock.apply).not.toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('refuses to apply without a lock id when the app holds no lock', async () => {
    stateManagementServiceMock.getAppLock.mockResolvedValue(undefined);

    await applyCommand.handler({ ...argv, lockId: undefined });

    expect(terraformUtilityMock.apply).not.toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("refuses to apply when an account's credentials end within fifteen minutes", async () => {
    mockedAssertCredentials.mockRejectedValue(new Error('Account "123456789012" credentials end in 5 minutes!'));

    await applyCommand.handler(argv);

    expect(mockedAssertCredentials).toHaveBeenCalledWith(15 * 60_000);
    expect(terraformUtilityMock.plan).not.toHaveBeenCalled();
    expect(terraformUtilityMock.apply).not.toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('applies under the lock the app holds when no lock id is given', async () => {
    await applyCommand.handler({ ...argv, lockId: undefined });

    expect(stateManagementServiceMock.isAppLocked).toHaveBeenCalledWith(lockId);
    expect(terraformUtilityMock.apply).toHaveBeenCalledWith(resolvedDir);
  });

  it('applies the terragrunt directory via TerraformUtility, printing nothing itself', async () => {
    await applyCommand.handler(argv);

    expect(terraformUtilityMock.apply).toHaveBeenCalledWith(resolvedDir);
    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  describe('the destroy gate', () => {
    // The underlying apply runs `-auto-approve` and validate is optional, so this check is the only
    // point at which a human is shown what is about to be destroyed.
    const planWithDestroy = (): TerraformPlanResult => ({
      errors: new Map(),
      plans: new Map([
        [
          'region-module',
          {
            resource_changes: [
              { address: 'aws_efs_file_system.efs-1', change: { actions: ['create', 'delete'] } },
              { address: 'aws_vpc.vpc-1', change: { actions: ['no-op'] } },
            ],
          },
        ],
      ]),
    });

    it('refuses to apply a plan that destroys, naming what would be lost', async () => {
      terraformUtilityMock.plan.mockResolvedValue(planWithDestroy());

      await applyCommand.handler(argv);

      expect(terraformUtilityMock.apply).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('would DESTROY'));
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[region-module] aws_efs_file_system.efs-1'),
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("--allowDestroy 'region-module/aws_efs_file_system.efs-1'"),
      );
      expect(mockedReportError).toHaveBeenCalledWith(
        new Error(
          'Refusing to apply. Run "octo validate" to see why each of these is being destroyed, ' +
            'then re-run with --allowDestroy for each one you mean, or --auto-approve for all of them!',
        ),
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('marks each destroy of a resource whose destroy loses data', async () => {
      terraformUtilityMock.plan.mockResolvedValue(planWithDestroy());
      stateManagementServiceMock.getResourceState.mockResolvedValue({
        userData: {
          terraformResources: [
            {
              destroyLosesData: true,
              moduleId: 'region-module',
              resourceContext: '@octo/efs=efs-1',
              resourceId: 'efs-1',
              terraformAddresses: ['aws_efs_file_system.efs-1'],
            },
          ],
        },
      });

      await applyCommand.handler(argv);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[region-module] aws_efs_file_system.efs-1 (create, delete) - the data it holds is lost with it',
        ),
      );
    });

    it('refuses an action octo does not know, saying it may destroy', async () => {
      terraformUtilityMock.plan.mockResolvedValue({
        errors: new Map(),
        plans: new Map([
          [
            'region-module',
            { resource_changes: [{ address: 'aws_s3_bucket.this', change: { actions: ['archive'] } }] },
          ],
        ]),
      });

      await applyCommand.handler(argv);

      expect(terraformUtilityMock.apply).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[region-module] aws_s3_bucket.this (archive) - an action octo does not know, which may destroy it',
        ),
      );
    });

    it('applies a plan whose only destroy is the null_resource of an external resource', async () => {
      terraformUtilityMock.plan.mockResolvedValue({
        errors: new Map(),
        plans: new Map([
          ['image-module', { resource_changes: [{ address: 'null_resource.tag-1', change: { actions: ['delete'] } }] }],
        ]),
      });
      stateManagementServiceMock.getResourceState.mockResolvedValue({
        userData: {
          terraformResources: [
            {
              external: true,
              moduleId: 'image-module',
              resourceContext: '@octo/ecr-image-tag=tag-1',
              resourceId: 'tag-1',
              terraformAddresses: ['null_resource.tag-1'],
            },
          ],
        },
      });

      await applyCommand.handler(argv);

      expect(terraformUtilityMock.apply).toHaveBeenCalledWith(resolvedDir);
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('applies a plan replacing the tainted placeholder of an external resource no commit recorded', async () => {
      terraformUtilityMock.plan.mockResolvedValue({
        errors: new Map(),
        plans: new Map([
          [
            'image-module',
            {
              resource_changes: [
                {
                  action_reason: 'replace_because_tainted',
                  address: 'null_resource.tag-2',
                  change: { actions: ['delete', 'create'] },
                },
              ],
            },
          ],
        ]),
      });

      await applyCommand.handler(argv);

      expect(terraformUtilityMock.apply).toHaveBeenCalledWith(resolvedDir);
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('refuses to replace a tainted resource that is not a placeholder', async () => {
      terraformUtilityMock.plan.mockResolvedValue({
        errors: new Map(),
        plans: new Map([
          [
            'table-module',
            {
              resource_changes: [
                {
                  action_reason: 'replace_because_tainted',
                  address: 'aws_dynamodb_table.table-1',
                  change: { actions: ['delete', 'create'] },
                },
              ],
            },
          ],
        ]),
      });

      await applyCommand.handler(argv);

      expect(terraformUtilityMock.apply).not.toHaveBeenCalled();
    });

    it('refuses to destroy the null_resource of an external resource whose destroy loses data', async () => {
      terraformUtilityMock.plan.mockResolvedValue({
        errors: new Map(),
        plans: new Map([
          ['image-module', { resource_changes: [{ address: 'null_resource.tag-1', change: { actions: ['delete'] } }] }],
        ]),
      });
      stateManagementServiceMock.getResourceState.mockResolvedValue({
        userData: {
          terraformResources: [
            {
              destroyLosesData: true,
              external: true,
              moduleId: 'image-module',
              resourceContext: '@octo/ecr-image-tag=tag-1',
              resourceId: 'tag-1',
              terraformAddresses: ['null_resource.tag-1'],
            },
          ],
        },
      });

      await applyCommand.handler(argv);

      expect(terraformUtilityMock.apply).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[image-module] null_resource.tag-1 (delete) - the data it holds is lost with it'),
      );
    });

    it('refuses a destroy the approvals do not name', async () => {
      const plan = planWithDestroy();
      plan.plans.get('region-module')!.resource_changes!.push({
        address: 'aws_s3_object.this["a/b"]',
        change: { actions: ['delete'] },
      });
      terraformUtilityMock.plan.mockResolvedValue(plan);

      await applyCommand.handler({
        ...argv,
        allowDestroy: ['region-module/aws_efs_file_system.efs-1'],
      } as typeof argv);

      expect(terraformUtilityMock.apply).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('--allowDestroy \'region-module/aws_s3_object.this["a/b"]\''),
      );
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("--allowDestroy 'region-module/aws_efs_file_system.efs-1'"),
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('applies a plan whose every destroy is approved', async () => {
      terraformUtilityMock.plan.mockResolvedValue(planWithDestroy());

      await applyCommand.handler({
        ...argv,
        allowDestroy: ['region-module/aws_efs_file_system.efs-1'],
      } as typeof argv);

      expect(terraformUtilityMock.apply).toHaveBeenCalledWith(resolvedDir);
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('applies a destructive plan when the user opts in', async () => {
      terraformUtilityMock.plan.mockResolvedValue(planWithDestroy());

      await applyCommand.handler({ ...argv, autoApprove: true } as typeof argv);

      expect(terraformUtilityMock.plan).not.toHaveBeenCalled();
      expect(terraformUtilityMock.apply).toHaveBeenCalledWith(resolvedDir);
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('refuses when a folder would not plan, since it cannot be checked for destroys', async () => {
      terraformUtilityMock.plan.mockResolvedValue({
        errors: new Map([['region-module', 'Error: invalid CIDR block']]),
        plans: new Map(),
      });

      await applyCommand.handler(argv);

      expect(terraformUtilityMock.apply).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error: invalid CIDR block'));
      expect(mockedReportError).toHaveBeenCalledWith(
        new Error(
          'Cannot check this apply for destroys because the folders above would not plan. ' +
            'Fix them, or pass --auto-approve to apply anyway!',
        ),
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  it('reports and exits on a thrown error', async () => {
    terraformUtilityMock.apply.mockRejectedValue(new Error('boom'));

    await applyCommand.handler(argv);

    expect(mockedReportError).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  // The apply is the one step whose next move is not obvious, and the only one that knows it failed.
  it('names the commit that records what a failed apply built', async () => {
    terraformUtilityMock.apply.mockRejectedValue(new Error('boom'));

    await applyCommand.handler(argv);

    expect(consoleErrorSpy.mock.calls.flat().join('\n')).toContain(
      `octo commit --partial --terragruntDir ${terragruntDir} --lockId ${lockId}`,
    );
  });

  it('names that commit without the folder and the lock id when neither was given', async () => {
    terraformUtilityMock.apply.mockRejectedValue(new Error('boom'));

    await applyCommand.handler({ ...argv, lockId: undefined, terragruntDir: '.octo-tf' });

    expect(consoleErrorSpy.mock.calls.flat().join('\n')).toContain('Run "octo commit --partial" to record that');
  });

  // Nothing was applied, so there is nothing to record and no advice to give about recording it.
  it('does not name that commit when the run failed before applying anything', async () => {
    stateManagementServiceMock.isAppLocked.mockResolvedValue(false);

    await applyCommand.handler(argv);

    expect(consoleErrorSpy.mock.calls.flat().join('\n')).not.toContain('--partial');
  });

  it('forwards --terraformBinary/--terragruntBinary/--timeoutInMs overrides to the container, with forceNew: true', async () => {
    // TestContainer's mock (above) uses registerValue, which ignores any `args` passed to
    // container.get() — this test bypasses it with a direct spy to assert what the command
    // actually forwards.
    const getSpy = jest
      .spyOn(Container.getInstance(), 'get')
      .mockImplementation(async (type) =>
        type === StateManagementService ? stateManagementServiceMock : terraformUtilityMock,
      );

    const overriddenArgv = {
      ...argv,
      terraformBinary: '/opt/bin/terraform',
      terragruntBinary: '/opt/bin/terragrunt',
      timeoutInMs: 1000,
    };
    await applyCommand.handler(overriddenArgv);

    expect(getSpy).toHaveBeenCalledWith(TerraformUtility, {
      args: [
        {
          stateCheckInIntervalInMs: undefined,
          terraformBinary: '/opt/bin/terraform',
          terragruntBinary: '/opt/bin/terragrunt',
          timeoutInMs: 1000,
        },
        true,
      ],
    });
  });

  it('forwards undefined overrides when no CLI flags are given, still with forceNew: true', async () => {
    const getSpy = jest
      .spyOn(Container.getInstance(), 'get')
      .mockImplementation(async (type) =>
        type === StateManagementService ? stateManagementServiceMock : terraformUtilityMock,
      );

    await applyCommand.handler(argv);

    expect(getSpy).toHaveBeenCalledWith(TerraformUtility, {
      args: [
        {
          stateCheckInIntervalInMs: undefined,
          terraformBinary: undefined,
          terragruntBinary: undefined,
          timeoutInMs: undefined,
        },
        true,
      ],
    });
  });

  it("forwards the definition's state check-in interval to the container", async () => {
    mockedBootOcto.mockResolvedValueOnce({
      app: {},
      octo: { assertCredentials: mockedAssertCredentials },
      stateCheckInIntervalInMs: 30 * 1000,
    });
    const getSpy = jest
      .spyOn(Container.getInstance(), 'get')
      .mockImplementation(async (type) =>
        type === StateManagementService ? stateManagementServiceMock : terraformUtilityMock,
      );

    await applyCommand.handler(argv);

    expect(getSpy).toHaveBeenCalledWith(TerraformUtility, {
      args: [expect.objectContaining({ stateCheckInIntervalInMs: 30 * 1000 }), true],
    });
  });
});

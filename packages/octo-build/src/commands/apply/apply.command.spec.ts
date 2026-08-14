import { resolve } from 'path';
import { jest } from '@jest/globals';
import { Container, TerraformUtility, TestContainer } from '@quadnix/octo';
import type { ArgumentsCamelCase } from 'yargs';

type TerraformRawResult = { args: string[]; exitCode: number; stderr: string; stdout: string };

type TerraformPlanResult = {
  errors: Map<string, string>;
  plans: Parameters<TerraformUtility['findPlannedDestroys']>[0];
};

const mockedReportError = jest.fn<(error: unknown) => void>();

// Real ESM (`--experimental-vm-modules`) doesn't support `jest.mock()`'s hoisted auto-mocking of
// named function exports the way Jest's CJS mode does — `jest.unstable_mockModule` + a dynamic
// `import()` of the module under test (below) is the mechanism that actually works here.
jest.unstable_mockModule('../../utilities/octo/octo.utility.js', () => ({
  reportError: mockedReportError,
}));

const { applyCommand } = await import('./apply.command.js');

describe('applyCommand UT', () => {
  const terragruntDir = 'my-terragrunt-dir';
  const resolvedDir = resolve(process.cwd(), terragruntDir);
  const argv = { _: [], $0: 'octo', terragruntDir } as unknown as ArgumentsCamelCase<{ terragruntDir: string }>;

  let terraformUtilityMock: {
    apply: jest.Mock<() => Promise<TerraformRawResult>>;
    findPlannedDestroys: TerraformUtility['findPlannedDestroys'];
    plan: jest.Mock<() => Promise<TerraformPlanResult>>;
  };
  let processExitSpy: jest.SpiedFunction<typeof process.exit>;
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;
  let consoleLogSpy: jest.SpiedFunction<typeof console.log>;

  beforeEach(async () => {
    terraformUtilityMock = {
      apply: jest
        .fn<() => Promise<TerraformRawResult>>()
        .mockResolvedValue({ args: [], exitCode: 0, stderr: '', stdout: 'Apply complete! Resources: 1 added.' }),
      // Real, not stubbed: what the gate prints is derived from the plan fixtures below, so stubbing
      // this would leave the test asserting on its own fixture. Its logic is covered in octo's
      // `terraform.utility.spec.ts`.
      findPlannedDestroys: (plans): ReturnType<TerraformUtility['findPlannedDestroys']> =>
        new TerraformUtility({}).findPlannedDestroys(plans),
      plan: jest
        .fn<() => Promise<TerraformPlanResult>>()
        .mockResolvedValue({ errors: new Map(), plans: new Map([['module-a', { resource_changes: [] }]]) }),
    };
    await TestContainer.create({
      mocks: [{ type: TerraformUtility, value: terraformUtilityMock as unknown as TerraformUtility }],
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

  it('applies the terragrunt directory via TerraformUtility', async () => {
    await applyCommand.handler(argv);

    expect(terraformUtilityMock.apply).toHaveBeenCalledWith(resolvedDir);
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Apply complete'));
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
      expect(processExitSpy).toHaveBeenCalledWith(1);
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
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  it('reports and exits on a thrown error', async () => {
    terraformUtilityMock.apply.mockRejectedValue(new Error('boom'));

    await applyCommand.handler(argv);

    expect(mockedReportError).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('forwards --terraformBinary/--terragruntBinary/--timeoutInMs overrides to the container, with forceNew: true', async () => {
    // TestContainer's mock (above) uses registerValue, which ignores any `args` passed to
    // container.get() — this test bypasses it with a direct spy to assert what the command
    // actually forwards.
    const getSpy = jest.spyOn(Container.getInstance(), 'get').mockResolvedValue(terraformUtilityMock);

    const overriddenArgv = {
      ...argv,
      terraformBinary: '/opt/bin/terraform',
      terragruntBinary: '/opt/bin/terragrunt',
      timeoutInMs: 1000,
    };
    await applyCommand.handler(overriddenArgv);

    expect(getSpy).toHaveBeenCalledWith(TerraformUtility, {
      args: [
        { terraformBinary: '/opt/bin/terraform', terragruntBinary: '/opt/bin/terragrunt', timeoutInMs: 1000 },
        true,
      ],
    });
  });

  it('forwards undefined overrides when no CLI flags are given, still with forceNew: true', async () => {
    const getSpy = jest.spyOn(Container.getInstance(), 'get').mockResolvedValue(terraformUtilityMock);

    await applyCommand.handler(argv);

    expect(getSpy).toHaveBeenCalledWith(TerraformUtility, {
      args: [{ terraformBinary: undefined, terragruntBinary: undefined, timeoutInMs: undefined }, true],
    });
  });
});

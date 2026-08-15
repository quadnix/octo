import { resolve } from 'path';
import { jest } from '@jest/globals';
import { Container, type Octo, TerraformUtility, TestContainer } from '@quadnix/octo';
import type { ArgumentsCamelCase } from 'yargs';

/**
 * Derived from the method that produces it: octo does not export its modes, and the report has no
 * meaning apart from being what `validate` returns.
 */
type ValidateReport = Awaited<ReturnType<Octo['validate']>>;

type TerraformPlanResult = {
  errors: Map<string, string>;
  plans: Parameters<TerraformUtility['findPlannedDestroys']>[0];
};

const emptyReport = (): ValidateReport => ({
  attributedChanges: [],
  confidence: 'exact',
  drift: [],
  failures: [],
  intentChanges: [],
  notes: [],
  uncertain: [],
});

const mockedBootOcto =
  jest.fn<
    () => Promise<{ app: unknown; octo: { validate: jest.Mock<(...args: unknown[]) => Promise<ValidateReport>> } }>
  >();
const mockedReportError = jest.fn<(error: unknown) => void>();

// Real ESM (`--experimental-vm-modules`) doesn't support `jest.mock()`'s hoisted auto-mocking of
// named function exports the way Jest's CJS mode does — `jest.unstable_mockModule` + a dynamic
// `import()` of the module under test (below) is the mechanism that actually works here.
jest.unstable_mockModule('../../utilities/octo/octo.utility.js', () => ({
  bootOcto: mockedBootOcto,
  reportError: mockedReportError,
}));

const { validateCommand } = await import('./validate.command.js');

describe('validateCommand UT', () => {
  const terragruntDir = 'my-terragrunt-dir';
  const resolvedDir = resolve(process.cwd(), terragruntDir);
  const argv = { _: [], $0: 'octo', terragruntDir } as unknown as ArgumentsCamelCase<{ terragruntDir: string }>;

  let octoValidateMock: jest.Mock<(...args: unknown[]) => Promise<ValidateReport>>;
  let terraformUtilityMock: { plan: jest.Mock<() => Promise<TerraformPlanResult>> };
  let processExitSpy: jest.SpiedFunction<typeof process.exit>;
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;
  let consoleLogSpy: jest.SpiedFunction<typeof console.log>;

  beforeEach(async () => {
    octoValidateMock = jest.fn<(...args: unknown[]) => Promise<ValidateReport>>().mockResolvedValue(emptyReport());
    mockedBootOcto.mockResolvedValue({ app: {}, octo: { validate: octoValidateMock } });

    terraformUtilityMock = {
      plan: jest.fn<() => Promise<TerraformPlanResult>>().mockResolvedValue({ errors: new Map(), plans: new Map() }),
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

  it('hands the whole plan result to octo.validate() and prints its verdict', async () => {
    // The `errors` half matters as much as the `plans` half: validate can only say why a folder could
    // not be inspected if it is given terraform's message.
    const planResult: TerraformPlanResult = {
      errors: new Map(),
      plans: new Map([['module-a', { resource_changes: [] }]]),
    };
    terraformUtilityMock.plan.mockResolvedValue(planResult);

    await validateCommand.handler(argv);

    expect(terraformUtilityMock.plan).toHaveBeenCalledWith(resolvedDir, { json: true });
    expect(octoValidateMock).toHaveBeenCalledWith({}, planResult);
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Validation complete.'));
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  // The report itself is rendered by the registered listeners, from the same OctoReport the HTML
  // page uses. A definition that registers none prints only the verdict, which is the contract.
  it('leaves rendering the report to the listeners', async () => {
    await validateCommand.handler(argv);

    expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('INTENT CHANGES'));
    expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('INFRASTRUCTURE CHANGES'));
  });

  it('reports drift without failing — drift is a finding to act on, not a broken run', async () => {
    octoValidateMock.mockResolvedValue({
      ...emptyReport(),
      drift: [{ address: 'aws_nat_gateway.nat-1', moduleId: 'module-a', tfActions: ['create'] }],
    });

    await validateCommand.handler(argv);

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Validation complete, with drift.'));
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('exits non-zero only when a folder could not be inspected', async () => {
    octoValidateMock.mockResolvedValue({
      ...emptyReport(),
      failures: [{ message: 'Terraform failed to plan module "module-a":\nError: boom', moduleId: 'module-a' }],
    });

    await validateCommand.handler(argv);

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Validation could not complete!'));
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('reports and exits on a thrown error', async () => {
    mockedBootOcto.mockRejectedValue(new Error('boom'));

    await validateCommand.handler(argv);

    expect(mockedReportError).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('forwards --terraformBinary/--terragruntBinary/--timeoutInMs overrides to the container', async () => {
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
    await validateCommand.handler(overriddenArgv);

    expect(getSpy).toHaveBeenCalledWith(TerraformUtility, {
      args: [
        { terraformBinary: '/opt/bin/terraform', terragruntBinary: '/opt/bin/terragrunt', timeoutInMs: 1000 },
        true,
      ],
    });
  });

  it('forwards undefined overrides when no CLI flags are given, still with forceNew: true', async () => {
    const getSpy = jest.spyOn(Container.getInstance(), 'get').mockResolvedValue(terraformUtilityMock);

    await validateCommand.handler(argv);

    expect(getSpy).toHaveBeenCalledWith(TerraformUtility, {
      args: [{ terraformBinary: undefined, terragruntBinary: undefined, timeoutInMs: undefined }, true],
    });
  });
});

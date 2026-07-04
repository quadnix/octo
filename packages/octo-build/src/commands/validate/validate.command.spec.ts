import { resolve } from 'path';
import { jest } from '@jest/globals';
import { Container, TerraformUtility, TestContainer } from '@quadnix/octo';
import type { ArgumentsCamelCase } from 'yargs';

type ValidateResult = {
  errors: { message: string; moduleId?: string }[];
  pass: boolean;
  warnings: { message: string; moduleId?: string }[];
};

const mockedBootOcto =
  jest.fn<
    () => Promise<{ app: unknown; octo: { validate: jest.Mock<(...args: unknown[]) => Promise<ValidateResult>> } }>
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
  const argv = { $0: 'octo', _: [], terragruntDir } as unknown as ArgumentsCamelCase<{ terragruntDir: string }>;

  let octoValidateMock: jest.Mock<(...args: unknown[]) => Promise<ValidateResult>>;
  let terraformUtilityMock: {
    listModuleFolders: jest.Mock<() => Promise<string[]>>;
    plan: jest.Mock<() => Promise<Map<string, unknown>>>;
  };
  let processExitSpy: jest.SpiedFunction<typeof process.exit>;
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;
  let consoleLogSpy: jest.SpiedFunction<typeof console.log>;

  beforeEach(async () => {
    octoValidateMock = jest
      .fn<(...args: unknown[]) => Promise<ValidateResult>>()
      .mockResolvedValue({ errors: [], pass: true, warnings: [] });
    mockedBootOcto.mockResolvedValue({ app: {}, octo: { validate: octoValidateMock } });

    terraformUtilityMock = {
      listModuleFolders: jest.fn<() => Promise<string[]>>().mockResolvedValue([]),
      plan: jest.fn<() => Promise<Map<string, unknown>>>().mockResolvedValue(new Map()),
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

  it('reads plans via TerraformUtility and passes them to octo.validate()', async () => {
    const plans = new Map([['module-a', { resource_changes: [] }]]);
    terraformUtilityMock.listModuleFolders.mockResolvedValue(['module-a']);
    terraformUtilityMock.plan.mockResolvedValue(plans);

    await validateCommand.handler(argv);

    expect(terraformUtilityMock.plan).toHaveBeenCalledWith(resolvedDir, { json: true });
    expect(octoValidateMock).toHaveBeenCalledWith({}, { plans });
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Validation PASSED.'));
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('warns for a module folder missing from the returned plans, but still validates', async () => {
    terraformUtilityMock.listModuleFolders.mockResolvedValue(['module-a', 'module-b']);
    terraformUtilityMock.plan.mockResolvedValue(new Map([['module-a', { resource_changes: [] }]]));

    await validateCommand.handler(argv);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('WARN [module-b] Could not read terraform plan'),
    );
    expect(octoValidateMock).toHaveBeenCalled();
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('prints warnings/errors from the validate result and fails on !pass', async () => {
    octoValidateMock.mockResolvedValue({
      errors: [{ message: 'bad diff', moduleId: 'module-a' }],
      pass: false,
      warnings: [{ message: 'heads up' }],
    });

    await validateCommand.handler(argv);

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('WARN heads up'));
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('ERROR [module-a] bad diff'));
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Validation FAILED!'));
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

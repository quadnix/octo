import { resolve } from 'path';
import { jest } from '@jest/globals';
import { Container, TerraformUtility, TestContainer } from '@quadnix/octo';
import type { ArgumentsCamelCase } from 'yargs';

type TerraformRawResult = { args: string[]; exitCode: number; stderr: string; stdout: string };

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
  const argv = { $0: 'octo', _: [], terragruntDir } as unknown as ArgumentsCamelCase<{ terragruntDir: string }>;

  let terraformUtilityMock: { apply: jest.Mock<() => Promise<TerraformRawResult>> };
  let processExitSpy: jest.SpiedFunction<typeof process.exit>;
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;
  let consoleLogSpy: jest.SpiedFunction<typeof console.log>;

  beforeEach(async () => {
    terraformUtilityMock = {
      apply: jest
        .fn<() => Promise<TerraformRawResult>>()
        .mockResolvedValue({ args: [], exitCode: 0, stderr: '', stdout: 'Apply complete! Resources: 1 added.' }),
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

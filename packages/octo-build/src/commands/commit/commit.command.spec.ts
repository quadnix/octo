import { resolve } from 'path';
import { jest } from '@jest/globals';
import { Container, TerraformUtility, TestContainer } from '@quadnix/octo';
import type { ArgumentsCamelCase } from 'yargs';

type CommitResult = {
  warnings: { message: string; moduleId?: string }[];
};

const mockedBootOcto =
  jest.fn<
    () => Promise<{ app: unknown; octo: { commit: jest.Mock<(...args: unknown[]) => Promise<CommitResult>> } }>
  >();
const mockedReportError = jest.fn<(error: unknown) => void>();

// Real ESM (`--experimental-vm-modules`) doesn't support `jest.mock()`'s hoisted auto-mocking of
// named function exports the way Jest's CJS mode does — `jest.unstable_mockModule` + a dynamic
// `import()` of the module under test (below) is the mechanism that actually works here.
jest.unstable_mockModule('../../utilities/octo/octo.utility.js', () => ({
  bootOcto: mockedBootOcto,
  reportError: mockedReportError,
}));

const { commitCommand } = await import('./commit.command.js');

describe('commitCommand UT', () => {
  const terragruntDir = 'my-terragrunt-dir';
  const resolvedDir = resolve(process.cwd(), terragruntDir);
  const argv = { $0: 'octo', _: [], terragruntDir } as unknown as ArgumentsCamelCase<{ terragruntDir: string }>;

  let octoCommitMock: jest.Mock<(...args: unknown[]) => Promise<CommitResult>>;
  let terraformUtilityMock: {
    listModuleFolders: jest.Mock<() => Promise<string[]>>;
    output: jest.Mock<() => Promise<Map<string, unknown>>>;
  };
  let processExitSpy: jest.SpiedFunction<typeof process.exit>;
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;
  let consoleLogSpy: jest.SpiedFunction<typeof console.log>;

  beforeEach(async () => {
    octoCommitMock = jest.fn<(...args: unknown[]) => Promise<CommitResult>>().mockResolvedValue({ warnings: [] });
    mockedBootOcto.mockResolvedValue({ app: {}, octo: { commit: octoCommitMock } });

    terraformUtilityMock = {
      listModuleFolders: jest.fn<() => Promise<string[]>>().mockResolvedValue([]),
      output: jest.fn<() => Promise<Map<string, unknown>>>().mockResolvedValue(new Map()),
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

  it('reads outputs via TerraformUtility and passes them to octo.commit()', async () => {
    const outputs = new Map([['module-a', { bucket: { value: 'my-bucket' } }]]);
    terraformUtilityMock.listModuleFolders.mockResolvedValue(['module-a']);
    terraformUtilityMock.output.mockResolvedValue(outputs);

    await commitCommand.handler(argv);

    expect(terraformUtilityMock.output).toHaveBeenCalledWith(resolvedDir, { json: true });
    expect(octoCommitMock).toHaveBeenCalledWith({}, { outputs });
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Commit complete'));
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('warns for a module folder missing from the returned outputs, but still commits', async () => {
    terraformUtilityMock.listModuleFolders.mockResolvedValue(['module-a', 'module-b']);
    terraformUtilityMock.output.mockResolvedValue(new Map([['module-a', { bucket: { value: 'my-bucket' } }]]));

    await commitCommand.handler(argv);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('WARN [module-b] Could not read terraform outputs'),
    );
    expect(octoCommitMock).toHaveBeenCalled();
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('prints warnings from the commit result', async () => {
    octoCommitMock.mockResolvedValue({ warnings: [{ message: 'heads up', moduleId: 'module-a' }] });

    await commitCommand.handler(argv);

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('WARN [module-a] heads up'));
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('reports and exits on a thrown error', async () => {
    mockedBootOcto.mockRejectedValue(new Error('boom'));

    await commitCommand.handler(argv);

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
    await commitCommand.handler(overriddenArgv);

    expect(getSpy).toHaveBeenCalledWith(TerraformUtility, {
      args: [
        { terraformBinary: '/opt/bin/terraform', terragruntBinary: '/opt/bin/terragrunt', timeoutInMs: 1000 },
        true,
      ],
    });
  });

  it('forwards undefined overrides when no CLI flags are given, still with forceNew: true', async () => {
    const getSpy = jest.spyOn(Container.getInstance(), 'get').mockResolvedValue(terraformUtilityMock);

    await commitCommand.handler(argv);

    expect(getSpy).toHaveBeenCalledWith(TerraformUtility, {
      args: [{ terraformBinary: undefined, terragruntBinary: undefined, timeoutInMs: undefined }, true],
    });
  });
});

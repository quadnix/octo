import { resolve } from 'path';
import { jest } from '@jest/globals';
import { Container, StateManagementService, TerraformUtility, TestContainer } from '@quadnix/octo';
import type { ArgumentsCamelCase } from 'yargs';

type CommitResult = {
  emptiedModuleIds: string[];
  warnings: { message: string; moduleId?: string }[];
};

const mockedBootOcto = jest.fn<
  () => Promise<{
    app: unknown;
    octo: {
      assertCredentials: jest.Mock<(minimumRemainingInMs: number) => Promise<void>>;
      commit: jest.Mock<(...args: unknown[]) => Promise<CommitResult>>;
    };
  }>
>();
const mockedReportError = jest.fn<(error: unknown) => void>();

// Real ESM (`--experimental-vm-modules`) doesn't support `jest.mock()`'s hoisted auto-mocking of
// named function exports the way Jest's CJS mode does — `jest.unstable_mockModule` + a dynamic
// `import()` of the module under test (below) is the mechanism that actually works here.
jest.unstable_mockModule('../../utilities/octo/octo.utility.js', () => ({
  OctoUtility: {
    bootOcto: mockedBootOcto,
    reportError: mockedReportError,
    runCommand: async (_command: string, body: () => Promise<void>): Promise<void> => {
      try {
        await body();
      } catch (error) {
        mockedReportError(error);
        process.exit(1);
      }
    },
  },
}));

const { commitCommand } = await import('./commit.command.js');

describe('commitCommand UT', () => {
  const terragruntDir = 'my-terragrunt-dir';
  const resolvedDir = resolve(process.cwd(), terragruntDir);
  const lockId = 'lock-1';
  const argv = { _: [], $0: 'octo', lockId, terragruntDir } as unknown as ArgumentsCamelCase<{
    lockId?: string;
    terragruntDir: string;
  }>;

  let assertCredentialsMock: jest.Mock<(minimumRemainingInMs: number) => Promise<void>>;
  let octoCommitMock: jest.Mock<(...args: unknown[]) => Promise<CommitResult>>;
  let terraformUtilityMock: {
    deleteDestroyedFolders: jest.Mock<(dir: string, moduleIds: string[]) => Promise<string[]>>;
    output: jest.Mock<() => Promise<Map<string, unknown>>>;
    plan: jest.Mock<() => Promise<{ errors: Map<string, string>; plans: Map<string, unknown> }>>;
  };
  let stateManagementServiceMock: {
    getAppLock: jest.Mock<() => Promise<string | undefined>>;
    unlockApp: jest.Mock<(lockId: string) => Promise<void>>;
  };
  let processExitSpy: jest.SpiedFunction<typeof process.exit>;
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;
  let consoleLogSpy: jest.SpiedFunction<typeof console.log>;

  beforeEach(async () => {
    octoCommitMock = jest
      .fn<(...args: unknown[]) => Promise<CommitResult>>()
      .mockResolvedValue({ emptiedModuleIds: [], warnings: [] });
    assertCredentialsMock = jest.fn<(minimumRemainingInMs: number) => Promise<void>>().mockResolvedValue(undefined);
    mockedBootOcto.mockResolvedValue({
      app: {},
      octo: { assertCredentials: assertCredentialsMock, commit: octoCommitMock },
    });

    terraformUtilityMock = {
      deleteDestroyedFolders: jest
        .fn<(dir: string, moduleIds: string[]) => Promise<string[]>>()
        .mockImplementation(async (_dir, moduleIds) => moduleIds),
      output: jest.fn<() => Promise<Map<string, unknown>>>().mockResolvedValue(new Map()),
      plan: jest
        .fn<() => Promise<{ errors: Map<string, string>; plans: Map<string, unknown> }>>()
        .mockResolvedValue({ errors: new Map(), plans: new Map() }),
    };
    stateManagementServiceMock = {
      getAppLock: jest.fn<() => Promise<string | undefined>>().mockResolvedValue(lockId),
      unlockApp: jest.fn<(lockId: string) => Promise<void>>().mockResolvedValue(),
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

  it("should refuse to commit when an account's credentials end within five minutes", async () => {
    assertCredentialsMock.mockRejectedValue(new Error('Account "123456789012" credentials have ended!'));

    await commitCommand.handler(argv);

    expect(assertCredentialsMock).toHaveBeenCalledWith(5 * 60_000);
    expect(octoCommitMock).not.toHaveBeenCalled();
    expect(stateManagementServiceMock.unlockApp).not.toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should refuse to commit without a lock id when the app holds no lock', async () => {
    stateManagementServiceMock.getAppLock.mockResolvedValue(undefined);

    await commitCommand.handler({ ...argv, lockId: undefined });

    expect(octoCommitMock).not.toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should commit under the lock the app holds and release it when no lock id is given', async () => {
    await commitCommand.handler({ ...argv, lockId: undefined });

    expect(octoCommitMock).toHaveBeenCalledWith({}, expect.objectContaining({ lockId }));
    expect(stateManagementServiceMock.unlockApp).toHaveBeenCalledWith(lockId);
  });

  it('should release the app lock after a successful commit', async () => {
    await commitCommand.handler(argv);

    expect(stateManagementServiceMock.unlockApp).toHaveBeenCalledWith(lockId);
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('should keep the app lock when the commit throws', async () => {
    octoCommitMock.mockRejectedValue(new Error('missing terraform outputs'));

    await commitCommand.handler(argv);

    expect(stateManagementServiceMock.unlockApp).not.toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should keep the app lock when octo fails to boot', async () => {
    mockedBootOcto.mockRejectedValue(new Error('Definition file failed validation against schema!'));

    await commitCommand.handler(argv);

    expect(stateManagementServiceMock.unlockApp).not.toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should read outputs via TerraformUtility and pass them to octo.commit()', async () => {
    const outputs = new Map([['module-a', { bucket: { value: 'my-bucket' } }]]);
    terraformUtilityMock.output.mockResolvedValue(outputs);

    await commitCommand.handler(argv);

    expect(terraformUtilityMock.output).toHaveBeenCalledWith(resolvedDir, { json: true });
    expect(octoCommitMock).toHaveBeenCalledWith({}, { lockId, outputs, partial: undefined });
    // The listeners own stdout and render the commit report there; a `console.log` alongside pino
    // lands out of order, so the handler writes nothing to it.
    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('should commit no folder whose plan still holds changes on a partial commit', async () => {
    terraformUtilityMock.output.mockResolvedValue(
      new Map([
        ['applied', { a: { value: 'a' } }],
        ['failed', { b: { value: 'b' } }],
        ['unplanned', { c: { value: 'c' } }],
      ]),
    );
    terraformUtilityMock.plan.mockResolvedValue({
      errors: new Map([['unplanned', 'Error: no plan']]),
      plans: new Map([
        ['applied', { resource_changes: [{ address: 'aws_s3_bucket.a', change: { actions: ['no-op'] } }] }],
        ['failed', { resource_changes: [{ address: 'aws_dynamodb_table.b', change: { actions: ['update'] } }] }],
      ]),
    });

    await commitCommand.handler({ ...argv, partial: true });

    expect(octoCommitMock).toHaveBeenCalledWith(
      {},
      { lockId, outputs: new Map([['applied', { a: { value: 'a' } }]]), partial: true },
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('WARN [failed] Its plan still holds changes, so none of it is committed'),
    );
  });

  it("should refuse a full commit while a folder's plan still holds changes", async () => {
    terraformUtilityMock.plan.mockResolvedValue({
      errors: new Map([['unplanned', 'Error: no plan']]),
      plans: new Map([
        ['applied', { resource_changes: [{ address: 'aws_s3_bucket.a', change: { actions: ['no-op'] } }] }],
        ['failed', { resource_changes: [{ address: 'aws_s3_object.b', change: { actions: ['create'] } }] }],
      ]),
    });

    await commitCommand.handler(argv);

    expect(octoCommitMock).not.toHaveBeenCalled();
    expect(stateManagementServiceMock.unlockApp).not.toHaveBeenCalled();
    expect(mockedReportError).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Folders "failed", "unplanned" still hold changes, so their apply did not finish! Run "octo apply" ' +
          'again, or "octo commit --partial" to record what applied.',
      }),
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should commit every folder when each plan is empty', async () => {
    const outputs = new Map([['applied', { a: { value: 'a' } }]]);
    terraformUtilityMock.output.mockResolvedValue(outputs);
    terraformUtilityMock.plan.mockResolvedValue({
      errors: new Map(),
      plans: new Map([
        [
          'applied',
          {
            resource_changes: [
              { address: 'aws_s3_bucket.a', change: { actions: ['no-op'] } },
              { address: 'data.external.b', change: { actions: ['read'] }, mode: 'data' },
            ],
          },
        ],
      ]),
    });

    await commitCommand.handler(argv);

    expect(octoCommitMock).toHaveBeenCalledWith({}, { lockId, outputs, partial: undefined });
    expect(stateManagementServiceMock.unlockApp).toHaveBeenCalledWith(lockId);
  });

  it('should print warnings from the commit result', async () => {
    octoCommitMock.mockResolvedValue({
      emptiedModuleIds: [],
      warnings: [{ message: 'heads up', moduleId: 'module-a' }],
    });

    await commitCommand.handler(argv);

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('WARN [module-a] heads up'));
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('should delete the folders of the modules the commit emptied whose destroy applied', async () => {
    octoCommitMock.mockResolvedValue({ emptiedModuleIds: ['module-gone'], warnings: [] });

    await commitCommand.handler(argv);

    expect(terraformUtilityMock.deleteDestroyedFolders).toHaveBeenCalledWith(resolvedDir, ['module-gone']);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Deleted folder "module-gone"'));
    expect(stateManagementServiceMock.unlockApp).toHaveBeenCalledWith(lockId);
  });

  it('should report and exit on a thrown error', async () => {
    mockedBootOcto.mockRejectedValue(new Error('boom'));

    await commitCommand.handler(argv);

    expect(mockedReportError).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should forward --terraformBinary/--terragruntBinary/--timeoutInMs overrides to the container, with forceNew: true', async () => {
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

  it('should forward undefined overrides when no CLI flags are given, still with forceNew: true', async () => {
    const getSpy = jest.spyOn(Container.getInstance(), 'get').mockResolvedValue(terraformUtilityMock);

    await commitCommand.handler(argv);

    expect(getSpy).toHaveBeenCalledWith(TerraformUtility, {
      args: [{ terraformBinary: undefined, terragruntBinary: undefined, timeoutInMs: undefined }, true],
    });
  });
});

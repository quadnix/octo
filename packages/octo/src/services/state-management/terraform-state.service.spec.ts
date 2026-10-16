import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { jest } from '@jest/globals';
import { StateManagementService } from './state-management.service.js';
import { TerraformStateService } from './terraform-state.service.js';
import { TestStateProvider } from './test.state-provider.js';

describe('TerraformStateService UT', () => {
  let stateManagementService: StateManagementService;
  let stateProvider: TestStateProvider;
  let terraformStateService: TerraformStateService;
  let terragruntDir: string;

  const stateWithResources = JSON.stringify({ resources: [{ type: 'aws_s3_bucket' }], serial: 1 });

  const createModuleFolder = async (moduleId: string, terraformState?: string): Promise<void> => {
    await mkdir(join(terragruntDir, moduleId), { recursive: true });
    await writeFile(join(terragruntDir, moduleId, 'terragrunt.hcl'), '');
    if (terraformState !== undefined) {
      await writeFile(join(terragruntDir, moduleId, 'terraform.tfstate'), terraformState);
    }
  };

  beforeEach(async () => {
    terragruntDir = await mkdtemp(join(tmpdir(), 'octo-terraform-state-'));
    stateProvider = new TestStateProvider();
    stateManagementService = new StateManagementService(stateProvider);
    terraformStateService = new TerraformStateService(stateManagementService);
  });

  afterEach(async () => {
    terraformStateService.stopPeriodicCheckIn();
    await rm(terragruntDir, { force: true, recursive: true });
  });

  describe('checkIn()', () => {
    it('should write each module folder terraform state to the state provider', async () => {
      await createModuleFolder('module-a', stateWithResources);

      await terraformStateService.checkIn(terragruntDir, ['module-a']);

      expect((await stateProvider.getState('module-a.tfstate')).toString()).toBe(stateWithResources);
    });

    it('should delete the state of a module folder holding no state file', async () => {
      await stateProvider.saveStates([{ data: Buffer.from(stateWithResources), stateFileName: 'module-a.tfstate' }]);
      await createModuleFolder('module-a');

      await terraformStateService.checkIn(terragruntDir, ['module-a']);

      await expect(stateProvider.getState('module-a.tfstate')).rejects.toThrowErrorMatchingInlineSnapshot(
        `"No state found!"`,
      );
    });

    it('should delete the state of a module terraform has destroyed', async () => {
      await stateProvider.saveStates([{ data: Buffer.from(stateWithResources), stateFileName: 'module-a.tfstate' }]);
      await createModuleFolder('module-a', JSON.stringify({ resources: [], serial: 2 }));

      await terraformStateService.checkIn(terragruntDir, ['module-a']);

      await expect(stateProvider.getState('module-a.tfstate')).rejects.toThrowErrorMatchingInlineSnapshot(
        `"No state found!"`,
      );
    });

    it.each([
      ['an empty', ''],
      ['a half-written', stateWithResources.slice(0, 20)],
    ])('should leave the provider state alone when the folder holds %s state file', async (_, folderState) => {
      await stateProvider.saveStates([{ data: Buffer.from(stateWithResources), stateFileName: 'module-a.tfstate' }]);
      await createModuleFolder('module-a', folderState);

      await terraformStateService.checkIn(terragruntDir, ['module-a']);

      expect((await stateProvider.getState('module-a.tfstate')).toString()).toBe(stateWithResources);
    });

    it('should write every module folder as one change', async () => {
      await createModuleFolder('module-a', stateWithResources);
      await createModuleFolder('module-b');
      const saveStates = jest.spyOn(stateManagementService, 'saveStates');

      await terraformStateService.checkIn(terragruntDir, ['module-a', 'module-b']);

      expect(saveStates).toHaveBeenCalledTimes(1);
      expect(
        saveStates.mock.calls[0][0].map((s) => [s.stateFileName, 'data' in s ? s.data?.toString() : undefined]),
      ).toEqual([
        ['module-a.tfstate', stateWithResources],
        ['module-b.tfstate', undefined],
      ]);
    });

    it('should run one check-in at a time', async () => {
      await createModuleFolder('module-a', stateWithResources);
      const order: string[] = [];
      jest.spyOn(stateManagementService, 'saveStates').mockImplementation(async (stateFiles) => {
        order.push(`start ${stateFiles[0].stateFileName}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push(`end ${stateFiles[0].stateFileName}`);
      });

      await Promise.all([
        terraformStateService.checkIn(terragruntDir, ['module-a']),
        terraformStateService.checkIn(terragruntDir, ['module-a']),
      ]);

      expect(order).toEqual([
        'start module-a.tfstate',
        'end module-a.tfstate',
        'start module-a.tfstate',
        'end module-a.tfstate',
      ]);
    });
  });

  describe('checkOut()', () => {
    it('should write the state provider state into the module folder', async () => {
      await stateProvider.saveStates([{ data: Buffer.from(stateWithResources), stateFileName: 'module-a.tfstate' }]);
      await createModuleFolder('module-a', 'stale');

      await terraformStateService.checkOut(terragruntDir, ['module-a']);

      expect((await readFile(join(terragruntDir, 'module-a', 'terraform.tfstate'))).toString()).toBe(
        stateWithResources,
      );
    });

    it('should write the state provider state over a module folder state of another lineage', async () => {
      const providerState = JSON.stringify({ lineage: 'lineage-a', resources: [], serial: 1 });
      await stateProvider.saveStates([{ data: Buffer.from(providerState), stateFileName: 'module-a.tfstate' }]);
      await createModuleFolder('module-a', JSON.stringify({ lineage: 'lineage-b', resources: [], serial: 5 }));

      await terraformStateService.checkOut(terragruntDir, ['module-a']);

      expect((await readFile(join(terragruntDir, 'module-a', 'terraform.tfstate'))).toString()).toBe(providerState);
    });

    it('should keep what the module folder holds when the provider holds nothing', async () => {
      await createModuleFolder('module-a', stateWithResources);

      await terraformStateService.checkOut(terragruntDir, ['module-a']);

      expect((await readFile(join(terragruntDir, 'module-a', 'terraform.tfstate'))).toString()).toBe(
        stateWithResources,
      );
    });

    it('should keep what the module folder holds when it is ahead of the provider', async () => {
      const folderState = JSON.stringify({ lineage: 'lineage-a', resources: [], serial: 5 });
      await stateProvider.saveStates([
        {
          data: Buffer.from(JSON.stringify({ lineage: 'lineage-a', resources: [], serial: 4 })),
          stateFileName: 'module-a.tfstate',
        },
      ]);
      await createModuleFolder('module-a', folderState);

      await terraformStateService.checkOut(terragruntDir, ['module-a']);

      expect((await readFile(join(terragruntDir, 'module-a', 'terraform.tfstate'))).toString()).toBe(folderState);
    });
  });

  describe('startPeriodicCheckIn()', () => {
    it('should not check state in before the interval', async () => {
      await createModuleFolder('module-a', stateWithResources);
      const saveStates = jest.spyOn(stateManagementService, 'saveStates');
      jest.useFakeTimers();

      terraformStateService.startPeriodicCheckIn(terragruntDir, ['module-a'], 10 * 1000);
      jest.advanceTimersByTime(10 * 1000 - 1);
      jest.useRealTimers();

      expect(saveStates).not.toHaveBeenCalled();
    });

    it('should skip a tick while the last one is still checking in', async () => {
      let finishCheckIn: () => void = () => {};
      const checkIn = jest.spyOn(terraformStateService, 'checkIn').mockImplementation(
        () =>
          new Promise((resolve) => {
            finishCheckIn = resolve;
          }),
      );
      jest.useFakeTimers();

      terraformStateService.startPeriodicCheckIn(terragruntDir, ['module-a'], 10 * 1000);
      await jest.advanceTimersByTimeAsync(30 * 1000);
      expect(checkIn).toHaveBeenCalledTimes(1);

      finishCheckIn();
      await jest.advanceTimersByTimeAsync(10 * 1000);
      jest.useRealTimers();

      expect(checkIn).toHaveBeenCalledTimes(2);
    });

    it('should check state in while a command is still running', async () => {
      await createModuleFolder('module-a', stateWithResources);
      jest.useFakeTimers();

      terraformStateService.startPeriodicCheckIn(terragruntDir, ['module-a'], 10 * 1000);
      jest.advanceTimersByTime(10 * 1000);
      jest.useRealTimers();

      // Chains onto the queue the tick is already on, and checks in nothing of its own, so awaiting
      // it is awaiting the tick.
      await terraformStateService.checkIn(terragruntDir, []);

      expect((await stateProvider.getState('module-a.tfstate')).toString()).toBe(stateWithResources);
    });
  });
});

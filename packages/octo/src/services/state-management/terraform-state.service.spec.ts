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
      await stateProvider.saveState('module-a.tfstate', Buffer.from(stateWithResources));
      await createModuleFolder('module-a');

      await terraformStateService.checkIn(terragruntDir, ['module-a']);

      await expect(stateProvider.getState('module-a.tfstate')).rejects.toThrowErrorMatchingInlineSnapshot(
        `"No state found!"`,
      );
    });

    it('should delete the state of a module terraform has destroyed', async () => {
      await stateProvider.saveState('module-a.tfstate', Buffer.from(stateWithResources));
      await createModuleFolder('module-a', JSON.stringify({ resources: [], serial: 2 }));

      await terraformStateService.checkIn(terragruntDir, ['module-a']);

      await expect(stateProvider.getState('module-a.tfstate')).rejects.toThrowErrorMatchingInlineSnapshot(
        `"No state found!"`,
      );
    });

    it('should keep a state file it cannot parse', async () => {
      await createModuleFolder('module-a', 'not-json');

      await terraformStateService.checkIn(terragruntDir, ['module-a']);

      expect((await stateProvider.getState('module-a.tfstate')).toString()).toBe('not-json');
    });

    it('should run one check-in at a time', async () => {
      await createModuleFolder('module-a', stateWithResources);
      const order: string[] = [];
      jest.spyOn(stateManagementService, 'saveState').mockImplementation(async (stateFileName) => {
        order.push(`start ${stateFileName}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push(`end ${stateFileName}`);
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
      await stateProvider.saveState('module-a.tfstate', Buffer.from(stateWithResources));
      await createModuleFolder('module-a', 'stale');

      await terraformStateService.checkOut(terragruntDir, ['module-a']);

      expect((await readFile(join(terragruntDir, 'module-a', 'terraform.tfstate'))).toString()).toBe(
        stateWithResources,
      );
    });

    it('should keep what the module folder holds when the provider holds nothing', async () => {
      await createModuleFolder('module-a', stateWithResources);

      await terraformStateService.checkOut(terragruntDir, ['module-a']);

      expect((await readFile(join(terragruntDir, 'module-a', 'terraform.tfstate'))).toString()).toBe(
        stateWithResources,
      );
    });
  });

  describe('startPeriodicCheckIn()', () => {
    it('should check state in while a command is still running', async () => {
      await createModuleFolder('module-a', stateWithResources);
      jest.useFakeTimers();

      terraformStateService.startPeriodicCheckIn(terragruntDir, ['module-a']);
      jest.advanceTimersByTime(60 * 1000);
      jest.useRealTimers();

      // Chains onto the queue the tick is already on, and checks in nothing of its own, so awaiting
      // it is awaiting the tick.
      await terraformStateService.checkIn(terragruntDir, []);

      expect((await stateProvider.getState('module-a.tfstate')).toString()).toBe(stateWithResources);
    });
  });
});

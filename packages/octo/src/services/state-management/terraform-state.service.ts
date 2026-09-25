import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Factory } from '../../decorators/factory.decorator.js';
import { Container } from '../../functions/container/container.js';
import { StateManagementService } from './state-management.service.js';

const CHECK_IN_INTERVAL_IN_MS = 60 * 1000;
const TERRAFORM_STATE_FILE_NAME = 'terraform.tfstate';

/**
 * Moves each module folder's `terraform.tfstate` in and out of Octo's {@link IStateProvider}.
 *
 * Terraform's record of what exists is the one thing Octo cannot rebuild, and a local backend leaves
 * it in the module folder where only the machine that ran the apply can see it. Checking it out
 * before a terraform command and back in after puts it wherever Octo state already lives, so a team
 * sharing Octo state shares terraform state with it.
 *
 * Check-in is frequent rather than atomic: it runs on every terraform command's return, success or
 * failure, and on a timer through a long apply. A partial record of what exists beats none.
 *
 * {@link TerraformUtility} drives this around every command it runs, so nothing calls it directly.
 *
 * @internal
 */
export class TerraformStateService {
  private checkInQueue: Promise<void> = Promise.resolve();

  private periodicCheckIn: NodeJS.Timeout | undefined;

  private readonly stateManagementService: StateManagementService;

  /**
   * @param stateManagementService Where terraform state is read from and written to.
   */
  constructor(stateManagementService: StateManagementService) {
    this.stateManagementService = stateManagementService;
  }

  /**
   * Writes every module folder's terraform state to the state provider, as one change.
   *
   * A folder holding no state file, or one recording no resources, has its state **deleted** rather
   * than written - that is a module terraform has destroyed, and a file recording nothing is a file
   * worth nobody's history.
   *
   * Check-ins are serialized, so the one on a command's return never races the one on the timer.
   */
  async checkIn(terragruntDir: string, moduleIds: string[]): Promise<void> {
    this.checkInQueue = this.checkInQueue.then(
      () => this.writeStates(terragruntDir, moduleIds),
      () => this.writeStates(terragruntDir, moduleIds),
    );

    return this.checkInQueue;
  }

  /**
   * Writes the state provider's terraform state into every module folder.
   *
   * A module the provider holds nothing for keeps whatever its folder already has, which is what
   * adopts the state of a stack that ran with a local backend until now. A folder whose state is
   * ahead of the provider's keeps it too, which is what a run killed before its last check-in
   * leaves behind. The check-in that follows hands either to the provider.
   */
  async checkOut(terragruntDir: string, moduleIds: string[]): Promise<void> {
    for (const moduleId of moduleIds) {
      let data: Buffer;
      try {
        data = await this.stateManagementService.getState(this.stateFileName(moduleId));
      } catch (error) {
        if (error.message === 'No state found!') {
          continue;
        }
        throw error;
      }

      const stateFilePath = join(terragruntDir, moduleId, TERRAFORM_STATE_FILE_NAME);
      if (await this.isFolderStateAhead(stateFilePath, data)) {
        continue;
      }

      await writeFile(stateFilePath, data);
    }
  }

  /**
   * Starts checking state in on a timer, bounding what a killed runner loses to one interval.
   */
  startPeriodicCheckIn(terragruntDir: string, moduleIds: string[]): void {
    if (this.periodicCheckIn) {
      return;
    }

    this.periodicCheckIn = setInterval(() => {
      // A tick that fails is not worth aborting the terraform command that is still running - the
      // check-in on its return reports the failure instead.
      void this.checkIn(terragruntDir, moduleIds).catch(() => {});
    }, CHECK_IN_INTERVAL_IN_MS);
  }

  /**
   * Stops the timer {@link TerraformStateService.startPeriodicCheckIn} started.
   */
  stopPeriodicCheckIn(): void {
    if (this.periodicCheckIn) {
      clearInterval(this.periodicCheckIn);
      this.periodicCheckIn = undefined;
    }
  }

  /**
   * Whether a terraform state file records nothing, which is what a destroyed module is left with.
   * State that cannot be parsed is treated as holding resources, so an unreadable file is kept.
   */
  private holdsNoResources(data: Buffer): boolean {
    try {
      const state = JSON.parse(data.toString()) as { resources?: unknown[] };
      return Array.isArray(state.resources) && state.resources.length === 0;
    } catch {
      return false;
    }
  }

  /**
   * Whether the folder's terraform state is a later write of the same state the provider holds: the
   * same `lineage`, and a higher `serial`. State that cannot be read or parsed is never ahead.
   */
  private async isFolderStateAhead(stateFilePath: string, providerData: Buffer): Promise<boolean> {
    try {
      const folderState = JSON.parse(await readFile(stateFilePath, 'utf-8')) as { lineage?: string; serial?: number };
      const providerState = JSON.parse(providerData.toString()) as { lineage?: string; serial?: number };

      return (
        typeof folderState.serial === 'number' &&
        typeof providerState.serial === 'number' &&
        folderState.lineage === providerState.lineage &&
        folderState.serial > providerState.serial
      );
    } catch {
      return false;
    }
  }

  /**
   * The name one module's terraform state is stored under, alongside Octo's own state files.
   */
  private stateFileName(moduleId: string): string {
    return `${moduleId}.tfstate`;
  }

  /**
   * The body of a check-in, run one at a time through {@link TerraformStateService.checkIn}.
   */
  private async writeStates(terragruntDir: string, moduleIds: string[]): Promise<void> {
    const stateFiles: Parameters<StateManagementService['saveStates']>[0] = [];

    for (const moduleId of moduleIds) {
      const stateFilePath = join(terragruntDir, moduleId, TERRAFORM_STATE_FILE_NAME);
      const data = existsSync(stateFilePath) ? await readFile(stateFilePath) : undefined;

      stateFiles.push({
        data: data && !this.holdsNoResources(data) ? data : undefined,
        stateFileName: this.stateFileName(moduleId),
      });
    }

    await this.stateManagementService.saveStates(stateFiles);
  }
}

/**
 * @internal
 */
@Factory<TerraformStateService>(TerraformStateService)
export class TerraformStateServiceFactory {
  /**
   * Never cached: {@link Octo.initialize} builds a new {@link StateManagementService} around the
   * provider it is given, and a cached instance would go on writing to the previous one.
   *
   * @internal
   */
  static async create(): Promise<TerraformStateService> {
    const stateManagementService = await Container.getInstance().get(StateManagementService);
    return new TerraformStateService(stateManagementService);
  }
}

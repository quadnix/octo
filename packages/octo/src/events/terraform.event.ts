import { Event } from './event.model.js';

/**
 * The TerraformEvent class is the superclass for all events in relation to terraform and terragrunt.
 *
 * @group Events/Terraform
 */
export class TerraformEvent<T = undefined> extends Event<T> {}

/**
 * This event is emitted when generate finishes writing terragrunt module folders.
 * `emptied` lists folders written without resources, because their module left intent.
 *
 * @group Events/Terraform
 */
export class TerraformFoldersWrittenEvent extends TerraformEvent<{
  emptied: string[];
  outputDir: string;
  written: string[];
}> {}

/**
 * This event is emitted before a terraform/terragrunt command is invoked.
 *
 * @group Events/Terraform
 */
export class TerraformCommandStartedEvent extends TerraformEvent<{ command: string; dir: string }> {}

/**
 * This event is emitted after a terraform/terragrunt command returns, whatever its exit code.
 *
 * @group Events/Terraform
 */
export class TerraformCommandFinishedEvent extends TerraformEvent<{
  command: string;
  dir: string;
  durationInMs: number;
  exitCode: number;
}> {}

/**
 * This event is emitted when octo starts a terraform or terragrunt process, before it writes anything.
 * `processId` tells apart the processes of one octo process: a JSON plan runs a plan and a show in
 * every folder.
 *
 * @group Events/Terraform
 */
export class TerraformProcessStartedEvent extends TerraformEvent<{
  args: string[];
  binary: string;
  dir: string;
  processId: number;
}> {}

/**
 * This event is emitted for every chunk a terraform or terragrunt process writes, as it writes it.
 *
 * @group Events/Terraform
 */
export class TerraformProcessOutputEvent extends TerraformEvent<{
  processId: number;
  stream: 'stderr' | 'stdout';
  text: string;
}> {}

/**
 * This event is emitted after every terraform or terragrunt process exits, whatever its exit code.
 * `exitCode` is -1 for a process that could not start or was killed.
 *
 * @group Events/Terraform
 */
export class TerraformProcessExitedEvent extends TerraformEvent<{
  exitCode: number;
  processId: number;
}> {}

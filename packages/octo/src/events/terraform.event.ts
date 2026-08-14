import { Event } from './event.model.js';

/**
 * The TerraformEvent class is the superclass for all events in relation to terraform and terragrunt.
 *
 * @group Events/Terraform
 *
 * @returns The Event instance.
 */
export class TerraformEvent<T = undefined> extends Event<T> {}

/**
 * This event is emitted when generate finishes writing terragrunt module folders.
 * `emptied` lists folders written without resources, because their module left intent.
 *
 * @group Events/Terraform
 *
 * @returns The Event instance.
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
 *
 * @returns The Event instance.
 */
export class TerraformCommandStartedEvent extends TerraformEvent<{ command: string; dir: string }> {}

/**
 * This event is emitted after a terraform/terragrunt command returns, whatever its exit code.
 *
 * @group Events/Terraform
 *
 * @returns The Event instance.
 */
export class TerraformCommandFinishedEvent extends TerraformEvent<{
  command: string;
  dir: string;
  durationInMs: number;
  exitCode: number;
}> {}

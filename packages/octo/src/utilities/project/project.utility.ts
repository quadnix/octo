import { isAbsolute, resolve } from 'node:path';
import { PROJECT_ROOT_VARIABLE_NAME } from '../../services/terraform/terraform.type.js';

/**
 * The octo project root, for code that cannot rely on the current working directory being it.
 *
 * An external resource's action is the case this exists for. Octo runs it in two different places:
 * `octo commit` runs the delete action from the project root, but terraform runs the add and update
 * actions from a terragrunt cache directory, so a path a module resolved against the project root
 * resolves against nothing by the time the action reads it. Octo already supplies the root to every
 * terragrunt command as `TF_VAR_OCTO_PROJECT_ROOT`, which terraform passes down to `local-exec`;
 * this reads it back, and falls back to the working directory for the run that has no terraform in
 * the middle.
 *
 * Store a project-relative path in a resource's `properties` and resolve it here. An absolute one
 * would put the developer's directory layout into octo state, and into the properties hash that
 * generated terraform commits as an external resource's trigger.
 *
 * @group Utilities
 */
export class ProjectUtility {
  /**
   * The absolute path of the octo project root.
   */
  static getProjectRoot(): string {
    return process.env[`TF_VAR_${PROJECT_ROOT_VARIABLE_NAME}`] || process.cwd();
  }

  /**
   * Resolves a project-relative path against {@link ProjectUtility.getProjectRoot}. An absolute path
   * is returned as given.
   */
  static resolveFromProjectRoot(filePath: string): string {
    return isAbsolute(filePath) ? filePath : resolve(this.getProjectRoot(), filePath);
  }
}

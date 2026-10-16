import type { UnknownResource } from '../app.type.js';
import type { Diff } from '../functions/diff/diff.js';
import type { ANodeAction } from '../functions/node/node-action.abstract.js';

/**
 * A resource action creates, updates, or destroys one piece of real infrastructure.
 *
 * Actions belong to *external* resources - the ones Octo drives itself through a cloud provider's
 * SDK. A resource whose lifecycle terraform manages ({@link ATerraformResource}) must not have one;
 * registering an action for it throws.
 *
 * The class extends {@link ANodeAction}, which gives it the container and `log()`. Register it with
 * {@link Action}, and a {@link Factory} to construct it.
 *
 * @group Resources
 *
 * @see Definition of [Actions](/docs/fundamentals/actions).
 */
export interface IResourceAction<T extends UnknownResource> extends ANodeAction {
  /**
   * How long the action may run before Octo aborts it.
   *
   * @defaultValue `90000`
   */
  actionTimeoutInMs?: number;

  /**
   * Whether this action handles the given diff.
   * Typically a check on the diff's resource, field, and action.
   */
  filter(diff: Diff): boolean;

  /**
   * Performs the change against the cloud provider.
   *
   * @returns What the provider reported back, which Octo records as the resource's `response`.
   * Return nothing when the action has no output, e.g. a delete.
   */
  handle(diff: Diff): Promise<T['response']> | Promise<void>;
}

import { strict as assert } from 'assert';
import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { AModel } from '../model.abstract.js';
import { EnvironmentSchema } from './environment.schema.js';

/**
 * An Environment model is the logical sub-section of a Region which isolates one runtime environment from another.
 * E.g. development, staging, production, etc.
 *
 * @example
 * ```ts
 * const environment = new Environment('staging');
 * ```
 *
 * @group Models/Environment
 *
 * @see Definition of [Default Models](/docs/fundamentals/models#default-models).
 */
@Model<Environment>('@octo', 'environment', EnvironmentSchema)
export class Environment extends AModel<EnvironmentSchema, Environment> {
  readonly environmentName: string;

  readonly environmentVariables: Map<string, string> = new Map();

  /**
   * @param environmentName The name of the environment, unique within its region.
   */
  constructor(environmentName: string) {
    super();
    this.environmentName = environmentName;
  }

  /**
   * @internal
   */
  static override async unSynth(
    environment: EnvironmentSchema,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<Environment> {
    assert(!!deReferenceContext);

    const newEnvironment = new Environment(environment.environmentName);
    for (const key in environment.environmentVariables) {
      newEnvironment.environmentVariables.set(key, environment.environmentVariables[key]);
    }
    return newEnvironment;
  }

  /**
   * @internal
   */
  override setContext(): string | undefined {
    const parents = this.getParents();
    const region = parents['region']?.[0]?.to;
    if (!region) {
      return undefined;
    }
    return [`${(this.constructor as typeof Environment).NODE_NAME}=${this.environmentName}`, region.getContext()].join(
      ',',
    );
  }

  /**
   * @internal
   */
  override synth(): EnvironmentSchema {
    return {
      environmentName: this.environmentName,
      environmentVariables: Object.fromEntries(this.environmentVariables || new Map()),
    };
  }
}

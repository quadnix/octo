import { strict as assert } from 'assert';
import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { Validate } from '../../decorators/validate.decorator.js';
import { AModel } from '../model.abstract.js';
import type { IEnvironment } from './environment.interface.js';

/**
 * An Environment model is the logical sub-section of a Region which isolates one runtime environment from another.
 * E.g. qa, staging, production, etc.
 *
 * @example
 * ```ts
 * const environment = new Environment('qa');
 * ```
 * @group Models
 * @see Definition of [Default Models](/docs/fundamentals/models#default-models).
 */
@Model()
export class Environment extends AModel<IEnvironment, Environment> {
  readonly NODE_NAME: string = 'environment';

  /**
   * The name of the environment.
   * An environment must be unique within a Region. But multiple Regions can share the same environment name.
   */
  @Validate({ options: { maxLength: 32, minLength: 2, regex: /^[a-zA-Z][\w-]*[a-zA-Z0-9]$/ } })
  readonly environmentName: string;

  /**
   * A set of environment variables to be passed to any {@link Execution} running in this environment.
   */
  @Validate({
    destruct: (value: Map<string, string>): string[] => {
      return Array.from(value.keys());
    },
    options: { maxLength: 64, minLength: 2, regex: /^[a-zA-Z][\w-]*[a-zA-Z0-9]$/ },
  })
  readonly environmentVariables: Map<string, string> = new Map();

  constructor(environmentName: string) {
    super();
    this.environmentName = environmentName;
  }

  override setContext(): string {
    const parents = this.getParents();
    const region = parents['region'][0].to;
    return [`${this.NODE_NAME}=${this.environmentName}`, region.getContext()].join(',');
  }

  override synth(): IEnvironment {
    return {
      environmentName: this.environmentName,
      environmentVariables: Object.fromEntries(this.environmentVariables || new Map()),
    };
  }

  static override async unSynth(
    environment: IEnvironment,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<Environment> {
    assert(!!deReferenceContext);

    const newEnvironment = new Environment(environment.environmentName);
    for (const key in environment.environmentVariables) {
      newEnvironment.environmentVariables.set(key, environment.environmentVariables[key]);
    }
    return newEnvironment;
  }
}

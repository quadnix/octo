import { strict as assert } from 'assert';
import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { Validate } from '../../decorators/validate.decorator.js';
import { AModel } from '../model.abstract.js';
import type { IPipeline } from './pipeline.interface.js';

/**
 * A Pipeline model is a CI/CD pipeline capable of various automations,
 * including building and deploying code, running Octo projects, and more.
 *
 * :::danger Danger
 * `Pipeline` is not yet supported in Octo!
 * :::
 *
 * @example
 * ```ts
 * const pipeline = new Pipeline('MyPipeline');
 * ```
 * @group Models
 * @see Definition of [Default Models](/docs/fundamentals/models#default-models).
 */
@Model('@octo', 'pipeline')
export class Pipeline extends AModel<IPipeline, Pipeline> {
  readonly instructionSet: string[] = [];

  @Validate({ options: { maxLength: 64, minLength: 2, regex: /^[a-zA-Z][\w-]*[a-zA-Z0-9]$/ } })
  readonly pipelineName: string;

  constructor(pipelineName: string) {
    super();
    this.pipelineName = pipelineName;
  }

  override setContext(): string {
    const parents = this.getParents();
    const app = parents['app'][0].to;
    return [`${(this.constructor as typeof Pipeline).NODE_NAME}=${this.pipelineName}`, app.getContext()].join(',');
  }

  override synth(): IPipeline {
    return {
      instructionSet: JSON.parse(JSON.stringify(this.instructionSet)),
      pipelineName: this.pipelineName,
    };
  }

  static override async unSynth(
    pipeline: IPipeline,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<Pipeline> {
    assert(!!deReferenceContext);

    const newPipeline = new Pipeline(pipeline.pipelineName);
    newPipeline.instructionSet.push(...pipeline.instructionSet);
    return newPipeline;
  }
}

import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { Validate } from '../../decorators/validate.decorator.js';
import { DiffUtility } from '../../functions/diff/diff.utility.js';
import { AModel } from '../model.abstract.js';
import type { Diff } from '../../functions/diff/diff.js';
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
@Model()
export class Pipeline extends AModel<IPipeline, Pipeline> {
  readonly MODEL_NAME: string = 'pipeline';

  readonly instructionSet: string[] = [];

  @Validate({ options: { maxLength: 64, minLength: 2, regex: /^[a-zA-Z][\w-]*[a-zA-Z0-9]$/ } })
  readonly pipelineName: string;

  constructor(pipelineName: string) {
    super();
    this.pipelineName = pipelineName;
  }

  override async diffProperties(previous: Pipeline): Promise<Diff[]> {
    return DiffUtility.diffArray(previous, this, 'instructionSet');
  }

  override setContext(): string {
    const parents = this.getParents();
    const app = parents['app'][0].to;
    return [`${this.MODEL_NAME}=${this.pipelineName}`, app.getContext()].join(',');
  }

  override synth(): IPipeline {
    return {
      instructionSet: JSON.parse(JSON.stringify(this.instructionSet)),
      pipelineName: this.pipelineName,
    };
  }

  static override async unSynth(
    pipeline: IPipeline,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<Pipeline> {
    const newPipeline = new Pipeline(pipeline.pipelineName);
    newPipeline.instructionSet.push(...pipeline.instructionSet);
    return newPipeline;
  }
}

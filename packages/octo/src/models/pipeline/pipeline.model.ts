import { strict as assert } from 'assert';
import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { AModel } from '../model.abstract.js';
import { PipelineSchema } from './pipeline.schema.js';

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
@Model<Pipeline>('@octo', 'pipeline', PipelineSchema)
export class Pipeline extends AModel<PipelineSchema, Pipeline> {
  readonly instructionSet: string[] = [];

  readonly pipelineName: string;

  constructor(pipelineName: string) {
    super();
    this.pipelineName = pipelineName;
  }

  override setContext(): string | undefined {
    const parents = this.getParents();
    const app = parents['app']?.[0]?.to;
    if (!app) {
      return undefined;
    }
    return [`${(this.constructor as typeof Pipeline).NODE_NAME}=${this.pipelineName}`, app.getContext()].join(',');
  }

  override synth(): PipelineSchema {
    return {
      instructionSet: JSON.parse(JSON.stringify(this.instructionSet)),
      pipelineName: this.pipelineName,
    };
  }

  static override async unSynth(
    pipeline: PipelineSchema,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<Pipeline> {
    assert(!!deReferenceContext);

    const newPipeline = new Pipeline(pipeline.pipelineName);
    newPipeline.instructionSet.push(...pipeline.instructionSet);
    return newPipeline;
  }
}

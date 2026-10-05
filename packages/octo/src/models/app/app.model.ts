import { strict as assert } from 'assert';
import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { ModelError } from '../../errors/index.js';
import { Account } from '../account/account.model.js';
import { AModel } from '../model.abstract.js';
import { Pipeline } from '../pipeline/pipeline.model.js';
import { Server } from '../server/server.model.js';
import { AppSchema } from './app.schema.js';

/**
 * An App model is the parent of all other models.
 * It represents the main app for whom the infrastructure is being created.
 *
 * @example
 * ```ts
 * const app = new App('MyApp');
 * ```
 *
 * @group Models/App
 *
 * @see Definition of [Default Models](/docs/fundamentals/models#default-models).
 */
@Model<App>('@octo', 'app', AppSchema)
export class App extends AModel<AppSchema, App> {
  readonly name: string;

  /**
   * @param name The name of the app.
   */
  constructor(name: string) {
    super();
    this.name = name;
  }

  /**
   * @internal
   */
  static override async unSynth(
    app: AppSchema,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<App> {
    assert(!!deReferenceContext);

    return new App(app.name);
  }

  /**
   * To add an {@link Account}.
   */
  addAccount(account: Account): void {
    const childrenDependencies = this.getChildren('account');
    if (!childrenDependencies['account']) childrenDependencies['account'] = [];

    // Check for duplicates.
    const accounts = childrenDependencies['account'].map((d) => d.to);
    if (accounts.find((a: Account) => a.accountId === account.accountId)) {
      throw new ModelError('Account already exists!', this);
    }
    this.addChild('name', account, 'accountId');
  }

  /**
   * To add a {@link Pipeline}.
   */
  addPipeline(pipeline: Pipeline): void {
    const childrenDependencies = this.getChildren('pipeline');
    if (!childrenDependencies['pipeline']) childrenDependencies['pipeline'] = [];

    // Check for duplicates.
    const pipelines = childrenDependencies['pipeline'].map((d) => d.to);
    if (pipelines.find((p: Pipeline) => p.pipelineName === pipeline.pipelineName)) {
      throw new ModelError('Pipeline already exists!', this);
    }
    this.addChild('name', pipeline, 'pipelineName');
  }

  /**
   * To add a {@link Server}.
   */
  addServer(server: Server): void {
    const childrenDependencies = this.getChildren('server');
    if (!childrenDependencies['server']) childrenDependencies['server'] = [];

    // Check for duplicates.
    const servers = childrenDependencies['server'].map((d) => d.to);
    if (servers.find((s: Server) => s.serverKey === server.serverKey)) {
      throw new ModelError('Server already exists!', this);
    }
    this.addChild('name', server, 'serverKey');
  }

  /**
   * @internal
   */
  override setContext(): string {
    return `${(this.constructor as typeof App).NODE_NAME}=${this.name}`;
  }

  /**
   * @internal
   */
  override synth(): AppSchema {
    return {
      name: this.name,
    };
  }
}

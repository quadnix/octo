import { strict as assert } from 'assert';
import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { ModelError } from '../../errors/index.js';
import { Account } from '../account/account.model.js';
import { AModel } from '../model.abstract.js';
import { AppSchema } from './app.schema.js';

/**
 * An App model is the parent of all other models.
 * It represents the main app for whom the infrastructure is being created.
 *
 * @example
 * ```ts
 * const app = new App('MyApp');
 * ```
 * @group Models
 * @see Definition of [Default Models](/docs/fundamentals/models#default-models).
 */
@Model<App>('@octo', 'app', AppSchema)
export class App extends AModel<AppSchema, App> {
  readonly name: string;

  constructor(name: string) {
    super();
    this.name = name;
  }

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

  override setContext(): string {
    return `${(this.constructor as typeof App).NODE_NAME}=${this.name}`;
  }

  override synth(): AppSchema {
    return {
      name: this.name,
    };
  }

  static override async unSynth(
    app: AppSchema,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<App> {
    assert(!!deReferenceContext);

    return new App(app.name);
  }
}

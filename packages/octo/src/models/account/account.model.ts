import { strict as assert } from 'assert';
import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { ModelError } from '../../errors/index.js';
import { AModel } from '../model.abstract.js';
import { Region } from '../region/region.model.js';
import { AccountSchema, AccountType } from './account.schema.js';

/**
 * An Account model is the cloud provider account the infrastructure below it is deployed into.
 * It sits between the {@link App} and its {@link Region}s, so one app can span several accounts -
 * e.g. a separate account per environment, or per cloud provider.
 *
 * Credentials are not held here. A module such as `AwsIniAccountModule` extends this model and
 * supplies them through {@link Account.getCredentials}.
 *
 * @example
 * ```ts
 * const account = new Account(AccountType.AWS, '1234567890');
 * app.addAccount(account);
 * ```
 *
 * @group Models/Account
 *
 * @see Definition of [Default Models](/docs/fundamentals/models#default-models).
 */
@Model<Account>('@octo', 'account', AccountSchema)
export class Account extends AModel<AccountSchema, Account> {
  readonly accountId: string;

  readonly accountType: AccountType;

  /**
   * @param accountType The cloud provider this account belongs to.
   * @param accountId The provider's own identifier for the account.
   */
  constructor(accountType: AccountType, accountId: string) {
    super();

    this.accountId = accountId;
    this.accountType = accountType;
  }

  /**
   * @internal
   */
  static override async unSynth(
    account: AccountSchema,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<Account> {
    assert(!!deReferenceContext);

    return new Account(account.accountType, account.accountId);
  }

  /**
   * To add a {@link Region}.
   */
  addRegion(region: Region): void {
    const childrenDependencies = this.getChildren('region');
    if (!childrenDependencies['region']) childrenDependencies['region'] = [];

    // Check for duplicates.
    const regions = childrenDependencies['region'].map((d) => d.to);
    if (regions.find((r: Region) => r.regionId === region.regionId)) {
      throw new ModelError('Region already exists!', this);
    }
    this.addChild('accountId', region, 'regionId');
  }

  /**
   * The credentials this account authenticates with, for the paths octo drives itself rather than
   * through a provider - an external resource's actions, most of all. The shape is the provider's
   * own; octo only carries it from the model to whatever builds the client.
   *
   * @throws {@link ModelError} On the base model, which holds no credentials. Override it in the
   * subclass a module creates.
   */
  getCredentials(): object {
    throw new ModelError('Method not implemented! Use subclass', this);
  }

  /**
   * @internal
   */
  override setContext(): string | undefined {
    const parents = this.getParents();
    const app = parents['app']?.[0]?.to;
    if (!app) {
      return undefined;
    }
    return [`${(this.constructor as typeof Account).NODE_NAME}=${this.accountId}`, app.getContext()].join(',');
  }

  /**
   * @internal
   */
  override synth(): AccountSchema {
    return {
      accountId: this.accountId,
      accountType: this.accountType,
    };
  }
}

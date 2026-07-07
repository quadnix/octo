import { strict as assert } from 'assert';
import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { ModelError } from '../../errors/index.js';
import { AModel } from '../model.abstract.js';
import { Region } from '../region/region.model.js';
import { AccountSchema, AccountType } from './account.schema.js';

/**
 * @group Models/Account
 */
@Model<Account>('@octo', 'account', AccountSchema)
export class Account extends AModel<AccountSchema, Account> {
  readonly accountId: string;

  readonly accountType: AccountType;

  constructor(accountType: AccountType, accountId: string) {
    super();

    this.accountId = accountId;
    this.accountType = accountType;
  }

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

  override setContext(): string | undefined {
    const parents = this.getParents();
    const app = parents['app']?.[0]?.to;
    if (!app) {
      return undefined;
    }
    return [`${(this.constructor as typeof Account).NODE_NAME}=${this.accountId}`, app.getContext()].join(',');
  }

  override synth(): AccountSchema {
    return {
      accountId: this.accountId,
      accountType: this.accountType,
    };
  }
}

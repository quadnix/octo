import { Schema } from '../../functions/schema/schema.js';

/**
 * The cloud provider an {@link Account} belongs to.
 *
 * @group Models/Account
 */
export enum AccountType {
  AWS = 'aws',
  Azure = 'azure',
  GCP = 'gcp',
}

/**
 * Schema of the {@link Account} model.
 *
 * @group Models/Account
 */
export class AccountSchema {
  /**
   * The provider's own identifier for the account, e.g. an AWS account number.
   */
  accountId = Schema<string>();

  /**
   * The cloud provider this account belongs to.
   */
  accountType = Schema<AccountType>();
}

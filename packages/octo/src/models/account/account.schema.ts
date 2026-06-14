import { Schema } from '../../functions/schema/schema.js';

/**
 * @group Models/Account
 */
export enum AccountType {
  AWS = 'aws',
  Azure = 'azure',
  GCP = 'gcp',
}

/**
 * @group Models/Account
 */
export class AccountSchema {
  accountId = Schema<string>();

  accountType = Schema<AccountType>();
}

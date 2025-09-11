import { Schema } from '../../functions/schema/schema.js';

/**
 * @group Models/Account
 */
export enum AccountType {
  AWS = 'aws',
}

/**
 * @group Models/Account
 */
export class AccountSchema {
  accountId = Schema<string>();

  accountType = Schema<AccountType>();
}

import { Schema } from '../../functions/schema/schema.js';

export enum AccountType {
  AWS = 'aws',
}

export class AccountSchema {
  accountId = Schema<string>();

  accountType = Schema<AccountType>();
}

import type { IRedactionRule } from '../redaction.utility.js';

const ACCOUNT_ID = String.raw`\d{12}`;

/**
 * An AWS account number, in the four shapes captured output carries one.
 *
 * `123456789012` is the documentation placeholder, `123456789123` the scaffold's, `999999999999` the
 * second account the definition file docs need, and `000000000000` what terragrunt's own mock
 * outputs read.
 */
export const AWS_ACCOUNT_ID_RULE: IRedactionRule = {
  name: 'AWS account id',
  patterns: [
    // The account field of an ARN, e.g. "arn:aws:iam::123456789012:role/ServerRole-backend".
    new RegExp(String.raw`(arn:aws[\w-]*:[^:\s]*:[^:\s]*:)${ACCOUNT_ID}`, 'g'),
    // The account segment of a node context, e.g. "region=us-east-1,account=123456789012,app=x".
    new RegExp(String.raw`(account=)${ACCOUNT_ID}`, 'g'),
    // The terraform provider alias octo generates per account and region, e.g. "_123456789012-us-east-1".
    new RegExp(String.raw`(_)${ACCOUNT_ID}(?=-)`, 'g'),
    // A value that is nothing but an account number, e.g. a security group's "owner_id".
    new RegExp(String.raw`(^)${ACCOUNT_ID}$`, 'g'),
  ],
  placeholders: ['123456789012', '123456789123', '999999999999', '000000000000'],
  token: '<AWS_ACCOUNT_ID>',
};

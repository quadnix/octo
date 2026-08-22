import type { IRedactionRule } from '../redaction.utility.js';

/**
 * A bare IPv4 address a provider handed out.
 *
 * A CIDR block carries a prefix length and is declared configuration, so it is left alone.
 */
export const IP_ADDRESS_RULE: IRedactionRule = {
  name: 'IP address',
  patterns: [/(?<![\d.])\d{1,3}(?:\.\d{1,3}){3}(?![\d./])/g],
  placeholders: [],
  token: null,
};

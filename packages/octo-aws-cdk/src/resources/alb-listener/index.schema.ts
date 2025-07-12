import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * Defines the types of actions on the ALB Listener.
 * Possible values are `fixed-response`, `forward`, or `redirect`.
 * These values are mapped from the official ALB Listener Action Types document.
 * Please refer to the AWS documentation for more information.
 *
 * @group Resources/AlbListener
 */
export type IAlbListenerActionTypes = {
  /**
   * Sends a fixed HTTP response to the client.
   */
  'fixed-response': AlbListenerActionFixedResponseActionSchema;

  /**
   * Forwards requests to one or more target groups.
   */
  forward: AlbListenerActionForwardConfigSchema;

  /**
   * Redirects requests from one path to another.
   */
  redirect: AlbListenerActionRedirectActionSchema;
};

/**
 * When the ALB receives an HTTP request, the ALB Listener evaluates rules
 * to determine what to do with the request.
 * This defines the types of rules on the ALB Listener.
 * Possible values are `host-header`, `http-header`, `http-request-method`,
 * `path-pattern`, `query-string`, or `source-ip`.
 * These values are mapped from the official ALB Listener Rules document.
 * Please refer to the AWS documentation for more information.
 *
 * The official documentation also imposes some restrictions on rules.
 * It is important to review those restrictions, or else resource creation might fail and get into a dirty state.
 *
 * @group Resources/AlbListener
 */
export type IAlbListenerRuleTypes = {
  /**
   * Matches requests based on the value of the host header in the HTTP request.
   */
  'host-header': AlbListenerRuleHostHeaderConditionSchema;

  /**
   * Matches requests based on the value of a specified HTTP header in the HTTP request.
   */
  'http-header': AlbListenerRuleHttpHeaderConditionSchema;

  /**
   * Matches requests based on the HTTP method in the HTTP request.
   */
  'http-request-method': AlbListenerRuleHttpRequestMethodConditionSchema;

  /**
   * Matches requests based on the value of the path in the HTTP request.
   */
  'path-pattern': AlbListenerRulePathPatternConditionSchema;

  /**
   * Matches requests based on the value of the query string in the HTTP request.
   */
  'query-string': AlbListenerRuleQueryStringConditionSchema;

  /**
   * Matches requests based on the source IP address.
   */
  'source-ip': AlbListenerRuleSourceIpConditionSchema;
};

/**
 * When sending a fixed HTTP response to the client, this ALB Listener Action defines the payload structure
 * used by the ALB Listener to fulfill the request.
 *
 * @group Resources/AlbListener
 *
 * @hideconstructor
 */
export class AlbListenerActionFixedResponseActionSchema {
  /**
   * Value of the Content-Type HTTP header.
   */
  @Validate({ options: { minLength: 1 } })
  ContentType = Schema<string>();

  /**
   * The fixed message to be sent in the HTTP response.
   */
  @Validate({ options: { minLength: 1 } })
  MessageBody = Schema<string>();

  /**
   * Value of the HTTP status code returned to the client.
   */
  @Validate({ options: { maxLength: 599, minLength: 100 } })
  StatusCode = Schema<number>();
}

/**
 * When forwarding requests to one or more target groups, this ALB Listener Action defines the target groups
 * the ALB Listener forwards requests to.
 *
 * @group Resources/AlbListener
 *
 * @hideconstructor
 */
export class AlbListenerActionForwardConfigSchema {
  /**
   * Definition of target group that will accept the request.
   * You must specify the name of the target group, and the percentage of traffic to send to that target group.
   *
   * You set the name of the target group when you created the {@link AlbTargetGroupSchema} resource.
   *
   * For a single target group, you can use a weight of 100.
   * For multiple target groups, the sum of the weights must be 100.
   */
  @Validate<unknown>([
    {
      options: { minLength: 1 },
    },
    {
      destruct: (value: AlbListenerActionForwardConfigSchema['TargetGroups']): string[] =>
        value.map((v) => v.targetGroupName),
      options: { maxLength: 32, minLength: 1 },
    },
    {
      destruct: (value: AlbListenerActionForwardConfigSchema['TargetGroups']): number[] => value.map((v) => v.Weight),
      options: { maxLength: 999, minLength: 0 },
    },
  ])
  TargetGroups = Schema<{ targetGroupName: string; Weight: number }[]>();

  /**
   * An optional configuration to instruct the load balancer on how to route requests to the targets.
   * With stickiness enabled, the load balancer routes requests to the same target for the given duration.
   */
  @Validate<unknown>([
    {
      destruct: (value: AlbListenerActionForwardConfigSchema['TargetGroupStickinessConfig']): number[] => {
        const subjects: number[] = [];
        if (value) {
          subjects.push(value.DurationSeconds);
        }
        return subjects;
      },
      options: { maxLength: 604800, minLength: 1 },
    },
    {
      destruct: (value: AlbListenerActionForwardConfigSchema['TargetGroupStickinessConfig']): string[] => {
        const subjects: string[] = [];
        if (value) {
          subjects.push(String(value.Enabled));
        }
        return subjects;
      },
      options: { minLength: 1 },
    },
  ])
  TargetGroupStickinessConfig? = Schema<{
    DurationSeconds: number;
    Enabled: boolean;
  } | null>(null);
}

/**
 * When sending a redirect HTTP response to the client, this ALB Listener Action defines the payload structure
 * used by the ALB Listener to fulfill the request.
 *
 * The ALB is already configured to redirect to `protocol://hostname:port/path?query` where each part of the URL is
 * derived from the original request. You must override at least one option to avoid infinite redirect loops.
 *
 * @group Resources/AlbListener
 *
 * @hideconstructor
 */
export class AlbListenerActionRedirectActionSchema {
  /**
   * Override the hostname in the redirect URL.
   */
  @Validate({
    destruct: (value: AlbListenerActionRedirectActionSchema['Host']): string[] => (value ? [value] : []),
    options: { minLength: 1 },
  })
  Host? = Schema<string | null>(null);

  /**
   * Override the path in the redirect URL.
   */
  @Validate({
    destruct: (value: AlbListenerActionRedirectActionSchema['Path']): string[] => (value ? [value] : []),
    options: { minLength: 1 },
  })
  Path? = Schema<string | null>(null);

  /**
   * Override the port in the redirect URL.
   */
  @Validate({
    destruct: (value: AlbListenerActionRedirectActionSchema['Port']): number[] => (value ? [value] : []),
    options: { maxLength: 65535, minLength: 0 },
  })
  Port? = Schema<number | null>(null);

  /**
   * Override the protocol in the redirect URL.
   */
  @Validate({
    destruct: (value: AlbListenerActionRedirectActionSchema['Protocol']): string[] => (value ? [value] : []),
    options: { minLength: 1 },
  })
  Protocol? = Schema<'HTTP' | 'HTTPS' | null>(null);

  /**
   * Override the query parameters in the redirect URL.
   */
  @Validate({
    destruct: (value: AlbListenerActionRedirectActionSchema['Query']): string[] => (value ? [value] : []),
    options: { minLength: 1 },
  })
  Query? = Schema<string | null>(null);

  /**
   * HTTP redirect code. The redirect is either permanent (HTTP 301) or temporary (HTTP 302).
   */
  @Validate({
    destruct: (value: AlbListenerActionRedirectActionSchema['StatusCode']): number[] => (value ? [value] : []),
    options: { maxLength: 302, minLength: 301 },
  })
  StatusCode = Schema<301 | 302 | null>(null);
}

/**
 * Matches on the value of the Host header in the HTTP request.
 * You must provide one or more hostnames to match on.
 *
 * @group Resources/AlbListener
 *
 * @hideconstructor
 */
export class AlbListenerRuleHostHeaderConditionSchema {
  @Validate([
    { options: { minLength: 1 } },
    {
      destruct: (value: AlbListenerRuleHostHeaderConditionSchema['Values']): string[] => value,
      options: { maxLength: 128, minLength: 1 },
    },
  ])
  Values = Schema<string[]>();
}

/**
 * Matches on the value of the HTTP header in the HTTP request.
 * You must specify the name of the HTTP header to match on, and provide one or more values to match on.
 *
 * @group Resources/AlbListener
 *
 * @hideconstructor
 */
export class AlbListenerRuleHttpHeaderConditionSchema {
  @Validate({ options: { maxLength: 40, minLength: 1 } })
  HttpHeaderName = Schema<string>();

  @Validate([
    { options: { minLength: 1 } },
    {
      destruct: (value: AlbListenerRuleHttpHeaderConditionSchema['Values']): string[] => value,
      options: { maxLength: 128, minLength: 1 },
    },
  ])
  Values = Schema<string[]>();
}

/**
 * Matches on the value of the HTTP request method.
 * You must provide one or more HTTP methods to match on.
 *
 * @group Resources/AlbListener
 *
 * @hideconstructor
 */
export class AlbListenerRuleHttpRequestMethodConditionSchema {
  @Validate([
    { options: { minLength: 1 } },
    {
      destruct: (value: AlbListenerRuleHttpRequestMethodConditionSchema['Values']): string[] => value,
      options: { maxLength: 40, minLength: 1, regex: /^[A-Z-_]+$/ },
    },
  ])
  Values = Schema<string[]>();
}

/**
 * Matches on the value of the path in the HTTP request.
 * You must provide one or more paths to match on.
 *
 * For more information on use of wildcards, please refer to the AWS documentation.
 *
 * @group Resources/AlbListener
 *
 * @hideconstructor
 */
export class AlbListenerRulePathPatternConditionSchema {
  @Validate([
    { options: { minLength: 1 } },
    {
      destruct: (value: AlbListenerRulePathPatternConditionSchema['Values']): string[] => value,
      options: { maxLength: 128, minLength: 1 },
    },
  ])
  Values = Schema<string[]>();
}

/**
 * Matches on the value of the query parameters in the HTTP request.
 * You must provide one or more key-value pairs to match on,
 * where the key is the name of the query to match, and the value is the value of the query to match.
 *
 * @group Resources/AlbListener
 *
 * @hideconstructor
 */
export class AlbListenerRuleQueryStringConditionSchema {
  @Validate([
    { options: { minLength: 1 } },
    {
      destruct: (value: AlbListenerRuleQueryStringConditionSchema['Values']): string[] =>
        value.reduce<string[]>((accumulator, current) => {
          accumulator.push(current.Key, current.Value);
          return accumulator;
        }, []),
      options: { maxLength: 128, minLength: 1 },
    },
  ])
  Values = Schema<{ Key: string; Value: string }[]>();
}

/**
 * Matches on the source IP address of the request.
 * You must provide one or more IP addresses to match on.
 *
 * @group Resources/AlbListener
 *
 * @hideconstructor
 */
export class AlbListenerRuleSourceIpConditionSchema {
  @Validate([
    { options: { maxLength: 5, minLength: 1 } },
    {
      destruct: (value: AlbListenerRuleSourceIpConditionSchema['Values']): string[] => value,
      options: { maxLength: 15, minLength: 7 },
    },
  ])
  Values = Schema<string[]>();
}

/**
 * The `AlbListenerSchema` class is the schema for the `AlbListener` resource,
 * which represents the AWS Application Load Balancer Listener resource.
 * This resource can create a alb listener in AWS using the AWS JavaScript SDK V3 API.
 * See [official sdk docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/elastic-load-balancing-v2/).
 *
 * @group Resources/AlbListener
 *
 * @hideconstructor
 *
 * @overrideProperty parents - This resource has parents.
 * ```mermaid
 * graph TD;
 *   alb((Alb)) --> alb_listener((Alb<br>Listener))
 *   alb_target_group((Alb<br>Target<br>Group)) --> alb_listener
 * ```
 * @overrideProperty resourceId - The resource id is of format `alb-listener-<alb-name>`
 */
export class AlbListenerSchema extends BaseResourceSchema {
  /**
   * Input properties.
   * * `properties.awsAccountId` - The AWS account ID.
   * * `properties.awsRegionId` - The AWS region ID.
   * * `properties.DefaultActions` - Specify an action to run when none of the conditions are met.
   * See {@link IAlbListenerActionTypes} for options.
   * * `properties.Port` - The port on which the listener is listening.
   * * `properties.Protocol` - The protocol to use. Valid values are `HTTP`.
   * * `properties.rules` - Specify the rules for the listener.
   * A rule must contain conditions as per {@link IAlbListenerRuleTypes},
   * a set of actions to perform if the conditions are met as per {@link IAlbListenerActionTypes},
   * and a priority which determines the order in which the rules are evaluated.
   *
   * @group Properties
   */
  @Validate<unknown>([
    {
      destruct: (value: AlbListenerSchema['properties']): string[] => [
        value.awsAccountId,
        value.awsRegionId,
        value.Protocol,
      ],
      options: { minLength: 1 },
    },
    {
      destruct: (value: AlbListenerSchema['properties']): number[] => [value.Port],
      options: { maxLength: 65535, minLength: 0 },
    },
    {
      // DefaultActions array must be of length 1.
      destruct: (value: AlbListenerSchema['properties']): [AlbListenerSchema['properties']['DefaultActions']] => [
        value.DefaultActions,
      ],
      options: { maxLength: 1, minLength: 1 },
    },
    {
      destruct: (value: AlbListenerSchema['properties']): AlbListenerActionFixedResponseActionSchema[] =>
        value.DefaultActions.filter((a) => a.actionType === 'fixed-response').map((a) => a.action),
      options: { isSchema: { schema: AlbListenerActionFixedResponseActionSchema } },
    },
    {
      destruct: (value: AlbListenerSchema['properties']): AlbListenerActionForwardConfigSchema[] =>
        value.DefaultActions.filter((a) => a.actionType === 'forward').map((a) => a.action),
      options: { isSchema: { schema: AlbListenerActionForwardConfigSchema } },
    },
    {
      destruct: (value: AlbListenerSchema['properties']): AlbListenerActionRedirectActionSchema[] =>
        value.DefaultActions.filter((a) => a.actionType === 'redirect').map((a) => a.action),
      options: { isSchema: { schema: AlbListenerActionRedirectActionSchema } },
    },
    {
      // rules array can be empty.
      destruct: (value: AlbListenerSchema['properties']): [AlbListenerSchema['properties']['rules']] => [value.rules],
      options: { minLength: 0 },
    },
    {
      // Each rule must have at least one action.
      destruct: (value: AlbListenerSchema['properties']): AlbListenerSchema['properties']['rules'][0]['actions'][] =>
        value.rules.map((r) => r.actions),
      options: { minLength: 1 },
    },
    {
      destruct: (value: AlbListenerSchema['properties']): AlbListenerActionFixedResponseActionSchema[] =>
        value.rules
          .map((r) => r.actions)
          .flat()
          .filter((a) => a.actionType === 'fixed-response')
          .map((a) => a.action),
      options: { isSchema: { schema: AlbListenerActionFixedResponseActionSchema } },
    },
    {
      destruct: (value: AlbListenerSchema['properties']): AlbListenerActionForwardConfigSchema[] =>
        value.rules
          .map((r) => r.actions)
          .flat()
          .filter((a) => a.actionType === 'forward')
          .map((a) => a.action),
      options: { isSchema: { schema: AlbListenerActionForwardConfigSchema } },
    },
    {
      destruct: (value: AlbListenerSchema['properties']): AlbListenerActionRedirectActionSchema[] =>
        value.rules
          .map((r) => r.actions)
          .flat()
          .filter((a) => a.actionType === 'redirect')
          .map((a) => a.action),
      options: { isSchema: { schema: AlbListenerActionRedirectActionSchema } },
    },
    {
      // Each rule must have at least one condition.
      destruct: (value: AlbListenerSchema['properties']): AlbListenerSchema['properties']['rules'][0]['conditions'][] =>
        value.rules.map((r) => r.conditions),
      options: { minLength: 1 },
    },
    {
      destruct: (value: AlbListenerSchema['properties']): AlbListenerRuleHostHeaderConditionSchema[] =>
        value.rules
          .map((r) => r.conditions)
          .flat()
          .filter((c) => c.conditionType === 'host-header')
          .map((c) => c.condition),
      options: { isSchema: { schema: AlbListenerRuleHostHeaderConditionSchema } },
    },
    {
      destruct: (value: AlbListenerSchema['properties']): AlbListenerRuleHttpHeaderConditionSchema[] =>
        value.rules
          .map((r) => r.conditions)
          .flat()
          .filter((c) => c.conditionType === 'http-header')
          .map((c) => c.condition),
      options: { isSchema: { schema: AlbListenerRuleHttpHeaderConditionSchema } },
    },
    {
      destruct: (value: AlbListenerSchema['properties']): AlbListenerRuleHttpRequestMethodConditionSchema[] =>
        value.rules
          .map((r) => r.conditions)
          .flat()
          .filter((c) => c.conditionType === 'http-request-method')
          .map((c) => c.condition),
      options: { isSchema: { schema: AlbListenerRuleHttpRequestMethodConditionSchema } },
    },
    {
      destruct: (value: AlbListenerSchema['properties']): AlbListenerRulePathPatternConditionSchema[] =>
        value.rules
          .map((r) => r.conditions)
          .flat()
          .filter((c) => c.conditionType === 'path-pattern')
          .map((c) => c.condition),
      options: { isSchema: { schema: AlbListenerRulePathPatternConditionSchema } },
    },
    {
      destruct: (value: AlbListenerSchema['properties']): AlbListenerRuleQueryStringConditionSchema[] =>
        value.rules
          .map((r) => r.conditions)
          .flat()
          .filter((c) => c.conditionType === 'query-string')
          .map((c) => c.condition),
      options: { isSchema: { schema: AlbListenerRuleQueryStringConditionSchema } },
    },
    {
      destruct: (value: AlbListenerSchema['properties']): AlbListenerRuleSourceIpConditionSchema[] =>
        value.rules
          .map((r) => r.conditions)
          .flat()
          .filter((c) => c.conditionType === 'source-ip')
          .map((c) => c.condition),
      options: { isSchema: { schema: AlbListenerRuleSourceIpConditionSchema } },
    },
    {
      destruct: (value: AlbListenerSchema['properties']): number[] => value.rules.map((r) => r.Priority),
      options: { maxLength: 999, minLength: 1 },
    },
  ])
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    DefaultActions: {
      [A in keyof IAlbListenerActionTypes]-?: { action: IAlbListenerActionTypes[A]; actionType: A };
    }[keyof IAlbListenerActionTypes][];
    Port: number;
    Protocol: 'HTTP';
    rules: {
      actions: {
        [A in keyof IAlbListenerActionTypes]-?: { action: IAlbListenerActionTypes[A]; actionType: A };
      }[keyof IAlbListenerActionTypes][];
      conditions: {
        [R in keyof IAlbListenerRuleTypes]-?: { condition: IAlbListenerRuleTypes[R]; conditionType: R };
      }[keyof IAlbListenerRuleTypes][];
      Priority: number;
    }[];
  }>();

  /**
   * Saved response.
   * * `response.ListenerArn` - ALB Listener ARN.
   * * `response.Rules` - An array of ALB Listener Rule ARNs and priorities.
   */
  @Validate({
    destruct: (value: AlbListenerSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.ListenerArn) {
        subjects.push(value.ListenerArn);
      }
      if (value.Rules && value.Rules.length > 0) {
        subjects.push(...value.Rules.map((r) => r.RuleArn));
        subjects.push(...value.Rules.map((r) => String(r.Priority)));
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    ListenerArn?: string;
    Rules?: { Priority: number; RuleArn: string }[];
  }>();
}

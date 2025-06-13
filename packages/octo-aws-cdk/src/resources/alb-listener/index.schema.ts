import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

export type IAlbListenerActionTypes = {
  'fixed-response': AlbListenerActionFixedResponseActionSchema;
  forward: AlbListenerActionForwardConfigSchema;
  redirect: AlbListenerActionRedirectActionSchema;
};

export type IAlbListenerRuleTypes = {
  'host-header': AlbListenerRuleHostHeaderConditionSchema;
  'http-header': AlbListenerRuleHttpHeaderConditionSchema;
  'http-request-method': AlbListenerRuleHttpRequestMethodConditionSchema;
  'path-pattern': AlbListenerRulePathPatternConditionSchema;
  'query-string': AlbListenerRuleQueryStringConditionSchema;
  'source-ip': AlbListenerRuleSourceIpConditionSchema;
};

export class AlbListenerActionFixedResponseActionSchema {
  @Validate({ options: { minLength: 1 } })
  ContentType: string;

  @Validate({ options: { minLength: 1 } })
  MessageBody: string;

  @Validate({ options: { maxLength: 599, minLength: 100 } })
  StatusCode: number;
}

export class AlbListenerActionForwardConfigSchema {
  @Validate<unknown>([
    {
      options: { minLength: 1 },
    },
    {
      destruct: (value: AlbListenerActionForwardConfigSchema['TargetGroups']): string[] =>
        value.map((v) => v.targetGroupName),
      options: { minLength: 1 },
    },
    {
      destruct: (value: AlbListenerActionForwardConfigSchema['TargetGroups']): number[] => value.map((v) => v.Weight),
      options: { maxLength: 999, minLength: 0 },
    },
  ])
  TargetGroups: { targetGroupName: string; Weight: number }[];

  @Validate<unknown>([
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
  ])
  TargetGroupStickinessConfig?: {
    DurationSeconds: number;
    Enabled: boolean;
  };
}

export class AlbListenerActionRedirectActionSchema {
  @Validate({ options: { minLength: 1 } })
  Host?: string;

  @Validate({ options: { minLength: 1 } })
  Path?: string;

  @Validate({ options: { maxLength: 65535, minLength: 0 } })
  Port?: number;

  @Validate({ options: { minLength: 1 } })
  Protocol?: 'HTTP' | 'HTTPS';

  @Validate({ options: { minLength: 1 } })
  Query?: string;

  @Validate({ options: { maxLength: 302, minLength: 301 } })
  StatusCode: 301 | 302;
}

export class AlbListenerRuleHostHeaderConditionSchema {
  @Validate([
    { options: { minLength: 1 } },
    {
      destruct: (value: AlbListenerRuleHostHeaderConditionSchema['Values']): string[] => value,
      options: { maxLength: 128, minLength: 1 },
    },
  ])
  Values: string[];
}

export class AlbListenerRuleHttpHeaderConditionSchema {
  @Validate({ options: { maxLength: 40, minLength: 1 } })
  HttpHeaderName: string;

  @Validate([
    { options: { minLength: 1 } },
    {
      destruct: (value: AlbListenerRuleHttpHeaderConditionSchema['Values']): string[] => value,
      options: { maxLength: 128, minLength: 1 },
    },
  ])
  Values: string[];
}

export class AlbListenerRuleHttpRequestMethodConditionSchema {
  @Validate([
    { options: { minLength: 1 } },
    {
      destruct: (value: AlbListenerRuleHttpRequestMethodConditionSchema['Values']): string[] => value,
      options: { maxLength: 40, minLength: 1, regex: /^[A-Z-_]+$/ },
    },
  ])
  Values: string[];
}

export class AlbListenerRulePathPatternConditionSchema {
  @Validate([
    { options: { minLength: 1 } },
    {
      destruct: (value: AlbListenerRulePathPatternConditionSchema['Values']): string[] => value,
      options: { maxLength: 128, minLength: 1 },
    },
  ])
  Values: string[];
}

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
  Values: { Key: string; Value: string }[];
}

export class AlbListenerRuleSourceIpConditionSchema {
  @Validate([
    { options: { maxLength: 5, minLength: 1 } },
    {
      destruct: (value: AlbListenerRuleSourceIpConditionSchema['Values']): string[] => value,
      options: { maxLength: 15, minLength: 7 },
    },
  ])
  Values: string[];
}

export class AlbListenerSchema extends BaseResourceSchema {
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

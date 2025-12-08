export type S3BucketPolicy = {
  Statement: {
    Action: string | string[];
    Effect: string;
    Principal: string;
    Resource: string | string[];
    Sid: string;
  }[];
  Version: string;
};

/**
 * @internal
 */
export class PolicyUtility {
  static getSafeSid(subject: string): string {
    return subject.replace(new RegExp(/[^0-9A-Za-z]/, 'ig'), '');
  }

  static isS3BucketPolicyEqual(policy1: S3BucketPolicy, policy2: S3BucketPolicy): boolean {
    if (policy1.Version !== policy2.Version) {
      return false;
    }

    // Check if both policies have the same number of statements.
    if (policy1.Statement.length !== policy2.Statement.length) {
      return false;
    }

    // Helper function to normalize and sort arrays for comparison.
    const normalizeArray = <T>(value: T | T[]): T[] => {
      return Array.isArray(value) ? [...value].sort() : [value];
    };

    // Helper function to compare arrays (order-independent).
    const arraysEqual = <T>(arr1: T[], arr2: T[]): boolean => {
      if (arr1.length !== arr2.length) {
        return false;
      }
      const sorted1 = [...arr1].sort();
      const sorted2 = [...arr2].sort();
      return sorted1.every((val, idx) => val === sorted2[idx]);
    };

    return policy1.Statement.every((p1s) => {
      const p2s = policy2.Statement.find((p) => p.Sid === p1s.Sid);
      if (!p2s) {
        return false;
      }

      // Compare Effect.
      if (p1s.Effect !== p2s.Effect) {
        return false;
      }

      // Compare Principal.
      if (p1s.Principal !== p2s.Principal) {
        return false;
      }

      // Compare Action (order-independent).
      const p1Actions = normalizeArray(p1s.Action);
      const p2Actions = normalizeArray(p2s.Action);
      if (!arraysEqual(p1Actions, p2Actions)) {
        return false;
      }

      // Compare Resource (order-independent).
      const p1Resources = normalizeArray(p1s.Resource);
      const p2Resources = normalizeArray(p2s.Resource);
      return arraysEqual(p1Resources, p2Resources);
    });
  }
}

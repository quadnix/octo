export interface IIamUserProperties {
  username: string;
}

export interface IIamUserResponse {
  Arn: string;
  policies: { [key: string]: string[] };
  UserId: string;
  UserName: string;
}

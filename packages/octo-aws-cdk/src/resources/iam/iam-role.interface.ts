export interface IIamRoleProperties {
  rolename: string;
}

export interface IIamRoleResponse {
  Arn: string;
  policies: { [key: string]: string[] };
  RoleId: string;
  RoleName: string;
}

export interface IS3WebsiteProperties {
  Bucket: string;
  ErrorDocument: string;
  IndexDocument: string;
  manifestDiff: { [key: string]: ['add' | 'delete' | 'update', string] };
}

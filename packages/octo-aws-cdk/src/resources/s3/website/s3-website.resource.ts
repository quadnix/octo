import { AResource, Diff, DiffAction, Resource } from '@quadnix/octo';
import type { IS3WebsiteProperties, IS3WebsiteResponse } from './s3-website.interface.js';

@Resource()
export class S3Website extends AResource<S3Website> {
  readonly MODEL_NAME: string = 's3-website';

  declare properties: IS3WebsiteProperties;
  declare response: IS3WebsiteResponse;

  private readonly manifestDiff: { [key: string]: ['add' | 'delete' | 'update', string] } = {};

  constructor(resourceId: string, properties: IS3WebsiteProperties) {
    super(resourceId, properties, []);
  }

  override async diffProperties(): Promise<Diff[]> {
    const diffs: Diff[] = [];

    if (this.manifestDiff && Object.keys(this.manifestDiff).length > 0) {
      diffs.push(
        new Diff(this, DiffAction.UPDATE, 'update-source-paths', JSON.parse(JSON.stringify(this.manifestDiff))),
      );
    }

    // Empty manifestDiff.
    for (const key of Object.keys(this.manifestDiff)) {
      delete this.manifestDiff[key];
    }

    return diffs;
  }

  updateManifestDiff(manifestDiff: S3Website['manifestDiff']): void {
    for (const key of Object.keys(manifestDiff)) {
      this.manifestDiff[key] = [...manifestDiff[key]];
    }
  }
}

import { AResource, Diff, DiffAction, Resource } from '@quadnix/octo';
import type { IResource } from '@quadnix/octo';
import type { IS3WebsiteProperties } from './s3-website.interface.js';

@Resource()
export class S3Website extends AResource<S3Website> {
  readonly MODEL_NAME: string = 's3-website';

  private readonly manifestDiff: { [key: string]: ['add' | 'delete' | 'update', string] } = {};

  constructor(resourceId: string, properties: IS3WebsiteProperties) {
    super(resourceId, properties as unknown as IResource['properties'], []);
  }

  override async diff(): Promise<Diff[]> {
    const diffs: Diff[] = [];

    if (this.manifestDiff && Object.keys(this.manifestDiff).length > 0) {
      diffs.push(new Diff(this, DiffAction.UPDATE, 'update-source-paths', this.manifestDiff));
    }

    return diffs;
  }

  updateManifestDiff(manifestDiff: S3Website['manifestDiff']): void {
    for (const key of Object.keys(manifestDiff)) {
      this.manifestDiff[key] = [...manifestDiff[key]];
    }
  }
}

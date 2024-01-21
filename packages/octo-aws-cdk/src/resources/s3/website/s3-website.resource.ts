import { AResource, Diff, DiffAction, IResource, Resource } from '@quadnix/octo';
import { IS3WebsiteProperties } from './s3-website.interface.js';

@Resource()
export class S3Website extends AResource<S3Website> {
  readonly MODEL_NAME: string = 's3-website';

  private manifestDiff: { [key: string]: ['add' | 'delete' | 'update', string] };

  constructor(resourceId: string, properties: IS3WebsiteProperties) {
    super(resourceId, properties as unknown as IResource['properties'], []);
  }

  override async diff(previous?: S3Website): Promise<Diff[]> {
    const diffs = await super.diff(previous);

    if (this.manifestDiff) {
      diffs.push(new Diff(this, DiffAction.UPDATE, 'update-source-paths', this.manifestDiff));
    }

    return diffs;
  }

  updateManifestDiff(manifestDiff: S3Website['manifestDiff']): void {
    this.manifestDiff = {};
    for (const key of Object.keys(manifestDiff)) {
      this.manifestDiff[key] = [...manifestDiff[key]];
    }
  }
}

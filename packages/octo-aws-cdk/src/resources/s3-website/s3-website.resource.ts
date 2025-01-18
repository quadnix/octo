import { AResource, Diff, DiffAction, Resource } from '@quadnix/octo';
import { S3WebsiteSchema } from './s3-website.schema.js';

@Resource<S3Website>('@octo', 's3-website', S3WebsiteSchema)
export class S3Website extends AResource<S3WebsiteSchema, S3Website> {
  declare properties: S3WebsiteSchema['properties'];
  declare response: S3WebsiteSchema['response'];

  private readonly manifestDiff: { [key: string]: ['add' | 'delete' | 'update', string] } = {};

  constructor(resourceId: string, properties: S3WebsiteSchema['properties']) {
    super(resourceId, properties, []);
  }

  override async diffInverse(diff: Diff, deReferenceResource: (resourceId: string) => Promise<never>): Promise<void> {
    if (diff.field === 'update-source-paths' && diff.action === DiffAction.UPDATE) {
      // do nothing, since nothing in node changes for this diff action.
    } else {
      await super.diffInverse(diff, deReferenceResource);
    }
  }

  override async diffProperties(): Promise<Diff[]> {
    const diffs: Diff[] = [];

    if (this.manifestDiff && Object.keys(this.manifestDiff).length > 0) {
      diffs.push(
        new Diff(this, DiffAction.UPDATE, 'update-source-paths', JSON.parse(JSON.stringify(this.manifestDiff))),
      );
    }

    return diffs;
  }

  override diffUnpack(diff: Diff): Diff[] {
    if (diff.action === DiffAction.ADD) {
      const diffs: Diff[] = [diff];

      if (this.manifestDiff && Object.keys(this.manifestDiff).length > 0) {
        diffs.push(
          new Diff(this, DiffAction.UPDATE, 'update-source-paths', JSON.parse(JSON.stringify(this.manifestDiff))),
        );
      }

      return diffs;
    } else {
      return [diff];
    }
  }

  updateManifestDiff(manifestDiff: S3Website['manifestDiff']): void {
    for (const key of Object.keys(manifestDiff)) {
      this.manifestDiff[key] = [...manifestDiff[key]];
    }
  }
}

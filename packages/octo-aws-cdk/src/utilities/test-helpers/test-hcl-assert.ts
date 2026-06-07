import { diff } from 'jest-diff';
import type { OctoTerraform } from '../../factories/octo-terraform.factory.js';
import { type HclShape, HclUtility } from '../hcl/hcl.utility.js';

const NO_COLOR = (s: string): string => s;

export class HclAssert {
  private previousHclShape: HclShape = {};

  constructor(private readonly octoTerraform: OctoTerraform) {}

  digest(): string | null {
    const before = this.previousHclShape;
    const after = HclUtility.parse(this.octoTerraform.render());

    this.previousHclShape = after;
    this.octoTerraform.reset();

    return diff(before, after, {
      aColor: NO_COLOR,
      bColor: NO_COLOR,
      changeColor: NO_COLOR,
      commonColor: NO_COLOR,
      patchColor: NO_COLOR,
    });
  }
}

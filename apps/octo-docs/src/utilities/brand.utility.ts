const ORGANIZATION_NAME = 'quadnix';
const PROJECT_NAME = 'octo';

export enum BRAND_FORMAT {
  CAPITALIZE = 'capitalize',
  LOWER = 'lower',
  UPPER = 'upper',
}

export enum BRAND_VARIATION {
  ORG = 'org',
  PROJ = 'proj',
  PROJ_ALL_CDK = 'proj-all-cdk',
  PROJ_AWS_CDK = 'proj-aws-cdk',
  ORG_PROJ = 'org-proj',
  ORG_at_PROJ = 'org-@-proj',
  PROJ_at_ORG = 'proj-@-org',
}

function formatBrand(brand: string, format: BRAND_FORMAT): string {
  switch (format) {
    case BRAND_FORMAT.CAPITALIZE:
      return brand.charAt(0).toUpperCase() + brand.slice(1);
    case BRAND_FORMAT.LOWER:
      return brand.toLowerCase();
    case BRAND_FORMAT.UPPER:
      return brand.toUpperCase();
  }
}

export function getBrand(
  variation: BRAND_VARIATION = BRAND_VARIATION.PROJ,
  format: BRAND_FORMAT = BRAND_FORMAT.CAPITALIZE,
): string {
  switch (variation) {
    case BRAND_VARIATION.ORG:
      return formatBrand(ORGANIZATION_NAME, format);
    case BRAND_VARIATION.PROJ:
      return formatBrand(PROJECT_NAME, format);
    case BRAND_VARIATION.PROJ_ALL_CDK:
      return `${formatBrand(PROJECT_NAME, format)}-${formatBrand('*-cdk', format)}`;
    case BRAND_VARIATION.PROJ_AWS_CDK:
      return `${formatBrand(PROJECT_NAME, format)}-${formatBrand('aws-cdk', format)}`;
    case BRAND_VARIATION.ORG_PROJ:
      return `${formatBrand(ORGANIZATION_NAME, format)} ${formatBrand(PROJECT_NAME, format)}`;
    case BRAND_VARIATION.ORG_at_PROJ:
      return `${formatBrand(ORGANIZATION_NAME, format)}@${formatBrand(PROJECT_NAME, format)}`;
    case BRAND_VARIATION.PROJ_at_ORG:
      return `${formatBrand(PROJECT_NAME, format)}@${formatBrand(ORGANIZATION_NAME, format)}`;
  }
}

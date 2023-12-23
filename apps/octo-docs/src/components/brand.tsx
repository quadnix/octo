import { getBrand } from '@site/src/utilities/brand.utility';

export function Brand({ variation, format, codify }): JSX.Element {
  const brand = getBrand(variation, format);
  if (codify) {
    return <code>{brand}</code>;
  } else {
    return <span>{brand}</span>;
  }
}

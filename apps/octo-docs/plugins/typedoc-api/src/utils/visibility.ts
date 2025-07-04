import type { JSONOutput } from 'typedoc';
import type { TSDDeclarationReflectionMap } from '../types.js';

// https://github.com/TypeStrong/typedoc/blob/master/src/lib/output/themes/DefaultTheme.ts#L264
export function hasOwnDocument(id: number, reflections: TSDDeclarationReflectionMap): boolean {
  const reflection = reflections[id];

  return Boolean(reflection?.permalink && !reflection.permalink.includes('#'));
}

export function allCategoryChildrenHaveOwnDocument(
  category: JSONOutput.ReflectionCategory,
  reflections: TSDDeclarationReflectionMap,
): boolean {
  let onlyOwnDocuments = true;

  category.children?.forEach((child) => {
    onlyOwnDocuments &&= hasOwnDocument(child, reflections);
  });

  return onlyOwnDocuments;
}

export function allGroupChildrenHaveOwnDocument(
  group: JSONOutput.ReflectionGroup,
  reflections: TSDDeclarationReflectionMap,
): boolean {
  return Boolean(group.children?.every((child) => hasOwnDocument(child, reflections)));
}

import { createContext } from 'react';
import type { ApiOptions, TSDDeclarationReflectionMap } from '../types.js';

export const ApiDataContext = createContext<{
  options: ApiOptions;
  reflections: TSDDeclarationReflectionMap;
}>({
  options: {
    banner: '',
    breadcrumbs: true,
    gitRefName: 'master',
    minimal: false,
    pluginId: 'default',
    scopes: [],
  },
  reflections: {},
});

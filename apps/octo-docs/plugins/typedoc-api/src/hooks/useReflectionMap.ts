import { useContext } from 'react';
import { ApiDataContext } from '../components/ApiDataContext.js';
import type { TSDDeclarationReflectionMap } from '../types.js';

export function useReflectionMap(): TSDDeclarationReflectionMap {
  return useContext(ApiDataContext).reflections;
}

import { useContext } from 'react';
import { ApiDataContext } from '../components/ApiDataContext.js';

export function useBreadcrumbs(): boolean {
  return useContext(ApiDataContext).options.breadcrumbs;
}

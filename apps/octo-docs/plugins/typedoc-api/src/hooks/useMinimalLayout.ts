import { useContext } from 'react';
import { ApiDataContext } from '../components/ApiDataContext.js';

export function useMinimalLayout(): boolean {
  return useContext(ApiDataContext).options.minimal;
}

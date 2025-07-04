import { useContext } from 'react';
import { ApiDataContext } from '../components/ApiDataContext.js';

export function useGitRefName(): string {
  return useContext(ApiDataContext).options.gitRefName;
}

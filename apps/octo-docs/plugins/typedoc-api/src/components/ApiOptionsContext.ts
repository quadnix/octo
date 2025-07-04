import { createContext } from 'react';

export const ApiOptionsContext = createContext({
  hideInherited: false,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setHideInherited: (_hideInherited: boolean) => {},
});

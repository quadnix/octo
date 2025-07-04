// https://github.com/TypeStrong/typedoc-default-themes/blob/master/src/default/partials/comment.hbs

import type { ReactElement } from 'react';
import type { JSONOutput } from 'typedoc';

function removePrefix(value: string): string {
  return value.replace(/^is([A-Z])/, (_match, char) => String(char).toLocaleLowerCase());
}

export interface FlagsProps {
  flags?: JSONOutput.ReflectionFlags;
}

export function Flags({ flags }: FlagsProps): ReactElement | null {
  if (!flags) {
    return null;
  }

  return (
    <>
      {Object.keys(flags)
        .map(removePrefix)
        .map((flag) => (
          <span key={flag} className={`tsd-flag tsd-flag-${flag}`}>
            {flag}
          </span>
        ))}
    </>
  );
}

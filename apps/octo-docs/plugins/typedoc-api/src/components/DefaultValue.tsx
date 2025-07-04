import type { ReactElement } from 'react';
import type { JSONOutput } from 'typedoc';
import { displayPartsToMarkdown } from './Comment.js';
import { Type } from './Type.js';

export interface DefaultValueProps {
  comment?: JSONOutput.Comment;
  type?: { type: string };
  value?: JSONOutput.SomeType | string;
}

function extractDefaultTag(comment?: JSONOutput.Comment): string | null {
  const tag = comment?.blockTags?.find((tag) => tag.tag === '@default');

  if (!tag) {
    return null;
  }

  return displayPartsToMarkdown(tag.content);
}

export function DefaultValue({ comment, value, type }: DefaultValueProps): ReactElement | null {
  if (!comment && !value) {
    return null;
  }

  const defaultTag = extractDefaultTag(comment);

  if (!defaultTag && !value) {
    return null;
  }

  return (
    <span className="tsd-signature-symbol">
      {' = '}

      {value && <>{typeof value === 'string' ? value : <Type type={value} />}</>}

      {!value && defaultTag && (
        <Type type={{ type: 'literal', ...(type?.type === 'intrinsic' ? {} : type), value: defaultTag }} />
      )}
    </span>
  );
}

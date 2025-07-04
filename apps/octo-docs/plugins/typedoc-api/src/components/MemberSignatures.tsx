import { type ReactElement, useState } from 'react';
import { useMinimalLayout } from '../hooks/useMinimalLayout.js';
import type { TSDSignatureReflection } from '../types.js';
import { Icon } from './Icon.js';
import { MemberSignatureBody, hasSigBody } from './MemberSignatureBody.js';
import { MemberSignatureTitle } from './MemberSignatureTitle.js';

export interface MemberSignaturesProps {
  inPanel?: boolean;
  sigs: TSDSignatureReflection[];
}

export function MemberSignatures({ inPanel, sigs }: MemberSignaturesProps): ReactElement {
  const [activeIndex, setActiveIndex] = useState(0);
  const minimal = useMinimalLayout();
  const hasMultiple = sigs.length > 1;
  const body = sigs[activeIndex];

  return (
    <>
      <div className={inPanel ? 'tsd-panel-content' : ''}>
        <ul className="tsd-signatures">
          {sigs.map((sig, i) => (
            <li
              key={sig.id}
              className={`tsd-signature tsd-kind-icon ${
                i === activeIndex ? '' : 'tsd-signature-inactive'
              } ${hasMultiple ? 'tsd-pressable' : ''}`}
              onClick={
                hasMultiple
                  ? (): void => {
                      setActiveIndex(i);
                    }
                  : undefined
              }
            >
              <Icon reflection={sig} />
              <MemberSignatureTitle sig={sig} />
            </li>
          ))}
        </ul>
      </div>

      {hasSigBody(body, minimal) && (
        <>
          {!inPanel && <hr className="tsd-divider" />}

          <div className={inPanel ? 'tsd-panel-content' : ''}>
            <ul className="tsd-descriptions">
              <li key={body.id} className="tsd-description">
                <MemberSignatureBody sig={body} />
              </li>
            </ul>
          </div>
        </>
      )}
    </>
  );
}

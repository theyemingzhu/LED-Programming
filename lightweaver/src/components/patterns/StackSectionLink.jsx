import React from 'react';
import { normalizeSavedLooks } from '../../lib/sectionLookModel.js';

export const stackEditHref = id => `#screen=pattern&editStack=${encodeURIComponent(id)}`;

export function StackSectionLink({ look, showName = false }) {
  return <a className="stack-section-link" href={stackEditHref(look.id)}
    aria-label={showName ? `Edit ${look.label} in Patterns` : `Update sections for ${look.label} in Patterns`}>
    {showName ? look.label : 'Update sections'}
  </a>;
}

export function StackSectionLinks({ lookIds, looks }) {
  const saved = normalizeSavedLooks(looks);
  return <span className="stack-section-links">{lookIds.map(id => {
    const look = saved.find(item => item.id === id);
    return look && <StackSectionLink key={id} look={look} showName />;
  })}</span>;
}

import React from 'react';
import { targetLabel } from '../../lib/sectionLookModel.js';

export function ProjectStackSummary({ sections, patternName, patternColor, onEditSection, disabled }) {
  const assignments = sections.map(section => {
    const id = section.look.patternId;
    const off = ['blackout', 'off'].includes(id) || Number(section.look.brightness) === 0;
    return { section, patternId: off ? 'off' : id, name: off ? 'Off' : patternName(id) };
  });
  const first = assignments[0];
  const uniform = first && assignments.every(assignment => assignment.patternId === first.patternId);
  if (!first) return null;
  return <div className={`project-stack-summary${uniform ? ' has-uniform-pattern' : ''}`} aria-label="Section assignments" role="group">
    {uniform && <strong className="project-stack-pattern" style={{ '--stack-color': patternColor(first.patternId) }}>{first.name}</strong>}
    <ul className="project-stack-section-targets" aria-label={uniform ? `${first.name} sections` : 'Sections and patterns'}>
      {assignments.map(({ section, patternId, name }) => <li key={section.id}>
        <button type="button" className="wordlink" aria-label={`Edit ${targetLabel(section)}`} aria-description={name}
          data-testid={`stack-edit-section-${section.id}`} disabled={disabled} onClick={() => onEditSection(section)}>
          <span>{targetLabel(section)}</span>
          {!uniform && <strong className="project-stack-pattern" style={{ '--stack-color': patternColor(patternId) }}>{name}</strong>}
        </button>
      </li>)}
    </ul>
  </div>;
}

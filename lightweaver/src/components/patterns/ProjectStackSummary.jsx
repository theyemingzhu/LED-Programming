import React from 'react';

export function ProjectStackSummary({ sections = [], patternName = id => id, patternColor = () => '#8398aa', compact = false }) {
  return <div className={`project-stack-summary${compact ? ' is-compact' : ''}`}>
    {sections.map(section => {
      const id = section.look?.patternId || section.patternId;
      const off = id === 'blackout' || id === 'off' || Number(section.look?.brightness) === 0;
      return <div className="project-stack-section" key={section.id}>
        <span className={`project-stack-strip${off ? ' is-off' : ''}`} style={{ '--stack-color': off ? '#252b30' : patternColor(id) }} aria-hidden="true" />
        <span className="project-stack-section-name">{section.label}</span>
        <strong>{off ? 'Off' : patternName(id)}</strong>
      </div>;
    })}
  </div>;
}

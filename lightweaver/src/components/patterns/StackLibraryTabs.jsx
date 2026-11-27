import React from 'react';

const tabId = (scope, value) => `${scope}-tab-${value}`;
export const stackLibraryPanelId = (scope, value) => `${scope}-panel-${value}`;

export function StackLibraryTabs({ scope, label, value, onChange, lookCount, stacksFirst = false }) {
  const tabs = stacksFirst ? ['stacks', 'patterns'] : ['patterns', 'stacks'];
  const handleKey = (event, index) => {
    let nextIndex;
    switch (event.key) {
      case 'ArrowLeft': nextIndex = (index + tabs.length - 1) % tabs.length; break;
      case 'ArrowRight': nextIndex = (index + 1) % tabs.length; break;
      case 'Home': nextIndex = 0; break;
      case 'End': nextIndex = tabs.length - 1; break;
      default: return;
    }
    event.preventDefault();
    const next = tabs[nextIndex];
    event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[nextIndex]?.focus();
    onChange(next);
  };

  return <div className="stack-library-tabs" role="tablist" aria-label={label}>
    {tabs.map((tab, index) => <button key={tab} type="button" className="btn" role="tab"
      id={tabId(scope, tab)} aria-controls={stackLibraryPanelId(scope, tab)}
      aria-selected={value === tab} tabIndex={value === tab ? 0 : -1}
      onClick={() => onChange(tab)} onKeyDown={event => handleKey(event, index)}>
      {tab === 'stacks' ? `Project stacks (${lookCount})` : 'Patterns'}
    </button>)}
  </div>;
}

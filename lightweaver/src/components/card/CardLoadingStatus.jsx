import React from 'react';

export function CardLoadingStatus({ children, className = '' }) {
  return (
    <div className={`card-loading-status ${className}`} role="status">
      {children && <><span className="lw-notice-spinner" aria-hidden="true" /><span>{children}</span></>}
    </div>
  );
}

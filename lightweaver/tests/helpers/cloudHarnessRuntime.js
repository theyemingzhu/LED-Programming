// Resolve imports through Vite so the harness shares the providers' React
// instance and hot-reload versions of the context modules.
export { default as React } from 'react';
export { createRoot } from 'react-dom/client';
export { CloudLibraryError } from '../../src/lib/cloudLibraryClient.js';
export { CloudLibraryProvider, useCloudLibrary } from '../../src/state/CloudLibraryContext.jsx';
export { ProjectProvider, useProject } from '../../src/state/ProjectContext.jsx';

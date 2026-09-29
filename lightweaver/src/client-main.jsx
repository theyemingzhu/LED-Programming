import React from 'react';
import '@fontsource-variable/dm-sans';
import { createRoot } from 'react-dom/client';
import ClientApp from './client/ClientApp.jsx';
createRoot(document.getElementById('root')).render(<ClientApp />);

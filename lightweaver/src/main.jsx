import { createRoot } from 'react-dom/client';
import { bootstrapCardHostFromLocation } from './lib/cardConnection.js';
// Exact v3 design: the mockup's own verbatim CSS + its own component files
// (converted to ES modules, bodies unchanged). This IS the code that renders
// /v3-mock/, so the look is guaranteed identical. Real-data wiring is layered
// on top of these exact components, not a rebuild of them.
import './v3/v3-styles.css';
import './v3/v3-screens.css';
// Live-only Layout controls (Light disclosure, per-strip expander, wire editor,
// canvas wire overlay, marching-ants) in the v3 token idiom. The real-engine
// Layout screen renders the exact mockup markup + these classes.
import './styles/v3-layout-extra.css';
// Layout mode shell (Draw | Size | Wire) — the mode switch + per-mode panel
// stubs; grows across the remaining layout-redesign-plan.md Phase 2 steps.
import './styles/v3-layout-modes.css';
// Live-only Settings widgets (card connection actions + status banner, ring
// hardware summary, project library rows, hardware layout editor lists,
// advanced JSON disclosure) in the v3 token idiom. The six mockup cards still
// use the mockup's own .set-* classes; these only style genuinely live-only UI.
import './styles/v3-settings-extra.css';
// The "Console" visual treatment for Settings: machined modules with a status
// LED, physical-feeling controls, amber for what the card is doing right now.
// Scoped entirely under .set, tokens only, so no other screen and neither
// theme is affected. Loads after the extras so it can override them.
import './styles/v3-settings-console.css';
// The same treatment across the rest of the Card page — identity strip, phase
// ladder, evidence panels, support tiles, folds — so the screen reads as one
// instrument instead of two designs meeting halfway down.
import './styles/v3-card-console.css';
// Live-only Patterns controls (connection/repair status strip, multi-section
// target tabs, Advanced disclosure, live card summary, load-more / empty state)
// — the .pmx-*/.tc-* classes lw-pattern.jsx emits that the static mockup has no
// slot for. Without this import those controls render unstyled.
import './styles/v3-patterns-extra.css';
// Live-only Playlist controls (.pl-* status / row extras) in the v3 token idiom.
import './styles/v3-playlist-extra.css';
// ── The console vocabulary, carried past the Card page ──────────────
// Card and Settings got the "console" treatment first, which left every
// other screen speaking a different language. These four layers finish
// the job: one shared token block, then one dressing layer per screen.
// All of them are CSS over the existing markup, scoped to that screen's
// root class, tokens only, so both themes keep working.
import './styles/v3-console-shared.css';
// Patterns and Playlist both render under .pm and share their parts, so
// one layer dresses both and they cannot drift apart again.
import './styles/v3-pm-console.css';
// Show: chrome only — its selectable chips are drawn by an inline
// chipStyle() in lw-show.jsx, which no stylesheet can reach.
import './styles/v3-show-console.css';
// Layout: physical chrome from the Console candidate, measured register
// from the Blueprint one. The canvas renderer is deliberately untouched.
import './styles/v3-layout-console.css';
import App from './v3/app.jsx';
import { createOfflineUpdateController } from './lib/offlineUpdate.js';
import { detectRuntimeMode } from './lib/runtimeMode.js';
import { createIndexedDbProjectRepository, migrateLocalStorageProjects } from './lib/indexedDbProjectRepository.js';

// Version switch. The 3.3 redesign is the default. The previous interface
// (version 3) is preserved verbatim under ./src-v3 and stays reachable at
// ?v=3 (or #v3) so nothing is lost — it loads on demand, so it adds nothing
// to the default bundle.
const params = new URLSearchParams(window.location.search);
const wantsV3 = params.get('v') === '3' || window.location.hash === '#v3';

if (import.meta.env.DEV) {
  const { installDevCardPreview } = await import('./lib/devCardPreview.js');
  await installDevCardPreview();
}
// Preview seeds used to run after app.jsx had already adopted ?cardHost=
// and then wipe that host. Re-read the URL after any seed so Connect still
// targets the card on this machine.
bootstrapCardHostFromLocation();

const root = createRoot(document.getElementById('root'));

const runtimeMode = detectRuntimeMode();
const offlineUpdate = createOfflineUpdateController({ runtimeMode });
void offlineUpdate.register();
let projectRepository = null;
try {
  projectRepository = createIndexedDbProjectRepository();
  void migrateLocalStorageProjects(projectRepository).catch(() => {});
} catch { /* localStorage compatibility remains available */ }
globalThis.__LW_RUNTIME_MODE__ = runtimeMode;
globalThis.__LW_OFFLINE_UPDATE__ = offlineUpdate;

if (wantsV3) {
  // Frozen previous interface — its own self-contained tree, untouched by 3.3.
  // Pull its stylesheet in the same on-demand chunk so it renders styled.
  Promise.all([
    import('../src-v3/main.css'),
    import('../src-v3/App.jsx'),
  ]).then(([, m]) => {
    root.render(<m.default />);
  });
} else {
  root.render(<App projectRepository={projectRepository} offlineUpdateController={offlineUpdate} />);
}

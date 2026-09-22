# Expression project source P1 result

Status: implemented as an additive project field with no project schema-major,
repository-envelope, wire, runtime, firmware, or card changes.

## Stored shape

Every new or migrated project exposes:

```json
{
  "expressionScenes": {
    "version": 1,
    "activeSceneId": null,
    "scenes": []
  }
}
```

Each entry in `scenes` is canonical editable source from
`normalizeSceneExpression()`. Layout references are deliberately retained even
when the current Layout cannot resolve them. Stable scene and step IDs are not
regenerated. Compiler results such as runtime packages, saved looks, playlists,
storage payloads, or resolution reports are rejected as editable source.

## Unsupported data decision

Future collection versions and malformed version-1 collection objects are
cloned and retained opaquely through project migration, serialization, autosave,
repository envelopes, and content hashing. `inspectExpressionScenes()` reports
an explicit reason and `applyExpressionScenesUpdate()` rejects edits until a
supported Studio or recovery action handles that data. JSON-unsafe values fail
with `SceneExpressionProjectError` rather than being partially serialized.

This choice prevents an older Studio from silently deleting newer expression
work when it opens and saves a project.

## API and context

`sceneExpressionProject.js` provides the empty collection, project
normalization, editability inspection, and value-or-functional-update helper.
`ProjectProvider` exposes `expressionScenes` and `setExpressionScenes`; project
application always replaces the collection, so switching to a legacy or empty
project cannot retain the previous project's scenes.

`serializeProject()` includes the collection directly. Existing structural
fingerprinting therefore marks expression edits as unsaved, the existing
autosave captures the draft, and repository commits use the same complete
snapshot while retaining the existing lifecycle distinction between restored
draft work and committed saves. The repository's canonical SHA-256 content hash
changes when expression source changes without any additional identity field.

## Focused evidence

Tests cover canonical normalization, unresolved target retention, stable IDs,
functional updates, legacy defaults, opaque future/malformed round trips,
derived-output rejection, project switching, and repository hash changes.

The red run failed because the collection module and default field did not yet
exist. The final relevant run passed 98 Node tests across expression source,
project migration, repositories, autosave storage, and project lifecycle.
`ProjectContext.jsx` also passed a standalone esbuild JSX/module transform.
The repository `npm run build` could not start Vite in this worktree because
the shared dependency directory is empty and the font preparation step could
not find the declared DM Sans file; no dependency or build-script change was
made in this bounded slice.

The remaining provider-level browser check should mount `ProjectProvider`, use
the functional `setExpressionScenes` form, assert `serializeProject()` contains
the update and changes dirty state, then replace it with a project lacking the
field and assert the context returns the empty collection. This belongs beside
the existing provider lifecycle browser coverage and is intentionally left to
the UI/integration owner.

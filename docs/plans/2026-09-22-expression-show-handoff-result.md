# Show shared-scene handoff result

Show now reads the project’s canonical `expressionScenes` collection directly from `ProjectContext`. Its inspector displays every saved scene by name with step count and opening cue, supports editor-focus selection, and opens the shared `SceneExpressionEditor` without creating another scene model or storage path.

## Behavior

- Selecting a Show scene changes only `activeSceneId`. An absent, null, or explicit `playbackSceneId` is preserved.
- Opening a scene retains its source IDs, ordered steps, Layout targets, and current project context. Saving and returning keeps the selected scene in Show, while Lab reopens the same source and later Lab edits appear back in Show.
- Empty collections offer the existing shared editor as the creation path. Unsupported future collections show their compatibility message and leave the opaque source unchanged.
- Show stops its microphone, song/demo playback, and card frame stream before mounting the scene editor. Closing awaits the Shell rehearsal stop/restore callback; a failed restoration keeps the editor open with an explicit error.
- The Shell integration uses `onExpressionSceneEditorOpenChange` to scope rehearsal ownership to the Show editor instead of every Show state, and `onStopExpressionScenePreview` to restore card playback before legacy audio controls return.
- Selecting or navigating between scenes does not start card output or install anything. Browser coverage blocks and records all card mutations.

## Integration contract

`ShowScreen` consumes the existing dynamic Screen props plus:

- `onStartExpressionScenePreview` and `expressionPreviewContextKey` for the shared editor rehearsal.
- `onStopExpressionScenePreview(reason)` to stop and verify restoration before leaving the editor.
- `onExpressionSceneEditorOpenChange(open)` so Shell limits rehearsal ownership to the mounted Show editor.

The corresponding Shell work is supplied separately by the app owner; this change does not edit `app.jsx`.

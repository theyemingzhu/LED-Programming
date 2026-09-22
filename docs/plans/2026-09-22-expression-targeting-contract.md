# Expression targeting contract

`lightweaver/src/lib/sceneExpressionTargets.js` is the one adapter from a
current Layout to an expression editor. It is deliberately a pure read model:
it changes neither Layout, wiring, nor artwork coordinates.

## Catalog

`buildSceneExpressionAreaCatalog({ strips, sectionFamilies, layerGroups,
compiledWiring })` returns a serializable version-1 catalog. Its areas are:

- `all` — the whole current artwork, and only this explicit ID means whole
  artwork.
- `strip:<stripId>` — a current Layout strip. IDs survive a rename.
- `family:<sectionFamilyId>` — a connected divided strip, with its existing
  Layout member order.
- `group:<groupId>` — an existing Layout strip group, including a mandala
  group such as Petals or Inner ring.

Every area has a readable `name`, `parentIds`, `childIds`, `stripIds`, and
ordered `sourceRefs`. A source reference is `{ stripId, sourceLeds }`. It is a
reference to existing artwork data, not copied geometry, so the editor can use
the Layout canvas without recreating strips or changing coordinates.

`physicalOrder` is supplied only from successful `compiledWiring.pixels`. The
adapter never substitutes array order, artwork order, or group order for output
order. If compiled wiring is unavailable, the catalog remains usable for
choosing and independently repeating areas, but a continuous expression cannot
be exported.

## Selection

`resolveSceneExpressionSelection(catalog, { areaIds, domain })` accepts only
the saved catalog IDs.

- `domain: 'continuous'` returns one `physicalRefs` stream in the current
  compiled-wiring order. This is the meaning of a pattern travelling across the
  three parts of a divided strip.
- `domain: 'repeat'` returns `instances`, one independent source domain per
  selected area. This is the meaning of giving the three parts their own
  simultaneous behavior.

The function rejects parent/child and overlapping-group selections before any
pixel can appear twice. It also rejects an empty choice, an unknown domain, and
a continuous choice without compiled wiring.

Missing saved area IDs remain in `unresolved`; they never expand to `all` or a
similarly named current strip. A family/group whose recorded member is missing
is likewise unresolved. The only supported split continuity is an existing
`sectionFamilies` record. Merged or otherwise removed identities are reported
for deliberate reassignment rather than guessed migration.

## Consumer boundary

Persist `{ areaIds, domain }` in a scene draft. Rebuild the catalog from the
current Layout when reopening or exporting, then resolve that stored selection.
An editor may use `sourceRefs` to highlight existing artwork. A renderer/export
must consume `physicalRefs` for continuous output and must retain the returned
instances for repeated output. Do not persist `physicalRefs`: wiring can change
while the editable source selection remains valid.

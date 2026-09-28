# Spatial LED mapping for Lightweaver — research note

28 September 2026. Future feature research only; no runtime or UI change proposed for the current Layout batch.

## The three orders

1. **Visual order** is the order of rows or artwork layers. Sections from one GPIO may appear between sections from other outputs. A drag in this list need not move a physical LED.
2. **Physical address order** is the ordered run sequence inside each output, including direction and inactive LEDs. It determines which RGB value reaches each LED. Only an explicit wiring operation should change it.
3. **Spatial map** is the position `(x, y)` of each addressed LED on the installation. A color field, image, or procedural effect can be evaluated at these positions, independent of the list order or GPIO assignment.

The current request to interleave sections in Layout is a visual arrangement requirement. It does not, by itself, authorize rewiring or create a spatial effect engine. A useful invariant is that reordering a visual row leaves the compiled `(output, output-relative address, x, y)` tuple of every LED unchanged.

## What MadMapper actually demonstrates

GarageCube's [MadMapper interface guide](https://madmapper.com/files/01-Introduction%20to%20the%20User%20Interface.pdf) describes light fixtures as representations of a physical installation, patched to DMX channels and universes. The guide separately says fixtures can move in a list as layers, and warns that overlapping fixtures can overwrite one another (pp. 18–20). This supports keeping display order, fixture position, and address patch distinct.

MadMapper's [version 6 release notes](https://forum.garagecube.com/viewtopic.php?t=36222) say DMX fixtures sample composited video surfaces directly in the output, with automatic or custom DMX canvases. Earlier [GarageCube FAQ guidance](https://shop.garagecube.com/pages/faq) describes a projector-output Syphon/Spout loopback to sample a composition; that is a version-specific earlier workflow, not a universal requirement. The same FAQ documents Art-Net/sACN output compatibility, address-shifting tools, and unfolding 3D LED geometry into a 2D representation. The transferable idea is **sample a composed color field at each mapped LED position, then send the resulting colors through a separately defined address patch**. The sources do not establish a built-in “fractal effect” contract. Fractals would be one possible authored color field or material, subject to its own design and performance proof.

## Existing Lightweaver pieces

- `led-art-mapper/app/src/mapper.js` samples SVG paths into per-pixel `(x, y)` points. Its `assignIndices` follows strip array order, while `createPhysicalFrame` writes by explicit physical index. `led-art-mapper/app/src/export.js` distinguishes an index-based WLED grid map from an ordered coordinate map. That mapper is useful source geometry, but its draw-order indices must not be assumed to equal current Studio wiring.
- `lightweaver/src/lib/projectModel.js` stores artwork strips, offsets, layer order, patch board, and wiring separately. `lightweaver/src/lib/wiringCompiler.js` compiles output runs into ordered physical pixels carrying output ID, source LED, `(x, y)`, and inactive status, plus output-relative ranges. This is the strongest candidate for an authoritative address-to-position projection.
- `lightweaver/src/lib/sectionRunConversion.js` can divide an existing strip at run boundaries and checks that compiled physical addresses and coordinates survive the operation. It also migrates look and scene references. Section identity and address identity therefore already require care.
- `lightweaver/src/lib/frameEngine.js` normalizes `(x, y)` and passes them to per-pixel patterns, while also supporting strip progress and global index. `led-art-mapper/app/src/patterns.js` exposes normalized `x, y` to authored patterns, including an XY diagnostic in its library. `lightweaver/src/lib/patternLabPatternAdapter.js` and `patternLabCompositor.js` already render and blend bounded layers per LED. These are reusable concepts; they are not proof that arbitrary spatial compositions can already be delivered to the ESP32 card with full fidelity. Many Pattern Lab generators in `patternLabGenerators.js` use one-dimensional strip progress.

## Workspace choices

| Choice | Benefit | Cost / risk |
| --- | --- | --- |
| Add spatial editing to **Layout** | Geometry and physical verification are nearby. | Crowds the installation/wiring task with creative composition; easy to confuse a canvas drag with an address edit. |
| Add a **Spatial Mapping** workspace inside Studio | Clear place for field placement, masks and whole-artwork preview; can read the verified Layout projection and reuse Pattern Lab ingredients. | Adds navigation and a new saved composition contract; must define card playback/export limits. |
| Revive/extend the separate **led-art-mapper portal** | Existing SVG sampling and coordinate export give it a head start for specialist mapping. | Duplicates project, section, wiring and look state; handoff drift is likely unless an explicit import/export contract is built. |

**Recommendation:** keep the current Layout redesign focused on sections, counts, visual ordering, and explicit wiring order. If a prototype proves spatial compositions useful, give them a dedicated workspace **inside Studio**, backed by the same project and compiled wiring projection. Treat the existing mapper as a source of geometry and export logic, not a second authority for physical addresses. This is a design inference from the code and the MadMapper model, not a claim that current firmware already supports it.

## Smallest future prototype

Use one saved project with at least two GPIO outputs and three interleaved visual sections. Read the compiled address-to-XY table without changing wiring. Render one animated whole-artwork field (for example, a moving radial gradient) and one existing pattern layer or mask at those positions; show the resulting colors on the installation preview. Export or stream one physical RGB frame in compiled output/run order. A fixture test should prove that visual row reorder and hiding a section do not renumber or recolor unrelated physical addresses; changing an LED's mapped coordinate should alter only its spatial sample, while changing a run order should require the existing wiring verification. Benchmark target device memory/frame rate before promising card-native playback. This prototype can remain offline until the runtime route is chosen.

## Consequential questions

1. Is the desired field authored from images/video, procedural recipes, or both? Is “fractal” a specific family of generators Adrian wants, or a visual example?
2. Should the end result be pre-rendered frames stored on microSD, browser-to-card live frames, a compact card-native recipe, or Art-Net from an external host? These have materially different offline and frame-rate limits under the ESP32-only runtime.
3. Which coordinate space is canonical for an installation: imported SVG units, normalized 2D artwork, or measured real-world positions? How should stacked LEDs and intentionally unmapped/inactive addresses sample?
4. Should a spatial composition target the entire installation, a selection of sections, or both? What happens to saved compositions when Layout sections split, merge, or are rewired?

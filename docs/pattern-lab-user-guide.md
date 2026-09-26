# Build and run a shared Lightweaver scene

A scene is one editable source shared by **Lab** and **Show**. Build it once,
reopen it from either place, and explicitly choose when to save it, rehearse it
on the lights, or install it for card playback.

## 1. Prepare the Layout

1. Open **Layout** and map every physical strip to the correct output.
2. Give strips and sections names that describe the artwork, such as **Left
   branch**, **Outline**, or **Upper curve**. Sections can have any shape.
3. Check output order, direction, color order, and LED counts.
4. Install the Layout on the intended card.

Scene rehearsal is tied to this exact installed pixel map. If you later change
strip routing, direction, LED count, or source mapping, install the revised
Layout before using **Try on lights** again.

## Different patterns on separate GPIO strips

GPIOs describe physical wiring. Sections describe which LEDs receive a pattern.
Give each strip a named section in **Layout**, assign its GPIO and LED count,
and check the routing before installing.

The GPIO label beside each section shows where it is wired. A section can span
more than one GPIO; those parts share that section's pattern. To control them
independently, use separate named sections in Layout. Conversely, several
sections on one GPIO can each have their own pattern.

For a single combined look, open **Patterns**, choose a named section under
**Design target**, and choose its pattern. Repeat for the other sections.
**All sections** and **Use this look on every section** deliberately apply one
look across the piece. Use the individual section targets to keep them different.
The target selector appears before the pattern bank, and the bank names the
scope of the next pattern choice. On phones, scroll past the preview to reach
the target selector and the pattern cards.

Use **Keep this look** to retain the combination in the project, then
**Install on card** to update standalone playback. Keeping a look in Studio
does not by itself install it. When a timed playlist is enabled, that playlist
controls playback: include the saved combined look in the playlist if you want
its sections to play together during that step.

For multiple ordered combinations, use the scene workflow below. One scene step
can assign different patterns to several named areas at the same time.

## Patterns from Bench Discovery

Finish counting and confirming each connected strip, then choose **Save what
we found**. The completed Discovery step offers **Try patterns on the measured
lights**. Choose **Same pattern on all measured strips** for matching outputs, or
choose a pattern beside each GPIO to make them different.

Trying a pattern changes temporary card playback. **Stop preview** restores
the previous temporary patterns. **Keep these patterns** retains the choices
in the measured project for the final setup. Installing the setup is what makes
the measured output map and its patterns available for standalone playback.
Where Discovery offers a direct install button, **Keep these patterns and
install** includes the current choices. In the counting overlay, use **Keep
these patterns**, then **Continue to Layout** to finish placement and installation.

Older temporary setups may need **Update temporary setup for each GPIO** before
independent patterns can be tried. This preserves the confirmed counts; the
extra pixels provisioned for discovery remain probe headroom, not measured LEDs.

If the project already has an authored layout, Discovery preserves it. Use the
Layout handoff to place the measured strips and confirm their wiring before
installing. The full Patterns bank remains available after that setup step.

## 2. Build the scene in Lab

1. Open **Lab** and choose **Build scene**.
2. Name the scene, or choose **New scene** to add another one.
3. In **What plays together**, add an area and select its **Where** target.
   Named Layout areas let separate paths or split sections use independent
   behavior.
4. Choose the pattern, card color controls, speed, and brightness for each
   assignment.
5. Add ordered steps, set each hold time, and arrange their order.

The exact native card slice currently supports built-in card patterns, card
color controls, speed, brightness, ordered holds, and **Cut** changes between
steps. For a pattern that travels through several sections, choose **Flow**,
arrange the participating sections, and reverse their effect direction where
needed. This changes the effect route; it does not change the physical wire
order in Layout. Use **Record Flow** for standalone delivery of the complete
scene, as described below. The editor keeps unsupported combinations unavailable
rather than silently changing the effect.

### Stack patterns over a section mix

Open the current look in **Lab**, expand **Layers**, and add an overlay. Its
target controls which sections receive the additional pattern; the existing
section mix stays underneath. Adjust opacity and blend, move layers above or
below one another, mute a layer, or use Undo. Record the complete result and
retain it in the project to make it available under **Recordings** in Playlist.
The saved recording retains its editable Lab recipe.

## 3. Choose the right action

### Record Flow and install a recording

1. Choose **Record Flow** in the scene editor. Check the duration and size shown
   before recording. Studio saves both the rendered frames and editable source.
2. Open **Playlist**, add the item from **Recordings**, and arrange it alongside
   saved native looks. A recording is one complete output frame across the
   configured GPIOs, so its sections play together.
3. Use the existing install action. Studio checks compatible card firmware,
   uploads the files to microSD, verifies their hashes by reading them back, and
   only then installs the playback configuration.
4. To change a recording, open **Saved recordings** in Lab. Flow recordings use
   **Edit scene**; Lab recordings reopen their recipe. Record the edited source
   again and reinstall to update card playback.

Recorded playback requires writable microSD storage and firmware with recorded
media support. The same or different built-in patterns on individual sections
use native playback and do not require microSD. A source-only legacy recording
must be recorded again before installation. If wiring, LED counts, or physical
direction change, record again against the new Layout.

Recordings survive browser reload in local storage separate from the project
JSON. Use a portable project export to move both source and recording bytes to
another browser or computer; editable source alone does not contain the frames.

### Save scene

**Save scene** saves the editable project source. It does not change the card
or the lights. Use it whenever you want the latest scene edits to survive a
reload and remain available in both Lab and Show.

### Try on lights

**Try on lights** is a temporary rehearsal on the connected card. Studio first
checks that:

- you are connected as the owner of the intended card;
- the card reports known-good wiring;
- the card's saved project and running project identify the same installed
  source; and
- every physical pixel maps to the same Layout strip and source LED as the
  current draft.

Studio then snapshots the current playback and streams the rendered frame.
Stopping rehearsal or closing the Show editor cancels the stream and verifies
restoration of previous playback while the same card and source context remain
valid. A card or source-context change stops further writes; Studio does not
restore into a different card or a superseding owner. If exact restoration cannot
be verified, Studio keeps the failure visible and does not silently return to
normal Show controls.

### Put scene on card

**Put scene on card** makes the selected scene the card's standalone playback.
Studio saves the canonical editable source first, verifies that exact source,
installs the compiled native runtime, and verifies the card readback. A POST
success alone is not treated as proof that installation finished.

If source saving succeeds but runtime installation fails, the scene remains
saved and is reported as **saved, not installed**. Resolve the card problem and
run **Put scene on card** again.

## 4. Reopen and edit from Show

1. Open **Show** to see the same saved scene library.
2. Select a scene to make it the current shared scene source.
3. Choose **Edit scene** to open that exact scene in the shared editor.
4. Make changes, then use **Save scene**, **Try on lights**, or **Put scene on
   card** as needed.
5. Choose **Back to Show**. Any active rehearsal is stopped and its previous
   card playback is restored before Show's normal audio controls resume.

The scene ID, ordered steps, assignments, and Layout targets remain the same
when moving between Lab and Show.

## 5. Understand saved and installed state

The saved source and installed card receipt answer different questions:

- **Project saved** means the editable scene source was persisted.
- **On card** means that exact source and playback were verified on the
  connected card.
- **Earlier snapshot on card** means the card has a verified older scene while
  the project now contains newer edits, or a different card is connected.

After editing an installed scene, save it and choose **Put scene on card** again
to update standalone playback. After changing Layout wiring, install the Layout
first, then reinstall or rehearse the scene.

## Connection checklist

- Use the supported Lightweaver card on the same local network as Studio.
- Connect as the card owner before installation or physical rehearsal.
- Confirm the card identity shown by Studio is the intended artwork.
- Resolve wiring, source-fingerprint, or restoration warnings instead of
  bypassing them. Studio deliberately refuses physical output when identity or
  mapping cannot be proved.

For the existing private recipe workspace, audio analysis, and sequence export,
see the [advanced Pattern Lab guide](pattern-lab-advanced-user-guide.md).

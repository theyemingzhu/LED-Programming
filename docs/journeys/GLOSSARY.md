# Lightweaver words — the one list

Decided by Adrian on 2026-11-19. Each concept has one word on screen. If a screen
needs a word that isn't here, add it to this file first.

The table below is read by `lightweaver/tests/vocabulary.test.mjs`. Every phrase in
backticks in the **Never on screen** column is checked against the text Studio
shows. A phrase written as `="Word"` matches only a string that is exactly that word.

| Concept | Say | Never on screen | Meaning |
|---|---|---|---|
| Writing the project to the card | Save to card | `Install on card`, `Install to card`, `Install project` | Sends the project to the card and reads it back. "Install" and "Update" are reserved for firmware. |
| A complete arrangement | Look | `Scene` | A named arrangement of patterns across sections, with symmetry, tuning and sound where supported. One effect on its own is a **pattern**. |
| The screen where you make looks | Looks | `Patterns & Looks`, `Patterns &amp; Looks`, `="Patterns"` | The menu item and page heading. Patterns stay patterns inside it. |
| Joining a card to Studio | Connect | `Pair` | One verb for every way of reaching the card (Wi-Fi, USB, card page). |
| The wire a strip plugs into | Output | `GPIO` | Owners see "Output 1". The GPIO number is a small detail beside it (`Output 1 · GPIO 16`), shown by one formatter, never as the label. |

## Words that keep their meaning

- **Pattern**: one effect.
- **Project**: the artwork setup plus its saved looks.
- **Playlist**: an optional timed order of looks.
- **Update**: new card firmware only.

## How the check works

Studio has rejected words on screen today. The test records how many there are
in `lightweaver/tests/vocabulary-baseline.json`, file by file, and fails if a count
goes **up** (a new rejected word was added) or **down** without the baseline being
lowered (so the progress is recorded). After renaming screen text, run:

```bash
cd lightweaver && node tests/vocabulary.test.mjs --update
```

The baseline should only ever shrink, until it is empty.

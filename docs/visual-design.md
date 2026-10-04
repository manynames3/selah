# Watercolor Journal

The interface should resemble ink and watercolor on tactile artist rag paper rather than a pastel dashboard. The paper is an original generated texture inspired by cotton-rag watercolor surfaces, not a scan or asset supplied by Hahnemuhle or an endorsement by that manufacturer.

## Treatment

- Organic fibers and irregular surface relief remain visible in open areas. Pale, quiet panels protect lyrics, input fields and feedback from visual noise.
- The page background uses only very pale grey-sage pigment over warm natural-white paper. Butter-yellow, coral and sky-blue remain localized to the botanical artwork rather than competing across the whole page. Controls keep clear outlines, readable labels and distinct focus states.
- Songbook selection and hover borrow the muted blue of the botanical flower petals. Selection uses a deeper paper-blended blue wash, a colored edge and a matching status badge; hover and keyboard focus use a lighter tint. The rest of the interface palette stays unchanged.
- The record uses a hand-painted image, but its rotation, album artwork, needle pivot and 9-to-36-degree playback tracking remain real interface elements.
- Botanical illustrations and small musical sketches appear at meaningful sizes. Mobile layouts reflow them instead of hiding them or reducing them to tiny ornaments.
- Decoration is non-interactive, has empty alternative text or is hidden from assistive technology, and never changes the waveform's real sample data or seek hit area.

## Original Assets

Four images were generated with the built-in image-generation tool and encoded as WebP for the site. Transparency is preserved for the botanical artwork and record. No new production dependency is required.

| Asset | Use | Generation prompt |
| --- | --- | --- |
| `assets/rag-paper.webp` | Repeating paper surface | Original flatbed-style warm natural-white cotton rag watercolor paper; irregular intertwined fibers, soft pits and fine cold-press tooth; subtle surface illumination; seamless edges; no paint, objects, branding, border or text. |
| `assets/watercolor-meadow.webp` | Journal, songbook, writing room and lyrics ornament | Original transparent ink-and-watercolor meadow with ivory/yellow daisies, soft coral wildflowers, pale blue flowers, sage leaves and two small olive musical notes; granular pigment, pooled edges, translucent washes and delicate wandering ink lines; no scenery, text, branding or paper rectangle. |
| `assets/painted-record.webp` | Animated vinyl disc | Centered top-down sage/celadon circular watercolor record on transparency; irregular concentric olive ink grooves, cotton-paper tooth, pooled pigment and dry-brush gaps; plain center for the existing artwork overlay; no tonearm, label, text, perspective or scene. |
| `assets/watercolor-field.webp` | Quiet continuous page wash | Edited with the built-in tool to remove all blue, peach, pink and yellow; only extremely pale grey-sage over warm natural-white cotton-rag paper. A few broad, softly diffusing, irregular traces extend through the middle, with at least 80% reading as unpainted paper. Fine fibers, faint feathering and subtle pigment pooling; no dominant stroke, dots, harsh outlines, corner framing, regular pattern, objects, text or branding. |

The user supplied screenshots from their Bellyfloat game as visual references for the page wash's interlocking pigment and mottled texture. They were used only as style references for a new abstract material, not copied into the journal or repository. After reviewing a multicolor version, the user requested less distraction and fewer colors. The final wash is nearly monochromatic and much lighter than those references, distributed through the center rather than confined to the edges, and blended with the paper surface at reduced opacity. There is no animated or per-refresh randomization.

`assets/painted-plinth.svg` is an original code-native material treatment. Its seeded displacement and pigment filters soften painted edges without filtering live text or controls. The existing vector flower remains the header mark.

`assets/painted-pivot.svg` gives the tonearm mount a slightly uneven, open-ended ink contour and softly pooled pigment instead of a perfect CSS circle. It keeps the original 12px mount size and position; the arm's rotation origin and playback tracking are unchanged.

## Guardrails

Preserve publishing, feedback approval, sharing, playback, seeking, volume, speed and looping behavior. Keep shared links focused on the selected recording, with botanical artwork retained farther down the songbook. Respect reduced-motion preferences. Test narrow mobile widths as well as the desktop view.

## Release Screenshots

The README pairs the original user-supplied dark-wood screenshots with four captures of the running watercolor interface, saved under `screenshots/watercolor-journal-*.webp`. The after images are browser-test captures from the isolated local D1/R2 runtime, optimized as WebP without altering the interface. The sample recordings and feedback are test fixtures, not newly published production songs. No admin password or session token appears in these captures.

Run `npm run test:e2e -- --grep 'painted journal|petal-blue'` to reproduce the desktop journal, writing room, narrow mobile layout and selection/hover captures under ignored `test-results/`. Documentation screenshots are deliberately outside `dist/` and do not ship as website assets.

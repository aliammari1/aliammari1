# Profile Banner — Art Direction (TODO)

The README hero currently uses a `capsule-render` placeholder. Replace it with a
committed local asset so it never rate-limits or 404s.

## Direction: charcoal editorial hero

- **Format:** 1280×640 PNG/SVG for the README hero; also export a 1280×640 PNG
  for GitHub Settings → Social preview.
- **Palette:** charcoal gradient `#1a1a1a → #2d2d2d → #3a3a3a` (matches the
  current header/footer), off-white type `#ffffff`, muted grey subtext `#aaaaaa`.
- **Type:** large serif or geometric display name "Ali Ammari"; small mono
  subtitle "Full-Stack Developer · AI Application Builder · Open Source".
- **Tone:** minimal, editorial, lots of negative space. No stock illustration.

## How to generate

Use the `brandkit` Claude skill for the identity board + social card, and
`imagegen-frontend-web` for the wide README hero. Commit the output under
`assets/` (e.g. `assets/banner.png`) and update the `<img src>` at the top of
`README.md`.

> Deferred here: no image is generated in this pass (config/markdown only).

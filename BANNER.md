# Profile Banner — Image Generation Prompt

The README hero currently uses a `capsule-render` placeholder. Replace it with a
committed local asset (`assets/hero.png`) so it never rate-limits or 404s, then
point the `<img src>` at the top of `README.md` at the local file.

Generate two crops from the single prompt below: a **1280×320** README hero and a
**1280×640** GitHub social-preview card (Settings → Social preview).

## The prompt

> Editorial, minimal hero banner for a software engineer's GitHub profile.
> Wide horizontal composition with generous negative space.
>
> **Background:** smooth charcoal gradient from `#1a1a1a` (left) through `#2d2d2d`
> to `#3a3a3a` (right). Matte, no glow, no noise grain overload — clean and
> premium.
>
> **Headline:** "Ali Ammari" in a large, confident geometric display face,
> off-white `#ffffff`, left-aligned in the left third.
>
> **Subtitle:** "Full-Stack & AI Application Builder" in small, sparse Fira Code
> monospace, muted grey `#aaaaaa`, set just beneath the name with comfortable
> letter-spacing.
>
> **Motif:** a subtle, low-contrast geometric line pattern on the right third —
> thin `#3a3a3a` strokes suggesting the Tunisian zellige / interlaced-star
> tessellation, abstracted and restrained (a faint texture, never a logo).
>
> **Tone:** dark-tech, art-directed, editorial. Lots of breathing room. No stock
> illustration, no clip-art icons, no rainbow color, no busy backgrounds.
>
> **Output:** 1280×320 for the README hero; also export a 1280×640 variant with
> the same elements re-centered for the square-ish social card.

## How to generate

Use the `brandkit` Claude skill (identity board + 1280×640 social card) or
`imagegen-frontend-web` (wide 1280×320 hero). Commit the output as
`assets/hero.png` (and optionally `assets/social.png`), then replace the
capsule-render `<img>` at the top of `README.md` with:

```html
<img src="./assets/hero.png" alt="Ali Ammari — Full-Stack & AI Application Builder" />
```

> No image is generated in this pass (config/markdown only). The capsule-render
> placeholder stays live until `assets/hero.png` is committed.

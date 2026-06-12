# Security Policy

This is my personal GitHub profile repository. It has no application code,
build, or runtime — only a profile README, a few GitHub Actions that regenerate
contribution graphics and refresh the Featured Projects blurbs, and the
SVG/asset files they produce.

The only realistic security surface here is the automation itself:

- The scheduled workflows in `.github/workflows/` (3D contribution calendar,
  contribution snake, metrics, and the Featured Projects refresher).
- The actions and tokens those workflows use to commit generated assets back to
  this repository (`GITHUB_TOKEN`, `METRICS_TOKEN`, `ANTHROPIC_API_KEY`).

All actions are pinned to full commit SHAs, token-bearing workflows run under
`step-security/harden-runner`, and Dependabot keeps the pinned SHAs current.

## Reporting a Concern

If you spot something that could be abused — for example a workflow with broader
permissions than it needs, an action pinned in a way that could be hijacked, or
a token being used unsafely — please email me directly rather than opening a
public issue:

- Email: contact@aliammari.com
- Subject: `[SECURITY] aliammari1 profile`

Include what you found and, if possible, how it could be exploited. I read these
personally and will reply as soon as I reasonably can.

For anything that isn't security-sensitive (typos, broken badges, suggestions),
a normal GitHub issue is perfect.

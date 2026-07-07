# AGENTS

Project-specific guidance for AI coding agents working on the managed-storage demo.

<!-- ASTRYX:START -->
Astryx v0.1.3. Run commands as `pnpm exec astryx <cmd>` from `apps/demo`.

- Import `@astryxdesign/core/reset.css`, `@astryxdesign/core/astryx.css`, and the neutral theme as the server app does.
- Start UI work with `astryx build`, inspect the selected page shell with `astryx template`, then inspect every chosen component with `astryx component`.
- Use `AppShell` or the recommended page shell before adding content.
- Use Astryx layout primitives instead of raw `<div>` elements.
- Present dense operation data as edge-to-edge rows, not cards.
- Use status components for state and reserve badges for counts or enumerated states.
- Prefer component props; otherwise use Astryx design tokens for styling. Do not add raw colors or spacing values.
<!-- ASTRYX:END -->

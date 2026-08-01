# Product

## Register

product

## Users

Desktop and mobile players of historical hex-and-counter wargames, including players
learning the Battle of Lobositz system for the first time. They need reliable rule
enforcement, clear explanations for rejected actions, and a board that remains usable
on a phone without losing the spatial character of the tabletop game.

## Product Purpose

Create a faithful bilingual electronic edition of The Battle of Lobositz. The product
must make movement, zones of control, line of sight, combat, retreat, recovery, and
victory conditions understandable and deterministic while preserving the pace and
texture of the physical game. The first release is an offline-first, same-device
two-player experience; online play and AI can build on the same rules engine later.

## Brand Personality

Historical, deliberate, and trustworthy. The interface should feel like a well-made
field command aid: calm under close inspection, compact without being cramped, and
never theatrical at the expense of rules clarity.

## Anti-references

Avoid neon strategy-game styling, fantasy ornament, glossy casino dice effects,
generic dark dashboards, excessive card grids, and skeuomorphic controls that obscure
the hex map. Do not make the original printed map carry interactive or bilingual text
that should belong to the application layer.

## Design Principles

1. The board is the primary workspace; chrome yields space to it.
2. Every legal or rejected action explains itself in the player's language.
3. Rules are deterministic, inspectable, and independent from rendering.
4. Touch interaction uses selection and confirmation, never drag-only controls.
5. Chinese and English are equal first-class interfaces and share one ruleset.

## Accessibility & Inclusion

Target WCAG 2.2 AA for application controls and text. Never encode side, legality, or
combat state using color alone. Maintain visible focus, keyboard board navigation,
reduced-motion support, large touch targets, and text alternatives for unit statistics
and line-of-sight results.

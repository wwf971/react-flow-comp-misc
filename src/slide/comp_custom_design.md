
## How to support drag to move behavior

If a custom component do no have semantically meaninful drag behavior, it is suggested not to consume the events related to drag-events, and instead delegated it to `CompContainer`, which will generate drag to move behavior.

- `CompImageExample`: on pointer down, it only forwards the event with `requestContainerMoveByPointer(event)`.
- `CompMetadata`: same forwarding pattern, no local move math.
- `CompTextMultiple`: it only detects drag-start threshold; once detected, it calls `requestContainerMoveByPoint({ x, y })`, then container owns the real move interaction.

Result: example comps stay focused on content/editing, while move/resize logic is centralized in `CompContainer`.

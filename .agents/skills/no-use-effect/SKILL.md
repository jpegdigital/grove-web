---
name: no-use-effect
description: >-
  Enforce a no-direct-useEffect policy in React codebases. Replaces useEffect
  with derived state, event handlers, data-fetching libraries, useMountEffect,
  and key-based resets. Use when writing or reviewing React components, refactoring
  useEffect calls, or when the user mentions useEffect, side effects, or
  synchronization in React code.
---

# No Direct useEffect

Never call `useEffect` directly in components. This rule eliminates the most
common sources of infinite loops, race conditions, and hidden coupling in React
codebases.

For the rare case where you need to sync with an external system on mount, use
`useMountEffect()`:

```typescript
export function useMountEffect(effect: () => void | (() => void)) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(effect, []);
}
```

## The Five Replacement Rules

### Rule 1: Derive state, don't sync it

If a value can be computed from existing state or props, compute it inline.
Never write `useEffect(() => setX(f(y)), [y])`.

**Smell test:** You have state that only mirrors other state or props.

### Rule 2: Use data-fetching libraries

Never fetch data inside an effect. Use a query library (TanStack Query, SWR,
or your framework's loader) that handles caching, cancellation, and staleness.

**Smell test:** Your effect does `fetch(...)` then `setState(...)`, or you are
reimplementing caching/retries/cancellation.

### Rule 3: Event handlers, not effects

If something happens because a user did something, put the logic in the event
handler. Do not set a flag and react to it in an effect.

**Smell test:** State is used as a flag so an effect can do the real action
("set flag -> effect runs -> reset flag" mechanics).

### Rule 4: useMountEffect for one-time external sync

For setup/teardown of external systems (DOM APIs, third-party widgets, browser
subscriptions), use `useMountEffect`. Guard preconditions via conditional
rendering in the parent rather than `if` checks inside the effect.

**Smell test:** The behavior is naturally "setup on mount, cleanup on unmount."

### Rule 5: Reset with key, not dependency choreography

When a component must start fresh for a new entity, give it a `key` prop and
use `useMountEffect` internally. Don't write an effect that resets state when
an ID changes.

**Smell test:** The effect's only job is to reset local state when an ID/prop
changes.

## Decision Flowchart

When you are about to write `useEffect`, ask in order:

1. **Is it derived state?** Compute inline. (Rule 1)
2. **Is it data fetching?** Use a query library. (Rule 2)
3. **Is it triggered by a user action?** Move to the event handler. (Rule 3)
4. **Is it external-system sync on mount?** Use `useMountEffect`. (Rule 4)
5. **Does it reset state when an ID changes?** Use `key` + `useMountEffect`. (Rule 5)

If none of these apply, discuss the use case before introducing `useEffect`.

## Why This Matters

- **Dependency arrays hide coupling.** A seemingly unrelated refactor can
  quietly change effect behavior.
- **Infinite loops are easy to create.** State update -> render -> effect ->
  state update loops compound when dependency lists are "fixed" incrementally.
- **Debugging is painful.** "Why did this run?" has no clear entrypoint like a
  handler does.
- **`useMountEffect` failures are loud.** It either ran once or not at all,
  whereas `useEffect` failures degrade gradually as flaky behavior or
  performance regressions.

## Applying This Rule

When reviewing or writing React code:

1. **New code:** Follow the five rules. Never introduce `useEffect` directly.
2. **Existing code with `useEffect`:** Refactor to the appropriate pattern.
   Walk through the decision flowchart to pick the right replacement.
3. **Lint enforcement:** Add an ESLint `no-restricted-syntax` rule targeting
   direct `useEffect` calls (the `useMountEffect` wrapper is exempt).

## Detailed Examples

For comprehensive before/after code examples of each rule, see
[examples.md](examples.md).

# Skeleton Loading System

How PradoTube implements skeleton loading with zero layout shift, shimmer animation, and smooth crossfade reveals.

## Core Principles

1. **Never block the page** — headers, footers, and static chrome render immediately. Only data-dependent areas show skeletons.
2. **Layered DOM, not conditional swap** — render both skeleton and content layers simultaneously, crossfade with CSS opacity. Never swap wrapper elements (e.g. `<div>` to `<Link>`) — React will unmount/remount, destroying DOM elements and killing transitions.
3. **Gate on image load** — don't reveal a slot until its primary image fires `onLoad`. Prevents broken-image flash.
4. **Fixed dimensions** — skeleton and content containers must occupy identical space. Any mismatch causes layout shift.
5. **Anti-flicker** — use `useDeferredLoading(isLoading)` to guarantee a 500ms minimum skeleton display. React Query cache hits return `isLoading: false` synchronously, so cached data never triggers a skeleton at all.

## Architecture

```
┌─────────────────────────────────────────────┐
│  Page Component                             │
│  ┌───────────────────────────────────────┐  │
│  │  useFeed() / useQuery()               │  │
│  │  → isLoading, data                    │  │
│  └──────────────┬────────────────────────┘  │
│                 │                            │
│  ┌──────────────▼────────────────────────┐  │
│  │  useDeferredLoading(isLoading)        │  │
│  │  → showSkeleton (min 500ms display)   │  │
│  │  → dataReady = !showSkeleton && !load │  │
│  └──────────────┬────────────────────────┘  │
│                 │                            │
│  ┌──────────────▼────────────────────────┐  │
│  │  Slot Array                           │  │
│  │  dataReady ? realData                 │  │
│  │            : Array(SKELETON_COUNT)    │  │
│  └──────────────┬────────────────────────┘  │
│                 │                            │
│  ┌──────────────▼────────────────────────┐  │
│  │  SlotComponent per item               │  │
│  │  ┌─────────────┐ ┌─────────────────┐ │  │
│  │  │  Skeleton   │ │  Real Content   │ │  │
│  │  │  opacity: ? │ │  opacity: ?     │ │  │
│  │  │  (defines   │ │  (absolute,     │ │  │
│  │  │   height)   │ │   stacked)      │ │  │
│  │  └─────────────┘ └─────────────────┘ │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## Layered Slot Pattern

Each item slot renders both layers stacked. The skeleton layer is in normal flow (defines the container height). The content layer is `absolute inset-0` on top.

```tsx
function Slot({ item, index, revealed }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const showContent = revealed && item !== null && imgLoaded;
  const revealDelay = `${index * 60}ms`;

  return (
    <div className="relative">
      {/* Skeleton — in normal flow, defines height */}
      <div
        style={{
          opacity: showContent ? 0 : 1,
          transition: `opacity 300ms ease ${showContent ? revealDelay : "0ms"}`,
          pointerEvents: showContent ? "none" : undefined,
        }}
      >
        <SkeletonVersion />
      </div>

      {/* Content — absolute, stacked on top */}
      {item && (
        <div
          className="absolute inset-0"
          style={{
            opacity: showContent ? 1 : 0,
            transition: `opacity 300ms ease ${revealDelay}`,
          }}
        >
          <RealContent item={item} onImageLoad={() => setImgLoaded(true)} />
        </div>
      )}
    </div>
  );
}
```

### Why the skeleton layer must define height

The skeleton is in normal document flow — it determines the slot's height. The real content layer is `absolute inset-0`, so it doesn't affect layout. This means:
- During loading: skeleton defines the space.
- After reveal: skeleton fades to `opacity: 0` but still occupies space, preventing collapse.
- No layout shift at any point.

### Why content uses `absolute inset-0` (not the reverse)

If the content layer were in flow and the skeleton were absolute, the slot would collapse to zero height during loading (content hasn't rendered yet). Keeping the skeleton in flow guarantees stable height from first paint.

## Staggered Reveal

Each slot gets a `transitionDelay` based on its index, creating a ripple fill-in effect:

```tsx
const revealDelay = `${index * 60}ms`; // 60ms per card
// or for smaller items like avatars:
const revealDelay = `${index * 40}ms`; // 40ms per avatar
```

Apply the delay only on the reveal transition (skeleton → content), not on the hide. When going back to skeleton state (e.g. refetch), all items should disappear simultaneously:

```tsx
transition: `opacity 300ms ease ${showContent ? revealDelay : "0ms"}`
```

## Image Load Gating

Never reveal a slot until its primary image has loaded. This prevents a flash where the content area is visible but the image hasn't painted yet.

```tsx
const [imgLoaded, setImgLoaded] = useState(false);
const showContent = revealed && item !== null && imgLoaded;

// In the Image component:
<Image src={...} onLoad={() => setImgLoaded(true)} />
```

For items that might not have an image, gate on the image only when one exists:

```tsx
const hasImage = item?.imageUrl != null;
const showContent = revealed && item !== null && (imgLoaded || !hasImage);
```

## Shimmer Animation

Defined once in `globals.css`, reused everywhere via the `.skeleton-shimmer` class:

```css
@keyframes skeleton-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton-shimmer {
  background-color: var(--muted);
  background-image: linear-gradient(
    90deg, transparent 25%, rgba(255, 255, 255, 0.15) 50%, transparent 75%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s ease-in-out infinite;
}

.dark .skeleton-shimmer {
  background-image: linear-gradient(
    90deg, transparent 25%, rgba(255, 255, 255, 0.06) 50%, transparent 75%
  );
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-shimmer { animation: none; background-image: none; }
}
```

### Gotcha: Tailwind v4 CSS variables

Tailwind v4 stores color variables as hex values (e.g. `--muted: #F7F7F7`), NOT as HSL channels. This means `hsl(var(--muted))` produces invalid CSS. Always use `var(--muted)` directly for `background-color`, and use raw `rgba()` values for the shimmer gradient highlight — never reference theme variables inside gradients.

## Anti-Flicker: `useDeferredLoading`

Located at `src/hooks/use-deferred-loading.ts`.

The hook solves two problems:
1. **Cached data** — React Query returns `isLoading: false` synchronously when data is cached. The hook's initial state mirrors `isLoading`, so cached hits never show a skeleton at all.
2. **Fast network** — If data arrives in <500ms, the skeleton would flash briefly. The hook keeps the skeleton visible for a minimum 500ms before revealing content.

```tsx
const showSkeleton = useDeferredLoading(isLoading);
const dataReady = !showSkeleton && !isLoading;
```

## Matching Skeleton to Real Content

The skeleton for each element must match the real element's exact dimensions. Here's how to audit:

### Circular avatars / chips

Real: `h-16 w-16 rounded-full` with optional ring
Skeleton: `h-16 w-16 rounded-full skeleton-shimmer` with matching ring if the real one has a selected state

If a chip row has a "selected" first item (like "All" with `ring-[3px] ring-offset-2`), the skeleton's first item must also have that ring — otherwise the row height changes on swap.

### Text lines

Measure the real text's rendered height and use a fixed-height skeleton bar:
- `text-sm` (~20px line) → `h-4` skeleton bar
- `text-xs` (~16px line) → `h-3` skeleton bar
- `text-[11px]` (~14px line) → `h-3` skeleton bar

Vary widths across skeleton items so they don't look uniform:
```tsx
const SKELETON_TITLE_WIDTHS = ["75%", "60%", "85%", "70%", "80%", "65%"];
```

### Name containers (variable-length text)

For names that vary in length (e.g. "Bluey" vs "Genevieve's Playhouse"), use a fixed-width container with `line-clamp-2`:

```tsx
<div className="w-[100px] sm:w-[120px] h-10 flex items-start justify-center">
  {/* Skeleton bar — absolute, centered */}
  <div className="absolute ... skeleton-shimmer" style={{ width: "60%" }} />
  {/* Real text — wraps within fixed container */}
  <span className="line-clamp-2 text-center">{name}</span>
</div>
```

Never use `whitespace-nowrap` on variable-length text — it causes overflow and shifts the layout.

### Thumbnail cards

Match the real card structure exactly:
```tsx
// Real VideoCard structure:
// - aspect-video rounded-2xl (thumbnail)
// - h-9 w-9 rounded-full (avatar)
// - text line (title)
// - text line (creator name)

// Skeleton equivalent:
<div className="flex flex-col gap-3">
  <div className="aspect-video rounded-2xl skeleton-shimmer" />
  <div className="flex gap-3 px-1">
    <div className="h-9 w-9 shrink-0 rounded-full skeleton-shimmer" />
    <div className="flex-1 flex flex-col gap-2 pt-0.5">
      <div className="h-4 rounded skeleton-shimmer" style={{ width: "75%" }} />
      <div className="h-3 w-1/3 rounded skeleton-shimmer" />
    </div>
  </div>
</div>
```

### Sections with different loading states

For sections like a chip row where the layered approach is complex (horizontal scroll, click handlers), use a parent container with `position: relative` and stack skeleton/real as layers:

```tsx
<div className="relative">
  {/* Skeleton — in flow, defines height */}
  <div style={{ opacity: dataReady ? 0 : 1, transition: "opacity 300ms ease" }}>
    <SkeletonChips />
  </div>
  {/* Real — absolute overlay */}
  {dataReady && (
    <div className="absolute inset-0" style={{ opacity: 1, transition: "opacity 300ms ease" }}>
      <RealChips />
    </div>
  )}
</div>
```

## Accessibility

- `aria-busy="true"` on containers that are loading
- `prefers-reduced-motion: reduce` disables the shimmer animation (static gray instead)

## Hydration: Theme Toggle

The Sun/Moon toggle icon depends on the user's theme preference, which is only known client-side. To avoid a hydration mismatch (server renders Moon, client renders Sun):

```tsx
const { resolvedTheme, setTheme } = useTheme();
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);

// Always render Moon on server; switch after mount
{mounted && resolvedTheme === "dark" ? <Sun /> : <Moon />}
```

Use `resolvedTheme` (not `theme`) — it resolves "system" to the actual value.

## White Flash Prevention

Add plain CSS before theme definitions in `globals.css` so the body has a background color before Tailwind resolves:

```css
body {
  background: var(--background);
  color: var(--foreground);
}
```

Also add `bg-background` to `<body>` in `layout.tsx` as a belt-and-suspenders measure.

## Checklist for New Skeleton Implementations

1. [ ] Identify data-dependent vs static sections — only skeleton the data-dependent parts
2. [ ] Match skeleton dimensions exactly to real content (inspect with DevTools)
3. [ ] Use `.skeleton-shimmer` class on all placeholder shapes
4. [ ] Use `useDeferredLoading(isLoading)` for anti-flicker
5. [ ] Use layered DOM pattern (skeleton in flow, content absolute) for each slot
6. [ ] Add `onLoad` callback to primary images, gate reveal on it
7. [ ] Add staggered `transitionDelay` per slot index
8. [ ] Use `pointerEvents: "none"` on skeleton layer when faded out
9. [ ] Set `aria-busy` on loading containers
10. [ ] Test with hard refresh (cold load), back-navigation (cached), and slow network (throttled)
11. [ ] Verify no layout shift with DevTools Performance panel or CLS metric
12. [ ] Check `prefers-reduced-motion` — shimmer should be static

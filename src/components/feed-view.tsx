"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import Link from "next/link";
import {
  Sun,
  Moon,
  ChevronDown,
  Tv,
} from "lucide-react";
import { VideoCard } from "@/components/video-card";
import { CreatorChips } from "@/components/creator-chips";
import { UserNav } from "@/components/user-nav";
import { useFeed, type FeedVideo } from "@/hooks/use-feed";
import { useDeferredLoading } from "@/hooks/use-deferred-loading";

/* ─── Constants ─── */

const BATCH_SIZE = 18;
const SKELETON_CARD_COUNT = 18;
const SKELETON_CHIP_COUNT = 10;

/** Pseudo-random skeleton title widths so they don't look identical */
const SKELETON_TITLE_WIDTHS = ["75%", "60%", "85%", "70%", "80%", "65%"];

/* ─── Helpers ─── */

/* ─── Skeleton Components ─── */

function SkeletonChips() {
  return (
    <div className="flex gap-4 overflow-x-auto px-1.5 pt-1.5 pb-2 scrollbar-none">
      {/* "All" chip skeleton — matches selected state with ring-[3px] ring-offset-2 */}
      <div className="flex shrink-0 flex-col items-center gap-1.5">
        <div className="h-16 w-16 rounded-full skeleton-shimmer ring-[3px] ring-primary/20 ring-offset-2 ring-offset-background" />
        <div className="h-3 w-8 rounded skeleton-shimmer" />
      </div>
      {Array.from({ length: SKELETON_CHIP_COUNT }, (_, i) => (
        <div key={i} className="flex shrink-0 flex-col items-center gap-1.5">
          <div className="h-16 w-16 rounded-full skeleton-shimmer" />
          <div className="h-3 w-12 rounded skeleton-shimmer" />
        </div>
      ))}
    </div>
  );
}

function SkeletonCard({ index }: { index: number }) {
  return (
    <div className="flex flex-col gap-3">
      {/* Thumbnail */}
      <div className="aspect-video rounded-2xl skeleton-shimmer" />
      {/* Info row */}
      <div className="flex gap-3 px-1">
        <div className="h-9 w-9 shrink-0 rounded-full skeleton-shimmer" />
        <div className="flex-1 flex flex-col gap-2 pt-0.5">
          <div
            className="h-4 rounded skeleton-shimmer"
            style={{ width: SKELETON_TITLE_WIDTHS[index % SKELETON_TITLE_WIDTHS.length] }}
          />
          <div className="h-3 w-1/3 rounded skeleton-shimmer" />
        </div>
      </div>
    </div>
  );
}

/* ─── Feed Card Slot — layered skeleton + content ─── */

function FeedCardSlot({
  video,
  index,
  revealed,
}: {
  video: FeedVideo | null;
  index: number;
  revealed: boolean;
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const hasThumb =
    video !== null && (video.thumbnailPath !== null || video.thumbnailUrl !== "");
  const showContent = revealed && video !== null && (imgLoaded || !hasThumb);
  const revealDelay = `${index * 60}ms`;

  const onThumbnailLoad = useCallback(() => setImgLoaded(true), []);

  return (
    <div className="relative">
      {/* Skeleton layer — fades out */}
      <div
        style={{
          opacity: showContent ? 0 : 1,
          transition: `opacity 300ms ease ${showContent ? revealDelay : "0ms"}`,
          pointerEvents: showContent ? "none" : undefined,
        }}
      >
        <SkeletonCard index={index} />
      </div>

      {/* Content layer — fades in, stacked on top */}
      {video && (
        <div
          className="absolute inset-0"
          style={{
            opacity: showContent ? 1 : 0,
            transition: `opacity 300ms ease ${revealDelay}`,
          }}
        >
          <VideoCard
            id={video.id}
            title={video.title}
            thumbnailUrl={video.thumbnailUrl}
            thumbnailPath={video.thumbnailPath}
            creatorName={video.creatorName}
            creatorAvatar={video.creatorAvatar}
            durationSeconds={video.durationSeconds}
            onThumbnailLoad={onThumbnailLoad}
          />
        </div>
      )}
    </div>
  );
}

/* ─── Feed View ─── */

export function FeedView({ creatorSlug }: { creatorSlug: string | null }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const router = useRouter();
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);

  const { videos: allVideos, total, creators, isLoading } = useFeed(creatorSlug);

  const showSkeleton = useDeferredLoading(isLoading);
  const dataReady = !showSkeleton && !isLoading;

  const displayVideos = allVideos.slice(0, visibleCount);
  const hasMore = visibleCount < allVideos.length;

  // Handle creator chip selection — navigate to proper URL
  const handleCreatorSelect = useCallback(
    (slug: string | null) => {
      setVisibleCount(BATCH_SIZE);
      if (slug) {
        router.push(`/c/${slug}`);
      } else {
        router.push("/feed");
      }
    },
    [router]
  );

  // Handle "Show more" — just reveal the next batch, no fetch
  const handleShowMore = useCallback(() => {
    setVisibleCount((prev) => prev + BATCH_SIZE);
  }, []);

  // Empty state (only after loading completes)
  if (dataReady && allVideos.length === 0) {
    return (
      <div className="player-root min-h-screen">
        <div className="grain-overlay" />
        <FeedHeader
          resolvedTheme={mounted ? resolvedTheme : undefined}
          setTheme={setTheme}
        />
        <div className="relative z-10 flex flex-col items-center justify-center gap-5 text-center px-6 pt-24">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-linear-to-br from-primary/20 to-lavender/20 ring-1 ring-primary/15">
            <Tv className="h-9 w-9 text-primary" />
          </div>
          <h1 className="font-heading text-2xl text-foreground">
            No videos available yet
          </h1>
          <p className="font-body max-w-md text-muted-foreground">
            No videos available yet. Ask a parent to set up your
            subscriptions!
          </p>
        </div>
      </div>
    );
  }

  // Build slots: skeleton placeholders or real videos
  const slots: (FeedVideo | null)[] = dataReady
    ? displayVideos
    : displayVideos.length > 0
      ? displayVideos
      : Array.from({ length: SKELETON_CARD_COUNT }, () => null);

  return (
    <div className="player-root min-h-screen">
      <div className="grain-overlay" />

      <FeedHeader
        resolvedTheme={mounted ? resolvedTheme : undefined}
        setTheme={setTheme}
      />

      {/* Main content */}
      <main className="relative z-10 px-5 sm:px-6 pb-16">
        <div className="max-w-6xl mx-auto">
          {/* Creator chips — layered to prevent shift */}
          <div className="pt-5 pb-4 relative">
            {/* Skeleton layer */}
            <div
              style={{
                opacity: dataReady ? 0 : 1,
                transition: "opacity 300ms ease",
                pointerEvents: dataReady ? "none" : undefined,
              }}
            >
              <SkeletonChips />
            </div>
            {/* Real chips layer — stacked on top */}
            {dataReady && creators.length > 0 && (
              <div
                className="absolute inset-0 pt-5 pb-4"
                style={{
                  opacity: dataReady ? 1 : 0,
                  transition: "opacity 300ms ease",
                }}
              >
                <CreatorChips
                  creators={creators.map((c) => ({ id: c.slug, name: c.name, avatar: c.avatar }))}
                  selectedCreatorId={creatorSlug}
                  onSelect={handleCreatorSelect}
                />
              </div>
            )}
          </div>

          {/* Video count */}
          <div className="pb-4 h-6 flex items-center">
            {dataReady ? (
              <p className="font-body text-sm text-muted-foreground">
                {total} video{total !== 1 ? "s" : ""}
                {creatorSlug && creators.length > 0
                  ? ` from ${creators.find((c) => c.slug === creatorSlug)?.name ?? "this creator"}`
                  : ""}
              </p>
            ) : (
              <div className="h-4 w-20 rounded skeleton-shimmer" />
            )}
          </div>

          {/* Video grid */}
          <div
            className="grid gap-6 sm:gap-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            aria-busy={!dataReady}
          >
            {slots.map((video, i) => (
              <FeedCardSlot
                key={video?.id ?? `skeleton-${i}`}
                video={video}
                index={i}
                revealed={dataReady}
              />
            ))}
          </div>

          {/* Show more / That's everything */}
          {dataReady && (
            <div className="flex justify-center pt-10 pb-4">
              {hasMore ? (
                <button
                  onClick={handleShowMore}
                  className="inline-flex items-center gap-2 rounded-2xl bg-secondary px-8 py-3 font-body text-sm font-bold text-foreground ring-1 ring-border/50 transition-all hover:bg-secondary/80 hover:ring-border hover:shadow-lg hover:-translate-y-0.5"
                >
                  <ChevronDown className="h-4 w-4" />
                  Show more
                </button>
              ) : (
                displayVideos.length > 0 && (
                  <p className="font-body text-sm text-muted-foreground">
                    That&rsquo;s everything!
                  </p>
                )
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center py-10 border-t border-border/40">
        <p className="font-body text-xs text-muted-foreground">
          Curated with care for little viewers
        </p>
      </footer>
    </div>
  );
}

/* ─── Shared Header ─── */

function FeedHeader({
  resolvedTheme,
  setTheme,
}: {
  resolvedTheme: string | undefined;
  setTheme: (t: string) => void;
}) {
  return (
    <header className="player-header sticky top-0 z-50 border-b border-border/50 px-5 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center">
            <img src="/logo.svg" alt="PradoTube" className="h-8" />
          </Link>
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            href="/"
            className="rounded-xl px-3 py-2 font-body text-sm font-semibold text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary"
          >
            Creators
          </Link>
          <button
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="rounded-xl p-2 text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary"
            aria-label="Toggle theme"
          >
            {resolvedTheme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
          <UserNav />
        </div>
      </div>
    </header>
  );
}

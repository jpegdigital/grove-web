"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import Link from "next/link";
import {
  Loader2,
  Tv,
  Sun,
  Moon,
  Settings,
  Play,
  ChevronDown,
} from "lucide-react";
import { VideoCard } from "@/components/video-card";
import { CreatorChips } from "@/components/creator-chips";

/* ─── Types ─── */

interface FeedVideo {
  id: string;
  title: string;
  thumbnailUrl: string;
  channelId: string;
  channelTitle: string;
  channelThumbnail: string;
  duration: string | null;
  durationSeconds: number;
  publishedAt: string;
  isDownloaded: boolean;
  mediaPath: string | null;
  thumbnailPath: string | null;
  creatorId: string | null;
  creatorSlug: string | null;
  creatorName: string;
  creatorAvatar: string;
}

interface FeedResponse {
  videos: FeedVideo[];
  total: number;
  hasMore: boolean;
  creators: Array<{ id: string; slug: string; name: string; avatar: string }>;
}

/* ─── Helpers ─── */

function RainbowLogo({ className = "" }: { className?: string }) {
  const letters = [
    { char: "P", color: "var(--logo-green)" },
    { char: "r", color: "var(--logo-blue)" },
    { char: "a", color: "var(--logo-red)" },
    { char: "d", color: "var(--logo-yellow)" },
    { char: "o", color: "var(--logo-purple)" },
    { char: "T", color: "var(--logo-green)" },
    { char: "u", color: "var(--logo-orange)" },
    { char: "b", color: "var(--logo-blue)" },
    { char: "e", color: "var(--logo-red)" },
  ];
  return (
    <span className={`font-heading tracking-tight ${className}`}>
      {letters.map((l, i) => (
        <span key={i} className="logo-letter" style={{ color: l.color }}>
          {l.char}
        </span>
      ))}
    </span>
  );
}

/* ─── Feed View ─── */

export function FeedView({ creatorSlug }: { creatorSlug: string | null }) {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [visibleCount, setVisibleCount] = useState(18);
  const BATCH_SIZE = 18;

  // Fetch ALL videos for the current filter in one request.
  const { data, isLoading } = useQuery<FeedResponse>({
    queryKey: ["feed", creatorSlug],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", "1000");
      params.set("offset", "0");
      if (creatorSlug) params.set("creator", creatorSlug);
      const res = await fetch(`/api/videos/feed?${params}`);
      if (!res.ok) throw new Error("Failed to load feed");
      return res.json();
    },
  });

  const allVideos = data?.videos ?? [];
  const creators = data?.creators ?? [];
  const total = data?.total ?? 0;
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

  // Loading state
  if (isLoading) {
    return (
      <div className="player-root flex min-h-screen items-center justify-center">
        <div className="grain-overlay" />
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[#89E219] shadow-lg">
            <Play className="h-6 w-6 text-white fill-white" />
          </div>
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <p className="font-body text-sm text-muted-foreground">
            Loading videos...
          </p>
        </div>
      </div>
    );
  }

  // Empty state
  if (!isLoading && displayVideos.length === 0) {
    return (
      <div className="player-root min-h-screen">
        <div className="grain-overlay" />
        <FeedHeader theme={theme} setTheme={setTheme} />
        <div className="relative z-10 flex flex-col items-center justify-center gap-5 text-center px-6 pt-24">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/20 to-lavender/20 ring-1 ring-primary/15">
            <Tv className="h-9 w-9 text-primary" />
          </div>
          <h1 className="font-heading text-2xl text-foreground">
            No videos available yet
          </h1>
          <p className="font-body max-w-md text-muted-foreground">
            Videos will appear here once they&rsquo;ve been downloaded. Head to
            the admin panel to manage your channels.
          </p>
          <Link
            href="/admin"
            className="font-body mt-2 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm text-white font-bold shadow-md shadow-primary/25 transition-all hover:shadow-lg hover:shadow-primary/30 hover:-translate-y-0.5"
          >
            <Settings className="h-4 w-4" />
            Open Admin Panel
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="player-root min-h-screen">
      <div className="grain-overlay" />

      <FeedHeader theme={theme} setTheme={setTheme} />

      {/* Main content */}
      <main className="relative z-10 px-5 sm:px-6 pb-16">
        <div className="max-w-6xl mx-auto">
          {/* Creator chips */}
          {creators.length > 0 && (
            <div className="pt-5 pb-4">
              <CreatorChips
                creators={creators.map((c) => ({ id: c.slug, name: c.name, avatar: c.avatar }))}
                selectedCreatorId={creatorSlug}
                onSelect={handleCreatorSelect}
              />
            </div>
          )}

          {/* Video count */}
          <div className="pb-4">
            <p className="font-body text-sm text-muted-foreground">
              {total} video{total !== 1 ? "s" : ""}
              {creatorSlug && creators.length > 0
                ? ` from ${creators.find((c) => c.slug === creatorSlug)?.name ?? "this creator"}`
                : ""}
            </p>
          </div>

          {/* Video grid */}
          <div className="grid gap-6 sm:gap-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {displayVideos.map((video) => (
              <VideoCard
                key={video.id}
                id={video.id}
                title={video.title}
                thumbnailUrl={video.thumbnailUrl}
                thumbnailPath={video.thumbnailPath}
                creatorName={video.channelTitle || video.creatorName}
                creatorAvatar={video.creatorAvatar}
                durationSeconds={video.durationSeconds}
              />
            ))}
          </div>

          {/* Show more / That's everything */}
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
  theme,
  setTheme,
}: {
  theme: string | undefined;
  setTheme: (t: string) => void;
}) {
  return (
    <header className="player-header sticky top-0 z-50 border-b border-border/50 px-5 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[#89E219] shadow-sm">
              <Tv className="h-4.5 w-4.5 text-white" />
            </div>
            <RainbowLogo className="text-xl" />
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
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="rounded-xl p-2 text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
          <Link
            href="/admin"
            className="rounded-xl p-2 text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary"
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}

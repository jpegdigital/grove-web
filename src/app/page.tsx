"use client";

import Image from "next/image";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  Tv,
  Sun,
  Moon,
  Settings,
  Sparkles,
  Play,
} from "lucide-react";

/* ─── Types ─── */

interface ChannelData {
  youtube_id: string;
  title: string;
  description: string;
  custom_url: string;
  thumbnail_url: string;
  banner_url: string | null;
  subscriber_count: number;
  video_count: number;
  view_count: number;
}

interface CuratedChannel {
  id: string;
  channel_id: string;
  display_order: number;
  creator_id: string | null;
  channels: ChannelData;
}

interface Creator {
  id: string;
  name: string;
  slug: string;
  avatar_channel_id: string | null;
  cover_channel_id: string | null;
  display_order: number;
  curated_channels: CuratedChannel[];
}

interface CreatorsResponse {
  creators: Creator[];
  ungrouped: CuratedChannel[];
}

/* ─── Helpers ─── */

/** Get the avatar URL for a creator (from their designated avatar channel) */
function getCreatorAvatar(creator: Creator): string | null {
  if (creator.avatar_channel_id) {
    const ch = creator.curated_channels.find(
      (cc) => cc.channel_id === creator.avatar_channel_id
    );
    if (ch?.channels?.thumbnail_url) return ch.channels.thumbnail_url;
  }
  // Fallback: first channel's thumbnail
  if (creator.curated_channels.length > 0) {
    return creator.curated_channels[0]?.channels?.thumbnail_url ?? null;
  }
  return null;
}

/** Get cover image for a creator */
function getCreatorCover(creator: Creator): string | null {
  if (creator.cover_channel_id) {
    const ch = creator.curated_channels.find(
      (cc) => cc.channel_id === creator.cover_channel_id
    );
    if (ch?.channels?.banner_url) return ch.channels.banner_url;
  }
  if (creator.curated_channels.length > 0) {
    return creator.curated_channels[0]?.channels?.banner_url ?? null;
  }
  return null;
}

/** Rainbow logo */
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

/** Accent colors for creator cards */
const ACCENT_COLORS = [
  { gradient: "from-[#58CC02] to-[#89E219]", ring: "ring-[#58CC02]/30" },
  { gradient: "from-[#1CB0F6] to-[#00CD9C]", ring: "ring-[#1CB0F6]/30" },
  { gradient: "from-[#CE82FF] to-[#FF4B4B]", ring: "ring-[#CE82FF]/30" },
  { gradient: "from-[#FF9600] to-[#FFC800]", ring: "ring-[#FF9600]/30" },
  { gradient: "from-[#FF4B4B] to-[#FF9600]", ring: "ring-[#FF4B4B]/30" },
  { gradient: "from-[#FFC800] to-[#58CC02]", ring: "ring-[#FFC800]/30" },
  { gradient: "from-[#00CD9C] to-[#1CB0F6]", ring: "ring-[#00CD9C]/30" },
];

/* ─── Fetch ─── */

async function fetchCreators(): Promise<CreatorsResponse> {
  const res = await fetch("/api/creators");
  if (!res.ok) throw new Error("Failed to load creators");
  return res.json();
}

/* ─── Creator Card ─── */

function CreatorCard({
  creator,
  index,
  priority,
}: {
  creator: Creator;
  index: number;
  priority?: boolean;
}) {
  const accent = ACCENT_COLORS[index % ACCENT_COLORS.length];
  const avatar = getCreatorAvatar(creator);
  const cover = getCreatorCover(creator);
  const channelCount = creator.curated_channels.length;

  return (
    <div className="creator-card group relative flex flex-col items-center text-center overflow-hidden rounded-3xl border border-border/40 bg-card transition-all duration-300 hover:border-border hover:shadow-2xl hover:shadow-primary/8 hover:-translate-y-1.5">
      {/* Cover / gradient band */}
      <div className="relative w-full h-24 sm:h-28 overflow-hidden shrink-0">
        {cover ? (
          <Image
            src={cover}
            alt=""
            fill
            className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            priority={priority}
          />
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${accent.gradient} opacity-90`} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
      </div>

      {/* Big avatar — overlaps the cover */}
      <div className="-mt-14 relative z-10 shrink-0">
        <div className={`relative h-24 w-24 sm:h-28 sm:w-28 overflow-hidden rounded-full border-4 border-card shadow-xl bg-card ring-4 ${accent.ring} transition-all duration-300 group-hover:scale-105 group-hover:ring-8`}>
          {avatar ? (
            <Image
              src={avatar}
              alt={creator.name}
              fill
              className="object-cover"
              sizes="112px"
              priority={priority}
            />
          ) : (
            <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${accent.gradient}`}>
              <span className="font-heading text-3xl text-white">
                {creator.name.charAt(0)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Creator name — big and bold */}
      <div className="px-5 pt-3 pb-5 flex flex-col items-center gap-2 flex-1">
        <h3 className="font-heading text-xl sm:text-2xl text-foreground leading-tight group-hover:text-primary transition-colors">
          {creator.name}
        </h3>

        {/* Channel count pill */}
        {channelCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-bold text-muted-foreground">
            <Tv className="h-3 w-3" />
            {channelCount} channel{channelCount !== 1 ? "s" : ""}
          </span>
        )}

        {/* Channel avatars row — small circular thumbnails */}
        {channelCount > 1 && (
          <div className="flex items-center -space-x-2 mt-1">
            {creator.curated_channels.slice(0, 5).map((cc) => (
              <div
                key={cc.id}
                className="relative h-8 w-8 overflow-hidden rounded-full border-2 border-card shadow-sm"
                title={cc.channels?.title}
              >
                {cc.channels?.thumbnail_url ? (
                  <Image
                    src={cc.channels.thumbnail_url}
                    alt={cc.channels.title}
                    fill
                    className="object-cover"
                    sizes="32px"
                  />
                ) : (
                  <div className={`h-full w-full bg-gradient-to-br ${accent.gradient}`} />
                )}
              </div>
            ))}
            {channelCount > 5 && (
              <div className="relative h-8 w-8 overflow-hidden rounded-full border-2 border-card bg-secondary flex items-center justify-center">
                <span className="text-[10px] font-bold text-muted-foreground">
                  +{channelCount - 5}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hover accent line at top */}
      <div
        className={`absolute top-0 inset-x-0 h-1 bg-gradient-to-r ${accent.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
      />
    </div>
  );
}

/* ─── Ungrouped Channel Card (fallback for channels not assigned to a creator) ─── */

function UngroupedChannelCard({
  channel,
  index,
}: {
  channel: CuratedChannel;
  index: number;
}) {
  const accent = ACCENT_COLORS[(index + 3) % ACCENT_COLORS.length];
  const ch = channel.channels;
  if (!ch) return null;

  return (
    <div className="creator-card group relative flex flex-col items-center text-center overflow-hidden rounded-3xl border border-border/40 bg-card transition-all duration-300 hover:border-border hover:shadow-2xl hover:shadow-primary/8 hover:-translate-y-1.5">
      <div className="relative w-full h-24 sm:h-28 overflow-hidden shrink-0">
        {ch.banner_url ? (
          <Image src={ch.banner_url} alt="" fill className="object-cover object-center transition-transform duration-500 group-hover:scale-105" sizes="(max-width: 640px) 100vw, 50vw" />
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${accent.gradient} opacity-90`} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
      </div>

      <div className="-mt-14 relative z-10 shrink-0">
        <div className={`relative h-24 w-24 sm:h-28 sm:w-28 overflow-hidden rounded-full border-4 border-card shadow-xl bg-card ring-4 ${accent.ring} transition-all duration-300 group-hover:scale-105 group-hover:ring-8`}>
          {ch.thumbnail_url ? (
            <Image src={ch.thumbnail_url} alt={ch.title} fill className="object-cover" sizes="112px" />
          ) : (
            <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${accent.gradient}`}>
              <span className="font-heading text-3xl text-white">{ch.title.charAt(0)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 pt-3 pb-5 flex flex-col items-center gap-2 flex-1">
        <h3 className="font-heading text-xl sm:text-2xl text-foreground leading-tight group-hover:text-primary transition-colors">
          {ch.title}
        </h3>
      </div>

      <div className={`absolute top-0 inset-x-0 h-1 bg-gradient-to-r ${accent.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
    </div>
  );
}

/* ─── Page ─── */

export default function Home() {
  const { theme, setTheme } = useTheme();

  const { data, isLoading } = useQuery({
    queryKey: ["creators"],
    queryFn: fetchCreators,
  });

  const creators = data?.creators ?? [];
  const ungrouped = data?.ungrouped ?? [];
  const totalCreators = creators.length + ungrouped.length;

  // Loading state
  if (isLoading) {
    return (
      <div className="player-root flex min-h-screen items-center justify-center">
        <div className="grain-overlay" />
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[#89E219] shadow-lg">
            <Tv className="h-6 w-6 text-white" />
          </div>
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <p className="font-body text-sm text-muted-foreground">
            Loading creators...
          </p>
        </div>
      </div>
    );
  }

  // Empty state
  if (totalCreators === 0) {
    return (
      <div className="player-root flex min-h-screen items-center justify-center">
        <div className="grain-overlay" />
        <div className="relative z-10 flex flex-col items-center gap-5 text-center px-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/20 to-lavender/20 ring-1 ring-primary/15">
            <Tv className="h-9 w-9 text-primary" />
          </div>
          <h1 className="font-heading text-2xl text-foreground">
            No creators yet
          </h1>
          <p className="font-body max-w-md text-muted-foreground">
            Head to the admin panel to add some channels and creators, then come
            back here for the good stuff.
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

      {/* Header */}
      <header className="player-header sticky top-0 z-50 border-b border-border/50 px-5 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[#89E219] shadow-sm">
              <Tv className="h-4.5 w-4.5 text-white" />
            </div>
            <RainbowLogo className="text-xl" />
          </div>
          <div className="flex items-center gap-1.5">
            <Link
              href="/feed"
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 font-body text-sm font-semibold text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary"
            >
              <Play className="h-3.5 w-3.5" />
              Watch
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

      {/* Hero */}
      <section className="relative z-10 px-6 pt-12 pb-6 sm:pt-16 sm:pb-8 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl tracking-tight text-foreground">
            Who do you want to{" "}
            <span className="text-primary">watch</span>?
          </h2>
          <p className="font-body text-muted-foreground mt-3 text-base sm:text-lg leading-relaxed max-w-lg mx-auto">
            Pick a creator to start watching!
          </p>
        </div>
      </section>

      {/* Creator Grid */}
      <main className="relative z-10 px-5 pb-16 sm:px-6">
        <div className="max-w-5xl mx-auto grid gap-6 sm:gap-8 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {creators.map((creator, i) => (
            <Link
              key={creator.id}
              href={`/c/${creator.slug}`}
            >
              <CreatorCard
                creator={creator}
                index={i}
                priority={i < 4}
              />
            </Link>
          ))}
          {ungrouped.map((cc, i) => (
            <Link key={cc.id} href="/feed">
              <UngroupedChannelCard
                channel={cc}
                index={i}
              />
            </Link>
          ))}
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

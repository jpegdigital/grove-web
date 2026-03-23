"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { useRef, useState, useCallback } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Eye,
  ThumbsUp,
  MessageSquare,
  Sun,
  Moon,
  Tv,
  Play,
  Pause,
  Maximize,
  Volume2,
  VolumeX,
  Tag,
  Monitor,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";

/* ─── Types ─── */

interface Chapter {
  title: string;
  startTime: number;
  endTime: number;
}

interface VideoMeta {
  id: string;
  title: string;
  description: string;
  channel: string;
  channelId: string;
  handle: string;
  channelFollowers: number | null;
  uploadDate: string;
  duration: number;
  durationFormatted: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  tags: string[];
  categories: string[];
  chapters: Chapter[] | null;
  thumbnail: string;
  resolution: string;
  width: number;
  height: number;
  fps: number;
  language: string | null;
  webpageUrl: string;
  mediaPath: string;
  thumbnailPath: string | null;
  creatorId: string | null;
  creatorName: string | null;
  creatorSlug: string | null;
}

interface SuggestionVideo {
  id: string;
  title: string;
  thumbnailUrl: string;
  thumbnailPath: string | null;
  durationSeconds: number;
  creatorName: string;
  creatorAvatar: string;
}

/* ─── Helpers ─── */

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const sPad = s.toString().padStart(2, "0");
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sPad}`;
  return `${m}:${sPad}`;
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr + "T00:00:00").getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/* ─── Video Player Component ─── */

function LocalPlayer({
  mediaPath,
  thumbnail,
  chapters,
  title,
  onEnded,
}: {
  mediaPath: string;
  thumbnail: string;
  chapters: Chapter[] | null;
  title: string;
  onEnded?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [activeChapter, setActiveChapter] = useState<Chapter | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const chaptersRef = useRef(chapters);
  chaptersRef.current = chapters;
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  const src = `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${mediaPath}`;

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
    } else {
      v.pause();
    }
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  }, []);

  const seekTo = useCallback((time: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = time;
  }, []);

  const toggleFullscreen = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      v.requestFullscreen();
    }
  }, []);

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      seekTo(pct * duration);
    },
    [duration, seekTo]
  );

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setShowControls(true);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setShowControls(false);
      }
    }, 3000);
  }, []);

  // Subscribe to video element events on mount
  useMountEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onTimeUpdate = () => {
      setCurrentTime(v.currentTime);
      const chs = chaptersRef.current;
      if (chs) {
        const ch = chs.find(
          (c) => v.currentTime >= c.startTime && v.currentTime < c.endTime
        );
        setActiveChapter(ch ?? null);
      }
    };
    const onLoadedMetadata = () => setDuration(v.duration);
    const onPlay = () => {
      setIsPlaying(true);
      scheduleHide();
    };
    const onPause = () => {
      setIsPlaying(false);
      setShowControls(true);
    };

    const onEndedHandler = () => {
      onEndedRef.current?.();
    };

    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("loadedmetadata", onLoadedMetadata);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEndedHandler);

    return () => {
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("loadedmetadata", onLoadedMetadata);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEndedHandler);
    };
  });

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="video-player-container group relative bg-black"
      onMouseMove={scheduleHide}
      onMouseLeave={() => {
        if (isPlaying) setShowControls(false);
      }}
    >
      <video
        ref={videoRef}
        src={src}
        poster={thumbnail}
        className="w-full max-h-[75vh] cursor-pointer"
        onClick={togglePlay}
        playsInline
        preload="metadata"
        title={title}
      />

      {/* Big center play button when paused */}
      {!isPlaying && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity"
          aria-label="Play"
        >
          <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-primary/85 shadow-lg transition-transform hover:scale-110">
            <Play className="h-10 w-10 text-white fill-white ml-1" />
          </div>
        </button>
      )}

      {/* Bottom controls bar */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-3 pt-10 transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Progress bar */}
        <div
          ref={progressRef}
          className="relative mb-3 h-1 w-full cursor-pointer rounded-full bg-white/20 transition-all hover:h-1.5"
          onClick={handleProgressClick}
        >
          {/* Chapter markers */}
          {chapters &&
            duration > 0 &&
            chapters.map((ch) => (
              <div
                key={ch.startTime}
                className="absolute top-0 h-full w-[2px] bg-white/40"
                style={{ left: `${(ch.startTime / duration) * 100}%` }}
              />
            ))}
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="text-white/90 hover:text-white transition-colors"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5 fill-white" />
              )}
            </button>
            <button
              onClick={toggleMute}
              className="text-white/90 hover:text-white transition-colors"
              aria-label={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? (
                <VolumeX className="h-5 w-5" />
              ) : (
                <Volume2 className="h-5 w-5" />
              )}
            </button>
            <span className="font-body text-xs text-white/80 tabular-nums">
              {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
            </span>
            {activeChapter && (
              <span className="font-body text-xs text-white/60 hidden sm:inline truncate max-w-[200px]">
                &middot; {activeChapter.title}
              </span>
            )}
          </div>
          <button
            onClick={toggleFullscreen}
            className="text-white/90 hover:text-white transition-colors"
            aria-label="Fullscreen"
          >
            <Maximize className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Stat Pill ─── */

function StatPill({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  label: string;
}) {
  return (
    <div className="video-stat-pill" title={label}>
      <Icon className="h-3.5 w-3.5" />
      <span>{value}</span>
    </div>
  );
}

/* ─── Page Component ─── */

async function fetchVideo(id: string): Promise<VideoMeta> {
  const res = await fetch(`/api/videos/${id}`);
  if (!res.ok) throw new Error("Video not found");
  return res.json();
}

export default function VideoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [showDescription, setShowDescription] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);

  const {
    data: video,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["video", id],
    queryFn: () => fetchVideo(id),
    enabled: !!id,
  });

  // Fetch same-creator suggestions when video ends
  const creatorSlug = video?.creatorSlug ?? null;
  const { data: suggestions } = useQuery<SuggestionVideo[]>({
    queryKey: ["suggestions", creatorSlug, id],
    queryFn: async () => {
      if (!creatorSlug) return [];
      const params = new URLSearchParams({
        creator: creatorSlug,
        limit: "7",
      });
      const res = await fetch(`/api/videos/feed?${params}`);
      if (!res.ok) return [];
      const data = await res.json();
      // Filter out current video
      return (data.videos ?? [])
        .filter((v: SuggestionVideo) => v.id !== id)
        .slice(0, 6);
    },
    enabled: !!creatorSlug && videoEnded,
  });

  // Sidebar feed videos
  const { data: feedVideos } = useQuery<SuggestionVideo[]>({
    queryKey: ["sidebar-feed"],
    queryFn: async () => {
      const res = await fetch("/api/videos/feed?limit=20");
      if (!res.ok) return [];
      const data = await res.json();
      return data.videos ?? [];
    },
  });

  // Loading
  if (isLoading) {
    return (
      <div className="player-root flex min-h-screen items-center justify-center">
        <div className="grain-overlay" />
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
            <Tv className="h-6 w-6 text-primary" />
          </div>
          <Loader2 className="h-5 w-5 animate-spin text-primary/60" />
          <p className="font-body text-sm text-muted-foreground">
            Loading video...
          </p>
        </div>
      </div>
    );
  }

  // Error / not found
  if (error || !video) {
    return (
      <div className="player-root flex min-h-screen items-center justify-center">
        <div className="grain-overlay" />
        <div className="relative z-10 flex flex-col items-center gap-5 text-center px-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-destructive/8 ring-1 ring-destructive/15">
            <Tv className="h-9 w-9 text-destructive/50" />
          </div>
          <h1 className="font-heading text-2xl text-foreground">
            Video not found
          </h1>
          <p className="font-body max-w-md text-muted-foreground">
            This video hasn&rsquo;t been downloaded yet or the ID is invalid.
          </p>
          <button
            onClick={() => router.back()}
            className="font-body mt-2 inline-flex items-center gap-2 rounded-xl bg-primary/12 px-5 py-2.5 text-sm text-primary ring-1 ring-primary/25 transition-all hover:bg-primary/18 hover:ring-primary/40"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const visibleTags = showAllTags ? video.tags : video.tags.slice(0, 8);
  const hasMoreTags = video.tags.length > 8;

  return (
    <div className="player-root min-h-screen">
      <div className="grain-overlay" />

      {/* Header */}
      <header className="player-header relative z-10 border-b border-border/50 px-5 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Go back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
                <Tv className="h-4 w-4 text-primary" />
              </div>
              <h1 className="font-heading text-lg tracking-tight text-foreground">
                PradoTube
              </h1>
            </Link>
          </div>
          <div className="flex items-center gap-1.5">
            <Link
              href="/feed"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 font-body text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Play className="h-3.5 w-3.5" />
              Watch
            </Link>
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-[1fr_340px] lg:gap-6">
        {/* Left column: player + metadata */}
        <div className="min-w-0">
        {/* Player */}
        <div className="relative mt-4 overflow-hidden rounded-2xl shadow-xl ring-1 ring-border/30">
          <LocalPlayer
            mediaPath={video.mediaPath}
            thumbnail={video.thumbnail}
            chapters={video.chapters}
            title={video.title}
            onEnded={() => setVideoEnded(true)}
          />

          {/* End-of-video overlay */}
          {videoEnded && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-black/80 backdrop-blur-sm">
              <Link
                href={creatorSlug ? `/c/${creatorSlug}` : "/feed"}
                className="inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 font-body text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:shadow-xl hover:-translate-y-0.5"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to feed
              </Link>

              {suggestions && suggestions.length > 0 && (
                <div className="w-full max-w-lg px-6">
                  <p className="font-body text-xs text-white/60 text-center mb-3">
                    More from {video.creatorName ?? video.channel}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {suggestions.map((s) => (
                      <Link
                        key={s.id}
                        href={`/v/${s.id}`}
                        className="group relative aspect-video overflow-hidden rounded-xl ring-1 ring-white/10 transition-all hover:ring-primary/50 hover:scale-105"
                        onClick={() => setVideoEnded(false)}
                      >
                        <Image
                          src={
                            s.thumbnailPath
                              ? `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${s.thumbnailPath}`
                              : s.thumbnailUrl
                          }
                          alt={s.title}
                          fill
                          className="object-cover"
                          sizes="160px"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        <p className="absolute bottom-1 left-1.5 right-1.5 font-body text-[10px] text-white/90 leading-tight line-clamp-2">
                          {s.title}
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => setVideoEnded(false)}
                className="font-body text-xs text-white/40 hover:text-white/70 transition-colors"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>

        {/* Title + Channel */}
        <div className="mt-5">
          <h2 className="font-heading text-xl sm:text-2xl lg:text-3xl text-foreground leading-snug">
            {video.title}
          </h2>

          <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            {/* Channel info */}
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
                <span className="font-heading text-sm text-primary font-semibold">
                  {video.channel.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="font-body text-sm font-medium text-foreground truncate">
                  {video.channel}
                </p>
                <p className="font-body text-xs text-muted-foreground">
                  {video.handle}
                  {video.channelFollowers != null && (
                    <span className="ml-1.5">
                      &middot; {formatCount(video.channelFollowers)} subscribers
                    </span>
                  )}
                </p>
              </div>
            </div>

          </div>
        </div>

        {/* Stats row */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {video.uploadDate && (
            <StatPill
              icon={Calendar}
              value={formatDate(video.uploadDate)}
              label="Upload date"
            />
          )}
          <StatPill
            icon={Clock}
            value={video.durationFormatted}
            label="Duration"
          />
          {video.viewCount > 0 && (
            <StatPill
              icon={Eye}
              value={`${formatCount(video.viewCount)} views`}
              label="Views"
            />
          )}
          {video.likeCount > 0 && (
            <StatPill
              icon={ThumbsUp}
              value={formatCount(video.likeCount)}
              label="Likes"
            />
          )}
          {video.commentCount > 0 && (
            <StatPill
              icon={MessageSquare}
              value={formatCount(video.commentCount)}
              label="Comments"
            />
          )}
          <StatPill
            icon={Monitor}
            value={`${video.resolution} · ${video.fps}fps`}
            label="Quality"
          />
        </div>

        {/* Description */}
        {video.description && (
          <div className="mt-5 rounded-xl bg-secondary/50 ring-1 ring-border/50 p-4">
            <button
              onClick={() => setShowDescription(!showDescription)}
              className="flex w-full items-center justify-between font-body text-sm font-medium text-foreground"
            >
              <span>Description</span>
              {showDescription ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            {showDescription && (
              <p className="mt-3 font-body text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {video.description}
              </p>
            )}
          </div>
        )}

        {/* Chapters */}
        {video.chapters && video.chapters.length > 0 && (
          <div className="mt-5">
            <h3 className="font-heading text-base text-foreground mb-3">
              Chapters
            </h3>
            <div className="grid gap-1.5">
              {video.chapters.map((ch, i) => (
                <button
                  key={i}
                  onClick={() => {
                    const v = document.querySelector("video");
                    if (v) {
                      v.currentTime = ch.startTime;
                      v.play();
                    }
                  }}
                  className={`chapter-card flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all hover:bg-secondary ${
                    false /* will be enhanced later */
                      ? "bg-primary/8 ring-1 ring-primary/20"
                      : "ring-1 ring-border/40"
                  }`}
                >
                  <span className="font-body text-xs text-primary font-medium tabular-nums min-w-[42px]">
                    {formatTimestamp(ch.startTime)}
                  </span>
                  <span className="font-body text-sm text-foreground truncate">
                    {ch.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tags */}
        {video.tags.length > 0 && (
          <div className="mt-5">
            <h3 className="font-heading text-base text-foreground mb-3 flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              Tags
            </h3>
            <div className="flex flex-wrap gap-2">
              {visibleTags.map((tag) => (
                <span
                  key={tag}
                  className="font-body inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground ring-1 ring-border/50"
                >
                  {tag}
                </span>
              ))}
              {hasMoreTags && (
                <button
                  onClick={() => setShowAllTags(!showAllTags)}
                  className="font-body inline-flex items-center rounded-full bg-primary/8 px-3 py-1 text-xs text-primary ring-1 ring-primary/20 hover:bg-primary/15 transition-colors"
                >
                  {showAllTags
                    ? "Show less"
                    : `+${video.tags.length - 8} more`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Technical info footer */}
        <div className="mt-8 border-t border-border/40 pt-4">
          <div className="flex flex-wrap gap-x-6 gap-y-1 font-body text-xs text-muted-foreground/60">
            <span>Video ID: {video.id}</span>
            <span>
              {video.width}&times;{video.height} @ {video.fps}fps
            </span>
            {video.language && <span>Language: {video.language}</span>}
            {video.categories.length > 0 && (
              <span>Category: {video.categories.join(", ")}</span>
            )}
          </div>
        </div>
        </div>

        {/* Right sidebar: feed videos */}
        <aside className="hidden lg:block mt-4">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1 scrollbar-thin">
            <div className="flex flex-col gap-2">
              {feedVideos?.map((v) => {
                const thumb = v.thumbnailPath
                  ? `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${v.thumbnailPath}`
                  : v.thumbnailUrl;
                const isActive = v.id === id;
                return (
                  <Link
                    key={v.id}
                    href={`/v/${v.id}`}
                    className={`group flex gap-2 rounded-lg p-1.5 transition-colors ${
                      isActive
                        ? "bg-primary/8 ring-1 ring-primary/25"
                        : "hover:bg-secondary"
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="relative w-40 shrink-0 aspect-video overflow-hidden rounded-lg bg-secondary">
                      {thumb ? (
                        <Image
                          src={thumb}
                          alt={v.title}
                          fill
                          className="object-cover"
                          sizes="160px"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-secondary to-muted">
                          <span className="font-heading text-lg text-muted-foreground/40">
                            {v.title.charAt(0)}
                          </span>
                        </div>
                      )}
                      {v.durationSeconds > 0 && (
                        <div className="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-0.5 font-body text-[10px] font-bold text-white tabular-nums">
                          {formatTimestamp(v.durationSeconds)}
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="min-w-0 flex-1 py-0.5">
                      <p className="font-body text-sm font-medium text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                        {v.title}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <div className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full bg-secondary ring-1 ring-border/30">
                          {v.creatorAvatar ? (
                            <Image
                              src={v.creatorAvatar}
                              alt={v.creatorName}
                              fill
                              className="object-cover"
                              sizes="20px"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                              <span className="font-heading text-[8px] text-primary">
                                {v.creatorName.charAt(0)}
                              </span>
                            </div>
                          )}
                        </div>
                        <span className="font-body text-xs text-muted-foreground truncate">
                          {v.creatorName}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </aside>
        </div>
      </main>
    </div>
  );
}

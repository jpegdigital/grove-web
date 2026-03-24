"use client";

import { useState, useCallback, useRef, type ReactNode } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useTheme } from "next-themes";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toaster, toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { StarRating } from "@/components/ui/star-rating";
import {
  Search,
  Plus,
  Trash2,
  ExternalLink,
  Tv,
  Users,
  Film,
  Loader2,
  Sun,
  Moon,
  ArrowUp,
  ArrowDown,
  FolderPlus,
  X,
  ImageIcon,
  Ungroup,
  Hash,
  FolderInput,
  Check,
  PanelRightClose,
  PanelRightOpen,
  LayoutGrid,
  LayoutList,
  HardDrive,
  CloudUpload,
  Star,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Channel {
  id: string;
  title: string;
  description: string;
  customUrl: string;
  thumbnailUrl: string;
  bannerUrl: string | null;
  subscriberCount: string;
  videoCount: string;
  viewCount: string;
  publishedAt: string;
  priority: number;
}

interface CuratedChannelRow {
  id: string;
  channel_id: string;
  display_order: number;
  priority: number;
  creator_id: string | null;
  date_range_override: string | null;
  channels: {
    youtube_id: string;
    title: string;
    description: string | null;
    custom_url: string | null;
    thumbnail_url: string | null;
    banner_url: string | null;
    subscriber_count: number;
    video_count: number;
    view_count: number;
  };
}

interface Creator {
  id: string;
  name: string;
  slug: string;
  avatar_channel_id: string | null;
  cover_channel_id: string | null;
  display_order: number;
  priority: number;
  curated_channels: CuratedChannelRow[];
}

interface CreatorsResponse {
  creators: Creator[];
  ungrouped: CuratedChannelRow[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ACCENT_COLORS = [
  "var(--coral)",
  "var(--teal)",
  "var(--sky)",
  "var(--lavender)",
  "var(--sunflower)",
  "var(--mint)",
  "var(--peach)",
];

function formatCount(count: string): string {
  const num = parseInt(count, 10);
  if (isNaN(num)) return "0";
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

function rowToChannel(
  row: CuratedChannelRow
): Channel & { curatedId: string; creatorId: string | null } {
  const ch = row.channels;
  return {
    curatedId: row.id,
    creatorId: row.creator_id,
    priority: row.priority ?? 50,
    id: ch.youtube_id,
    title: ch.title,
    description: ch.description || "",
    customUrl: ch.custom_url || "",
    thumbnailUrl: ch.thumbnail_url || "",
    bannerUrl: ch.banner_url || null,
    subscriberCount: String(ch.subscriber_count),
    videoCount: String(ch.video_count),
    viewCount: String(ch.view_count),
    publishedAt: "",
  };
}

async function upsertChannel(channel: Channel) {
  const { error } = await supabase.from("channels").upsert(
    {
      youtube_id: channel.id,
      title: channel.title,
      description: channel.description,
      custom_url: channel.customUrl,
      thumbnail_url: channel.thumbnailUrl,
      banner_url: channel.bannerUrl,
      subscriber_count: parseInt(channel.subscriberCount, 10) || 0,
      subscriber_count_hidden:
        channel.subscriberCount === "0" || !channel.subscriberCount,
      video_count: parseInt(channel.videoCount, 10) || 0,
      view_count: parseInt(channel.viewCount, 10) || 0,
      published_at: channel.publishedAt || null,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "youtube_id" }
  );
  if (error) console.error("Failed to upsert channel:", error);
}

function dbRowToChannel(row: {
  youtube_id: string;
  title: string;
  description: string | null;
  custom_url: string | null;
  thumbnail_url: string | null;
  banner_url: string | null;
  subscriber_count: number;
  video_count: number;
  view_count: number;
  published_at: string | null;
}): Channel {
  return {
    id: row.youtube_id,
    title: row.title,
    description: row.description || "",
    customUrl: row.custom_url || "",
    thumbnailUrl: row.thumbnail_url || "",
    bannerUrl: row.banner_url || null,
    subscriberCount: String(row.subscriber_count),
    videoCount: String(row.video_count),
    viewCount: String(row.view_count),
    publishedAt: row.published_at || "",
    priority: 50,
  };
}

async function fetchCuratedChannels(): Promise<Channel[]> {
  const { data, error } = await supabase
    .from("curated_channels")
    .select("channel_id, display_order, channels(*)")
    .order("display_order", { ascending: true });

  if (error) throw new Error("Failed to load curated channels");

  return (data || [])
    .filter((row) => row.channels)
    .map((row) =>
      dbRowToChannel(
        row.channels as unknown as Parameters<typeof dbRowToChannel>[0]
      )
    );
}

async function fetchCreatorsData(): Promise<CreatorsResponse> {
  const res = await fetch("/api/creators");
  if (!res.ok) throw new Error("Failed to load creators");
  return res.json();
}

interface VideoCounts {
  channel_id: string;
  downloaded: number;
  uploaded: number;
}

async function fetchVideoCounts(): Promise<Map<string, VideoCounts>> {
  const { data, error } = await supabase.rpc("video_counts_by_channel");
  if (error) throw new Error("Failed to load video counts");
  const map = new Map<string, VideoCounts>();
  for (const row of data || []) {
    map.set(row.channel_id, {
      channel_id: row.channel_id,
      downloaded: Number(row.downloaded),
      uploaded: Number(row.uploaded),
    });
  }
  return map;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function AdminPage() {
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const [mounted, setMounted] = useState(false);
  useMountEffect(() => setMounted(true));
  const [searchInput, setSearchInput] = useState("");
  const [lookupResult, setLookupResult] = useState<Channel | null>(null);
  const [searchResults, setSearchResults] = useState<Channel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [mode, setMode] = useState<"lookup" | "search">("lookup");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");

  // Creator state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCreatorName, setNewCreatorName] = useState("");
  const [isCreatingCreator, setIsCreatingCreator] = useState(false);
  const [editingAvatar, setEditingAvatar] = useState<string | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  const { data: curatedChannels = [], isLoading: isHydrating } = useQuery({
    queryKey: ["curated-channels"],
    queryFn: fetchCuratedChannels,
  });

  const { data: creatorsData, isLoading: isCreatorsLoading } = useQuery({
    queryKey: ["creators"],
    queryFn: fetchCreatorsData,
  });

  const { data: videoCounts = new Map<string, VideoCounts>() } = useQuery({
    queryKey: ["video-counts"],
    queryFn: fetchVideoCounts,
  });

  const isHydrated = !isHydrating && !isCreatorsLoading;

  // Aggregate video counts for header
  const totalDownloaded = [...videoCounts.values()].reduce((s, c) => s + c.downloaded, 0);
  const totalUploaded = [...videoCounts.values()].reduce((s, c) => s + c.uploaded, 0);

  const creators = [...(creatorsData?.creators || [])].sort((a, b) => a.name.localeCompare(b.name));
  const ungroupedChannels = creatorsData?.ungrouped || [];

  const toggleCreateForm = useCallback(() => {
    setShowCreateForm((prev) => {
      if (!prev) {
        requestAnimationFrame(() => createInputRef.current?.focus());
      }
      return !prev;
    });
  }, []);

  // ─── Search handlers ─────────────────────────────────────────────────────

  const handleLookup = useCallback(async () => {
    if (!searchInput.trim()) return;
    setIsLoading(true);
    setLookupResult(null);
    setSearchResults([]);

    try {
      const res = await fetch(
        `/api/youtube/channel?input=${encodeURIComponent(searchInput.trim())}`
      );
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Channel not found");
        return;
      }

      setLookupResult(data);
      toast.success(`Found: ${data.title}`);
    } catch {
      toast.error("Failed to connect to YouTube API");
    } finally {
      setIsLoading(false);
    }
  }, [searchInput]);

  const handleSearch = useCallback(async () => {
    if (!searchInput.trim()) return;
    setIsSearching(true);
    setLookupResult(null);
    setSearchResults([]);

    try {
      const res = await fetch(
        `/api/youtube/search?q=${encodeURIComponent(searchInput.trim())}`
      );
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Search failed");
        return;
      }

      setSearchResults(data);
      if (data.length === 0) {
        toast.info("No channels found");
      }
    } catch {
      toast.error("Failed to connect to YouTube API");
    } finally {
      setIsSearching(false);
    }
  }, [searchInput]);

  // ─── Channel CRUD ─────────────────────────────────────────────────────────

  const addChannel = useCallback(
    async (channel: Channel) => {
      if (curatedChannels.some((c) => c.id === channel.id)) {
        toast.info(`${channel.title} is already in your list`);
        return;
      }

      await upsertChannel(channel);

      const nextOrder = curatedChannels.length;
      const { error } = await supabase.from("curated_channels").insert({
        channel_id: channel.id,
        display_order: nextOrder,
      });

      if (error) {
        if (error.code === "23505") {
          toast.info(`${channel.title} is already in your list`);
        } else {
          toast.error("Failed to save channel");
          console.error("Insert curated_channels error:", error);
        }
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["curated-channels"] });
      queryClient.invalidateQueries({ queryKey: ["creators"] });
      toast.success(`Added ${channel.title} to curated channels`);
    },
    [curatedChannels, queryClient]
  );

  const removeChannel = useCallback(
    async (channelId: string) => {
      const { error } = await supabase
        .from("curated_channels")
        .delete()
        .eq("channel_id", channelId);

      if (error) {
        toast.error("Failed to remove channel");
        console.error("Delete curated_channels error:", error);
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["curated-channels"] });
      queryClient.invalidateQueries({ queryKey: ["creators"] });
      toast("Channel removed");
    },
    [queryClient]
  );

  const moveChannel = useCallback(
    async (channelId: string, direction: "up" | "down") => {
      const idx = curatedChannels.findIndex((c) => c.id === channelId);
      if (idx === -1) return;
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= curatedChannels.length) return;

      queryClient.setQueryData<Channel[]>(["curated-channels"], (old = []) => {
        const newList = [...old];
        [newList[idx], newList[swapIdx]] = [newList[swapIdx], newList[idx]];
        return newList;
      });

      const updates = [
        supabase
          .from("curated_channels")
          .update({ display_order: swapIdx })
          .eq("channel_id", curatedChannels[idx].id),
        supabase
          .from("curated_channels")
          .update({ display_order: idx })
          .eq("channel_id", curatedChannels[swapIdx].id),
      ];

      const results = await Promise.all(updates);
      const failed = results.find((r) => r.error);
      if (failed?.error) {
        console.error("Failed to update order:", failed.error);
        toast.error("Failed to reorder");
      }
    },
    [curatedChannels, queryClient]
  );

  // ─── Creator CRUD ─────────────────────────────────────────────────────────

  const createCreator = useCallback(async () => {
    if (!newCreatorName.trim()) return;
    setIsCreatingCreator(true);

    try {
      const res = await fetch("/api/creators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCreatorName.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to create group");
        return;
      }

      const creator = await res.json();
      queryClient.invalidateQueries({ queryKey: ["creators"] });
      setNewCreatorName("");
      setShowCreateForm(false);
      toast.success(`Created "${creator.name}"`);
    } catch {
      toast.error("Failed to create group");
    } finally {
      setIsCreatingCreator(false);
    }
  }, [newCreatorName, queryClient]);

  const deleteCreator = useCallback(
    async (creatorId: string, creatorName: string) => {
      try {
        const res = await fetch(`/api/creators/${creatorId}`, {
          method: "DELETE",
        });

        if (!res.ok) {
          toast.error("Failed to delete group");
          return;
        }

        queryClient.invalidateQueries({ queryKey: ["creators"] });
        toast(`Removed "${creatorName}" — channels are now ungrouped`);
      } catch {
        toast.error("Failed to delete group");
      }
    },
    [queryClient]
  );

  const assignChannelToCreator = useCallback(
    async (
      curatedId: string,
      creatorId: string | null,
      channelTitle: string
    ) => {
      try {
        const res = await fetch(`/api/curated-channels/${curatedId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creator_id: creatorId }),
        });

        if (!res.ok) {
          toast.error("Failed to move channel");
          return;
        }

        // If assigning to a creator, auto-set avatar/cover if not yet set
        if (creatorId) {
          const creator = creators.find((c) => c.id === creatorId);
          if (creator && !creator.avatar_channel_id) {
            const allChannels = [
              ...creators.flatMap((c) => c.curated_channels),
              ...ungroupedChannels,
            ];
            const curatedRow = allChannels.find((c) => c.id === curatedId);
            if (curatedRow) {
              await fetch(`/api/creators/${creatorId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  avatar_channel_id: curatedRow.channel_id,
                  cover_channel_id: curatedRow.channel_id,
                }),
              });
            }
          }
        }

        queryClient.invalidateQueries({ queryKey: ["creators"] });
        toast.success(
          creatorId
            ? `Moved "${channelTitle}" to group`
            : `"${channelTitle}" is now ungrouped`
        );
      } catch {
        toast.error("Failed to move channel");
      }
    },
    [creators, ungroupedChannels, queryClient]
  );

  const updateChannelPriority = useCallback(
    async (curatedId: string, priority: number) => {
      try {
        const res = await fetch(`/api/curated-channels/${curatedId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priority }),
        });
        if (!res.ok) {
          toast.error("Failed to update priority");
          return;
        }
        queryClient.invalidateQueries({ queryKey: ["creators"] });
      } catch {
        toast.error("Failed to update priority");
      }
    },
    [queryClient]
  );

  const updateDateRange = useCallback(
    async (curatedId: string, dateRangeOverride: string | null) => {
      try {
        const res = await fetch(`/api/curated-channels/${curatedId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date_range_override: dateRangeOverride }),
        });
        if (!res.ok) {
          toast.error("Failed to update date range");
          return;
        }
        queryClient.invalidateQueries({ queryKey: ["creators"] });
        toast.success(dateRangeOverride ? `Date range: ${dateRangeOverride}` : "Date range: default (6mo)");
      } catch {
        toast.error("Failed to update date range");
      }
    },
    [queryClient]
  );

  const updateCreatorPriority = useCallback(
    async (creatorId: string, priority: number) => {
      try {
        const res = await fetch(`/api/creators/${creatorId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priority }),
        });
        if (!res.ok) {
          toast.error("Failed to update priority");
          return;
        }
        queryClient.invalidateQueries({ queryKey: ["creators"] });
      } catch {
        toast.error("Failed to update priority");
      }
    },
    [queryClient]
  );

  const updateCreatorAvatar = useCallback(
    async (creatorId: string, channelId: string) => {
      try {
        const res = await fetch(`/api/creators/${creatorId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            avatar_channel_id: channelId,
            cover_channel_id: channelId,
          }),
        });

        if (!res.ok) {
          toast.error("Failed to update avatar");
          return;
        }

        queryClient.invalidateQueries({ queryKey: ["creators"] });
        setEditingAvatar(null);
        toast.success("Avatar updated");
      } catch {
        toast.error("Failed to update avatar");
      }
    },
    [queryClient]
  );

  const moveCreator = useCallback(
    async (creatorId: string, direction: "up" | "down") => {
      const idx = creators.findIndex((c) => c.id === creatorId);
      if (idx === -1) return;
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= creators.length) return;

      try {
        await Promise.all([
          fetch(`/api/creators/${creators[idx].id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ display_order: swapIdx }),
          }),
          fetch(`/api/creators/${creators[swapIdx].id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ display_order: idx }),
          }),
        ]);

        queryClient.invalidateQueries({ queryKey: ["creators"] });
      } catch {
        toast.error("Failed to reorder");
      }
    },
    [creators, queryClient]
  );

  const isCurated = (id: string) => curatedChannels.some((c) => c.id === id);

  // ─── Get avatar/cover for a creator ──────────────────────────────────────

  function getCreatorAvatar(creator: Creator): string | null {
    if (creator.avatar_channel_id) {
      const ch = creator.curated_channels.find(
        (c) => c.channel_id === creator.avatar_channel_id
      );
      if (ch?.channels?.thumbnail_url) return ch.channels.thumbnail_url;
    }
    if (creator.curated_channels.length > 0) {
      return creator.curated_channels[0].channels?.thumbnail_url || null;
    }
    return null;
  }

  function getCreatorCover(creator: Creator): string | null {
    if (creator.cover_channel_id) {
      const ch = creator.curated_channels.find(
        (c) => c.channel_id === creator.cover_channel_id
      );
      if (ch?.channels?.banner_url) return ch.channels.banner_url;
    }
    if (creator.curated_channels.length > 0) {
      return creator.curated_channels[0].channels?.banner_url || null;
    }
    return null;
  }


  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="admin-root min-h-screen">
      <Toaster position="bottom-right" />
      <div className="grain-overlay" />

      {/* Full-width header bar */}
      <header className="admin-header relative z-10">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
              <Tv className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="font-heading text-base leading-none tracking-tight text-foreground">
                PradoTube
              </h1>
              <p className="font-body mt-1 text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
                Channel Manager
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="font-body mr-2 hidden items-center gap-4 text-sm text-foreground/60 sm:flex">
              <span className="flex items-center gap-1.5">
                <Hash className="h-3.5 w-3.5" />
                {curatedChannels.length} channels
              </span>
              <span className="flex items-center gap-1.5">
                <FolderPlus className="h-3.5 w-3.5" />
                {creators.length} groups
              </span>
              <span className="flex items-center gap-1.5">
                <HardDrive className="h-3.5 w-3.5" />
                {totalDownloaded} dl
              </span>
              <span className="flex items-center gap-1.5">
                <CloudUpload className="h-3.5 w-3.5" />
                {totalUploaded} r2
              </span>
            </div>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              title={sidebarOpen ? "Hide search" : "Show search"}
            >
              {sidebarOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {mounted ? (
                theme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Two-panel layout: Main (groups) | Sidebar (search) */}
      <div className="admin-layout-v2 relative z-10">
        {/* ── LEFT: Main content — Groups & Channels ── */}
        <main className="admin-main-v2">
          <div className="px-6 pt-5 pb-8 lg:px-10">
            {/* Main header with actions */}
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-body text-xl font-bold tracking-tight text-foreground">
                Groups
              </h2>
              <div className="flex items-center gap-2.5">
                {/* View toggle */}
                <div className="admin-segmented-toggle inline-flex rounded-lg p-0.5">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`admin-segment rounded-md p-2 transition-all ${
                      viewMode === "grid"
                        ? "active"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    title="Grid view"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={`admin-segment rounded-md p-2 transition-all ${
                      viewMode === "list"
                        ? "active"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    title="List view"
                  >
                    <LayoutList className="h-4 w-4" />
                  </button>
                </div>
                <button
                  onClick={toggleCreateForm}
                  className="admin-button font-body flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-all"
                >
                  <Plus className="h-4 w-4" />
                  New group
                </button>
              </div>
            </div>

            {/* Create group form — inline at top */}
            {showCreateForm && (
              <div className="mb-5 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="creator-group-form flex items-center gap-2.5 rounded-xl p-3">
                  <Input
                    ref={createInputRef}
                    value={newCreatorName}
                    onChange={(e) => setNewCreatorName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") createCreator();
                      if (e.key === "Escape") {
                        setShowCreateForm(false);
                        setNewCreatorName("");
                      }
                    }}
                    placeholder="Group name — e.g. Brooke and Riley"
                    className="admin-input h-9 font-body text-sm"
                  />
                  <Button
                    onClick={createCreator}
                    disabled={isCreatingCreator || !newCreatorName.trim()}
                    className="admin-button-solid h-9 px-4 font-body text-sm"
                  >
                    {isCreatingCreator ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Create"
                    )}
                  </Button>
                  <button
                    onClick={() => {
                      setShowCreateForm(false);
                      setNewCreatorName("");
                    }}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {!isHydrated ? (
              <div className="flex flex-col items-center py-24">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/50" />
                <p className="font-body mt-4 text-sm text-muted-foreground">
                  Loading channels...
                </p>
              </div>
            ) : curatedChannels.length === 0 ? (
              <div className="flex flex-col items-center px-8 py-24 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
                  <Tv className="h-6 w-6 text-muted-foreground/50" />
                </div>
                <p className="font-body mt-5 text-lg font-semibold text-foreground">
                  No channels yet
                </p>
                <p className="font-body mt-1.5 max-w-sm text-base text-muted-foreground">
                  Use the search panel on the right to find YouTube channels and
                  add them to your curated list.
                </p>
              </div>
            ) : (
              <div className={viewMode === "grid" ? "admin-groups-grid" : "admin-groups-list space-y-3"}>
                {/* ─── Creator group sections ─── */}
                {creators.map((creator, creatorIdx) => {
                  const accent =
                    ACCENT_COLORS[creatorIdx % ACCENT_COLORS.length];
                  const avatar = getCreatorAvatar(creator);
                  const cover = getCreatorCover(creator);
                  const channelCount = creator.curated_channels.length;
                  const groupDl = creator.curated_channels.reduce((s, cc) => s + (videoCounts.get(cc.channel_id)?.downloaded ?? 0), 0);
                  const groupR2 = creator.curated_channels.reduce((s, cc) => s + (videoCounts.get(cc.channel_id)?.uploaded ?? 0), 0);

                  return (
                    <div
                      key={creator.id}
                      className="admin-group-section group/creator"
                    >
                      {/* Cover banner — grid mode only */}
                      {viewMode === "grid" && cover && (
                        <div className="admin-tile-cover">
                          <Image
                            src={cover}
                            alt=""
                            fill
                            className="object-cover opacity-40"
                            sizes="600px"
                          />
                          <div className="admin-tile-cover-fade" />
                        </div>
                      )}
                      {viewMode === "grid" && !cover && (
                        <div
                          className="h-1 w-full rounded-t-xl"
                          style={{
                            background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 20%, transparent), color-mix(in srgb, ${accent} 5%, transparent))`,
                          }}
                        />
                      )}

                      {/* Group header row — always visible */}
                      <div className="admin-group-header">
                        <div className="flex items-center gap-3">
                          {/* Avatar */}
                          <button
                            onClick={() =>
                              setEditingAvatar(
                                editingAvatar === creator.id
                                  ? null
                                  : creator.id
                              )
                            }
                            className={`group/avatar relative flex-shrink-0 overflow-hidden rounded-full ring-2 ring-border transition-all hover:ring-foreground/25 ${viewMode === "grid" ? "h-11 w-11" : "h-10 w-10"}`}
                            title="Change avatar source"
                          >
                            {avatar ? (
                              <Image
                                src={avatar}
                                alt={creator.name}
                                fill
                                className="object-cover"
                                sizes={viewMode === "grid" ? "44px" : "40px"}
                              />
                            ) : (
                              <div
                                className="flex h-full w-full items-center justify-center text-sm font-bold text-white"
                                style={{ background: accent }}
                              >
                                {creator.name.charAt(0)}
                              </div>
                            )}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover/avatar:opacity-100">
                              <ImageIcon className="h-3.5 w-3.5 text-white" />
                            </div>
                          </button>

                          {/* Name + count */}
                          <div className="min-w-0 flex-1">
                            <h3 className={`font-body truncate font-semibold text-foreground ${viewMode === "grid" ? "text-base" : "text-[15px]"}`}>
                              {creator.name}
                            </h3>
                            <div className="font-body flex items-center gap-2 text-xs text-muted-foreground">
                              <StarRating
                                value={creator.priority}
                                onChange={(v) => updateCreatorPriority(creator.id, v)}
                                size={12}
                              />
                              <span>{channelCount} ch</span>
                              <span>·</span>
                              <span>{groupDl} dl</span>
                              <span>·</span>
                              <span>{groupR2} r2</span>
                            </div>
                          </div>

                          {/* Group-level actions */}
                          <div className="flex items-center gap-0.5">
                            {viewMode === "list" && (
                              <>
                                <button
                                  onClick={() => moveCreator(creator.id, "up")}
                                  disabled={creatorIdx === 0}
                                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-20"
                                  title="Move up"
                                >
                                  <ArrowUp className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => moveCreator(creator.id, "down")}
                                  disabled={creatorIdx === creators.length - 1}
                                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-20"
                                  title="Move down"
                                >
                                  <ArrowDown className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                            <button
                              onClick={() =>
                                deleteCreator(creator.id, creator.name)
                              }
                              className="rounded p-1.5 text-muted-foreground opacity-0 transition-all group-hover/creator:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                              title="Delete group"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Avatar picker */}
                      {editingAvatar === creator.id &&
                        creator.curated_channels.length > 0 && (
                          <div className="border-b border-border bg-muted/30 px-5 py-3">
                            <p className="font-body mb-2 text-[11px] tracking-wider text-muted-foreground uppercase">
                              Choose avatar source
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {creator.curated_channels.map((cc) => (
                                <button
                                  key={cc.id}
                                  onClick={() =>
                                    updateCreatorAvatar(
                                      creator.id,
                                      cc.channel_id
                                    )
                                  }
                                  className={`relative h-9 w-9 overflow-hidden rounded-full ring-2 transition-all hover:scale-110 ${
                                    cc.channel_id ===
                                    creator.avatar_channel_id
                                      ? "ring-primary"
                                      : "ring-border hover:ring-foreground/25"
                                  }`}
                                  title={cc.channels?.title}
                                >
                                  {cc.channels?.thumbnail_url && (
                                    <Image
                                      src={cc.channels.thumbnail_url}
                                      alt={cc.channels.title}
                                      fill
                                      className="object-cover"
                                      sizes="36px"
                                    />
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                      {/* Channel list */}
                      <div className="admin-group-channels">
                          {creator.curated_channels.length === 0 ? (
                            <p className="font-body py-5 text-center text-sm text-muted-foreground">
                              No channels — search and add some!
                            </p>
                          ) : (
                            <div>
                              {creator.curated_channels.map((cc) => {
                                const ch = rowToChannel(cc);
                                return (
                                  <ChannelRow
                                    key={cc.id}
                                    channel={ch}
                                    curatedId={cc.id}
                                    onRemove={removeChannel}
                                    creators={creators}
                                    onAssign={assignChannelToCreator}
                                    showUngroup
                                    onPriorityChange={updateChannelPriority}
                                    downloadedCount={videoCounts.get(cc.channel_id)?.downloaded}
                                    uploadedCount={videoCounts.get(cc.channel_id)?.uploaded}
                                    dateRangeOverride={cc.date_range_override}
                                    onDateRangeChange={updateDateRange}
                                  />
                                );
                              })}
                            </div>
                          )}
                        </div>
                    </div>
                  );
                })}

                {/* ─── Ungrouped channels section ─── */}
                {ungroupedChannels.length > 0 && (
                  <div className="admin-group-section admin-group-ungrouped">
                    <div className="admin-group-header">
                      <div className="flex items-center gap-3">
                        <div className="flex h-4 w-4 items-center justify-center">
                          <Ungroup className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-muted ring-2 ring-border">
                          <Ungroup className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <h3 className="font-body text-[15px] font-semibold text-muted-foreground">
                              Ungrouped
                            </h3>
                            <span className="font-body text-xs text-muted-foreground">
                              {ungroupedChannels.length} ch — assign to a group
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="admin-group-channels">
                      {ungroupedChannels.map((cc) => {
                        const ch = rowToChannel(cc);
                        return (
                          <ChannelRow
                            key={cc.id}
                            channel={ch}
                            curatedId={cc.id}
                            onRemove={removeChannel}
                            creators={creators}
                            onAssign={assignChannelToCreator}
                            showUngroup={false}
                            onPriorityChange={updateChannelPriority}
                            downloadedCount={videoCounts.get(cc.channel_id)?.downloaded}
                            uploadedCount={videoCounts.get(cc.channel_id)?.uploaded}
                            dateRangeOverride={cc.date_range_override}
                            onDateRangeChange={updateDateRange}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* All grouped message */}
                {creators.length > 0 &&
                  ungroupedChannels.length === 0 &&
                  curatedChannels.length > 0 && (
                    <div className="font-body py-3 text-center text-sm text-muted-foreground">
                      All channels are grouped
                    </div>
                  )}
              </div>
            )}
          </div>
        </main>

        {/* ── RIGHT: Search sidebar ── */}
        <aside
          className={`admin-search-sidebar transition-all duration-200 ${sidebarOpen ? "" : "admin-search-sidebar-hidden"}`}
        >
          <div className="sticky top-0">
            {/* Sidebar header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h2 className="font-body text-sm font-semibold text-foreground">
                Add channels
              </h2>
              <p className="font-body text-xs text-muted-foreground">
                URL, handle, or search
              </p>
            </div>

            {/* Mode toggle */}
            <div className="px-4 pb-2.5">
              <div className="admin-segmented-toggle inline-flex w-full rounded-lg p-0.5">
                <button
                  onClick={() => setMode("lookup")}
                  className={`admin-segment font-body flex-1 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-all ${
                    mode === "lookup"
                      ? "active"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Direct lookup
                </button>
                <button
                  onClick={() => setMode("search")}
                  className={`admin-segment font-body flex-1 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-all ${
                    mode === "search"
                      ? "active"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Search
                </button>
              </div>
            </div>

            {/* Search input */}
            <div className="flex gap-2 px-4 pb-4">
              <div className="relative flex-1">
                <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      mode === "lookup" ? handleLookup() : handleSearch();
                    }
                  }}
                  placeholder={
                    mode === "lookup" ? "@handle or URL" : "Channel name..."
                  }
                  className="admin-input h-9 pl-8 font-body text-sm"
                />
              </div>
              <Button
                onClick={mode === "lookup" ? handleLookup : handleSearch}
                disabled={isLoading || isSearching || !searchInput.trim()}
                className="admin-button-solid h-9 w-9 p-0 font-body text-sm"
              >
                {isLoading || isSearching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Search className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>

            {/* Search results */}
            <ScrollArea className="admin-search-results">
              <div className="space-y-2 px-4 pb-4">
                {/* Lookup result */}
                {lookupResult && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                    <SearchResultCard
                      channel={lookupResult}
                      onAdd={addChannel}
                      isCurated={isCurated(lookupResult.id)}
                    />
                  </div>
                )}

                {/* Search results */}
                {searchResults.map((channel, i) => (
                  <div
                    key={channel.id}
                    className="animate-in fade-in slide-in-from-top-2"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <SearchResultCard
                      channel={channel}
                      onAdd={addChannel}
                      isCurated={isCurated(channel.id)}
                    />
                  </div>
                ))}

                {/* Empty state */}
                {!lookupResult &&
                  searchResults.length === 0 &&
                  !isLoading &&
                  !isSearching && (
                    <div className="flex flex-col items-center px-3 py-8 text-center">
                      <Search className="h-5 w-5 text-muted-foreground/30" />
                      <p className="font-body mt-3 text-xs leading-relaxed text-muted-foreground">
                        Paste a YouTube URL, type{" "}
                        <span className="font-semibold text-foreground">
                          @handle
                        </span>
                        , or search by name
                      </p>
                    </div>
                  )}
              </div>
            </ScrollArea>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

/** Dismiss listeners — mounted only when dropdown is open (Rule 4: useMountEffect) */
function DropdownDismissListeners({
  dropdownRef,
  buttonRef,
  onClose,
}: {
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  useMountEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleScroll = () => onClose();

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKey);
    const scrollParent = buttonRef.current?.closest(".admin-main-v2");
    scrollParent?.addEventListener("scroll", handleScroll);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKey);
      scrollParent?.removeEventListener("scroll", handleScroll);
    };
  });
  return null;
}

/** Inline move-to-group dropdown — replaces the broken native select */
function MoveToGroupDropdown({
  curatedId,
  currentCreatorId,
  channelTitle,
  creators,
  onAssign,
  showUngroup,
}: {
  curatedId: string;
  currentCreatorId: string | null;
  channelTitle: string;
  creators: Creator[];
  onAssign: (
    curatedId: string,
    creatorId: string | null,
    title: string
  ) => void;
  showUngroup: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; flipUp: boolean }>({ top: 0, left: 0, flipUp: false });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Listeners are mounted via DropdownDismissListeners below (only when open)

  // Calculate position and open
  const handleOpen = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const flipUp = spaceBelow < 300;
      setPos({
        top: flipUp ? rect.top : rect.bottom + 4,
        left: rect.right,
        flipUp,
      });
    }
    setOpen(!open);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        ref={buttonRef}
        onClick={handleOpen}
        className="admin-move-btn rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        title="Reassign to group"
      >
        <FolderInput className="h-3.5 w-3.5" />
      </button>

      {open && <DropdownDismissListeners dropdownRef={dropdownRef} buttonRef={buttonRef} onClose={() => setOpen(false)} />}
      {open && createPortal(
        <div
          ref={dropdownRef}
          className="admin-move-dropdown fixed z-[100] min-w-[200px]"
          style={{
            top: pos.flipUp ? undefined : pos.top,
            bottom: pos.flipUp ? window.innerHeight - pos.top + 4 : undefined,
            left: pos.left,
            transform: 'translateX(-100%)',
          }}
        >
          <div className="rounded-xl border border-border bg-popover p-1.5 shadow-lg">
            <p className="font-body px-2.5 py-1.5 text-[10px] tracking-wider text-muted-foreground uppercase">
              Move to
            </p>
            {/* Ungroup option */}
            <button
              onClick={() => {
                onAssign(curatedId, null, channelTitle);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-body text-sm transition-colors hover:bg-secondary ${
                currentCreatorId === null
                  ? "text-foreground font-semibold"
                  : "text-foreground"
              }`}
            >
              <Ungroup className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
              <span className="truncate">Ungrouped</span>
              {currentCreatorId === null && (
                <Check className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-primary" />
              )}
            </button>

            {creators.length > 0 && (
              <div className="my-1 border-t border-border" />
            )}

            {/* Creator options (sorted alphabetically) */}
            {[...creators].sort((a, b) => a.name.localeCompare(b.name)).map((creator) => (
              <button
                key={creator.id}
                onClick={() => {
                  onAssign(curatedId, creator.id, channelTitle);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-body text-sm transition-colors hover:bg-secondary ${
                  currentCreatorId === creator.id
                    ? "text-foreground font-semibold"
                    : "text-foreground"
                }`}
              >
                <FolderPlus className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                <span className="truncate">{creator.name}</span>
                {currentCreatorId === creator.id && (
                  <Check className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-primary" />
                )}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/** Compact channel row for inside group sections */
const DATE_RANGE_OPTIONS = [
  { value: "", label: "6mo" },
  { value: "today-1years", label: "1y" },
  { value: "today-2years", label: "2y" },
  { value: "today-5years", label: "5y" },
  { value: "19700101", label: "All" },
];

function ChannelRow({
  channel,
  curatedId,
  onRemove,
  creators,
  onAssign,
  showUngroup,
  onPriorityChange,
  downloadedCount = 0,
  uploadedCount = 0,
  dateRangeOverride,
  onDateRangeChange,
}: {
  channel: Channel & { curatedId: string; creatorId: string | null; priority: number };
  curatedId: string;
  onRemove: (channelId: string) => void;
  creators: Creator[];
  onAssign: (
    curatedId: string,
    creatorId: string | null,
    title: string
  ) => void;
  showUngroup: boolean;
  onPriorityChange: (curatedId: string, priority: number) => void;
  downloadedCount?: number;
  uploadedCount?: number;
  dateRangeOverride?: string | null;
  onDateRangeChange?: (curatedId: string, value: string | null) => void;
}) {
  const [editingPriority, setEditingPriority] = useState(false);
  const priorityStars = (channel.priority / 20).toFixed(1).replace(/\.0$/, "");

  return (
    <div className="channel-row group/ch">
      <div className="flex gap-2.5 px-4 py-2">
        {/* Thumbnail */}
        <div className="relative h-9 w-9 flex-shrink-0 self-center overflow-hidden rounded-lg ring-1 ring-border">
          <Image
            src={channel.thumbnailUrl}
            alt={channel.title}
            fill
            className="object-cover"
            sizes="36px"
          />
        </div>

        {/* Two-line content */}
        <div className="min-w-0 flex-1">
          {/* Line 1: Name + hover actions */}
          <div className="flex items-center gap-1">
            <p className="font-body truncate text-sm font-medium leading-snug text-foreground">
              {channel.title}
            </p>
            {/* Hover actions — hidden until row hover */}
            <div className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/ch:opacity-100">
              <MoveToGroupDropdown
                curatedId={curatedId}
                currentCreatorId={channel.creatorId}
                channelTitle={channel.title}
                creators={creators}
                onAssign={onAssign}
                showUngroup={showUngroup}
              />
              <a
                href={`https://www.youtube.com/${channel.customUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                title="Open on YouTube"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <button
                onClick={() => onRemove(channel.id)}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                title="Remove channel"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Line 2: Handle + stats + date range */}
          <div className="font-body mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground leading-none">
            {channel.customUrl && (
              <>
                <span className="truncate max-w-[100px]">{channel.customUrl}</span>
                <span>·</span>
              </>
            )}
            {/* Priority — click to edit */}
            {editingPriority ? (
              <span className="inline-flex items-center gap-1">
                <StarRating
                  value={channel.priority}
                  onChange={(v) => {
                    onPriorityChange(curatedId, v);
                    setEditingPriority(false);
                  }}
                  size={11}
                />
                <button
                  onClick={() => setEditingPriority(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ) : (
              <button
                onClick={() => setEditingPriority(true)}
                className="inline-flex items-center gap-0.5 text-amber-400 hover:text-amber-300 transition-colors"
                title="Edit priority"
              >
                <Star className="h-3 w-3 fill-current" />
                <span>{priorityStars}</span>
              </button>
            )}
            <span>·</span>
            <span>{formatCount(channel.subscriberCount)} subs</span>
            <span>·</span>
            <span>{formatCount(channel.videoCount)} vids</span>
            <span>·</span>
            <span>{downloadedCount} dl</span>
            <span>·</span>
            <span>{uploadedCount} r2</span>
            {onDateRangeChange && (
              <>
                <span>·</span>
                <select
                  value={dateRangeOverride ?? ""}
                  onChange={(e) => onDateRangeChange(curatedId, e.target.value || null)}
                  className="h-4 rounded border border-border bg-transparent px-0.5 text-[11px] text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  title="Download date range"
                >
                  {DATE_RANGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Compact search result card for sidebar */
function SearchResultCard({
  channel,
  onAdd,
  isCurated,
}: {
  channel: Channel;
  onAdd: (channel: Channel) => void;
  isCurated: boolean;
}) {
  return (
    <Card className="search-result-card border-0 p-0">
      <div className="flex items-center gap-3 p-3">
        {/* Thumbnail */}
        <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg ring-1 ring-border">
          <Image
            src={channel.thumbnailUrl}
            alt={channel.title}
            fill
            className="object-cover"
            sizes="40px"
          />
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <h4 className="font-body truncate text-sm font-medium text-foreground">
            {channel.title}
          </h4>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="font-body truncate text-xs text-muted-foreground">
              {channel.customUrl}
            </span>
            <a
              href={`https://www.youtube.com/${channel.customUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 text-muted-foreground transition-colors hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="font-body mt-1 flex gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {formatCount(channel.subscriberCount)}
            </span>
            <span className="flex items-center gap-1">
              <Film className="h-3 w-3" />
              {formatCount(channel.videoCount)}
            </span>
          </div>
        </div>

        {/* Add button */}
        <Button
          size="sm"
          onClick={() => onAdd(channel)}
          disabled={isCurated}
          className={`h-8 px-3 font-body text-xs ${
            isCurated
              ? "cursor-default border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "admin-button-solid"
          }`}
        >
          {isCurated ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <>
              <Plus className="mr-0.5 h-3 w-3" />
              Add
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
import { createClient } from "@/lib/supabase/client";
import { slugify } from "@/lib/slugify";
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
  FolderPlus,
  X,
  ImageIcon,
  Ungroup,
  Hash,
  FolderInput,
  Check,
  PanelRightClose,
  PanelRightOpen,
  CloudUpload,
  Star,
} from "lucide-react";

const supabase = createClient();

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
  min_duration_override: number | null;
  max_videos_override: number | null;
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

function formatCount(count: string | number): string {
  const num = typeof count === "number" ? count : parseInt(String(count), 10);
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
  const { fetchCreatorsWithChannels } = await import("@/lib/queries/creators");
  return fetchCreatorsWithChannels();
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
  const totalUploaded = [...videoCounts.values()].reduce((s, c) => s + c.uploaded, 0);

  const creators = creatorsData?.creators || [];
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

  // ─── Creator CRUD ─────────────────────────────────────────────────────────

  const createCreator = useCallback(async () => {
    if (!newCreatorName.trim()) return;
    setIsCreatingCreator(true);

    try {
      const name = newCreatorName.trim();
      const slug = slugify(name);

      // Get next display_order
      const { data: existing } = await supabase
        .from("creators")
        .select("display_order")
        .order("display_order", { ascending: false })
        .limit(1);

      const nextOrder =
        existing && existing.length > 0 ? existing[0].display_order + 1 : 0;

      const { data: creator, error } = await supabase
        .from("creators")
        .insert({ name, slug, display_order: nextOrder })
        .select()
        .single();

      if (error) {
        toast.error(
          error.code === "23505"
            ? "A creator with that name already exists"
            : "Failed to create group"
        );
        return;
      }

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
        const { error } = await supabase
          .from("creators")
          .delete()
          .eq("id", creatorId);

        if (error) {
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
        const { error } = await supabase
          .from("curated_channels")
          .update({ creator_id: creatorId })
          .eq("id", curatedId);

        if (error) {
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
              await supabase
                .from("creators")
                .update({
                  avatar_channel_id: curatedRow.channel_id,
                  cover_channel_id: curatedRow.channel_id,
                })
                .eq("id", creatorId);
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
        const { error } = await supabase
          .from("curated_channels")
          .update({ priority })
          .eq("id", curatedId);
        if (error) {
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
        const { error } = await supabase
          .from("curated_channels")
          .update({ date_range_override: dateRangeOverride })
          .eq("id", curatedId);
        if (error) {
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

  const updateMinDuration = useCallback(
    async (curatedId: string, minDuration: number | null) => {
      try {
        const { error } = await supabase
          .from("curated_channels")
          .update({ min_duration_override: minDuration })
          .eq("id", curatedId);
        if (error) {
          toast.error("Failed to update min duration");
          return;
        }
        queryClient.invalidateQueries({ queryKey: ["creators"] });
        toast.success(minDuration ? `Min duration: ${minDuration}s` : "Min duration: default (300s)");
      } catch {
        toast.error("Failed to update min duration");
      }
    },
    [queryClient]
  );

  const updateMaxVideos = useCallback(
    async (curatedId: string, maxVideos: number | null) => {
      try {
        const { error } = await supabase
          .from("curated_channels")
          .update({ max_videos_override: maxVideos })
          .eq("id", curatedId);
        if (error) {
          toast.error("Failed to update max videos");
          return;
        }
        queryClient.invalidateQueries({ queryKey: ["creators"] });
        toast.success(maxVideos ? `Max videos: ${maxVideos}` : "Max videos: default (10)");
      } catch {
        toast.error("Failed to update max videos");
      }
    },
    [queryClient]
  );

  const updateCreatorPriority = useCallback(
    async (creatorId: string, priority: number) => {
      try {
        const { error } = await supabase
          .from("creators")
          .update({ priority })
          .eq("id", creatorId);
        if (error) {
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
        const { error } = await supabase
          .from("creators")
          .update({
            avatar_channel_id: channelId,
            cover_channel_id: channelId,
          })
          .eq("id", creatorId);

        if (error) {
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

  const isCurated = (id: string) => curatedChannels.some((c) => c.id === id);

  // ─── Get avatar for a creator ──────────────────────────────────────

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

      {/* Two-panel layout: Main (tree table) | Sidebar (search) */}
      <div className="admin-layout-v2 relative z-10">
        {/* ── LEFT: Main content — Tree Table ── */}
        <main className="admin-main-v2">
          <div className="px-4 pt-4 pb-8 lg:px-6">
            {/* Toolbar */}
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-body text-lg font-bold tracking-tight text-foreground">
                Groups
              </h2>
              <button
                onClick={toggleCreateForm}
                className="admin-button font-body flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-all"
              >
                <Plus className="h-3.5 w-3.5" />
                New group
              </button>
            </div>

            {/* Create group form */}
            {showCreateForm && (
              <div className="mb-3 animate-in fade-in slide-in-from-top-2 duration-200">
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
              /* ─── Tree Table ─── */
              <div className="tt-container">
                {/* Creator groups */}
                {creators.map((creator, i) => {
                  // groups always expanded — no collapse
                  const avatar = getCreatorAvatar(creator);
                  const channelCount = creator.curated_channels.length;
                  const groupR2 = creator.curated_channels.reduce(
                    (s, cc) => s + (videoCounts.get(cc.channel_id)?.uploaded ?? 0),
                    0
                  );

                  return (
                    <div key={creator.id} className={`tt-group tt-accent-${i % 6}`}>
                      {/* Group header */}
                      <div className="tt-group-header">
                        <button
                          onClick={() => setEditingAvatar(editingAvatar === creator.id ? null : creator.id)}
                          className="tt-avatar"
                          title="Change avatar"
                        >
                          {avatar ? (
                            <Image src={avatar} alt={creator.name} fill className="object-cover" sizes="42px" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center bg-secondary text-xs font-bold text-muted-foreground">
                              {creator.name.charAt(0)}
                            </span>
                          )}
                          <span className="tt-avatar-overlay">
                            <ImageIcon className="h-3 w-3 text-white" />
                          </span>
                        </button>
                        <div className="tt-group-info">
                          <span className="tt-group-name">{creator.name}</span>
                          <span className="tt-group-meta">
                            {channelCount} channel{channelCount !== 1 && "s"}
                            {groupR2 > 0 && <>&nbsp;&middot;&nbsp;{groupR2} synced</>}
                          </span>
                        </div>
                        <div className="tt-group-controls">
                          <StarRating
                            value={creator.priority}
                            onChange={(v) => updateCreatorPriority(creator.id, v)}
                            size={14}
                          />
                          <button
                            onClick={() => deleteCreator(creator.id, creator.name)}
                            className="tt-action-btn tt-action-danger"
                            title="Delete group"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Avatar picker row */}
                      {editingAvatar === creator.id && creator.curated_channels.length > 0 && (
                        <div className="tt-avatar-picker">
                          <span className="font-body text-[11px] tracking-wider text-muted-foreground uppercase">
                            Avatar:
                          </span>
                          {creator.curated_channels.map((cc) => (
                            <button
                              key={cc.id}
                              onClick={() => updateCreatorAvatar(creator.id, cc.channel_id)}
                              className={`tt-avatar-option ${
                                cc.channel_id === creator.avatar_channel_id ? "tt-avatar-option-active" : ""
                              }`}
                              title={cc.channels?.title}
                            >
                              {cc.channels?.thumbnail_url && (
                                <Image
                                  src={cc.channels.thumbnail_url}
                                  alt={cc.channels.title}
                                  fill
                                  className="object-cover"
                                  sizes="32px"
                                />
                              )}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Channel child rows */}
                      <div className="tt-channels">
                          {creator.curated_channels.length === 0 ? (
                            <div className="tt-channel-empty">
                              <span className="font-body text-sm text-muted-foreground">
                                No channels — search and add some
                              </span>
                            </div>
                          ) : (
                            creator.curated_channels.map((cc) => (
                              <ChannelTreeRow
                                key={cc.id}
                                cc={cc}
                                videoCounts={videoCounts}
                                onRemove={removeChannel}
                                creators={creators}
                                onAssign={assignChannelToCreator}
                                onPriorityChange={updateChannelPriority}
                                onDateRangeChange={updateDateRange}
                                onMinDurationChange={updateMinDuration}
                                onMaxVideosChange={updateMaxVideos}
                              />
                            ))
                          )}
                        </div>
                    </div>
                  );
                })}

                {/* Ungrouped section */}
                {ungroupedChannels.length > 0 && (
                  <div className="tt-group tt-group-ungrouped">
                    <div className="tt-group-header">
                      <span className="tt-ungrouped-icon">
                        <Ungroup className="h-4 w-4 text-muted-foreground" />
                      </span>
                      <div className="tt-group-info">
                        <span className="tt-group-name text-muted-foreground">Ungrouped</span>
                        <span className="tt-group-meta">{ungroupedChannels.length} channel{ungroupedChannels.length !== 1 && "s"}</span>
                      </div>
                    </div>

                    <div className="tt-channels">
                      {ungroupedChannels.map((cc) => (
                        <ChannelTreeRow
                          key={cc.id}
                          cc={cc}
                          videoCounts={videoCounts}
                          onRemove={removeChannel}
                          creators={creators}
                          onAssign={assignChannelToCreator}
                          onPriorityChange={updateChannelPriority}
                          onDateRangeChange={updateDateRange}
                          onMinDurationChange={updateMinDuration}
                          onMaxVideosChange={updateMaxVideos}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* All grouped message */}
                {creators.length > 0 &&
                  ungroupedChannels.length === 0 &&
                  curatedChannels.length > 0 && (
                    <div className="font-body py-3 text-center text-xs text-muted-foreground">
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
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h2 className="font-body text-sm font-semibold text-foreground">
                Add channels
              </h2>
              <p className="font-body text-xs text-muted-foreground">
                URL, handle, or search
              </p>
            </div>

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

            <ScrollArea className="admin-search-results">
              <div className="space-y-2 px-4 pb-4">
                {lookupResult && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                    <SearchResultCard
                      channel={lookupResult}
                      onAdd={addChannel}
                      isCurated={isCurated(lookupResult.id)}
                    />
                  </div>
                )}

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

const DATE_RANGE_OPTIONS = [
  { value: "", label: "6mo" },
  { value: "today-1years", label: "1y" },
  { value: "today-2years", label: "2y" },
  { value: "today-5years", label: "5y" },
  { value: "all", label: "All" },
];

/** Dismiss listeners — mounted only when dropdown is open */
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

/** Move-to-group dropdown */
function MoveToGroupDropdown({
  curatedId,
  currentCreatorId,
  channelTitle,
  creators,
  onAssign,
}: {
  curatedId: string;
  currentCreatorId: string | null;
  channelTitle: string;
  creators: Creator[];
  onAssign: (curatedId: string, creatorId: string | null, title: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; flipUp: boolean }>({ top: 0, left: 0, flipUp: false });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

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
        className="tt-action-btn"
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
            <button
              onClick={() => { onAssign(curatedId, null, channelTitle); setOpen(false); }}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-body text-sm transition-colors hover:bg-secondary ${
                currentCreatorId === null ? "text-foreground font-semibold" : "text-foreground"
              }`}
            >
              <Ungroup className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
              <span className="truncate">Ungrouped</span>
              {currentCreatorId === null && <Check className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-primary" />}
            </button>

            {creators.length > 0 && <div className="my-1 border-t border-border" />}

            {creators.map((creator) => (
              <button
                key={creator.id}
                onClick={() => { onAssign(curatedId, creator.id, channelTitle); setOpen(false); }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-body text-sm transition-colors hover:bg-secondary ${
                  currentCreatorId === creator.id ? "text-foreground font-semibold" : "text-foreground"
                }`}
              >
                <FolderPlus className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                <span className="truncate">{creator.name}</span>
                {currentCreatorId === creator.id && <Check className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-primary" />}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/** Local-state input that saves on blur or Enter */
function MinDurationInput({
  curatedId,
  value,
  onChange,
}: {
  curatedId: string;
  value: number | null | undefined;
  onChange: (curatedId: string, value: number | null) => void;
}) {
  const [local, setLocal] = useState(value != null ? String(value) : "");

  useEffect(() => {
    setLocal(value != null ? String(value) : "");
  }, [value]);

  const save = () => {
    const trimmed = local.trim();
    const next = trimmed === "" ? null : parseInt(trimmed, 10);
    const prev = value ?? null;
    if (next !== prev) {
      onChange(curatedId, Number.isNaN(next) ? null : next);
    }
  };

  return (
    <input
      type="number"
      min={0}
      step={60}
      placeholder="300"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className="tt-meta-input [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      title="Min duration (seconds) — empty = default (300s)"
    />
  );
}

/** Local-state input for max videos per channel */
function MaxVideosInput({
  curatedId,
  value,
  onChange,
}: {
  curatedId: string;
  value: number | null | undefined;
  onChange: (curatedId: string, value: number | null) => void;
}) {
  const [local, setLocal] = useState(value != null ? String(value) : "");

  useEffect(() => {
    setLocal(value != null ? String(value) : "");
  }, [value]);

  const save = () => {
    const trimmed = local.trim();
    const next = trimmed === "" ? null : parseInt(trimmed, 10);
    const prev = value ?? null;
    if (next !== prev) {
      onChange(curatedId, Number.isNaN(next) || (next !== null && next < 1) ? null : next);
    }
  };

  return (
    <input
      type="number"
      min={1}
      step={1}
      placeholder="10"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className="tt-meta-input [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      title="Max videos — empty = default (10)"
    />
  );
}

/** Single channel row inside the tree table */
function ChannelTreeRow({
  cc,
  videoCounts,
  onRemove,
  creators,
  onAssign,
  onPriorityChange,
  onDateRangeChange,
  onMinDurationChange,
  onMaxVideosChange,
}: {
  cc: CuratedChannelRow;
  videoCounts: Map<string, VideoCounts>;
  onRemove: (channelId: string) => void;
  creators: Creator[];
  onAssign: (curatedId: string, creatorId: string | null, title: string) => void;
  onPriorityChange: (curatedId: string, priority: number) => void;
  onDateRangeChange: (curatedId: string, value: string | null) => void;
  onMinDurationChange: (curatedId: string, value: number | null) => void;
  onMaxVideosChange: (curatedId: string, value: number | null) => void;
}) {
  const ch = rowToChannel(cc);
  const uploaded = videoCounts.get(cc.channel_id)?.uploaded ?? 0;
  const totalVids = parseInt(ch.videoCount, 10) || 0;

  // Normalize legacy "19700101" (epoch) to "all" for pill matching
  const rangeValue = cc.date_range_override === "19700101" ? "all" : (cc.date_range_override ?? "");

  return (
    <div className="tt-channel">
      <div className="tt-ch-thumb">
        <Image src={ch.thumbnailUrl} alt={ch.title} fill className="object-cover" sizes="36px" />
      </div>
      <div className="tt-ch-body">
        <div className="tt-ch-top">
          <span className="tt-ch-title">{ch.title}</span>
          <div className="tt-ch-actions">
            <MoveToGroupDropdown
              curatedId={cc.id}
              currentCreatorId={ch.creatorId}
              channelTitle={ch.title}
              creators={creators}
              onAssign={onAssign}
            />
            <a
              href={`https://www.youtube.com/${ch.customUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="tt-action-btn"
              title="Open on YouTube"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button
              onClick={() => onRemove(ch.id)}
              className="tt-action-btn tt-action-danger"
              title="Remove channel"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="tt-ch-meta">
          <StarRating value={ch.priority} onChange={(v) => onPriorityChange(cc.id, v)} size={15} />
          <span className="tt-dot">&middot;</span>
          <span className={`tt-sync ${uploaded > 0 ? "tt-sync-ok" : ""}`}>
            {uploaded}<span className="tt-sync-total">/{formatCount(totalVids)}</span>
          </span>
          <span className="tt-dot">&middot;</span>
          <div className="tt-range-pills">
            {DATE_RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onDateRangeChange(cc.id, opt.value || null)}
                className={`tt-range-pill ${rangeValue === opt.value ? "tt-range-pill-active" : ""}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <span className="tt-dot">&middot;</span>
          <MinDurationInput curatedId={cc.id} value={cc.min_duration_override} onChange={onMinDurationChange} />
          <span className="tt-dot">&middot;</span>
          <MaxVideosInput curatedId={cc.id} value={cc.max_videos_override} onChange={onMaxVideosChange} />
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
        <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg ring-1 ring-border">
          <Image
            src={channel.thumbnailUrl}
            alt={channel.title}
            fill
            className="object-cover"
            sizes="40px"
          />
        </div>
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

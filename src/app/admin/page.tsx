"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Image from "next/image";
import { useTheme } from "next-themes";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toaster, toast } from "sonner";
import { supabase } from "@/lib/supabase";
import {
  Search,
  Plus,
  Trash2,
  ExternalLink,
  Tv,
  Users,
  Eye,
  Film,
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Sun,
  Moon,
  ArrowUp,
  ArrowDown,
  FolderPlus,
  X,
  ImageIcon,
  Ungroup,
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
}

interface Video {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  publishedAt: string;
  channelId: string;
  channelTitle: string;
}

interface CuratedChannelRow {
  id: string;
  channel_id: string;
  display_order: number;
  creator_id: string | null;
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

function rowToChannel(row: CuratedChannelRow): Channel & { curatedId: string; creatorId: string | null } {
  const ch = row.channels;
  return {
    curatedId: row.id,
    creatorId: row.creator_id,
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

// ─── Main Component ──────────────────────────────────────────────────────────

export default function AdminPage() {
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [lookupResult, setLookupResult] = useState<Channel | null>(null);
  const [searchResults, setSearchResults] = useState<Channel[]>([]);
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);
  const [channelVideos, setChannelVideos] = useState<Record<string, Video[]>>(
    {}
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [loadingVideos, setLoadingVideos] = useState<string | null>(null);
  const [mode, setMode] = useState<"lookup" | "search">("lookup");

  // Creator state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCreatorName, setNewCreatorName] = useState("");
  const [isCreatingCreator, setIsCreatingCreator] = useState(false);
  const [expandedCreators, setExpandedCreators] = useState<Set<string>>(
    new Set()
  );
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

  const isHydrated = !isHydrating && !isCreatorsLoading;

  const creators = creatorsData?.creators || [];
  const ungroupedChannels = creatorsData?.ungrouped || [];

  // Auto-focus create input
  useEffect(() => {
    if (showCreateForm && createInputRef.current) {
      createInputRef.current.focus();
    }
  }, [showCreateForm]);

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
      setExpandedChannel((prev) => (prev === channelId ? null : prev));
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
      setExpandedCreators((prev) => new Set([...prev, creator.id]));
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
            // Find the channel_id from the curated channel row
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

  // ─── Video toggle ─────────────────────────────────────────────────────────

  const toggleVideos = useCallback(
    async (channelId: string) => {
      if (expandedChannel === channelId) {
        setExpandedChannel(null);
        return;
      }

      setExpandedChannel(channelId);

      if (!channelVideos[channelId]) {
        setLoadingVideos(channelId);
        try {
          const res = await fetch(
            `/api/youtube/videos?channelId=${encodeURIComponent(channelId)}`
          );
          const data = await res.json();
          if (res.ok) {
            setChannelVideos((prev) => ({ ...prev, [channelId]: data }));
          }
        } catch {
          toast.error("Failed to load videos");
        } finally {
          setLoadingVideos(null);
        }
      }
    },
    [expandedChannel, channelVideos]
  );

  const toggleCreator = (creatorId: string) => {
    setExpandedCreators((prev) => {
      const next = new Set(prev);
      if (next.has(creatorId)) next.delete(creatorId);
      else next.add(creatorId);
      return next;
    });
  };

  const isCurated = (id: string) => curatedChannels.some((c) => c.id === id);

  // ─── Get avatar thumbnail for a creator ───────────────────────────────────

  function getCreatorAvatar(creator: Creator): string | null {
    if (creator.avatar_channel_id) {
      const ch = creator.curated_channels.find(
        (c) => c.channel_id === creator.avatar_channel_id
      );
      if (ch?.channels?.thumbnail_url) return ch.channels.thumbnail_url;
    }
    // Fallback: first channel's thumbnail
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
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/12 ring-1 ring-primary/25">
              <Tv className="h-[18px] w-[18px] text-primary" />
            </div>
            <div>
              <h1 className="font-heading text-lg leading-none tracking-tight text-foreground">
                PradoTube
              </h1>
              <p className="font-body mt-0.5 text-[10px] font-semibold tracking-[0.15em] text-primary/60 uppercase">
                Admin
              </p>
            </div>
          </div>
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
      </header>

      {/* Two-panel layout */}
      <div className="admin-layout relative z-10">
        {/* Left panel — Curated sidebar */}
        <aside className="admin-sidebar">
          <div className="sticky top-0">
            {/* Sidebar header */}
            <div className="flex items-center justify-between px-5 pt-6 pb-4">
              <div>
                <h2 className="font-heading text-lg text-foreground">
                  Curated
                </h2>
                <p className="font-body mt-0.5 text-xs text-muted-foreground">
                  {curatedChannels.length} channel{curatedChannels.length !== 1 ? "s" : ""}
                  {creators.length > 0 &&
                    ` · ${creators.length} group${creators.length !== 1 ? "s" : ""}`}
                </p>
              </div>
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="admin-new-group-btn font-body flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-primary transition-all hover:bg-primary/10"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                New group
              </button>
            </div>

            {/* Create group form */}
            {showCreateForm && (
              <div className="mx-5 mb-3 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="creator-group-form flex items-center gap-2 rounded-xl p-2.5">
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
                    placeholder="e.g. Brooke and Riley"
                    className="admin-input h-8 font-body text-sm"
                  />
                  <Button
                    onClick={createCreator}
                    disabled={isCreatingCreator || !newCreatorName.trim()}
                    className="admin-button h-8 px-3 font-body text-xs"
                  >
                    {isCreatingCreator ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      "Create"
                    )}
                  </Button>
                  <button
                    onClick={() => {
                      setShowCreateForm(false);
                      setNewCreatorName("");
                    }}
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {!isHydrated ? (
              <div className="flex flex-col items-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-primary/50" />
                <p className="font-body mt-3 text-sm text-muted-foreground">
                  Loading...
                </p>
              </div>
            ) : curatedChannels.length === 0 ? (
              <div className="flex flex-col items-center px-5 py-12 text-center">
                <p className="font-body text-sm text-muted-foreground">
                  No channels yet. Use the search panel to add channels.
                </p>
              </div>
            ) : (
              <ScrollArea className="admin-sidebar-scroll">
                <div className="space-y-3 px-4 pb-6">
                  {/* Creator groups */}
                  {creators.map((creator, creatorIdx) => {
                    const isExpanded = expandedCreators.has(creator.id);
                    const accent =
                      ACCENT_COLORS[creatorIdx % ACCENT_COLORS.length];
                    const avatar = getCreatorAvatar(creator);
                    const cover = getCreatorCover(creator);
                    const channelCount = creator.curated_channels.length;

                    return (
                      <div key={creator.id} className="creator-group group/creator">
                        {/* Cover strip */}
                        {cover && isExpanded && (
                          <div className="relative h-16 w-full overflow-hidden rounded-t-xl">
                            <Image
                              src={cover}
                              alt=""
                              fill
                              className="object-cover opacity-40"
                              sizes="400px"
                            />
                            <div
                              className="absolute inset-0"
                              style={{
                                background: `linear-gradient(to top, var(--card), transparent)`,
                              }}
                            />
                          </div>
                        )}

                        {/* Creator header */}
                        <div
                          className="creator-group-header"
                          style={
                            {
                              "--accent": accent,
                            } as React.CSSProperties
                          }
                        >
                          <div className="flex items-center gap-3">
                            {/* Reorder — visible on group hover */}
                            <div className="flex flex-col gap-0.5 opacity-0 transition-opacity group-hover/creator:opacity-100">
                              <button
                                onClick={() =>
                                  moveCreator(creator.id, "up")
                                }
                                disabled={creatorIdx === 0}
                                className="rounded p-0.5 text-muted-foreground transition-colors hover:text-primary disabled:opacity-20"
                              >
                                <ArrowUp className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() =>
                                  moveCreator(creator.id, "down")
                                }
                                disabled={creatorIdx === creators.length - 1}
                                className="rounded p-0.5 text-muted-foreground transition-colors hover:text-primary disabled:opacity-20"
                              >
                                <ArrowDown className="h-3 w-3" />
                              </button>
                            </div>

                            {/* Avatar */}
                            <button
                              onClick={() =>
                                setEditingAvatar(
                                  editingAvatar === creator.id
                                    ? null
                                    : creator.id
                                )
                              }
                              className="group/avatar relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full ring-2 transition-all hover:ring-primary/50"
                              style={{
                                "--tw-ring-color": accent,
                              } as React.CSSProperties}
                              title="Change avatar source"
                            >
                              {avatar ? (
                                <Image
                                  src={avatar}
                                  alt={creator.name}
                                  fill
                                  className="object-cover"
                                  sizes="40px"
                                />
                              ) : (
                                <div
                                  className="flex h-full w-full items-center justify-center text-xs font-bold text-white"
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
                            <button
                              onClick={() => toggleCreator(creator.id)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <p className="font-heading truncate text-sm text-foreground">
                                {creator.name}
                              </p>
                              <p className="font-body text-[11px] text-muted-foreground">
                                {channelCount} channel
                                {channelCount !== 1 ? "s" : ""}
                              </p>
                            </button>

                            {/* Actions */}
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => toggleCreator(creator.id)}
                                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
                              >
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </button>
                              <button
                                onClick={() =>
                                  deleteCreator(creator.id, creator.name)
                                }
                                className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-all group-hover/creator:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Avatar picker */}
                        {editingAvatar === creator.id &&
                          creator.curated_channels.length > 0 && (
                            <div className="border-t border-border bg-muted/30 px-3 py-2">
                              <p className="font-body mb-2 text-[10px] tracking-wider text-muted-foreground uppercase">
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
                                        : "ring-border hover:ring-primary/50"
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

                        {/* Expanded channels */}
                        {isExpanded && (
                          <div className="space-y-1 px-2 pb-2 pt-1">
                            {creator.curated_channels.length === 0 ? (
                              <p className="font-body py-4 text-center text-xs text-muted-foreground">
                                No channels in this group yet
                              </p>
                            ) : (
                              creator.curated_channels.map((cc) => {
                                const ch = rowToChannel(cc);
                                return (
                                  <CuratedChannelCard
                                    key={cc.id}
                                    channel={ch}
                                    curatedId={cc.id}
                                    onRemove={removeChannel}
                                    onToggleVideos={toggleVideos}
                                    expandedChannel={expandedChannel}
                                    loadingVideos={loadingVideos}
                                    channelVideos={channelVideos}
                                    creators={creators}
                                    onAssign={assignChannelToCreator}
                                    showUngroup
                                  />
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Ungrouped section */}
                  {ungroupedChannels.length > 0 && (
                    <div>
                      {creators.length > 0 && (
                        <div className="flex items-center gap-2 px-1 py-2">
                          <Ungroup className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-body text-[11px] tracking-wider text-muted-foreground uppercase">
                            Ungrouped ({ungroupedChannels.length})
                          </span>
                          <div className="h-px flex-1 bg-border" />
                        </div>
                      )}
                      <div className="space-y-1">
                        {ungroupedChannels.map((cc) => {
                          const ch = rowToChannel(cc);
                          return (
                            <CuratedChannelCard
                              key={cc.id}
                              channel={ch}
                              curatedId={cc.id}
                              onRemove={removeChannel}
                              onToggleVideos={toggleVideos}
                              expandedChannel={expandedChannel}
                              loadingVideos={loadingVideos}
                              channelVideos={channelVideos}
                              creators={creators}
                              onAssign={assignChannelToCreator}
                              showUngroup={false}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* No groups and no ungrouped — everything is in groups */}
                  {creators.length > 0 && ungroupedChannels.length === 0 && (
                    <p className="font-body py-2 text-center text-xs text-muted-foreground">
                      All channels are grouped
                    </p>
                  )}
                </div>
              </ScrollArea>
            )}
          </div>
        </aside>

        {/* Right panel — Discovery */}
        <main className="admin-main">
          <div className="mx-auto max-w-2xl px-8 py-8 lg:px-12 lg:py-10">
            {/* Section header with integrated mode toggle */}
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="font-heading text-2xl tracking-tight text-foreground">
                  Discover channels
                </h2>
                <p className="font-body mt-1 text-sm text-muted-foreground">
                  Add by URL, handle, or search by name
                </p>
              </div>

              {/* Segmented mode toggle */}
              <div className="admin-segmented-toggle inline-flex rounded-lg p-0.5">
                <button
                  onClick={() => setMode("lookup")}
                  className={`admin-segment font-body rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    mode === "lookup"
                      ? "active"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Direct lookup
                </button>
                <button
                  onClick={() => setMode("search")}
                  className={`admin-segment font-body rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    mode === "search"
                      ? "active"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Search
                </button>
              </div>
            </div>

            {/* Search bar */}
            <div className="flex gap-2.5">
              <div className="relative flex-1">
                <Search className="absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      mode === "lookup" ? handleLookup() : handleSearch();
                    }
                  }}
                  placeholder={
                    mode === "lookup"
                      ? "Paste a URL or handle — e.g. @FunQuesters"
                      : "Search for kid-friendly channels..."
                  }
                  className="admin-input h-11 pl-10 font-body"
                />
              </div>
              <Button
                onClick={mode === "lookup" ? handleLookup : handleSearch}
                disabled={isLoading || isSearching || !searchInput.trim()}
                className="admin-button-solid h-11 px-5 font-body font-semibold"
              >
                {isLoading || isSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : mode === "lookup" ? (
                  "Look up"
                ) : (
                  "Search"
                )}
              </Button>
            </div>

            {/* Lookup Result */}
            {lookupResult && (
              <div className="mt-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <ChannelCard
                  channel={lookupResult}
                  onAdd={addChannel}
                  isCurated={isCurated(lookupResult.id)}
                />
              </div>
            )}

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="mt-6 space-y-3">
                <p className="font-body text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  {searchResults.length} channels found
                </p>
                {searchResults.map((channel, i) => (
                  <div
                    key={channel.id}
                    className="animate-in fade-in slide-in-from-bottom-2"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <ChannelCard
                      channel={channel}
                      onAdd={addChannel}
                      isCurated={isCurated(channel.id)}
                      compact
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Empty state — compact */}
            {!lookupResult &&
              searchResults.length === 0 &&
              !isLoading &&
              !isSearching && (
                <div className="mt-10 flex items-start gap-4 rounded-xl border border-dashed border-border p-5">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/8">
                    <Search className="h-4 w-4 text-primary/50" />
                  </div>
                  <div>
                    <p className="font-heading text-sm text-foreground">
                      Find channels to curate
                    </p>
                    <p className="font-body mt-0.5 text-sm leading-relaxed text-muted-foreground">
                      Paste a YouTube channel URL, type a handle like{" "}
                      <span className="font-semibold text-primary">@FunQuesters</span>, or
                      switch to search mode to browse by name.
                    </p>
                  </div>
                </div>
              )}
          </div>
        </main>
      </div>
    </div>
  );
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function CuratedChannelCard({
  channel,
  curatedId,
  onRemove,
  onToggleVideos,
  expandedChannel,
  loadingVideos,
  channelVideos,
  creators,
  onAssign,
  showUngroup,
}: {
  channel: Channel & { curatedId: string; creatorId: string | null };
  curatedId: string;
  onRemove: (channelId: string) => void;
  onToggleVideos: (channelId: string) => void;
  expandedChannel: string | null;
  loadingVideos: string | null;
  channelVideos: Record<string, Video[]>;
  creators: Creator[];
  onAssign: (
    curatedId: string,
    creatorId: string | null,
    title: string
  ) => void;
  showUngroup: boolean;
}) {
  return (
    <Card className="curated-card group border-0 p-0">
      <div className="flex items-center gap-2.5 p-2.5">
        <div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-lg ring-1 ring-border">
          <Image
            src={channel.thumbnailUrl}
            alt={channel.title}
            fill
            className="object-cover"
            sizes="36px"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-heading truncate text-[13px] text-foreground">
            {channel.title}
          </p>
          <p className="font-body text-[11px] text-muted-foreground">
            {formatCount(channel.subscriberCount)} subs
          </p>
        </div>
        <div className="flex items-center gap-0.5">
          {/* Move to group — native select with icon overlay */}
          <div className="relative flex items-center justify-center">
            <FolderPlus className="pointer-events-none absolute h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={channel.creatorId || ""}
              onChange={(e) => {
                const val = e.target.value;
                onAssign(
                  curatedId,
                  val === "" ? null : val,
                  channel.title
                );
              }}
              className="assign-select font-body h-7 w-7 cursor-pointer appearance-none rounded-md bg-transparent p-0 text-transparent opacity-0 transition-colors hover:bg-secondary hover:opacity-100"
              title={showUngroup ? "Ungroup or move" : "Move to group"}
            >
              <option value="">Ungrouped</option>
              {creators.map((creator) => (
                <option key={creator.id} value={creator.id}>
                  {creator.name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => onToggleVideos(channel.id)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
          >
            {expandedChannel === channel.id ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={() => onRemove(channel.id)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Expanded videos */}
      {expandedChannel === channel.id && (
        <div className="border-t border-border bg-muted/50 px-3 pb-3 pt-2">
          {loadingVideos === channel.id ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-primary/50" />
            </div>
          ) : channelVideos[channel.id]?.length ? (
            <div className="space-y-2">
              <p className="font-body text-[10px] tracking-wider text-muted-foreground uppercase">
                Recent uploads
              </p>
              {channelVideos[channel.id].slice(0, 5).map((video) => (
                <a
                  key={video.id}
                  href={`https://www.youtube.com/watch?v=${video.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group/vid flex gap-2.5 rounded-md p-1.5 transition-colors hover:bg-secondary"
                >
                  <div className="relative h-12 w-20 flex-shrink-0 overflow-hidden rounded">
                    <Image
                      src={video.thumbnailUrl}
                      alt={video.title}
                      fill
                      className="object-cover"
                      sizes="80px"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-body line-clamp-2 text-xs text-foreground/80 transition-colors group-hover/vid:text-foreground">
                      {video.title}
                    </p>
                    <p className="font-body mt-0.5 text-[10px] text-muted-foreground">
                      {new Date(video.publishedAt).toLocaleDateString()}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <p className="font-body py-4 text-center text-xs text-muted-foreground">
              No recent videos found
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function ChannelCard({
  channel,
  onAdd,
  isCurated,
  compact = false,
}: {
  channel: Channel;
  onAdd: (channel: Channel) => void;
  isCurated: boolean;
  compact?: boolean;
}) {
  return (
    <Card
      className={`channel-result-card overflow-hidden border-0 p-0 ${compact ? "" : ""}`}
    >
      {!compact && channel.bannerUrl && (
        <div className="relative h-28 w-full overflow-hidden">
          <Image
            src={channel.bannerUrl}
            alt=""
            fill
            className="object-cover opacity-60"
            sizes="(max-width: 768px) 100vw, 60vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
        </div>
      )}

      <div className={`flex gap-4 ${compact ? "p-4" : "relative -mt-6 p-5"}`}>
        <div
          className={`relative flex-shrink-0 overflow-hidden rounded-xl ring-2 ring-primary/20 ${compact ? "h-12 w-12" : "h-16 w-16"}`}
        >
          <Image
            src={channel.thumbnailUrl}
            alt={channel.title}
            fill
            className="object-cover"
            sizes={compact ? "48px" : "64px"}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3
                className={`font-heading text-foreground ${compact ? "text-sm" : "text-lg"}`}
              >
                {channel.title}
              </h3>
              <div className="mt-0.5 flex items-center gap-2">
                <span className="font-body text-xs text-primary">
                  {channel.customUrl}
                </span>
                <a
                  href={`https://www.youtube.com/${channel.customUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            <Button
              size="sm"
              onClick={() => onAdd(channel)}
              disabled={isCurated}
              className={`font-body flex-shrink-0 ${
                isCurated
                  ? "cursor-default border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "admin-button"
              }`}
            >
              {isCurated ? (
                "Added"
              ) : (
                <>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add
                </>
              )}
            </Button>
          </div>

          {!compact && (
            <p className="font-body mt-2 line-clamp-2 text-sm text-muted-foreground">
              {channel.description}
            </p>
          )}

          <div className="mt-2 flex gap-4">
            <span className="font-body flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              {formatCount(channel.subscriberCount)}
            </span>
            <span className="font-body flex items-center gap-1.5 text-xs text-muted-foreground">
              <Film className="h-3 w-3" />
              {formatCount(channel.videoCount)}
            </span>
            <span className="font-body flex items-center gap-1.5 text-xs text-muted-foreground">
              <Eye className="h-3 w-3" />
              {formatCount(channel.viewCount)}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}

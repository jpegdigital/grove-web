"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { useMountEffect } from "@/hooks/use-mount-effect";
import Link from "next/link";
import Image from "next/image";
import {
  Tv,
  Sun,
  Moon,
  ArrowLeft,
  Loader2,
  Check,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

/* ─── Types ─── */

interface Profile {
  user_id: string;
  display_name: string;
  role: string;
}

interface Creator {
  id: string;
  name: string;
  slug: string;
  avatar_url: string | null;
}

interface Subscription {
  id: string;
  user_id: string;
  creator_id: string;
}

/* ─── Data fetching ─── */

const supabase = createClient();

async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, display_name, role")
    .order("role", { ascending: true })
    .order("display_name", { ascending: true });
  if (error) throw new Error("Failed to load profiles");
  return data ?? [];
}

async function fetchCreators(): Promise<Creator[]> {
  const { data, error } = await supabase
    .from("creators")
    .select("id, name, slug, avatar_channel_id, channels:channels!avatar_channel_id(thumbnail_url)")
    .order("name", { ascending: true });
  if (error) throw new Error("Failed to load creators");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    avatar_url: c.channels?.thumbnail_url ?? null,
  }));
}

async function fetchSubscriptions(): Promise<Subscription[]> {
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("id, user_id, creator_id");
  if (error) throw new Error("Failed to load subscriptions");
  return data ?? [];
}

/* ─── Page ─── */

export default function SubscriptionsPage() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useMountEffect(() => setMounted(true));
  const queryClient = useQueryClient();

  const { data: profiles = [], isLoading: loadingProfiles } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: fetchProfiles,
    staleTime: 5 * 60 * 1000,
  });

  const { data: creators = [], isLoading: loadingCreators } = useQuery({
    queryKey: ["admin-creators"],
    queryFn: fetchCreators,
    staleTime: 5 * 60 * 1000,
  });

  const { data: subscriptions = [], isLoading: loadingSubs } = useQuery({
    queryKey: ["admin-subscriptions"],
    queryFn: fetchSubscriptions,
    staleTime: 60 * 1000,
  });

  const isLoading = loadingProfiles || loadingCreators || loadingSubs;

  // Build a set for quick lookup: "userId:creatorId"
  const subSet = new Set(subscriptions.map((s) => `${s.user_id}:${s.creator_id}`));

  const toggleMutation = useMutation({
    mutationFn: async ({
      userId,
      creatorId,
      isSubscribed,
    }: {
      userId: string;
      creatorId: string;
      isSubscribed: boolean;
    }) => {
      if (isSubscribed) {
        // Remove subscription
        const { error } = await supabase
          .from("user_subscriptions")
          .delete()
          .eq("user_id", userId)
          .eq("creator_id", creatorId);
        if (error) throw error;
      } else {
        // Add subscription
        const { error } = await supabase
          .from("user_subscriptions")
          .insert({ user_id: userId, creator_id: creatorId });
        if (error) throw error;
      }
    },
    onMutate: async ({ userId, creatorId, isSubscribed }) => {
      await queryClient.cancelQueries({ queryKey: ["admin-subscriptions"] });
      const previous = queryClient.getQueryData<Subscription[]>(["admin-subscriptions"]);

      queryClient.setQueryData<Subscription[]>(["admin-subscriptions"], (old = []) => {
        if (isSubscribed) {
          return old.filter(
            (s) => !(s.user_id === userId && s.creator_id === creatorId)
          );
        }
        return [...old, { id: crypto.randomUUID(), user_id: userId, creator_id: creatorId }];
      });

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["admin-subscriptions"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] });
    },
  });

  const handleToggle = useCallback(
    (userId: string, creatorId: string) => {
      const key = `${userId}:${creatorId}`;
      toggleMutation.mutate({
        userId,
        creatorId,
        isSubscribed: subSet.has(key),
      });
    },
    [subSet, toggleMutation]
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="player-header sticky top-0 z-50 border-b border-border/50 px-5 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[#89E219] shadow-sm">
                <Tv className="h-4.5 w-4.5 text-white" />
              </div>
            </Link>
            <h1 className="font-heading text-lg text-foreground">
              Subscriptions
            </h1>
          </div>
          <button
            onClick={() =>
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
            className="rounded-xl p-2 text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary"
          >
            {mounted && resolvedTheme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : profiles.length === 0 || creators.length === 0 ? (
          <div className="text-center py-20">
            <p className="font-body text-muted-foreground">
              {profiles.length === 0
                ? "No user accounts found. Create users in the Supabase Dashboard first."
                : "No creators found. Add creators in the admin panel first."}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {profiles.map((profile) => (
              <Card key={profile.user_id} className="p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
                    <span className="font-heading text-sm text-primary font-semibold">
                      {profile.display_name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <h2 className="font-heading text-lg text-foreground">
                      {profile.display_name}
                    </h2>
                    <span className="font-body text-xs text-muted-foreground">
                      {profile.role === "admin" ? "Parent (Admin)" : "Member"}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {creators.map((creator) => {
                    const key = `${profile.user_id}:${creator.id}`;
                    const isSubscribed = subSet.has(key);
                    return (
                      <button
                        key={creator.id}
                        onClick={() =>
                          handleToggle(profile.user_id, creator.id)
                        }
                        className={`relative flex flex-col items-center gap-2 rounded-xl p-3 transition-all border-2 ${
                          isSubscribed
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border/50 hover:border-border hover:bg-secondary/50"
                        }`}
                      >
                        {/* Status indicator */}
                        <div
                          className={`absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full transition-colors ${
                            isSubscribed
                              ? "bg-primary text-white"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {isSubscribed ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <X className="h-3 w-3" />
                          )}
                        </div>

                        {/* Avatar */}
                        <div className="relative h-12 w-12 overflow-hidden rounded-full bg-secondary ring-1 ring-border/30">
                          {creator.avatar_url ? (
                            <Image
                              src={creator.avatar_url}
                              alt={creator.name}
                              fill
                              className="object-cover"
                              sizes="48px"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                              <span className="font-heading text-sm text-primary">
                                {creator.name.charAt(0)}
                              </span>
                            </div>
                          )}
                        </div>

                        <span className="font-body text-xs text-foreground text-center leading-tight line-clamp-2">
                          {creator.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

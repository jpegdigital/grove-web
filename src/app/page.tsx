"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Moon, Play, Sun } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { UserNav } from "@/components/user-nav";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { createClient } from "@/lib/supabase/client";

/* ─── Types ─── */

interface Creator {
	id: string;
	name: string;
	slug: string;
	display_order: number;
	avatar_url: string | null;
}

interface SubscriptionRow {
	creator: {
		id: string;
		name: string;
		slug: string;
		display_order: number;
		avatar_channel: { thumbnail_url: string | null } | null;
	} | null;
}

/* ─── Helpers ─── */

/** Accent gradient pairs — vivid rings for each creator */
const ACCENT_RINGS = [
	{ from: "#58CC02", to: "#89E219" },
	{ from: "#1CB0F6", to: "#00CD9C" },
	{ from: "#CE82FF", to: "#FF4B4B" },
	{ from: "#FF9600", to: "#FFC800" },
	{ from: "#FF4B4B", to: "#FF9600" },
	{ from: "#FFC800", to: "#58CC02" },
	{ from: "#00CD9C", to: "#1CB0F6" },
];

/** Pseudo-random skeleton text widths so they don't all look identical */
const SKELETON_TEXT_WIDTHS = [72, 56, 80, 64, 88, 60, 76, 68, 84, 52, 72, 64];

const SKELETON_COUNT = 24;

/* ─── Creator Avatar — layered skeleton + content ─── */

function CreatorAvatar({
	creator,
	index,
	revealed,
}: {
	creator: Creator | null;
	index: number;
	revealed: boolean;
}) {
	const accent = ACCENT_RINGS[index % ACCENT_RINGS.length];
	const hasImage = creator?.avatar_url != null;
	const showContent = revealed && creator !== null;

	// Stagger: each avatar reveals 40ms after the previous
	const revealDelay = `${index * 40}ms`;

	return (
		<div
			className="home-creator-item group relative flex flex-col items-center gap-3"
			data-skeleton={!showContent || undefined}
			style={
				{
					"--accent-from": accent.from,
					"--accent-to": accent.to,
				} as React.CSSProperties
			}
		>
			{/* Clickable link overlay — only active when content is shown */}
			{showContent && creator && (
				<Link
					href={`/c/${creator.slug}`}
					className="absolute inset-0 z-10 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary"
					aria-label={creator.name}
				/>
			)}

			{/* Avatar ring */}
			<div className="home-avatar-ring relative size-[100px] sm:size-[120px] lg:size-[140px]">
				<div className="home-avatar-inner">
					{/* Skeleton layer — always present, fades out */}
					<div
						className="absolute inset-0 rounded-full skeleton-shimmer"
						style={{
							opacity: showContent ? 0 : 1,
							transition: `opacity 300ms ease ${showContent ? revealDelay : "0ms"}`,
						}}
					/>

					{/* Content layer — preload image while skeleton shows, fade in when ready */}
					{hasImage && (
						<div
							className="absolute inset-0"
							style={{
								opacity: showContent ? 1 : 0,
								transition: `opacity 300ms ease ${revealDelay}`,
							}}
						>
							<Image
								src={creator?.avatar_url ?? ""}
								alt={creator?.name ?? ""}
								fill
								className="object-cover rounded-full"
								sizes="(max-width: 640px) 96px, (max-width: 1024px) 120px, 140px"
								priority={index < 8}
							/>
						</div>
					)}

					{/* Fallback initial — for creators without avatar_url */}
					{creator && !hasImage && (
						<div
							className="absolute inset-0 flex items-center justify-center rounded-full"
							style={{
								backgroundImage: `linear-gradient(135deg, ${accent.from}, ${accent.to})`,
								opacity: showContent ? 1 : 0,
								transition: `opacity 300ms ease ${revealDelay}`,
							}}
						>
							<span className="font-heading text-3xl sm:text-4xl text-white drop-shadow-sm">
								{creator.name.charAt(0)}
							</span>
						</div>
					)}
				</div>
			</div>

			{/* Name — skeleton bar fades out, real name fades in */}
			<div className="relative w-[100px] sm:w-[120px] h-10 flex items-start justify-center">
				{/* Skeleton text bar */}
				<div
					className="absolute top-1 left-1/2 -translate-x-1/2 h-4 rounded-md skeleton-shimmer"
					style={{
						width: SKELETON_TEXT_WIDTHS[index % SKELETON_TEXT_WIDTHS.length],
						opacity: showContent ? 0 : 1,
						transition: `opacity 300ms ease ${showContent ? revealDelay : "0ms"}`,
					}}
				/>

				{/* Real name */}
				{creator && (
					<span
						className="font-heading text-sm sm:text-base text-foreground/80 text-center leading-tight group-hover:text-foreground line-clamp-2"
						style={{
							opacity: showContent ? 1 : 0,
							transition: `opacity 300ms ease ${revealDelay}`,
						}}
					>
						{creator.name}
					</span>
				)}
			</div>
		</div>
	);
}

/* ─── Page ─── */

export default function Home() {
	const { resolvedTheme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);
	useMountEffect(() => setMounted(true));

	// Force refetch when restored from bfcache (browser back/forward).
	// bfcache freezes the page mid-state — in-flight fetches are lost,
	// so React Query can be stuck with isPending=true forever.
	const queryClient = useQueryClient();
	useEffect(() => {
		const onPageShow = (e: PageTransitionEvent) => {
			if (e.persisted) {
				queryClient.invalidateQueries({ queryKey: ["creators-subscribed"] });
			}
		};
		window.addEventListener("pageshow", onPageShow);
		return () => window.removeEventListener("pageshow", onPageShow);
	}, [queryClient]);

	const { data, isPending } = useQuery({
		queryKey: ["creators-subscribed"],
		queryFn: async () => {
			const supabase = createClient();
			const { data: rows, error } = await supabase
				.from("user_subscriptions")
				.select(`
          creator:creators(
            id, name, slug, display_order,
            avatar_channel:channels!avatar_channel_id(thumbnail_url)
          )
        `);

			if (error) throw error;

			return (rows ?? [])
				.map((r: unknown) => {
					const { creator: c } = r as SubscriptionRow;
					if (!c) return null;
					return {
						id: c.id,
						name: c.name,
						slug: c.slug,
						display_order: c.display_order,
						avatar_url: c.avatar_channel?.thumbnail_url ?? null,
					} satisfies Creator;
				})
				.filter((c): c is Creator => c !== null)
				.sort((a, b) => a.name.localeCompare(b.name));
		},
		retry: false,
		staleTime: 5 * 60 * 1000,
	});

	const creators = data ?? [];

	const wasPendingRef = useRef(isPending);
	const [revealed, setRevealed] = useState(!isPending);

	useEffect(() => {
		if (wasPendingRef.current && !isPending) {
			const id = requestAnimationFrame(() => setRevealed(true));
			return () => cancelAnimationFrame(id);
		}
	}, [isPending]);

	const dataReady = !isPending && revealed;

	// Empty state (only after loading completes)
	if (dataReady && creators.length === 0) {
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
						No creators are subscribed for your account yet. Ask a parent to set
						up your feed!
					</p>
					<Link
						href="/feed"
						className="font-body mt-2 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm text-white font-bold shadow-md shadow-primary/25 transition-all hover:shadow-lg hover:shadow-primary/30 hover:-translate-y-0.5"
					>
						<Play className="h-4 w-4" />
						Go to Feed
					</Link>
				</div>
			</div>
		);
	}

	// Build slots: either skeleton placeholders or real creators
	const slots: (Creator | null)[] = dataReady
		? creators
		: creators.length > 0
			? creators // data arrived but min display hasn't elapsed — show data anyway
			: Array.from({ length: SKELETON_COUNT }, () => null);

	return (
		<div className="home-root min-h-screen">
			<div className="grain-overlay" />

			{/* Background glow orbs */}
			<div className="home-glow home-glow-1" />
			<div className="home-glow home-glow-2" />
			<div className="home-glow home-glow-3" />

			{/* Header */}
			<header className="player-header sticky top-0 z-50 border-b border-border/50 px-5 py-3">
				<div className="max-w-6xl mx-auto flex items-center justify-between">
					<Link href="/" className="flex items-center">
						<img src="/logo.svg" alt="PradoTube" className="h-8" />
					</Link>
					<div className="flex items-center gap-1.5">
						<Link
							href="/feed"
							className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 font-body text-sm font-semibold text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary"
						>
							<Play className="h-3.5 w-3.5" />
							Watch
						</Link>
						<button
							type="button"
							onClick={() =>
								setTheme(resolvedTheme === "dark" ? "light" : "dark")
							}
							className="rounded-xl p-2 text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary"
							aria-label="Toggle theme"
						>
							{mounted && resolvedTheme === "dark" ? (
								<Sun className="h-4 w-4" />
							) : (
								<Moon className="h-4 w-4" />
							)}
						</button>
						<UserNav />
					</div>
				</div>
			</header>

			{/* Hero */}
			<section className="home-hero relative z-10 px-6 pt-10 pb-4 sm:pt-14 sm:pb-6 text-center">
				<h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl tracking-tight text-foreground">
					Who do you want to <span className="home-hero-accent">watch</span>?
				</h2>
			</section>

			{/* Creator Grid — single grid, each slot crossfades skeleton → content */}
			<main
				className="home-grid relative z-10 px-6 sm:px-10 lg:px-16 pb-20"
				aria-busy={!dataReady}
			>
				<div className="flex flex-wrap justify-center gap-x-6 gap-y-8 sm:gap-x-10 sm:gap-y-10 lg:gap-x-12 lg:gap-y-12">
					{slots.map((creator, i) => (
						<CreatorAvatar
							key={creator?.id ?? `skeleton-${i}`}
							creator={creator}
							index={i}
							revealed={dataReady}
						/>
					))}
				</div>
			</main>

			{/* Footer */}
			<footer className="relative z-10 text-center py-10 border-t border-border/30">
				<p className="font-body text-xs text-muted-foreground/60">
					Curated with care for little viewers
				</p>
			</footer>
		</div>
	);
}

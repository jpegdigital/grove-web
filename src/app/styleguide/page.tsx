"use client";

import { useTheme } from "next-themes";
import { useState } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Sun,
  Moon,
  Monitor,
  Play,
  Heart,
  Star,
  Tv,
  Sparkles,
  Palette,
  Type,
  Layers,
  Zap,
} from "lucide-react";

/** Rainbow logo — each letter a different color */
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
        <span
          key={i}
          className="logo-letter"
          style={{ color: l.color }}
        >
          {l.char}
        </span>
      ))}
    </span>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useMountEffect(() => setMounted(true));
  if (!mounted) return null;

  return (
    <div className="flex items-center gap-1 rounded-full bg-secondary p-1">
      <button
        onClick={() => setTheme("light")}
        className={`rounded-full p-2.5 transition-all ${
          theme === "light"
            ? "bg-primary text-primary-foreground shadow-md"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Sun className="size-4" />
      </button>
      <button
        onClick={() => setTheme("system")}
        className={`rounded-full p-2.5 transition-all ${
          theme === "system"
            ? "bg-primary text-primary-foreground shadow-md"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Monitor className="size-4" />
      </button>
      <button
        onClick={() => setTheme("dark")}
        className={`rounded-full p-2.5 transition-all ${
          theme === "dark"
            ? "bg-primary text-primary-foreground shadow-md"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Moon className="size-4" />
      </button>
    </div>
  );
}

function ColorSwatch({
  name,
  cssVar,
}: {
  name: string;
  cssVar: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="size-16 rounded-2xl shadow-sm border border-border transition-colors"
        style={{ background: `var(--${cssVar})` }}
      />
      <span className="text-xs font-bold text-muted-foreground">{name}</span>
    </div>
  );
}

function FeatureColorSwatch({ name, cssVar }: { name: string; cssVar: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="size-14 rounded-2xl shadow-md transition-all hover:scale-110 hover:rotate-3 cursor-pointer"
        style={{ background: `var(--${cssVar})` }}
      />
      <span className="text-xs font-bold text-muted-foreground capitalize">{name}</span>
    </div>
  );
}

export default function StyleguidePage() {
  const [mounted, setMounted] = useState(false);
  useMountEffect(() => setMounted(true));

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-gradient-to-br from-primary to-[#89E219] flex items-center justify-center shadow-sm">
              <Tv className="size-5 text-white" />
            </div>
            <div>
              <RainbowLogo className="text-lg" />
              <p className="text-xs text-muted-foreground font-bold">Style Guide</p>
            </div>
          </div>
          {mounted && <ThemeToggle />}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12 space-y-20">
        {/* Hero */}
        <section className="text-center space-y-4 py-8">
          <h2 className="font-heading text-5xl sm:text-6xl tracking-tight">
            Curated for{" "}
            <span className="text-primary">Kids</span>,{" "}
            <br className="sm:hidden" />
            Designed for{" "}
            <span className="text-coral">Parents</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed font-body">
            Bright, bold, and unmistakably playful. Duolingo-inspired design
            with a rainbow soul.
          </p>
        </section>

        {/* ==================== LOGO ==================== */}
        <section className="space-y-8">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="size-5 text-primary" />
            </div>
            <div>
              <h3 className="font-heading text-2xl">Logo</h3>
              <p className="text-sm text-muted-foreground font-body">Rainbow letters, one color per character</p>
            </div>
          </div>

          <Card>
            <CardContent className="py-10 space-y-8">
              <div className="text-center space-y-6">
                <RainbowLogo className="text-6xl sm:text-7xl" />
                <div className="flex justify-center gap-3">
                  {[
                    { char: "P", color: "var(--logo-green)" },
                    { char: "r", color: "var(--logo-blue)" },
                    { char: "a", color: "var(--logo-red)" },
                    { char: "d", color: "var(--logo-yellow)" },
                    { char: "o", color: "var(--logo-purple)" },
                    { char: "T", color: "var(--logo-green)" },
                    { char: "u", color: "var(--logo-orange)" },
                    { char: "b", color: "var(--logo-blue)" },
                    { char: "e", color: "var(--logo-red)" },
                  ].map((l, i) => (
                    <div key={i} className="flex flex-col items-center gap-1.5">
                      <div
                        className="size-8 rounded-lg"
                        style={{ background: l.color }}
                      />
                      <span className="text-xs font-bold text-muted-foreground font-heading">
                        {l.char}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Logo with icon */}
              <div className="flex items-center justify-center gap-3 pt-4 border-t border-border">
                <div className="size-10 rounded-xl bg-gradient-to-br from-primary to-[#89E219] flex items-center justify-center shadow-md">
                  <Tv className="size-5 text-white" />
                </div>
                <RainbowLogo className="text-2xl" />
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* ==================== COLORS ==================== */}
        <section className="space-y-8">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Palette className="size-5 text-primary" />
            </div>
            <div>
              <h3 className="font-heading text-2xl">Colors</h3>
              <p className="text-sm text-muted-foreground font-body">Bright green primary, saturated rainbow accents</p>
            </div>
          </div>

          {/* Core colors */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Core Palette
            </h4>
            <div className="flex flex-wrap gap-6">
              <ColorSwatch name="Background" cssVar="background" />
              <ColorSwatch name="Foreground" cssVar="foreground" />
              <ColorSwatch name="Primary" cssVar="primary" />
              <ColorSwatch name="Secondary" cssVar="secondary" />
              <ColorSwatch name="Muted" cssVar="muted" />
              <ColorSwatch name="Card" cssVar="card" />
              <ColorSwatch name="Border" cssVar="border" />
              <ColorSwatch name="Destructive" cssVar="destructive" />
            </div>
          </div>

          {/* Feature colors */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Feature Colors
            </h4>
            <p className="text-sm text-muted-foreground font-body">
              Cranked-up, fully saturated kid colors. Tags, categories, badges, gradients.
            </p>
            <div className="flex flex-wrap gap-6">
              <FeatureColorSwatch name="coral" cssVar="coral" />
              <FeatureColorSwatch name="teal" cssVar="teal" />
              <FeatureColorSwatch name="sky" cssVar="sky" />
              <FeatureColorSwatch name="sunflower" cssVar="sunflower" />
              <FeatureColorSwatch name="mint" cssVar="mint" />
              <FeatureColorSwatch name="lavender" cssVar="lavender" />
              <FeatureColorSwatch name="peach" cssVar="peach" />
            </div>
          </div>
        </section>

        <Separator />

        {/* ==================== TYPOGRAPHY ==================== */}
        <section className="space-y-8">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Type className="size-5 text-primary" />
            </div>
            <div>
              <h3 className="font-heading text-2xl">Typography</h3>
              <p className="text-sm text-muted-foreground font-body">
                Fredoka for headings, Nunito for everything else
              </p>
            </div>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            {/* Heading font */}
            <Card>
              <CardHeader>
                <CardDescription className="font-body">Display / Heading Font</CardDescription>
                <CardTitle className="font-heading text-3xl">Fredoka</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="font-heading text-5xl tracking-tight">Aa Bb Cc</p>
                <p className="font-heading text-3xl">The quick brown fox</p>
                <p className="font-heading text-xl text-primary">
                  jumps over the lazy dog
                </p>
                <p className="text-xs text-muted-foreground font-body">
                  Fredoka is a rounded, bubbly display font &mdash; friendly and playful
                  without being childish. Perfect for a kids&apos; app.
                </p>
              </CardContent>
            </Card>

            {/* Body font */}
            <Card>
              <CardHeader>
                <CardDescription className="font-body">Body / UI Font</CardDescription>
                <CardTitle className="font-body text-3xl font-bold">Nunito</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="font-body text-5xl font-bold tracking-tight">Aa Bb Cc</p>
                <p className="font-body text-3xl font-semibold">The quick brown fox</p>
                <p className="font-body text-xl font-light">jumps over the lazy dog</p>
                <p className="text-xs text-muted-foreground font-body">
                  Nunito is a rounded sans-serif &mdash; warm and approachable.
                  Highly readable at all sizes with soft, kid-friendly curves.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Type scale */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading">Type Scale</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-baseline gap-4">
                  <span className="text-xs text-muted-foreground w-16 shrink-0 font-bold">6xl</span>
                  <p className="font-heading text-6xl tracking-tight text-primary">PradoTube</p>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="text-xs text-muted-foreground w-16 shrink-0 font-bold">4xl</span>
                  <p className="font-heading text-4xl">Channel Curator</p>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="text-xs text-muted-foreground w-16 shrink-0 font-bold">2xl</span>
                  <p className="font-heading text-2xl">Section Heading</p>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="text-xs text-muted-foreground w-16 shrink-0 font-bold">xl</span>
                  <p className="text-xl font-body font-semibold">Card title or subtitle</p>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="text-xs text-muted-foreground w-16 shrink-0 font-bold">base</span>
                  <p className="text-base font-body">Body text — the primary reading size for content and descriptions.</p>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="text-xs text-muted-foreground w-16 shrink-0 font-bold">sm</span>
                  <p className="text-sm text-muted-foreground font-body">Secondary text, metadata, timestamps</p>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="text-xs text-muted-foreground w-16 shrink-0 font-bold">xs</span>
                  <p className="text-xs text-muted-foreground font-body">Captions, fine print, labels</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* ==================== COMPONENTS ==================== */}
        <section className="space-y-8">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Layers className="size-5 text-primary" />
            </div>
            <div>
              <h3 className="font-heading text-2xl">Components</h3>
              <p className="text-sm text-muted-foreground font-body">Buttons, inputs, badges, and cards</p>
            </div>
          </div>

          {/* Buttons */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading">Buttons</CardTitle>
              <CardDescription className="font-body">All button variants at default size</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <Button>
                  <Play className="size-4" /> Primary
                </Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Destructive</Button>
                <Button variant="link">Link</Button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="lg">
                  <Sparkles className="size-4" /> Large
                </Button>
                <Button size="default">Default</Button>
                <Button size="sm">Small</Button>
                <Button size="xs">Extra Small</Button>
                <Button size="icon">
                  <Heart className="size-4" />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled>Disabled</Button>
                <Button variant="outline" disabled>
                  Disabled Outline
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Inputs */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading">Inputs</CardTitle>
              <CardDescription className="font-body">Text inputs with various states</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-w-md">
              <Input placeholder="Search channels..." />
              <Input placeholder="@ChannelHandle" />
              <Input placeholder="Disabled input" disabled />
              <div className="flex gap-2">
                <Input placeholder="With button..." className="flex-1" />
                <Button>Go</Button>
              </div>
            </CardContent>
          </Card>

          {/* Badges */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading">Badges</CardTitle>
              <CardDescription className="font-body">For tags, categories, and status indicators</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>Default</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="outline">Outline</Badge>
                <Badge variant="destructive">Destructive</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge style={{ background: "var(--coral)", color: "#fff" }}>
                  Science
                </Badge>
                <Badge style={{ background: "var(--teal)", color: "#fff" }}>
                  Nature
                </Badge>
                <Badge style={{ background: "var(--sky)", color: "#fff" }}>
                  Education
                </Badge>
                <Badge style={{ background: "var(--sunflower)", color: "#1B1B1B" }}>
                  Comedy
                </Badge>
                <Badge style={{ background: "var(--mint)", color: "#fff" }}>
                  Gaming
                </Badge>
                <Badge style={{ background: "var(--lavender)", color: "#fff" }}>
                  Music
                </Badge>
                <Badge style={{ background: "var(--peach)", color: "#fff" }}>
                  Cooking
                </Badge>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* ==================== CARDS ==================== */}
        <section className="space-y-8">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Zap className="size-5 text-primary" />
            </div>
            <div>
              <h3 className="font-heading text-2xl">Cards</h3>
              <p className="text-sm text-muted-foreground font-body">Content containers for channels and videos</p>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <Card className="overflow-hidden group">
              <div className="h-24 bg-gradient-to-br from-[#58CC02] to-[#89E219]" />
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Star className="size-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Fun Science</p>
                    <p className="text-xs text-muted-foreground">@funscience</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground font-body">
                  Making science fun and accessible for curious minds aged 6-12.
                </p>
                <div className="flex gap-2 pt-1">
                  <Badge variant="secondary" className="text-xs">Science</Badge>
                  <Badge variant="secondary" className="text-xs">Education</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden group">
              <div className="h-24 bg-gradient-to-br from-sky to-teal" />
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="size-10 rounded-full bg-sky/10 flex items-center justify-center">
                    <Tv className="size-5 text-sky" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Story Adventures</p>
                    <p className="text-xs text-muted-foreground">@storyadventures</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground font-body">
                  Animated stories that spark imagination and teach life lessons.
                </p>
                <div className="flex gap-2 pt-1">
                  <Badge variant="secondary" className="text-xs">Stories</Badge>
                  <Badge variant="secondary" className="text-xs">Animation</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden group">
              <div className="h-24 bg-gradient-to-br from-lavender to-coral" />
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="size-10 rounded-full bg-lavender/10 flex items-center justify-center">
                    <Sparkles className="size-5 text-lavender" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Creative Lab</p>
                    <p className="text-xs text-muted-foreground">@creativelab</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground font-body">
                  Arts, crafts, and DIY projects kids can do at home.
                </p>
                <div className="flex gap-2 pt-1">
                  <Badge variant="secondary" className="text-xs">Arts</Badge>
                  <Badge variant="secondary" className="text-xs">DIY</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator />

        {/* ==================== THEME COMPARISON ==================== */}
        <section className="space-y-8">
          <div className="text-center space-y-2">
            <h3 className="font-heading text-3xl">Theme Comparison</h3>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto font-body">
              Side-by-side preview of both themes. Use the toggle in the header to switch live.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Light preview */}
            <div
              className="rounded-2xl overflow-hidden border-2 border-border"
              style={{
                background: "#FFFFFF",
                color: "#1B1B1B",
              }}
            >
              <div className="px-5 py-3 flex items-center gap-2 border-b" style={{ borderColor: "#E5E5E5" }}>
                <div className="flex gap-1.5">
                  <div className="size-2.5 rounded-full" style={{ background: "#58CC02" }} />
                  <div className="size-2.5 rounded-full" style={{ background: "#FFC800" }} />
                  <div className="size-2.5 rounded-full" style={{ background: "#FF4B4B" }} />
                </div>
                <span className="text-xs font-bold ml-2" style={{ color: "#777777" }}>
                  Light Theme &mdash; &quot;Playground&quot;
                </span>
              </div>
              <div className="p-5 space-y-4">
                <p className="font-heading text-2xl" style={{ color: "#1B1B1B" }}>
                  Good morning!
                </p>
                <p className="text-sm font-body" style={{ color: "#777777" }}>
                  Bright white canvas with bold, saturated colors. Playful, confident,
                  and unmistakably kid-friendly.
                </p>
                <div className="flex gap-2">
                  <span
                    className="px-3 py-1 rounded-full text-xs font-bold text-white"
                    style={{ background: "#58CC02" }}
                  >
                    Primary
                  </span>
                  <span
                    className="px-3 py-1 rounded-full text-xs font-bold text-white"
                    style={{ background: "#1CB0F6" }}
                  >
                    Sky
                  </span>
                  <span
                    className="px-3 py-1 rounded-full text-xs font-bold text-white"
                    style={{ background: "#FF4B4B" }}
                  >
                    Coral
                  </span>
                  <span
                    className="px-3 py-1 rounded-full text-xs font-bold"
                    style={{ background: "#FFC800", color: "#1B1B1B" }}
                  >
                    Sun
                  </span>
                </div>
              </div>
            </div>

            {/* Dark preview */}
            <div
              className="rounded-2xl overflow-hidden border-2"
              style={{
                background: "#131F24",
                color: "#F5F5F5",
                borderColor: "rgba(255, 255, 255, 0.12)",
              }}
            >
              <div
                className="px-5 py-3 flex items-center gap-2 border-b"
                style={{ borderColor: "rgba(255, 255, 255, 0.12)" }}
              >
                <div className="flex gap-1.5">
                  <div className="size-2.5 rounded-full" style={{ background: "#89E219" }} />
                  <div className="size-2.5 rounded-full" style={{ background: "#FFDD44" }} />
                  <div className="size-2.5 rounded-full" style={{ background: "#FF6B6B" }} />
                </div>
                <span className="text-xs font-bold ml-2" style={{ color: "#8BA4AF" }}>
                  Dark Theme &mdash; &quot;Movie Night&quot;
                </span>
              </div>
              <div className="p-5 space-y-4">
                <p
                  className="font-heading text-2xl"
                  style={{ color: "#F5F5F5" }}
                >
                  Good evening!
                </p>
                <p className="text-sm font-body" style={{ color: "#8BA4AF" }}>
                  Deep teal-charcoal with vivid neon accents. Bold and immersive &mdash;
                  movie night mode for the whole family.
                </p>
                <div className="flex gap-2">
                  <span
                    className="px-3 py-1 rounded-full text-xs font-bold"
                    style={{ background: "#89E219", color: "#131F24" }}
                  >
                    Primary
                  </span>
                  <span
                    className="px-3 py-1 rounded-full text-xs font-bold"
                    style={{ background: "#55CCFF", color: "#131F24" }}
                  >
                    Sky
                  </span>
                  <span
                    className="px-3 py-1 rounded-full text-xs font-bold"
                    style={{ background: "#FF6B6B", color: "#131F24" }}
                  >
                    Coral
                  </span>
                  <span
                    className="px-3 py-1 rounded-full text-xs font-bold"
                    style={{ background: "#FFDD44", color: "#131F24" }}
                  >
                    Sun
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center py-12 space-y-2">
          <p className="font-heading text-xl">
            That&apos;s the vibe.
          </p>
          <p className="text-sm text-muted-foreground font-body">
            Toggle between themes using the switcher in the top right.
          </p>
        </footer>
      </main>
    </div>
  );
}

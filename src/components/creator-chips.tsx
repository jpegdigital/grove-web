"use client";

import Image from "next/image";

interface CreatorChip {
  id: string;
  name: string;
  avatar: string;
}

interface CreatorChipsProps {
  creators: CreatorChip[];
  selectedCreatorId: string | null;
  onSelect: (creatorId: string | null) => void;
}

export function CreatorChips({
  creators,
  selectedCreatorId,
  onSelect,
}: CreatorChipsProps) {
  if (creators.length === 0) return null;

  return (
    <div className="flex gap-4 overflow-x-auto px-1.5 pt-1.5 pb-2 scrollbar-none">
      {/* "All" avatar */}
      <button
        onClick={() => onSelect(null)}
        className="flex shrink-0 flex-col items-center gap-1.5 group"
      >
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-full transition-all ${
            selectedCreatorId === null
              ? "bg-primary ring-[3px] ring-primary ring-offset-2 ring-offset-background"
              : "bg-secondary ring-1 ring-border/50 group-hover:ring-2 group-hover:ring-primary/40"
          }`}
        >
          <span
            className={`font-heading text-lg font-bold ${
              selectedCreatorId === null
                ? "text-primary-foreground"
                : "text-muted-foreground group-hover:text-foreground"
            }`}
          >
            All
          </span>
        </div>
        <span
          className={`max-w-16 truncate font-body text-[11px] leading-tight ${
            selectedCreatorId === null
              ? "font-semibold text-foreground"
              : "text-muted-foreground group-hover:text-foreground"
          }`}
        >
          All
        </span>
      </button>

      {creators.map((creator) => {
        const isActive = selectedCreatorId === creator.id;
        return (
          <button
            key={creator.id}
            onClick={() => onSelect(isActive ? null : creator.id)}
            className="flex shrink-0 flex-col items-center gap-1.5 group"
          >
            <div
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-full transition-all ${
                isActive
                  ? "ring-[3px] ring-primary ring-offset-2 ring-offset-background"
                  : "ring-1 ring-border/50 group-hover:ring-2 group-hover:ring-primary/40"
              }`}
            >
              {creator.avatar ? (
                <Image
                  src={creator.avatar}
                  alt={creator.name}
                  fill
                  className="object-cover"
                  sizes="64px"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                  <span className="text-base font-bold text-primary">
                    {creator.name.charAt(0)}
                  </span>
                </div>
              )}
            </div>
            <span
              className={`max-w-16 truncate font-body text-[11px] leading-tight ${
                isActive
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground group-hover:text-foreground"
              }`}
            >
              {creator.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

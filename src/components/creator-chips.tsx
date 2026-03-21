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
    <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-none">
      {/* "All" chip */}
      <button
        onClick={() => onSelect(null)}
        className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 font-body text-sm font-semibold transition-all ${
          selectedCreatorId === null
            ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
            : "bg-secondary text-muted-foreground ring-1 ring-border/50 hover:bg-secondary/80 hover:text-foreground"
        }`}
      >
        All
      </button>

      {creators.map((creator) => {
        const isActive = selectedCreatorId === creator.id;
        return (
          <button
            key={creator.id}
            onClick={() => onSelect(isActive ? null : creator.id)}
            className={`flex shrink-0 items-center gap-2 rounded-full pl-1.5 pr-4 py-1.5 font-body text-sm font-semibold transition-all ${
              isActive
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                : "bg-secondary text-muted-foreground ring-1 ring-border/50 hover:bg-secondary/80 hover:text-foreground"
            }`}
          >
            {/* Avatar */}
            <div
              className={`relative h-7 w-7 shrink-0 overflow-hidden rounded-full ${
                isActive
                  ? "ring-2 ring-primary-foreground/50"
                  : "ring-1 ring-border/40"
              }`}
            >
              {creator.avatar ? (
                <Image
                  src={creator.avatar}
                  alt={creator.name}
                  fill
                  className="object-cover"
                  sizes="28px"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                  <span className="text-[10px] font-bold text-primary">
                    {creator.name.charAt(0)}
                  </span>
                </div>
              )}
            </div>
            <span className="whitespace-nowrap">{creator.name}</span>
          </button>
        );
      })}
    </div>
  );
}

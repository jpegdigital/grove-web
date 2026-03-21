import Image from "next/image";
import Link from "next/link";

interface VideoCardProps {
  id: string;
  title: string;
  thumbnailUrl: string;
  thumbnailPath: string | null;
  creatorName: string;
  creatorAvatar: string;
  durationSeconds: number;
}

function formatDuration(seconds: number): string {
  if (!seconds) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const sPad = s.toString().padStart(2, "0");
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sPad}`;
  return `${m}:${sPad}`;
}

export function VideoCard({
  id,
  title,
  thumbnailUrl,
  thumbnailPath,
  creatorName,
  creatorAvatar,
  durationSeconds,
}: VideoCardProps) {
  // Prefer local thumbnail if available, fall back to YouTube CDN
  const thumb = thumbnailPath
    ? `/api/media/${thumbnailPath}`
    : thumbnailUrl;

  return (
    <Link
      href={`/v/${id}`}
      className="group flex flex-col gap-3 outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-2xl"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-secondary ring-1 ring-border/30 transition-all duration-300 group-hover:ring-border group-hover:shadow-xl group-hover:shadow-primary/8 group-hover:-translate-y-1">
        {thumb ? (
          <Image
            src={thumb}
            alt={title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-secondary to-muted">
            <span className="font-heading text-2xl text-muted-foreground/40">
              {title.charAt(0)}
            </span>
          </div>
        )}

        {/* Duration badge */}
        {durationSeconds > 0 && (
          <div className="absolute bottom-2 right-2 rounded-lg bg-black/75 px-2 py-0.5 font-body text-xs font-bold text-white tabular-nums backdrop-blur-sm">
            {formatDuration(durationSeconds)}
          </div>
        )}
      </div>

      {/* Info row */}
      <div className="flex gap-3 px-1">
        {/* Creator avatar */}
        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-secondary ring-1 ring-border/40">
          {creatorAvatar ? (
            <Image
              src={creatorAvatar}
              alt={creatorName}
              fill
              className="object-cover"
              sizes="36px"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
              <span className="font-heading text-xs text-primary">
                {creatorName.charAt(0)}
              </span>
            </div>
          )}
        </div>

        {/* Title + creator name */}
        <div className="min-w-0 flex-1">
          <h3 className="font-body text-sm font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
            {title}
          </h3>
          <p className="font-body text-xs text-muted-foreground mt-0.5 truncate">
            {creatorName}
          </p>
        </div>
      </div>
    </Link>
  );
}

"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Play, Pause } from "lucide-react";

// YouTube IFrame API player state constants
const YT_PAUSED = 2;
const YT_ENDED = 0;
const YT_PLAYING = 1;

// Extend Window for the YT API global
declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement | string,
        config: {
          videoId: string;
          playerVars?: Record<string, unknown>;
          events?: Record<string, (event: { data: number }) => void>;
        }
      ) => YTPlayer;
      PlayerState: {
        PLAYING: number;
        PAUSED: number;
        ENDED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  destroy: () => void;
  getPlayerState: () => number;
}

interface YouTubePlayerProps {
  videoId: string;
  title: string;
}

let apiLoaded = false;
let apiReady = false;
const readyCallbacks: (() => void)[] = [];

function ensureYTApi(cb: () => void) {
  if (apiReady && window.YT) {
    cb();
    return;
  }

  readyCallbacks.push(cb);

  if (!apiLoaded) {
    apiLoaded = true;
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      apiReady = true;
      readyCallbacks.forEach((fn) => fn());
      readyCallbacks.length = 0;
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  }
}

export function YouTubePlayer({ videoId, title }: YouTubePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);

  // Build/rebuild player when videoId changes
  useEffect(() => {
    let destroyed = false;

    function createPlayer() {
      if (destroyed || !containerRef.current) return;

      // Clear any previous player
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }

      // The API replaces this div with an iframe
      const el = document.createElement("div");
      el.id = `yt-player-${videoId}`;
      containerRef.current.innerHTML = "";
      containerRef.current.appendChild(el);

      playerRef.current = new window.YT!.Player(el.id, {
        videoId,
        playerVars: {
          autoplay: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onStateChange: (event: { data: number }) => {
            if (destroyed) return;
            if (event.data === YT_PAUSED || event.data === YT_ENDED) {
              setShowOverlay(true);
            } else if (event.data === YT_PLAYING) {
              setShowOverlay(false);
            }
          },
        },
      });
    }

    ensureYTApi(createPlayer);

    return () => {
      destroyed = true;
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [videoId]);

  const handleOverlayClick = useCallback(() => {
    if (playerRef.current) {
      const state = playerRef.current.getPlayerState();
      if (state === YT_ENDED) {
        // Replay from start — destroy and recreate
        playerRef.current.playVideo();
      } else {
        playerRef.current.playVideo();
      }
      setShowOverlay(false);
    }
  }, []);

  return (
    <div className="player-iframe">
      <div ref={containerRef} className="absolute inset-0 [&>iframe]:!w-full [&>iframe]:!h-full [&>iframe]:!border-0" />

      {/* Overlay that blocks YouTube recommendations when paused/ended */}
      {showOverlay && (
        <button
          onClick={handleOverlayClick}
          className="player-overlay"
          aria-label={title ? `Resume ${title}` : "Resume playback"}
        >
          <div className="player-overlay-icon">
            <Play className="h-10 w-10 text-white fill-white ml-1" />
          </div>
        </button>
      )}
    </div>
  );
}

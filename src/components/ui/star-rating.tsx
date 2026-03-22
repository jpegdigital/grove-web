"use client";

import { Star } from "lucide-react";
import { useCallback } from "react";

interface StarRatingProps {
  value: number; // 0–100
  onChange: (value: number) => void;
  size?: number;
  className?: string;
}

/**
 * Star rating control: 0–5 stars in half-star increments (0–100 in steps of 10).
 * Click on left half of star = half star, right half = full star.
 * Small numeric input shows and edits the raw 0–100 value.
 */
export function StarRating({
  value,
  onChange,
  size = 16,
  className = "",
}: StarRatingProps) {
  const stars = value / 20; // 0–5

  const handleStarClick = useCallback(
    (starIndex: number, isHalf: boolean) => {
      const newStars = isHalf ? starIndex + 0.5 : starIndex + 1;
      onChange(Math.round(newStars * 20));
    },
    [onChange]
  );

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span className="inline-flex">
        {[0, 1, 2, 3, 4].map((i) => {
          const filled = stars - i;
          return (
            <span
              key={i}
              className="relative cursor-pointer"
              style={{ width: size, height: size }}
            >
              {/* Background empty star */}
              <Star
                size={size}
                className="absolute inset-0 text-muted-foreground/30"
              />
              {/* Filled overlay */}
              {filled > 0 && (
                <span
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: filled >= 1 ? "100%" : "50%" }}
                >
                  <Star
                    size={size}
                    className="text-amber-400 fill-amber-400"
                  />
                </span>
              )}
              {/* Click targets: left half, right half */}
              <span
                className="absolute inset-0 w-1/2"
                onClick={() => handleStarClick(i, true)}
              />
              <span
                className="absolute inset-0 left-1/2 w-1/2"
                onClick={() => handleStarClick(i, false)}
              />
            </span>
          );
        })}
      </span>
      <input
        type="number"
        min={0}
        max={100}
        value={value}
        onChange={(e) => {
          const v = Math.min(100, Math.max(0, Number(e.target.value) || 0));
          onChange(v);
        }}
        className="w-10 h-5 text-xs text-center bg-transparent border border-border rounded tabular-nums"
      />
    </span>
  );
}

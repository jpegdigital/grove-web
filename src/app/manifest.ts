import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Grove — Curated YouTube for Kids",
    short_name: "Grove",
    description:
      "A parent-curated YouTube experience. Only the channels you trust, none of the slop.",
    start_url: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#5ACA31",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

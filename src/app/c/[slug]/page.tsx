"use client";

import { useParams } from "next/navigation";
import { FeedView } from "@/components/feed-view";

export default function CreatorFeedPage() {
  const { slug } = useParams<{ slug: string }>();
  return <FeedView creatorSlug={slug} />;
}

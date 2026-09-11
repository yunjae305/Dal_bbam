import type { Lang } from '@/shared/types';

/** Editable source values; absent media stays null instead of a display fallback. */
export type AdminShortItem = {
  id: string;
  contentId: string;
  lang: Lang;
  title: string;
  summary: string;
  narration: string;
  imageUrl: string | null;
  audioUrl: string | null;
  videoUrl: string | null;
  youtubeVideoId: string | null;
  durationSeconds: number;
  tags: string[];
  isPublished: boolean;
  isAiGenerated: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminShortPageMeta = {
  limit: number;
  offset: number;
  nextOffset: number | null;
  hasMore: boolean;
};

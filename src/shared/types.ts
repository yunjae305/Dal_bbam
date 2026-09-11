export const languages = ['ko', 'en', 'ja', 'zh'] as const;
export type Lang = (typeof languages)[number];

export const placeCategories = [
  'heritage',
  'attraction',
  'food',
  'lodging',
  'festival',
  'nature',
  'experience'
] as const;

export type PlaceCategory = (typeof placeCategories)[number];
export type Category = 'all' | PlaceCategory;
export type TransportMode = 'walking' | 'car' | 'public';

export type LocalizedText = Partial<Record<Lang, {
  name: string;
  description: string;
}>>;

export type PlaceSummary = {
  contentId: string;
  category: PlaceCategory;
  name: string;
  description: string;
  address: string;
  imageUrl: string;
  coordinates: [number, number];
  tags: string[];
  rating?: number;
  distanceMeters?: number;
  source: 'database' | 'tour-api' | 'sample';
};

export type PlaceDetail = PlaceSummary & {
  phone?: string;
  openingHours?: string;
  homepageUrl?: string;
  images: string[];
  reviewSummary?: string;
  overview: string;
  fetchedAt?: string;
};

/**
 * Existing screen model. New server APIs expose PlaceSummary/PlaceDetail, while
 * this shape keeps the current UI compatible during the App Router migration.
 */
export type Place = {
  id: string;
  contentId: string;
  category: PlaceCategory;
  name: string;
  description: string;
  address: string;
  distance: string;
  rating: number;
  bestTime: string;
  image: string;
  tags: string[];
  coordinates: [number, number];
  translations: LocalizedText;
  source?: PlaceSummary['source'];
};

export type Narration = {
  id: string;
  contentId: string;
  lang: Lang;
  title: string;
  summary: string;
  narration: string;
  tags: string[];
  isAiGenerated: boolean;
  audioUrl?: string;
  promptVersion: string;
};

export type ShortItem = {
  id: string;
  contentId: string;
  title: string;
  summary: string;
  narration: string;
  imageUrl: string;
  durationSeconds: number;
  tags: string[];
  liked: boolean;
  saved: boolean;
  likeCount: number;
  isAiGenerated: boolean;
  audioUrl?: string;
  videoUrl?: string;
  youtubeVideoId?: string;
};

export type CourseRequest = {
  purpose?: string;
  startTime?: string;
  days: number;
  companion: 'solo' | 'couple' | 'family' | 'friends' | 'group';
  interests: PlaceCategory[];
  pace: 'relaxed' | 'balanced' | 'packed';
  transport: TransportMode;
  lang: Lang;
};

export type CourseStop = {
  contentId: string;
  order: number;
  reason: string;
  stayMinutes: number;
  dayIndex?: number;
  startTime?: string;
  endTime?: string;
  travelMinutes?: number;
  distanceMeters?: number;
  travelPath?: [number, number][];
  place?: PlaceSummary;
};

export type CoursePlan = {
  id?: string;
  title: string;
  summary: string;
  stops: CourseStop[];
  transport: TransportMode;
  totalDistanceMeters: number;
  estimatedMinutes: number;
  generatedBy: 'openai' | 'fallback' | 'curated';
  days?: number;
  startTime?: string;
  timingSource?: 'map-provider' | 'estimated' | 'mixed';
  shareToken?: string;
};

export type Course = {
  id: string;
  persona: string;
  title: string;
  description: string;
  duration: string;
  transport: string;
  stops: string[];
  focus: string[];
};

export type ShortClip = {
  id: string;
  placeId: string;
  title: string;
  caption: string;
  duration: string;
  image: string;
  tags: string[];
  videoUrl?: string;
  youtubeVideoId?: string;
};

export type ScheduleItem = {
  id: string;
  contentId: string;
  visitDate: string;
  startTime?: string;
  stayMinutes: number;
  sortOrder: number;
  note?: string;
  place?: PlaceSummary;
};

export type Schedule = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  items: ScheduleItem[];
  shareToken?: string;
};

export type CartItem = {
  id: string;
  contentId: string;
  createdAt: string;
  place?: PlaceSummary;
};

export type StampProgress = {
  id: string;
  contentId: string;
  acquiredAt: string;
  place?: PlaceSummary;
};

export type Badge = {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  earnedAt?: string;
};

export type CommunityPost = {
  id: string;
  category: 'review' | 'tip' | 'food' | 'lodging';
  contentId?: string;
  placeName?: string;
  placeAddress?: string;
  placeCategory?: PlaceCategory;
  title: string;
  content: string;
  rating?: number;
  mediaUrls: string[];
  authorName: string;
  isOwner?: boolean;
  bookmarked: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CommunityComment = {
  id: string;
  authorName: string;
  content: string;
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ApiSuccess<T> = { data: T; meta?: Record<string, unknown> };
export type ApiFailure = { error: { code: string; message: string; details?: unknown } };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type MvpData = {
  overview: {
    name: string;
    headline: string;
    summary: string;
    region: string;
    mvpFeatures: string[];
    stack: string[];
  };
  places: Place[];
  courses: Course[];
  shorts: ShortClip[];
};

export type RecommendationRequest = Partial<CourseRequest> & {
  persona?: string;
};

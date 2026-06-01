export type Lang = 'ko' | 'en' | 'ja' | 'zh';

export type Category = '전체' | '문화재' | '음식점' | '숙박' | '축제';

export type Place = {
  id: string;
  category: Exclude<Category, '전체'>;
  name: string;
  description: string;
  address: string;
  distance: string;
  rating: number;
  bestTime: string;
  image: string;
  tags: string[];
  coordinates: [number, number];
  translations: Record<Exclude<Lang, 'ko'>, {
    name: string;
    description: string;
  }>;
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
};

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

export type RecommendationRequest = {
  interests?: string[];
  persona?: string;
};

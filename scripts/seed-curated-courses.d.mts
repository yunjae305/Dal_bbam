export type CuratedSeedStop = {
  patterns: string[];
  categories?: string[];
  reason: string;
  stayMinutes: number;
};

export type CuratedSeedCourse = {
  title: string;
  theme: string;
  description: string;
  transport: string;
  stops: CuratedSeedStop[];
};

export const curatedCourses: CuratedSeedCourse[];

export function seedCuratedCourses(options: {
  db?: unknown;
  url: string;
  secret: string;
  courses?: CuratedSeedCourse[];
  fetcher?: typeof fetch;
}): Promise<unknown>;

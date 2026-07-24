import { DirectPageShell } from '@/frontend/components/common/direct-page-shell';
import { AiCourseScreen } from '@/frontend/components/travel/ai-course-screen';
import { getTourMvpData } from '@/backend/tour-mvp-data';
import { getRequestLocale } from '@/backend/request-locale';

export default async function CoursesPage() {
  const data = await getTourMvpData(await getRequestLocale());
  return <DirectPageShell><div className="mx-auto max-w-[640px]"><AiCourseScreen places={data.places} /></div></DirectPageShell>;
}

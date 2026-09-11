import { getCurrentUser } from '@/backend/auth/current-user';
import { isAdminUser } from '@/backend/auth/admin';
import { getRequestLocale } from '@/backend/request-locale';
import { getTourMvpData } from '@/backend/tour-mvp-data';
import { DirectPageShell } from '@/frontend/components/common/direct-page-shell';
import { CuratedCourseEditor } from '@/frontend/components/travel/curated-course-editor';
import { plannerMessages } from '@/shared/planner-messages';

export default async function CourseAdminPage() {
  const lang = await getRequestLocale();
  if (!isAdminUser(await getCurrentUser())) {
    return <DirectPageShell><p role="alert" className="p-6 text-sm">{plannerMessages[lang].denied}</p></DirectPageShell>;
  }
  const data = await getTourMvpData(lang);
  return <DirectPageShell><CuratedCourseEditor places={data.places} /></DirectPageShell>;
}

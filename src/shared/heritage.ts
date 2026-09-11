export type HeritageRecord = {
  name: string;
  designation: string;
  designatedDate: string;
  era: string;
  address: string;
  description: string;
  source: 'korea-heritage-service';
  sourceUrl: string;
  fetchedAt: string;
  language: 'ko';
};

export const heritageMessages = {
  ko: { title: '국가유산청 공식 기록', original: '국문 원문', source: '국가유산청 출처 확인', era: '시대', date: '지정일' },
  en: { title: 'Official heritage record', original: 'Original Korean text', source: 'View Korea Heritage Service source', era: 'Period', date: 'Designation date' },
  ja: { title: '国家遺産庁の公式記録', original: '韓国語の原文', source: '国家遺産庁の出典を見る', era: '時代', date: '指定日' },
  zh: { title: '国家遗产厅官方记录', original: '韩文原文', source: '查看国家遗产厅来源', era: '时代', date: '指定日期' }
};

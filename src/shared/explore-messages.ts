import type { Lang } from '@/shared/types';

export const exploreMessages: Record<Lang, {
  detail: string; selectOnMap: string; popular: string; popularHint: string;
  offlinePlaces: string; offlineEmpty: string; offlineSaved: string;
}> = {
  ko: { detail: '상세 보기', selectOnMap: '{name} 지도에서 선택', popular: '지금 인기 있는 관광지', popularHint: '최근 7일 조회 기준 · 1분마다 갱신', offlinePlaces: '저장된 관광 정보', offlineEmpty: '아직 저장된 관광 정보가 없습니다. 연결 후 장소를 둘러보세요.', offlineSaved: '마지막으로 확인한 정보입니다. 운영 시간은 달라질 수 있습니다.' },
  en: { detail: 'View details', selectOnMap: 'Select {name} on map', popular: 'Popular places now', popularHint: 'Views in the past 7 days · updated every minute', offlinePlaces: 'Saved place information', offlineEmpty: 'No place information saved yet. Explore places when you are online.', offlineSaved: 'Information from your last visit. Opening hours may have changed.' },
  ja: { detail: '詳細を見る', selectOnMap: '地図で{name}を選択', popular: '今人気の観光地', popularHint: '過去7日間の閲覧数 · 1分ごとに更新', offlinePlaces: '保存済みの観光情報', offlineEmpty: '保存された観光情報はありません。接続後に観光地を見てみましょう。', offlineSaved: '最後に確認した情報です。営業時間は変わる場合があります。' },
  zh: { detail: '查看详情', selectOnMap: '在地图上选择{name}', popular: '当前热门景点', popularHint: '近7天浏览量 · 每分钟更新', offlinePlaces: '已保存的景点信息', offlineEmpty: '尚无保存的景点信息。联网后浏览景点即可保存。', offlineSaved: '这是上次查看的信息。开放时间可能已变更。' }
};

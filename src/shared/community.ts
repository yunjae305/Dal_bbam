import type { Lang } from '@/shared/types';

export const communityCopy = {
  ko: {
    region: '지역 검색', regionHint: '지역·읍·면·동 (예: 황남동)', placeCategory: '장소 종류', allPlaces: '모든 장소',
    place: '방문한 장소', choosePlace: '장소 선택', optionalPlace: '장소 연결 안 함', placeHint: '장소를 연결하면 지역별로 검색할 수 있어요.',
    placeRequired: '맛집·숙소 평가에는 방문한 장소와 별점이 필요해요.', placesFailed: '장소 목록을 불러오지 못했어요.',
    imageScanUnavailable: '사진의 개인정보·유해성 자동 검사를 사용할 수 없어요. 얼굴, 연락처, 신분증 등 개인정보가 보이지 않는 여행 사진만 올려 주세요.',
    stories: '지금, 문화재 이야기', storiesHint: '최근 7일간 공개된 방문자 사진으로 만든 스토리', storiesEmpty: '문화재 장소를 연결한 사진 후기를 남겨 첫 이야기를 만들어 보세요.',
    storiesFailed: '방문자 이야기를 불러오지 못했어요.', refresh: '새로고침', reviews: '여행자 리뷰', writeReview: '리뷰 작성', noReviews: '아직 리뷰가 없어요. 첫 방문 후기를 남겨 주세요.',
    reviewFailed: '리뷰를 불러오지 못했어요.', count: '{count}개 리뷰', points: '평균 {rating}점', storyPreparing: '사진으로 이야기 초안을 만들고 있어요.',
  },
  en: {
    region: 'Search area', regionHint: 'Area or district (e.g. 황남동)', placeCategory: 'Place category', allPlaces: 'All places',
    place: 'Place visited', choosePlace: 'Choose a place', optionalPlace: 'No linked place', placeHint: 'Link a place so travelers can find your post by area.',
    placeRequired: 'Restaurant and accommodation reviews need a place and a star rating.', placesFailed: 'Could not load places.',
    imageScanUnavailable: 'Automatic photo privacy and safety checks are unavailable. Only upload travel photos without visible faces, contact details, or identity documents.',
    stories: 'Heritage stories now', storiesHint: 'Stories from visitor photos published in the last 7 days', storiesEmpty: 'Share a photo review linked to a heritage site to start a story.',
    storiesFailed: 'Could not load visitor stories.', refresh: 'Refresh', reviews: 'Traveler reviews', writeReview: 'Write a review', noReviews: 'No reviews yet. Share your visit.',
    reviewFailed: 'Could not load reviews.', count: '{count} reviews', points: 'Average {rating} stars', storyPreparing: 'Creating a story draft from your photo.',
  },
  ja: {
    region: '地域を検索', regionHint: '地域・地区（例：황남동）', placeCategory: '場所の種類', allPlaces: 'すべての場所',
    place: '訪れた場所', choosePlace: '場所を選択', optionalPlace: '場所を指定しない', placeHint: '場所を指定すると地域別に検索できます。',
    placeRequired: '飲食店・宿泊施設のレビューには場所と星評価が必要です。', placesFailed: '場所を読み込めませんでした。',
    imageScanUnavailable: '写真の個人情報・安全性の自動検査を利用できません。顔、連絡先、身分証などが写っていない旅行写真だけを投稿してください。',
    stories: 'いま、文化遺産の物語', storiesHint: '過去7日間に公開された訪問者の写真ストーリー', storiesEmpty: '文化遺産の場所を指定した写真レビューで物語を始めましょう。',
    storiesFailed: '訪問者の物語を読み込めませんでした。', refresh: '更新', reviews: '旅行者のレビュー', writeReview: 'レビューを書く', noReviews: 'まだレビューがありません。訪問の感想を投稿しましょう。',
    reviewFailed: 'レビューを読み込めませんでした。', count: '{count}件のレビュー', points: '平均 {rating}点', storyPreparing: '写真からストーリーの下書きを作成しています。',
  },
  zh: {
    region: '搜索地区', regionHint: '地区或街区（例：황남동）', placeCategory: '地点类别', allPlaces: '所有地点',
    place: '到访地点', choosePlace: '选择地点', optionalPlace: '不关联地点', placeHint: '关联地点后，游客可以按地区找到您的帖子。',
    placeRequired: '餐厅和住宿评价需要选择地点及星级。', placesFailed: '无法加载地点。',
    imageScanUnavailable: '照片隐私和安全自动检查暂不可用。请仅上传不含人脸、联系方式或身份证件等个人信息的旅行照片。',
    stories: '此刻的文化遗产故事', storiesHint: '根据最近7天发布的游客照片生成的故事', storiesEmpty: '分享关联文化遗产地点的照片游记，开启第一个故事。',
    storiesFailed: '无法加载游客故事。', refresh: '刷新', reviews: '游客评价', writeReview: '撰写评价', noReviews: '暂无评价。分享您的到访体验吧。',
    reviewFailed: '无法加载评价。', count: '{count}条评价', points: '平均 {rating}星', storyPreparing: '正在根据照片生成故事草稿。',
  },
} satisfies Record<Lang, Record<string, string>>;

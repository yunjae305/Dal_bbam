import type { Lang } from './types';

type ShortsAdminMessages = {
  heading: string; description: string; denied: string; courses: string; newVideo: string;
  place: string; title: string; summary: string; language: string; videoUrl: string;
  videoHint: string; poster: string; posterHint: string; duration: string; tags: string;
  tagsHint: string; transcript: string; transcriptHint: string; saveDraft: string; save: string;
  saving: string; saved: string; failed: string; invalidVideo: string; invalidPoster: string;
  invalidTags: string; invalidFields: string; draft: string; published: string; publish: string;
  unpublish: string; publishedNotice: string; draftNotice: string; edit: string; preview: string;
  closePreview: string; previewHint: string; previewFailed: string; library: string; empty: string;
  loading: string; retry: string; loadMore: string; status: string; all: string; noPlaces: string;
  seconds: string; existingMediaHint: string;
};

export const shortsAdminMessages: Record<Lang, ShortsAdminMessages> = {
  ko: {
    existingMediaHint: '기존 영상은 영상 URL을 비우고 포스터와 대본을 유지할 수 있습니다. 기존 음성 파일은 그대로 보존됩니다.',
    heading: '문화유산 영상 관리', description: '미리 제작한 문화유산 캐릭터 소개나 짧은 해설 영상을 등록하세요. 새 영상은 초안으로 저장됩니다.',
    denied: '관리자만 접근할 수 있습니다.', courses: '추천 코스 관리', newVideo: '새 영상', place: '연결할 관광지', title: '영상 제목', summary: '영상 소개', language: '영상 언어',
    videoUrl: '영상 URL', videoHint: 'public/videos에 넣은 MP4는 /videos/파일명.mp4로 입력하세요. HTTPS MP4 주소나 YouTube 영상·Shorts URL도 사용할 수 있습니다.',
    poster: '포스터 URL (선택)', posterHint: '앱 내부 이미지 경로나 HTTPS 이미지 주소를 입력하세요.', duration: '영상 길이 (초)', tags: '태그', tagsHint: '쉼표로 구분해 최대 6개, 태그마다 30자까지 입력하세요.',
    transcript: '영상 대본 (선택)', transcriptHint: '완성된 영상의 대사나 해설을 입력하세요. 영상의 원래 소리가 재생됩니다.',
    saveDraft: '초안 저장', save: '변경 저장', saving: '저장 중…', saved: '영상이 저장되었습니다.', failed: '요청을 완료하지 못했습니다. 다시 시도해 주세요.', invalidVideo: '앱 내부 MP4 경로, HTTPS MP4 주소 또는 YouTube URL을 확인해 주세요.',
    invalidPoster: '포스터는 앱 내부 경로나 HTTPS 이미지 주소여야 합니다.', invalidTags: '태그는 최대 6개이며, 각각 30자 이하여야 합니다.', invalidFields: '관광지, 제목, 소개와 1~600초의 영상 길이를 확인해 주세요.',
    draft: '초안', published: '공개 중', publish: '공개', unpublish: '비공개로 전환', publishedNotice: '영상이 공개되었습니다.', draftNotice: '영상을 비공개 초안으로 전환했습니다.', edit: '편집', preview: '영상 미리보기', closePreview: '미리보기 닫기',
    previewHint: '미리보기를 누르면 영상 제공처의 콘텐츠를 불러옵니다.', previewFailed: '영상을 불러오지 못했습니다. 주소와 영상 제공처의 공개 설정을 확인해 주세요.', library: '등록된 영상', empty: '등록된 영상이 없습니다.', loading: '불러오는 중…', retry: '다시 불러오기', loadMore: '더 보기', status: '공개 상태', all: '전체', noPlaces: '등록 가능한 관광지가 없습니다.', seconds: '초'
  },
  en: {
    existingMediaHint: 'For an existing item, you can leave the video URL empty and keep its poster and transcript. Its existing audio file is preserved.',
    heading: 'Heritage video manager', description: 'Add a prepared heritage character introduction or short explainer video. New videos are saved as drafts.',
    denied: 'Administrator access is required.', courses: 'Curated course manager', newVideo: 'New video', place: 'Linked place', title: 'Video title', summary: 'Video introduction', language: 'Video language',
    videoUrl: 'Video URL', videoHint: 'For an MP4 in public/videos, enter /videos/filename.mp4. You can also use an HTTPS MP4 address or a YouTube video or Shorts URL.',
    poster: 'Poster URL (optional)', posterHint: 'Enter an image path within the app or an HTTPS image address.', duration: 'Video length (seconds)', tags: 'Tags', tagsHint: 'Separate up to 6 tags with commas, with no more than 30 characters per tag.',
    transcript: 'Video transcript (optional)', transcriptHint: 'Enter the dialogue or explanation from the finished video. The video plays its original audio.',
    saveDraft: 'Save draft', save: 'Save changes', saving: 'Saving…', saved: 'Video saved.', failed: 'The request could not be completed. Please try again.', invalidVideo: 'Check the local MP4 path, HTTPS MP4 address, or YouTube URL.',
    invalidPoster: 'Use an image path within the app or an HTTPS image address.', invalidTags: 'Use up to 6 tags, each no longer than 30 characters.', invalidFields: 'Check the place, title, introduction, and video length of 1–600 seconds.',
    draft: 'Draft', published: 'Published', publish: 'Publish', unpublish: 'Unpublish', publishedNotice: 'Video published.', draftNotice: 'Video changed to a private draft.', edit: 'Edit', preview: 'Preview video', closePreview: 'Close preview',
    previewHint: 'Preview loads content from the video provider.', previewFailed: 'Could not load the video. Check its address and the provider’s visibility settings.', library: 'Video library', empty: 'No videos have been added.', loading: 'Loading…', retry: 'Try again', loadMore: 'Load more', status: 'Publication status', all: 'All', noPlaces: 'No places are available.', seconds: 's'
  },
  ja: {
    existingMediaHint: '既存の項目は動画URLを空にして、ポスターと台本を残すこともできます。既存の音声ファイルは保持されます。',
    heading: '文化遺産動画の管理', description: '制作済みの文化遺産キャラクター紹介や短い解説動画を登録します。新しい動画は下書きとして保存されます。',
    denied: '管理者権限が必要です。', courses: 'おすすめコースの管理', newVideo: '新しい動画', place: '関連する観光地', title: '動画タイトル', summary: '動画の紹介', language: '動画の言語',
    videoUrl: '動画URL', videoHint: 'public/videosに置いたMP4は /videos/ファイル名.mp4 と入力してください。HTTPSのMP4アドレスやYouTube動画・ショートのURLも使用できます。',
    poster: 'ポスターURL（任意）', posterHint: 'アプリ内の画像パス、またはHTTPSの画像アドレスを入力してください。', duration: '動画の長さ（秒）', tags: 'タグ', tagsHint: 'カンマで区切って最大6個、各タグ30文字以内で入力してください。',
    transcript: '動画の台本（任意）', transcriptHint: '完成した動画のセリフや解説を入力してください。動画の元の音声が再生されます。',
    saveDraft: '下書きを保存', save: '変更を保存', saving: '保存中…', saved: '動画を保存しました。', failed: '処理を完了できませんでした。もう一度お試しください。', invalidVideo: 'アプリ内のMP4パス、HTTPSのMP4アドレス、またはYouTubeのURLを確認してください。',
    invalidPoster: 'アプリ内の画像パス、またはHTTPSの画像アドレスを使用してください。', invalidTags: 'タグは最大6個、各30文字以内で入力してください。', invalidFields: '観光地、タイトル、紹介文、1～600秒の動画の長さを確認してください。',
    draft: '下書き', published: '公開中', publish: '公開', unpublish: '非公開にする', publishedNotice: '動画を公開しました。', draftNotice: '動画を非公開の下書きに変更しました。', edit: '編集', preview: '動画をプレビュー', closePreview: 'プレビューを閉じる',
    previewHint: 'プレビューを押すと動画配信元のコンテンツを読み込みます。', previewFailed: '動画を読み込めませんでした。アドレスと配信元の公開設定を確認してください。', library: '登録済みの動画', empty: '登録済みの動画はありません。', loading: '読み込み中…', retry: '再読み込み', loadMore: 'もっと見る', status: '公開状態', all: 'すべて', noPlaces: '登録可能な観光地がありません。', seconds: '秒'
  },
  zh: {
    existingMediaHint: '编辑已有条目时，可以留空视频网址并保留封面和文稿。原有音频文件会保留。',
    heading: '文化遗产视频管理', description: '添加已制作的文化遗产角色介绍或简短讲解视频。新视频默认保存为草稿。',
    denied: '需要管理员权限。', courses: '精选路线管理', newVideo: '新建视频', place: '关联景点', title: '视频标题', summary: '视频介绍', language: '视频语言',
    videoUrl: '视频网址', videoHint: '放在 public/videos 中的MP4请填写 /videos/文件名.mp4。也支持HTTPS MP4地址及YouTube视频或Shorts网址。',
    poster: '封面网址（选填）', posterHint: '请输入应用内图片路径或HTTPS图片地址。', duration: '视频时长（秒）', tags: '标签', tagsHint: '用逗号分隔，最多6个标签，每个不超过30个字符。',
    transcript: '视频文稿（选填）', transcriptHint: '请输入成片中的台词或讲解。播放时使用视频原有音频。',
    saveDraft: '保存草稿', save: '保存修改', saving: '保存中…', saved: '视频已保存。', failed: '未能完成请求，请重试。', invalidVideo: '请检查应用内MP4路径、HTTPS MP4地址或YouTube网址。',
    invalidPoster: '请使用应用内图片路径或HTTPS图片地址。', invalidTags: '最多填写6个标签，每个不超过30个字符。', invalidFields: '请检查景点、标题、介绍及1至600秒的视频时长。',
    draft: '草稿', published: '已公开', publish: '公开', unpublish: '设为不公开', publishedNotice: '视频已公开。', draftNotice: '视频已设为私密草稿。', edit: '编辑', preview: '预览视频', closePreview: '关闭预览',
    previewHint: '点击预览后将加载视频提供方的内容。', previewFailed: '无法加载视频，请检查地址及提供方的公开设置。', library: '视频库', empty: '尚未添加视频。', loading: '加载中…', retry: '重新加载', loadMore: '加载更多', status: '公开状态', all: '全部', noPlaces: '暂无可关联的景点。', seconds: '秒'
  }
};

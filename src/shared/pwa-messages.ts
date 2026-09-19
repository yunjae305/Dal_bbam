import type { Lang } from '@/shared/types';

export const pwaMessages: Record<Lang, {
  title: string; description: string; install: string; installed: string; ios: string;
  manual: string; failed: string; offline: string; saved: string; update: string;
  updateHint: string; reload: string; later: string;
}> = {
  ko: {
    title: '달밤 앱 설치', description: '홈 화면에서 경주 여행을 바로 시작하세요. 설치와 기본 여행 기능은 무료입니다.',
    install: '홈 화면에 설치', installed: '앱이 설치되어 있습니다.',
    ios: 'Safari의 공유 버튼을 누른 뒤 “홈 화면에 추가”를 선택하세요.',
    manual: '브라우저 메뉴에서 “앱 설치” 또는 “홈 화면에 추가”를 선택하세요. 메뉴가 보이지 않으면 Chrome 또는 Safari에서 열어 주세요.',
    failed: '설치 창을 열지 못했습니다. 브라우저 메뉴에서 다시 시도해 주세요.',
    offline: '오프라인입니다. 저장·로그인·경로 조회에는 인터넷 연결이 필요합니다.', saved: '저장된 장소 보기',
    update: '새 버전이 준비되었습니다.', updateHint: '작성 중인 내용을 저장한 뒤 업데이트하세요.', reload: '업데이트', later: '나중에'
  },
  en: {
    title: 'Install Dal Bbam', description: 'Start your Gyeongju trip from your home screen. Installation and basic travel features are free.',
    install: 'Install app', installed: 'The app is installed.', ios: 'In Safari, tap Share, then “Add to Home Screen”.',
    manual: 'Choose “Install app” or “Add to Home Screen” in your browser menu. If unavailable, open in Chrome or Safari.',
    failed: 'Could not open installation. Try your browser menu.', offline: 'You are offline. Saving, sign-in and route searches need a connection.', saved: 'View saved places',
    update: 'An update is ready.', updateHint: 'Save your work before updating.', reload: 'Update', later: 'Later'
  },
  ja: {
    title: 'ダルバムをインストール', description: 'ホーム画面から慶州旅行を始めましょう。インストールと基本機能は無料です。',
    install: 'ホーム画面に追加', installed: 'アプリはインストール済みです。', ios: 'Safariの共有ボタンから「ホーム画面に追加」を選んでください。',
    manual: 'ブラウザのメニューで「アプリをインストール」または「ホーム画面に追加」を選択してください。表示されない場合はChromeかSafariで開いてください。',
    failed: 'インストールを開けませんでした。ブラウザのメニューからお試しください。', offline: 'オフラインです。保存・ログイン・経路検索には接続が必要です。', saved: '保存済みの場所を見る',
    update: '新しいバージョンがあります。', updateHint: '編集中の内容を保存してから更新してください。', reload: '更新', later: '後で'
  },
  zh: {
    title: '安装 Dal Bbam', description: '从主屏幕开始庆州之旅。安装和基本旅行功能免费。',
    install: '安装到主屏幕', installed: '应用已安装。', ios: '在 Safari 点击分享，然后选择“添加到主屏幕”。',
    manual: '在浏览器菜单中选择“安装应用”或“添加到主屏幕”。若无此选项，请使用 Chrome 或 Safari。',
    failed: '无法打开安装窗口，请从浏览器菜单重试。', offline: '当前离线。保存、登录和路线查询需要网络。', saved: '查看已保存地点',
    update: '有新版本可用。', updateHint: '请先保存编辑内容，再更新。', reload: '更新', later: '稍后'
  }
};

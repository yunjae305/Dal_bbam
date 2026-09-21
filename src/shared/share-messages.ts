import type { Lang } from '@/shared/types';

export const shareMessages = {
  ko: {
    title: '공유하기', close: '닫기', retry: '다른 앱으로 공유', copy: '링크 복사', link: '공유 링크',
    unsupported: '현재 브라우저에서는 앱 선택 공유창을 사용할 수 없어요. 휴대폰의 Chrome 또는 Safari에서 이 페이지를 직접 열어 공유해 주세요.',
    failed: '앱 선택 공유창을 열지 못했어요. 다시 시도하거나 링크를 복사해 원하는 앱에 붙여 넣어 주세요.',
    copied: '링크를 복사했어요. 원하는 앱에 붙여 넣어 주세요.',
    copyFailed: '자동 복사가 안 돼요. 아래 링크를 길게 눌러 복사해 주세요.'
  },
  en: {
    title: 'Share', close: 'Close', retry: 'Share to another app', copy: 'Copy link', link: 'Share link',
    unsupported: 'This browser cannot open the app sharing menu. Open this page directly in Chrome or Safari on your phone to share it.',
    failed: 'Could not open the app sharing menu. Try again or copy the link and paste it into your preferred app.',
    copied: 'Link copied. Paste it into your preferred app.',
    copyFailed: 'Automatic copying is unavailable. Press and hold the link below to copy it.'
  },
  ja: {
    title: '共有', close: '閉じる', retry: '他のアプリで共有', copy: 'リンクをコピー', link: '共有リンク',
    unsupported: 'このブラウザーではアプリの共有メニューを利用できません。スマートフォンのChromeまたはSafariでこのページを直接開いて共有してください。',
    failed: 'アプリの共有メニューを開けませんでした。再試行するか、リンクをコピーして他のアプリに貼り付けてください。',
    copied: 'リンクをコピーしました。他のアプリに貼り付けてください。',
    copyFailed: '自動コピーができません。下のリンクを長押ししてコピーしてください。'
  },
  zh: {
    title: '分享', close: '关闭', retry: '分享到其他应用', copy: '复制链接', link: '分享链接',
    unsupported: '当前浏览器无法打开应用分享菜单。请在手机的Chrome或Safari中直接打开此页面进行分享。',
    failed: '无法打开应用分享菜单。请重试，或复制链接并粘贴到其他应用。',
    copied: '链接已复制，请粘贴到其他应用。',
    copyFailed: '无法自动复制，请长按下方链接进行复制。'
  }
} satisfies Record<Lang, Record<string, string>>;

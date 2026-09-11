import type { Lang } from '@/shared/types';

export const SIGNUP_CONSENT_VERSION = 'signup-privacy-v1-2026-09-06';

export function hasSignupConsent(value: { termsAccepted?: unknown; privacyAccepted?: unknown; consentVersion?: unknown }): boolean {
  return value.termsAccepted === true && value.privacyAccepted === true && value.consentVersion === SIGNUP_CONSENT_VERSION;
}

export const signupConsentCopy = {
  ko: {
    title: '회원가입 필수 동의', terms: '[필수] 이용약관에 동의합니다.', privacy: '[필수] 개인정보 수집·이용에 동의합니다.',
    summary: '이름과 이메일을 계정 생성·관리에 이용하며 회원탈퇴 시까지 보관합니다. 필수 동의를 거부하면 회원가입을 진행할 수 없습니다. 위치정보 동의는 해당 기능을 사용할 때 별도로 요청합니다.',
    termsDetails: '이용약관 보기', privacyDetails: '개인정보 처리방침 보기', required: '이용약관과 개인정보 수집·이용에 동의해 주세요.'
  },
  en: {
    title: 'Required signup consent', terms: '[Required] I agree to the terms of service.', privacy: '[Required] I consent to the collection and use of my personal information.',
    summary: 'Your name and email are used to create and manage your account and kept until account deletion. You cannot sign up without required consent. Location consent is requested separately when you use a location feature.',
    termsDetails: 'Read terms of service', privacyDetails: 'Read privacy policy', required: 'Please agree to the terms and personal information collection and use.'
  },
  ja: {
    title: '会員登録に必要な同意', terms: '[必須] 利用規約に同意します。', privacy: '[必須] 個人情報の収集・利用に同意します。',
    summary: '氏名とメールアドレスはアカウントの作成・管理に利用し、退会まで保管します。必須の同意がない場合は登録できません。位置情報の同意は該当機能の利用時に別途確認します。',
    termsDetails: '利用規約を読む', privacyDetails: 'プライバシーポリシーを読む', required: '利用規約と個人情報の収集・利用に同意してください。'
  },
  zh: {
    title: '注册所需同意', terms: '[必选] 我同意服务条款。', privacy: '[必选] 我同意收集和使用个人信息。',
    summary: '姓名和电子邮箱用于创建和管理账户，并保留至注销账户。不同意必选事项将无法注册。使用位置功能时会另行征求位置权限同意。',
    termsDetails: '阅读服务条款', privacyDetails: '阅读隐私政策', required: '请同意服务条款及个人信息的收集和使用。'
  }
} satisfies Record<Lang, Record<string, string>>;

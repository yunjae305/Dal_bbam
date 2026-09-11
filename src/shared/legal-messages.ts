import type { Lang } from '@/shared/types';

export type LegalPolicy = 'terms' | 'privacy' | 'location';
export type LegalSection = { title: string; paragraphs?: string[]; items?: string[] };
type LegalDocument = { title: string; description: string; sections: LegalSection[] };

export const legalShell = {
  ko: { back: '← 달밤으로 돌아가기', operator: '운영자', contact: '문의', effective: '시행일', missing: '환경설정 필요', unconfigured: '운영자·담당자·시행일이 아직 설정되지 않아 이 문서는 배포 준비 상태가 아닙니다.', footer: '서비스 기능이나 처리 방식이 변경되면 문서를 개정하고 시행일 전에 알립니다. 상용 배포 전 대한민국 법률 전문가의 최종 검토가 필요합니다.' },
  en: { back: '← Back to Dal Bbam', operator: 'Operator', contact: 'Contact', effective: 'Effective date', missing: 'Configuration required', unconfigured: 'The operator, contact, and effective date have not yet been configured, so this document is not ready for deployment.', footer: 'If service features or processing practices change, we will revise this document and provide notice before its effective date. Final review by a legal professional in South Korea is required before commercial deployment.' },
  ja: { back: '← ダルバムに戻る', operator: '運営者', contact: 'お問い合わせ', effective: '施行日', missing: '設定が必要です', unconfigured: '運営者・担当者・施行日がまだ設定されていないため、この文書は公開準備が整っていません。', footer: 'サービスの機能や処理方法が変わる場合は文書を改定し、施行日前にお知らせします。商用公開前に、大韓民国の法律専門家による最終確認が必要です。' },
  zh: { back: '← 返回月夜', operator: '运营方', contact: '联系方式', effective: '生效日期', missing: '需要配置', unconfigured: '运营方、负责人和生效日期尚未配置，因此本文件尚未准备好部署。', footer: '服务功能或处理方式变更时，我们会修订本文件并在生效日期前告知。商业部署前须由韩国法律专业人士进行最终审查。' }
} satisfies Record<Lang, Record<string, string>>;

export const legalDocuments: Record<Lang, Record<LegalPolicy, LegalDocument>> = {
  ko: {
    terms: {
      title: '서비스 이용약관', description: '달밤의 관광 정보, 일정, 커뮤니티, AI 콘텐츠 및 스탬프 기능 이용 조건입니다.',
      sections: [
        { title: '1. 목적과 적용', paragraphs: ['이 약관은 운영자가 제공하는 달밤 웹·PWA 서비스의 이용 조건과 이용자 및 운영자의 권리·의무를 정합니다.'] },
        { title: '2. 계정과 보안', items: ['이용자는 정확한 정보를 제공하고 계정 접근 수단을 안전하게 관리해야 합니다.', '계정 공유, 타인 사칭, 비정상 자동 호출 및 서비스 보안 우회는 금지됩니다.', '이용자는 설정 화면에서 계정과 서비스 데이터를 삭제할 수 있습니다.'] },
        { title: '3. 관광·지도 정보', paragraphs: ['관광지 운영 시간, 요금, 경로와 교통 정보는 공공데이터 및 외부 제공자 정보에 기초하며 현장 상황에 따라 달라질 수 있습니다. 중요한 일정은 해당 시설과 교통 제공자에게 다시 확인해야 합니다.'] },
        { title: '4. AI 생성 콘텐츠', paragraphs: ['AI 해설, 코스, 음성과 스탬프 아트에는 생성 사실을 표시합니다. AI 결과는 오류가 있을 수 있으며 역사·안전·의료·법률 판단의 유일한 근거로 사용할 수 없습니다.'] },
        { title: '5. 커뮤니티 콘텐츠', items: ['이용자는 게시 권한이 있는 글과 이미지만 올려야 하며 개인정보, 불법·유해 콘텐츠, 권리 침해물을 게시할 수 없습니다.', '운영자는 신고 또는 자동 검사를 통해 게시물을 제한·숨김·삭제할 수 있고 필요한 경우 계정 이용을 제한할 수 있습니다.', '게시물의 권리는 작성자에게 남으며, 작성자는 서비스 표시와 운영에 필요한 범위의 비독점적 이용을 허락합니다.'] },
        { title: '6. 스탬프와 보상', paragraphs: ['GPS 및 현장 확인을 조작하거나 자동화해 스탬프 또는 보상을 취득할 수 없습니다. 부정 취득이 확인되면 스탬프와 보상을 취소할 수 있습니다.'] },
        { title: '7. 서비스 변경과 책임', paragraphs: ['점검, 제공자 장애, 법령 또는 정책 변경으로 기능이 변경·중단될 수 있습니다. 운영자는 고의 또는 중대한 과실이 없는 한 외부 데이터 오류나 이용자 선택으로 발생한 간접 손해를 법령이 허용하는 범위에서 책임지지 않습니다.'] },
        { title: '8. 준거법과 분쟁', paragraphs: ['대한민국 법을 따르며 분쟁은 관계 법령상 관할 법원에서 해결합니다. 소비자에게 강행 적용되는 권리는 이 약관으로 제한되지 않습니다.'] }
      ]
    },
    privacy: {
      title: '개인정보처리방침', description: '달밤이 처리하는 계정, 서비스 이용, 위치 동의 및 커뮤니티 정보를 설명합니다.',
      sections: [
        { title: '1. 처리하는 정보', items: ['필수: 이메일 또는 소셜 로그인 식별자, 표시 이름, 인증·보안 세션 정보', '서비스 이용: 일정, 장바구니, 스탬프, 북마크, 게시물, 댓글, 신고와 차단 기록', '선택: 위치 이용 동의, 스탬프 확인 시 정확도와 관광지까지의 계산된 거리', '업로드: 재인코딩한 이미지와 파일 크기·형식. 공개 전 EXIF 및 GPS 메타데이터는 제거합니다.', '보안·운영: 요청 시각, 제한 횟수, 오류 식별 정보. 원문 비밀번호는 저장하지 않습니다.'] },
        { title: '2. 이용 목적', items: ['회원 인증과 계정 보호', '여행 일정·추천·스탬프·커뮤니티 제공', '불법·유해·개인정보 콘텐츠 탐지와 신고 처리', '오류 대응, 부정 이용 방지, 품질 및 성능 개선'] },
        { title: '3. 보유 기간', items: ['계정 및 이용 데이터: 회원탈퇴 시까지. 법령상 보존 의무가 있으면 해당 기간 동안 분리 보관', '스테이징 업로드: 완료되지 않으면 원칙적으로 1시간 후 만료 처리', 'API 요청 제한 기록: 원칙적으로 2일 이내', '신고 처리 기록: 분쟁 대응 및 안전 운영에 필요한 최소 기간 후 삭제'] },
        { title: '4. 외부 처리와 제공', paragraphs: ['서비스 제공을 위해 Supabase(인증·데이터·파일), OpenAI(AI 생성·안전 검사), Kakao(로그인·지도·경로), 한국관광공사 TourAPI(관광 정보), YouTube 또는 영상 호스팅 제공자를 사용할 수 있습니다. 각 제공자에게는 해당 기능 수행에 필요한 최소 정보만 전달하며 API 키와 계약 설정에 따라 처리합니다. 법령상 요구가 있거나 이용자가 동의한 경우를 제외하고 개인정보를 판매하지 않습니다.'] },
        { title: '5. 위치정보와 이미지', paragraphs: ['브라우저 위치 권한은 별도로 동의받습니다. 원시 위도·경도 이력은 저장하지 않고 스탬프 판정에 필요한 정확도와 계산 거리만 보관합니다. 업로드 이미지는 방향을 바로잡고 안전한 형식으로 재인코딩해 카메라·GPS 메타데이터를 제거합니다.'] },
        { title: '6. 이용자의 권리', items: ['설정에서 본인 정보를 확인하고 계정과 서비스 데이터를 삭제할 수 있습니다.', '위치 권한은 브라우저 또는 운영체제 설정에서 언제든 철회할 수 있습니다.', '게시물·댓글은 제공되는 수정·삭제 기능으로 관리할 수 있으며, 추가 요청은 개인정보 문의 주소로 접수할 수 있습니다.'] },
        { title: '7. 안전 조치', items: ['전송 구간 암호화, HttpOnly·Secure 세션 쿠키, 세션 만료·폐기', '서비스 역할 키의 서버 전용 보관과 API 요청 제한', '업로드 형식·크기·실제 파일 서명 검사와 메타데이터 제거', '접근 권한 최소화, 오류 및 보안 이벤트 점검'] },
        { title: '8. 문의와 구제', paragraphs: ['개인정보 열람·정정·삭제·처리정지 및 침해 신고는 위 문의 주소로 접수할 수 있습니다. 관계 기관을 통한 상담과 구제 절차도 이용할 수 있습니다.'] }
      ]
    },
    location: {
      title: '위치기반서비스 이용약관', description: '현재 위치 주변 탐색과 관광지 스탬프 확인을 위한 위치정보 이용 조건입니다.',
      sections: [
        { title: '1. 서비스 내용', items: ['현재 위치를 지도에 표시하고 주변 관광지를 검색합니다.', '선택한 관광지까지의 경로를 외부 지도 제공자를 통해 조회합니다.', '관광지 반경과 위치 정확도를 확인해 방문 스탬프를 발급합니다.'] },
        { title: '2. 동의와 철회', paragraphs: ['위치 기능을 처음 사용할 때 목적과 저장 범위를 알리고 별도 동의를 받습니다. 동의하지 않아도 수동 지도 탐색 등 위치가 필요 없는 기능을 이용할 수 있습니다. 브라우저·운영체제 설정 또는 서비스 내 동의 철회로 언제든 중단할 수 있습니다.'] },
        { title: '3. 보유와 보호', paragraphs: ['현재 위치는 요청 처리 중에만 사용하며 원시 위도·경도 이력은 저장하지 않습니다. 스탬프 부정 이용 방지와 이의 처리에 필요한 정확도, 관광지까지의 계산 거리, 확인 시각만 최소한으로 보관합니다.'] },
        { title: '4. 제3자 서비스', paragraphs: ['지도 표시와 경로 계산에는 Kakao 지도 서비스를 사용하며, 경로 요청 시 출발지와 목적지 좌표가 Kakao API로 전달될 수 있습니다. 상세 길안내를 선택하면 카카오맵 앱 또는 웹으로 이동합니다.'] },
        { title: '5. 이용자 의무와 안전', paragraphs: ['운전 또는 이동 중 화면 조작을 피하고 현장 표지와 안전 지침을 우선해야 합니다. 좌표·현장 코드를 조작해 스탬프나 보상을 부정 취득할 수 없습니다.'] },
        { title: '6. 손해배상과 분쟁', paragraphs: ['운영자 또는 이용자의 귀책으로 손해가 발생한 경우 관계 법령에 따릅니다. 위치정보 이용과 관련한 문의·이의는 위 연락처로 접수할 수 있습니다.'] }
      ]
    }
  },
  en: {
    terms: {
      title: 'Terms of Service', description: 'Conditions for using Dal Bbam tourism information, schedules, community, AI content, and stamps.',
      sections: [
        { title: '1. Purpose and application', paragraphs: ['These terms set out the conditions for using the Dal Bbam web and PWA service provided by the operator, and the rights and obligations of users and the operator.'] },
        { title: '2. Accounts and security', items: ['Users must provide accurate information and securely manage their account access credentials.', 'Account sharing, impersonation, abnormal automated requests, and bypassing service security are prohibited.', 'Users can delete their account and service data from Settings.'] },
        { title: '3. Tourism and map information', paragraphs: ['Opening hours, fees, routes, and transport information are based on public data and external providers and may vary with local conditions. Important travel plans should be checked again with the relevant facility and transport provider.'] },
        { title: '4. AI-generated content', paragraphs: ['AI narration, courses, voices, and stamp artwork are identified as generated content. AI results may contain errors and must not be the sole basis for historical, safety, medical, or legal judgments.'] },
        { title: '5. Community content', items: ['Users may upload only text and images they have the right to publish, and must not post personal information, illegal or harmful content, or material that infringes rights.', 'The operator may restrict, hide, or delete posts based on reports or automated checks, and may restrict account use when necessary.', 'Rights to posts remain with their authors. Authors grant a non-exclusive right to use them to the extent needed to display and operate the service.'] },
        { title: '6. Stamps and rewards', paragraphs: ['Stamps or rewards must not be obtained by manipulating or automating GPS or on-site verification. Stamps and rewards may be revoked if improper acquisition is confirmed.'] },
        { title: '7. Service changes and liability', paragraphs: ['Features may change or stop because of maintenance, provider outages, or changes in laws or policies. In the absence of intent or gross negligence, the operator is not liable, to the extent permitted by law, for indirect damage arising from external data errors or user choices.'] },
        { title: '8. Governing law and disputes', paragraphs: ['The laws of the Republic of Korea apply, and disputes are resolved in the courts with jurisdiction under applicable laws. These terms do not limit mandatory consumer rights.'] }
      ]
    },
    privacy: {
      title: 'Privacy Policy', description: 'This policy explains the account, service usage, location consent, and community information processed by Dal Bbam.',
      sections: [
        { title: '1. Information processed', items: ['Required: email or social login identifier, display name, and authentication and security session information.', 'Service usage: schedules, cart, stamps, bookmarks, posts, comments, reports, and blocking records.', 'Optional: location consent and, during stamp verification, accuracy and the calculated distance to the attraction.', 'Uploads: re-encoded images and file size and format. EXIF and GPS metadata are removed before publication.', 'Security and operations: request times, limit counters, and error identifiers. Plaintext passwords are not stored.'] },
        { title: '2. Purposes of use', items: ['Member authentication and account protection.', 'Providing travel schedules, recommendations, stamps, and community features.', 'Detecting illegal or harmful content and content containing personal information, and handling reports.', 'Responding to errors, preventing misuse, and improving quality and performance.'] },
        { title: '3. Retention periods', items: ['Account and usage data: until account deletion. Where retention is required by law, data is stored separately for the required period.', 'Staged uploads: incomplete uploads generally expire after one hour.', 'API rate-limit records: generally no longer than two days.', 'Report handling records: deleted after the minimum period necessary for dispute handling and safe operation.'] },
        { title: '4. External processing and disclosure', paragraphs: ['To provide the service, we may use Supabase (authentication, data, and files), OpenAI (AI generation and safety checks), Kakao (login, maps, and routes), Korea Tourism Organization TourAPI (tourism information), YouTube, or video hosting providers. Only the minimum information needed for each function is sent to each provider and processed according to API key and contractual settings. We do not sell personal information except where required by law or where the user has consented.'] },
        { title: '5. Location information and images', paragraphs: ['Browser location permission is requested separately. We do not store a history of raw latitude and longitude; only the accuracy and calculated distance needed for stamp verification are retained. Uploaded images are reoriented and re-encoded into a safe format to remove camera and GPS metadata.'] },
        { title: '6. User rights', items: ['You can view your information and delete your account and service data in Settings.', 'Location permission can be withdrawn at any time in browser or operating system settings.', 'Posts and comments can be managed using the provided editing and deletion features. Additional requests can be sent to the privacy contact address.'] },
        { title: '7. Safeguards', items: ['Encryption in transit, HttpOnly and Secure session cookies, and session expiry and revocation.', 'Server-only storage of service-role keys and API rate limits.', 'Checks of upload format, size, and actual file signatures, and metadata removal.', 'Minimized access privileges and monitoring of errors and security events.'] },
        { title: '8. Inquiries and remedies', paragraphs: ['Requests to access, correct, delete, or stop processing personal information, and reports of privacy violations, can be sent to the contact address above. Consultation and remedy procedures through relevant authorities are also available.'] }
      ]
    },
    location: {
      title: 'Location-Based Service Terms', description: 'Conditions for using location information to explore nearby places and verify attraction stamps.',
      sections: [
        { title: '1. Service features', items: ['Show your current location on the map and search for nearby attractions.', 'Request routes to a selected attraction through an external map provider.', 'Issue visit stamps after checking the attraction radius and location accuracy.'] },
        { title: '2. Consent and withdrawal', paragraphs: ['When you first use a location feature, we explain its purpose and the scope of storage and request separate consent. Without consent, you can still use features that do not require location, such as manual map browsing. You can stop location use at any time through browser or operating system settings or by withdrawing consent within the service.'] },
        { title: '3. Retention and protection', paragraphs: ['Your current location is used only while processing a request, and no history of raw latitude and longitude is stored. Only the minimum accuracy, calculated distance to the attraction, and verification time needed to prevent stamp misuse and handle objections are retained.'] },
        { title: '4. Third-party services', paragraphs: ['Kakao map services are used for map display and route calculation. When a route is requested, the departure and destination coordinates may be sent to the Kakao API. Selecting detailed directions opens the KakaoMap app or website.'] },
        { title: '5. User responsibilities and safety', paragraphs: ['Avoid operating the screen while driving or moving, and prioritize on-site signs and safety instructions. Coordinates or on-site codes must not be manipulated to improperly obtain stamps or rewards.'] },
        { title: '6. Damages and disputes', paragraphs: ['Applicable laws govern damage attributable to the operator or a user. Inquiries and objections concerning location information use can be sent to the contact address above.'] }
      ]
    }
  },
  ja: {
    terms: {
      title: 'サービス利用規約', description: 'ダルバムの観光情報、旅程、コミュニティ、AIコンテンツ、スタンプ機能の利用条件です。',
      sections: [
        { title: '1. 目的と適用', paragraphs: ['本規約は、運営者が提供するダルバムのウェブ・PWAサービスの利用条件、および利用者と運営者の権利・義務を定めます。'] },
        { title: '2. アカウントとセキュリティ', items: ['利用者は正確な情報を提供し、アカウントへのアクセス手段を安全に管理する必要があります。', 'アカウントの共有、なりすまし、異常な自動リクエスト、サービスのセキュリティの回避は禁止されています。', '利用者は設定画面からアカウントとサービスのデータを削除できます。'] },
        { title: '3. 観光・地図情報', paragraphs: ['観光施設の営業時間、料金、経路、交通情報は公開データと外部提供者の情報に基づいており、現地の状況によって異なる場合があります。重要な旅程については、該当施設や交通事業者に再確認してください。'] },
        { title: '4. AI生成コンテンツ', paragraphs: ['AI解説、コース、音声、スタンプアートには、生成されたものであることを表示します。AIの結果には誤りが含まれる場合があり、歴史・安全・医療・法律に関する判断の唯一の根拠として使用できません。'] },
        { title: '5. コミュニティコンテンツ', items: ['利用者は投稿する権利を持つ文章と画像のみを投稿し、個人情報、違法・有害なコンテンツ、権利を侵害するものを投稿してはいけません。', '運営者は通報または自動検査により投稿を制限・非表示・削除でき、必要に応じてアカウントの利用を制限できます。', '投稿の権利は投稿者に帰属し、投稿者はサービスの表示と運営に必要な範囲で非独占的な利用を許諾します。'] },
        { title: '6. スタンプと報酬', paragraphs: ['GPSや現地確認を操作または自動化してスタンプや報酬を取得してはいけません。不正取得が確認された場合、スタンプと報酬を取り消すことがあります。'] },
        { title: '7. サービスの変更と責任', paragraphs: ['保守点検、提供者の障害、法令や方針の変更により、機能が変更・中断されることがあります。運営者に故意または重大な過失がない限り、外部データの誤りや利用者の選択により生じた間接的な損害について、法令が認める範囲で責任を負いません。'] },
        { title: '8. 準拠法と紛争', paragraphs: ['大韓民国の法律に従い、紛争は関係法令に基づく管轄裁判所で解決します。消費者に強行的に適用される権利は、本規約によって制限されません。'] }
      ]
    },
    privacy: {
      title: 'プライバシーポリシー', description: 'ダルバムが処理するアカウント、サービス利用、位置情報の同意、コミュニティの情報について説明します。',
      sections: [
        { title: '1. 処理する情報', items: ['必須：メールアドレスまたはソーシャルログイン識別子、表示名、認証・セキュリティセッション情報', 'サービス利用：旅程、カート、スタンプ、ブックマーク、投稿、コメント、通報・ブロック記録', '任意：位置情報の利用同意、スタンプ確認時の精度と観光地までの計算距離', 'アップロード：再エンコードした画像とファイルのサイズ・形式。公開前にEXIFおよびGPSメタデータを削除します。', 'セキュリティ・運営：リクエスト時刻、制限回数、エラー識別情報。平文のパスワードは保存しません。'] },
        { title: '2. 利用目的', items: ['会員認証とアカウント保護', '旅程・おすすめ・スタンプ・コミュニティの提供', '違法・有害なコンテンツおよび個人情報を含むコンテンツの検出と通報対応', 'エラー対応、不正利用防止、品質・性能の改善'] },
        { title: '3. 保管期間', items: ['アカウントと利用データ：退会まで。法令上の保存義務がある場合は、該当期間、分離して保管します。', '一時アップロード：未完了の場合、原則として1時間後に期限切れとして処理します。', 'APIリクエスト制限記録：原則として2日以内', '通報対応記録：紛争対応と安全な運営に必要な最短期間の経過後に削除します。'] },
        { title: '4. 外部での処理と提供', paragraphs: ['サービス提供のため、Supabase（認証・データ・ファイル）、OpenAI（AI生成・安全検査）、Kakao（ログイン・地図・経路）、韓国観光公社TourAPI（観光情報）、YouTubeまたは動画ホスティング提供者を利用する場合があります。各提供者には該当機能に必要な最小限の情報のみを渡し、APIキーと契約上の設定に従って処理します。法令で要求される場合または利用者が同意した場合を除き、個人情報を販売しません。'] },
        { title: '5. 位置情報と画像', paragraphs: ['ブラウザーの位置情報権限は別途同意を得ます。生の緯度・経度の履歴は保存せず、スタンプ判定に必要な精度と計算距離のみを保管します。アップロード画像は向きを補正し、安全な形式に再エンコードしてカメラ・GPSメタデータを削除します。'] },
        { title: '6. 利用者の権利', items: ['設定から本人の情報を確認し、アカウントとサービスのデータを削除できます。', '位置情報権限は、ブラウザーまたはOSの設定からいつでも取り消せます。', '投稿・コメントは提供される編集・削除機能で管理でき、追加のご要望は個人情報の問い合わせ先に送ることができます。'] },
        { title: '7. 安全対策', items: ['通信の暗号化、HttpOnly・Secureセッションクッキー、セッションの期限切れ・失効', 'サービスロールキーのサーバー専用保管とAPIリクエスト制限', 'アップロードの形式・サイズ・実際のファイルシグネチャの検査とメタデータ削除', 'アクセス権限の最小化、エラーとセキュリティイベントの点検'] },
        { title: '8. お問い合わせと救済', paragraphs: ['個人情報の閲覧・訂正・削除・処理停止、および侵害の通報は、上記の問い合わせ先で受け付けます。関係機関による相談・救済手続きも利用できます。'] }
      ]
    },
    location: {
      title: '位置情報サービス利用規約', description: '現在地周辺の探索と観光地のスタンプ確認のための位置情報の利用条件です。',
      sections: [
        { title: '1. サービス内容', items: ['現在地を地図に表示し、周辺の観光地を検索します。', '選択した観光地までの経路を外部の地図提供者を通じて照会します。', '観光地の半径と位置精度を確認して訪問スタンプを発行します。'] },
        { title: '2. 同意と撤回', paragraphs: ['位置機能を初めて使う際に、目的と保存範囲を説明して別途同意を得ます。同意しなくても、手動の地図探索など位置情報が不要な機能を利用できます。ブラウザー・OSの設定、またはサービス内での同意撤回により、いつでも利用を停止できます。'] },
        { title: '3. 保管と保護', paragraphs: ['現在地はリクエスト処理中のみ使用し、生の緯度・経度の履歴は保存しません。スタンプの不正利用防止と異議対応に必要な精度、観光地までの計算距離、確認時刻のみを最小限保管します。'] },
        { title: '4. 第三者サービス', paragraphs: ['地図表示と経路計算にはKakao地図サービスを使用し、経路をリクエストする際に出発地と目的地の座標がKakao APIに送信される場合があります。詳細な道案内を選択すると、カカオマップのアプリまたはウェブに移動します。'] },
        { title: '5. 利用者の義務と安全', paragraphs: ['運転中や移動中の画面操作を避け、現地の標識と安全指示を優先してください。座標や現地コードを操作して、スタンプや報酬を不正に取得してはいけません。'] },
        { title: '6. 損害賠償と紛争', paragraphs: ['運営者または利用者の責任により損害が生じた場合は、関係法令に従います。位置情報の利用に関するお問い合わせ・異議は、上記の連絡先で受け付けます。'] }
      ]
    }
  },
  zh: {
    terms: {
      title: '服务条款', description: '本条款规定月夜的旅游信息、行程、社区、AI内容及印章功能的使用条件。',
      sections: [
        { title: '1. 目的与适用', paragraphs: ['本条款规定运营方提供的月夜网页及PWA服务的使用条件，以及用户和运营方的权利与义务。'] },
        { title: '2. 账户与安全', items: ['用户须提供准确信息，并妥善保护账户访问凭证。', '禁止共享账户、冒充他人、异常自动请求及绕过服务安全措施。', '用户可在设置页面删除账户和服务数据。'] },
        { title: '3. 旅游与地图信息', paragraphs: ['景点营业时间、费用、路线和交通信息基于公共数据及外部提供方的信息，可能随现场情况变化。重要行程应向相关设施和交通提供方再次确认。'] },
        { title: '4. AI生成内容', paragraphs: ['AI讲解、路线、语音和印章插画会标明其生成性质。AI结果可能存在错误，不得作为历史、安全、医疗或法律判断的唯一依据。'] },
        { title: '5. 社区内容', items: ['用户只能上传有权发布的文字和图片，不得发布个人信息、违法有害内容或侵犯权利的材料。', '运营方可依据举报或自动检查限制、隐藏或删除帖子，并在必要时限制账户使用。', '帖子的权利仍归作者所有，作者授予服务展示和运营所必需范围内的非独占使用许可。'] },
        { title: '6. 印章与奖励', paragraphs: ['不得通过篡改或自动化GPS及现场验证来获取印章或奖励。确认存在不当获取行为时，可撤销相应印章和奖励。'] },
        { title: '7. 服务变更与责任', paragraphs: ['维护、提供方故障或法律政策变更可能导致功能变更或中断。运营方不存在故意或重大过失时，在法律允许的范围内，不对外部数据错误或用户选择造成的间接损失承担责任。'] },
        { title: '8. 适用法律与争议', paragraphs: ['适用大韩民国法律，争议由相关法律规定的管辖法院解决。本条款不限制强制适用于消费者的权利。'] }
      ]
    },
    privacy: {
      title: '隐私政策', description: '本政策说明月夜处理的账户、服务使用、位置同意及社区信息。',
      sections: [
        { title: '1. 处理的信息', items: ['必需：电子邮箱或社交登录标识符、显示名称、认证及安全会话信息。', '服务使用：行程、购物车、印章、收藏、帖子、评论、举报及屏蔽记录。', '可选：位置使用同意，以及印章验证时的精度和至景点的计算距离。', '上传：重新编码的图片及文件大小、格式。公开前会删除EXIF和GPS元数据。', '安全与运营：请求时间、限流计数、错误标识信息。不保存明文密码。'] },
        { title: '2. 使用目的', items: ['会员认证与账户保护。', '提供旅行行程、推荐、印章及社区功能。', '检测违法有害内容和包含个人信息的内容，并处理举报。', '处理错误、防止滥用、改进质量与性能。'] },
        { title: '3. 保留期限', items: ['账户及使用数据：保留至注销账户。如法律要求保存，则在规定期间单独保管。', '暂存上传：未完成的上传原则上于1小时后过期。', 'API限流记录：原则上不超过2天。', '举报处理记录：在处理争议和安全运营所需的最短期间后删除。'] },
        { title: '4. 外部处理与提供', paragraphs: ['为提供服务，我们可能使用Supabase（认证、数据、文件）、OpenAI（AI生成、安全检查）、Kakao（登录、地图、路线）、韩国旅游发展局TourAPI（旅游信息）、YouTube或视频托管提供方。仅向各提供方传送相关功能所需的最少信息，并按照API密钥和合同设置进行处理。除法律要求或用户同意的情况外，不出售个人信息。'] },
        { title: '5. 位置信息与图片', paragraphs: ['浏览器位置权限会另行征求同意。不保存原始经纬度历史，仅保留印章判定所需的精度和计算距离。上传图片会调整方向并重新编码为安全格式，以移除相机和GPS元数据。'] },
        { title: '6. 用户权利', items: ['用户可在设置中查看本人信息，并删除账户和服务数据。', '可随时在浏览器或操作系统设置中撤回位置权限。', '可通过提供的编辑、删除功能管理帖子和评论，其他请求可发送至隐私联系地址。'] },
        { title: '7. 安全措施', items: ['传输加密、HttpOnly及Secure会话Cookie、会话到期与撤销。', '服务角色密钥仅保存在服务器端，并实施API限流。', '检查上传格式、大小及实际文件签名，移除元数据。', '最小化访问权限，检查错误和安全事件。'] },
        { title: '8. 咨询与救济', paragraphs: ['个人信息查阅、更正、删除、停止处理请求及侵权举报可发送至上述联系地址，也可使用相关机构提供的咨询与救济程序。'] }
      ]
    },
    location: {
      title: '位置服务使用条款', description: '本条款规定用于探索当前位置周边及验证景点印章的位置信息使用条件。',
      sections: [
        { title: '1. 服务内容', items: ['在地图上显示当前位置并搜索附近景点。', '通过外部地图提供方查询前往所选景点的路线。', '确认景点半径及位置精度后发放到访印章。'] },
        { title: '2. 同意与撤回', paragraphs: ['首次使用位置功能时，会说明目的和保存范围并另行征求同意。不同意也可使用手动地图浏览等不需要位置的功能。可随时通过浏览器、操作系统设置或服务内撤回同意来停止使用。'] },
        { title: '3. 保留与保护', paragraphs: ['当前位置仅在处理请求期间使用，不保存原始经纬度历史。仅最低限度保留防止印章滥用和处理异议所需的精度、至景点的计算距离及验证时间。'] },
        { title: '4. 第三方服务', paragraphs: ['地图显示和路线计算使用Kakao地图服务。请求路线时，出发地和目的地坐标可能传送至Kakao API。选择详细导航后，将跳转至KakaoMap应用或网站。'] },
        { title: '5. 用户义务与安全', paragraphs: ['应避免在驾驶或移动时操作屏幕，并优先遵守现场标志和安全指引。不得篡改坐标或现场代码以不当获取印章或奖励。'] },
        { title: '6. 损害赔偿与争议', paragraphs: ['因运营方或用户过错造成损失时，适用相关法律。有关位置信息使用的咨询和异议可发送至上述联系方式。'] }
      ]
    }
  }
};

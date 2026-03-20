/* global module */

/**
 * About 页面的 JA / KO 覆盖层：
 * 1. 仅覆盖本轮明确要求本地化的“关于首页”“问题反馈”和“关于详情页”；
 * 2. 其余 about 页面继续沿用英文基线，避免过早扩散维护范围；
 * 3. 共享的品牌摘要、分享按钮和复制邮箱提示一并本地化。
 */

const ABOUT_JA_OVERLAY = {
  brand: {
    chineseName: "AI JuLian",
    platformLabel: "RemoteConn ミニプログラム",
    summary: "サーバーを管理し、モバイル端末で AI ターミナル操作を実行します。"
  },
  homeItems: {
    manual: {
      title: "使い方",
      subtitle: "各モジュールの実際の操作手順と推奨利用順を確認します"
    },
    feedback: {
      title: "フィードバック",
      subtitle: "連絡方法と添付をおすすめする情報を確認します"
    },
    privacy: {
      title: "プライバシー",
      subtitle: "情報の収集、利用、保存に関する説明を確認します"
    },
    changelog: {
      title: "変更履歴",
      subtitle: "完全なバージョン履歴と現在の既知課題を確認します"
    },
    app: {
      title: "このアプリについて",
      subtitle: "製品概要、バージョン情報、連絡先を確認します"
    }
  },
  details: {
    feedback: {
      title: "フィードバック",
      lead: "問題や改善提案があれば、メールでご連絡ください。",
      sections: [
        {
          title: "メール",
          paragraphs: ["douboer@gmail.com"],
          actionLabel: "メールをコピー"
        },
        {
          title: "添付をおすすめする情報",
          bullets: [
            "端末モデルと OS バージョン",
            "ミニプログラムのバージョン",
            "再現手順",
            "スクリーンショットまたは秘匿化済みログ"
          ]
        },
        {
          title: "受付対象",
          bullets: ["接続失敗", "端末描画の問題", "メモや設定の問題", "要望・UX フィードバック"]
        }
      ]
    },
    app: {
      title: "このアプリについて",
      lead: "このページでは製品概要、バージョン、連絡先を確認できます。",
      sections: [
        {
          title: "製品情報",
          bullets: [
            "製品名：RemoteConn",
            "中文名：AI JuLian",
            "プラットフォーム：RemoteConn ミニプログラム",
            "バージョン：v3.0.0",
            "ビルド日：20260318",
            "データ範囲：設定、サーバープロファイル、メモはデバイス間同期に対応し、機密資格情報はサーバー側で暗号化されています",
            "連絡先：douboer@gmail.com",
            "更新日：2026-03-18"
          ]
        }
      ]
    }
  },
  shareButton: "友だちに共有",
  copiedEmail: "メールアドレスをコピーしました"
};

const ABOUT_KO_OVERLAY = {
  brand: {
    chineseName: "AI JuLian",
    platformLabel: "RemoteConn 미니프로그램",
    summary: "서버를 관리하고 모바일 단말에서 AI 터미널 작업을 수행합니다."
  },
  homeItems: {
    manual: {
      title: "사용 안내",
      subtitle: "각 모듈의 실제 사용 방법과 권장 순서를 확인합니다"
    },
    feedback: {
      title: "피드백",
      subtitle: "문의 방법과 함께 보내면 좋은 정보를 확인합니다"
    },
    privacy: {
      title: "개인정보",
      subtitle: "정보 수집, 이용, 저장 방침을 확인합니다"
    },
    changelog: {
      title: "변경 기록",
      subtitle: "전체 버전 이력과 현재 남은 이슈를 확인합니다"
    },
    app: {
      title: "앱 정보",
      subtitle: "제품 개요, 버전 정보, 연락처를 확인합니다"
    }
  },
  details: {
    feedback: {
      title: "피드백",
      lead: "문제나 개선 제안이 있으면 이메일로 알려 주세요.",
      sections: [
        {
          title: "이메일",
          paragraphs: ["douboer@gmail.com"],
          actionLabel: "이메일 복사"
        },
        {
          title: "함께 보내면 좋은 정보",
          bullets: [
            "기기 모델과 OS 버전",
            "미니프로그램 버전",
            "재현 절차",
            "스크린샷 또는 비식별 처리된 로그"
          ]
        },
        {
          title: "접수 범위",
          bullets: ["연결 실패", "터미널 렌더링 문제", "메모 또는 설정 문제", "제안 및 UX 피드백"]
        }
      ]
    },
    app: {
      title: "앱 정보",
      lead: "이 페이지에서 제품 개요, 버전, 연락처를 확인할 수 있습니다.",
      sections: [
        {
          title: "제품 정보",
          bullets: [
            "제품명：RemoteConn",
            "중문명：AI JuLian",
            "플랫폼：RemoteConn 미니프로그램",
            "버전：v3.0.0",
            "빌드 날짜：20260318",
            "데이터 범위：설정, 서버 프로필, 메모는 기기 간 동기화를 지원하며 민감한 자격 증명은 서버 측에서 암호화됩니다",
            "문의：douboer@gmail.com",
            "업데이트：2026-03-18"
          ]
        }
      ]
    }
  },
  shareButton: "친구에게 공유",
  copiedEmail: "이메일 주소를 복사했습니다"
};

module.exports = {
  ABOUT_JA_OVERLAY,
  ABOUT_KO_OVERLAY
};

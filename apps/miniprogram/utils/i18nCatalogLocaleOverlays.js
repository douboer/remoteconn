/* global module */

/**
 * 日文、韩文词典覆盖层：
 * 1. 以英文词典为稳定基线，仅覆盖本轮明确要求翻译的页面；
 * 2. `logs / records` 保持英文回退，不在这里重复维护；
 * 3. 底部导航属于全局 UI，因此即使指向日志/闪念页，其标签也一并本地化。
 */

const JA_I18N_OVERLAY = {
  common: {
    statusLabels: {
      idle: "待機中",
      connecting: "接続中",
      auth_pending: "認証中",
      connected: "接続済み",
      reconnecting: "再接続中",
      disconnected: "切断済み",
      error: "エラー",
      config_required: "設定不足"
    },
    runtimeStateLabels: {
      connected: "接続済み",
      disconnected: "未接続"
    },
    pageIndicator: "{page} / {total} ページ"
  },
  bottomNav: {
    backText: "戻る",
    pageTextLabels: {
      "open-terminal-shell": "端末",
      "/pages/terminal/index": "端末",
      "/pages/connect/index": "サーバ",
      "/pages/logs/index": "ログ",
      "/pages/records/index": "メモ",
      "/pages/settings/index": "設定",
      "/pages/about/index": "案内",
      "/pages/plugins/index": "プラグ",
      default: "ページ"
    },
    modal: {
      noTerminalTitle: "開ける端末がありません",
      noTerminalContent: "まずサーバーカードからセッションを開始してから、端末ページを開いてください。"
    }
  },
  settings: {
    navTitle: "設定",
    saveStatus: {
      synced: "ローカル設定を同期しました",
      saving: "自動保存中...",
      saved: "自動保存しました"
    },
    tabs: {
      ui: "画面",
      shell: "端末",
      connection: "接続",
      log: "記録"
    },
    sections: {
      languageTitle: "言語",
      languageDesc: "ミニプログラムの表示言語を切り替えます",
      uiTitle: "画面設定",
      uiDesc: "アプリの外観とテーマモード",
      shellDisplayTitle: "表示設定",
      shellDisplayDesc: "端末表示と入力体験",
      ttsTitle: "読み上げ設定",
      ttsDesc: "単位は文字数です。既定の総量上限は 500、分割長は 80 です。",
      shellBufferTitle: "端末バッファ",
      shellBufferDesc: "ライブバッファと再開スナップショットの上限を調整し、メモリ使用量を抑えます",
      connectionTitle: "接続設定",
      connectionDesc: "接続挙動とサーバー既定値",
      aiConnectionTitle: "AI 接続",
      aiConnectionDesc: "Codex と Copilot の既定起動権限を設定します",
      syncTitle: "同期設定",
      syncDesc: "設定データをクラウドに同期するかを制御します",
      recordTitle: "記録設定",
      recordDesc: "メモとログの保持期間を制御します",
      voiceCategoryTitle: "メモ分類",
      voiceCategoryDesc: "メモ分類を管理します"
    },
    fields: {
      themeMode: "モード",
      themePreset: "テーマ",
      uiLanguage: "表示言語",
      uiAccentColor: "アクセント",
      uiBgColor: "背景",
      uiTextColor: "文字",
      uiBtnColor: "ボタン",
      shellBgColor: "端末背景",
      shellTextColor: "端末前景",
      shellAccentColor: "カーソル強調色",
      shellFontFamily: "フォント",
      shellFontSize: "文字サイズ",
      shellLineHeight: "行間",
      unicode11: "全角文字サポート",
      shellActivationDebugOutline: "入力エリア枠線",
      showVoiceInputButton: "音声入力ボタン",
      ttsSpeakableMaxChars: "総文字数上限",
      ttsSegmentMaxChars: "分割長",
      shellBufferMaxEntries: "最大バッファ行数",
      shellBufferMaxBytes: "最大バッファバイト数",
      shellBufferSnapshotMaxLines: "再開スナップショット行数",
      autoReconnect: "自動再接続",
      reconnectLimit: "再接続回数上限",
      backgroundSessionKeepAliveMinutes: "バックグラウンド保持時間（分）",
      defaultAuthType: "既定の認証方式",
      aiDefaultProvider: "既定の AI",
      aiCodexSandboxMode: "Codex",
      aiCopilotPermissionMode: "Copilot",
      defaultPort: "既定 SSH ポート",
      defaultProjectPath: "既定プロジェクトパス",
      defaultTimeoutSeconds: "既定タイムアウト（秒）",
      defaultHeartbeatSeconds: "既定ハートビート（秒）",
      syncConfigEnabled: "設定をクラウド同期",
      logRetentionDays: "保持日数",
      voiceCategoryList: "分類一覧"
    },
    hints: {
      shellFontSizeReconnect: "文字サイズ変更後は、見た目を安定させるため再接続を推奨します",
      shellActivationDebugOutline: "入力エリアをタップするとソフトキーボードを開き、ほかをタップすると閉じます。",
      showVoiceInputButton: "右下のフローティング音声ボタンと展開パネルを表示するかを制御します。",
      ttsSpeakableMaxChars:
        "推奨範囲は 120〜1200 文字です。読み上げ対象はアシスタントの応答本文のみで、入力行とフッターは除外されます。長文は最初の音声までの待ち時間を短くするため自動分割されます。",
      syncConfigLine1: "オフにすると、設定・サーバープロファイル・メモのクラウド同期を一時停止します。",
      syncConfigLine2: "ローカル保存、端末接続、現在のセッションには影響しません。",
      voicePreviewUnicodeOn: "オン",
      voicePreviewUnicodeOff: "オフ",
      terminalPreviewLine: "Unicode11: {unicodeState} | 日本語 ABC 123 |_END_"
    },
    placeholders: {
      defaultProjectPath: "例: ~/workspace",
      newVoiceRecordCategory: "新しい分類"
    },
    buttons: {
      addVoiceRecordCategory: "追加",
      setDefaultCategory: "既定に設定",
      removeSelectedCategory: "選択を削除"
    },
    labels: {
      defaultBadge: "既定",
      ttsSpeakableCharsUnit: " 文字"
    },
    options: {
      authType: {
        password: "パスワード",
        key: "鍵"
      },
      aiDefaultProvider: {
        codex: "Codex",
        copilot: "Copilot"
      },
      aiCodexSandboxMode: {
        readOnly: "読み取り専用",
        workspaceWrite: "プロジェクト読書き",
        dangerFullAccess: "フルアクセス"
      },
      aiCopilotPermissionMode: {
        default: "標準",
        experimental: "実験的",
        allowAll: "フルアクセス"
      },
      themeMode: {
        dark: "ダーク",
        light: "ライト"
      },
      uiLanguage: {
        "zh-Hans": "簡体中文",
        "zh-Hant": "繁體中文",
        en: "English",
        ja: "日本語",
        ko: "한국어"
      },
      themePresetDefaultSuffix: "（既定）",
      fontFallback: "等幅デフォルト"
    },
    toast: {
      enterCategoryName: "分類名を入力してください",
      categoryExists: "分類はすでに存在します",
      maxCategories: "分類は最大 10 件までです",
      fallbackCannotDelete: "既定の分類は削除できません",
      keepAtLeastOneCategory: "少なくとも 1 つの分類を残してください"
    }
  },
  connect: {
    navTitle: "サーバー",
    pageTitle: "サーバー一覧",
    searchPlaceholder: "サーバーを検索",
    recentConnectionPrefix: "最近の接続",
    emptyTip: "該当するサーバーがありません",
    unnamedServer: "名称未設定サーバー",
    authTypeLabels: {
      password: "パスワード",
      privateKey: "秘密鍵",
      certificate: "証明書"
    },
    textIcons: {
      create: "新規",
      remove: "削除",
      selectAll: "全選",
      search: "検索",
      copy: "複製",
      connect: "SSH"
    },
    modal: {
      removeTitle: "サーバーを削除",
      removeContent: "選択したサーバー（{count} 件）を削除しますか？"
    },
    toast: {
      serverNotFound: "サーバーが見つかりません",
      serverToCopyNotFound: "複製元のサーバーが見つかりません",
      serverCopied: "サーバーを複製しました",
      clearSearchBeforeSort: "並べ替える前に検索条件をクリアしてください"
    },
    summary: {
      connectFromList: "サーバー一覧から接続を開始しました",
      aiFromList: "サーバー一覧から AI クイック起動を開始しました"
    },
    fallback: {
      noConnection: "接続履歴なし",
      newServerPrefix: "サーバー"
    },
    labels: {
      copyNameSuffix: " のコピー"
    },
    display: {
      projectPrefix: "作業"
    }
  },
  plugins: {
    navTitle: "プラグイン",
    runtimeStatePrefix: "実行状態: ",
    summary: "現在のミニプログラム基線 v3.0.0 に合わせ、ライフサイクル制御、インポート/エクスポート、コマンド実行、実行ログを揃えています。",
    sections: {
      pluginList: "プラグイン一覧",
      importJson: "プラグイン JSON の取り込み",
      runCommand: "コマンド実行",
      runtimeLogs: "実行ログ"
    },
    buttons: {
      enable: "有効化",
      disable: "無効化",
      reload: "再読み込み",
      remove: "削除",
      importJson: "取り込む",
      exportJson: "すべて出力（コピー）"
    },
    empty: {
      noPlugins: "プラグインはまだありません",
      noCommands: "使用可能なコマンドがありません。接続中セッションと登録済みプラグインコマンドが必要です。",
      noLogs: "ログはまだありません"
    },
    placeholder: {
      pluginJson: "[{\"manifest\":...,\"mainJs\":\"...\",\"stylesCss\":\"...\"}]"
    },
    modal: {
      removeTitle: "プラグインを削除",
      removeContent: "プラグイン {id} を削除しますか？"
    },
    toast: {
      bootstrapFailed: "プラグイン初期化に失敗しました",
      pastePluginJsonFirst: "先にプラグイン JSON を貼り付けてください",
      importSuccess: "取り込みました",
      importFailed: "取り込みに失敗しました",
      exportSuccess: "プラグイン JSON をコピーしました",
      exportFailed: "出力に失敗しました",
      enabled: "有効化しました",
      enableFailed: "有効化に失敗しました",
      disabled: "無効化しました",
      disableFailed: "無効化に失敗しました",
      reloaded: "再読み込みしました",
      reloadFailed: "再読み込みに失敗しました",
      removed: "削除しました",
      removeFailed: "削除に失敗しました",
      commandExecuted: "コマンドを実行しました",
      commandExecuteFailed: "コマンド実行に失敗しました"
    }
  },
  serverSettings: {
    navTitle: "サーバー設定",
    sections: {
      basicTitle: "基本情報",
      basicDesc: "対象サーバーを識別して指定します",
      authTitle: "認証",
      authDesc: "認証方式に応じてパスワードまたは鍵情報を入力します",
      connectTitle: "接続",
      connectDesc: "接続経路と作業ディレクトリを定義します",
      jumpHostTitle: "踏み台ホスト",
      jumpHostDesc: "設定済みの踏み台経由で対象サーバーに到達します"
    },
    fields: {
      name: "名称",
      tags: "タグ",
      host: "ホスト",
      port: "ポート",
      username: "ユーザー名",
      authType: "認証方式",
      password: "パスワード",
      privateKey: "秘密鍵",
      passphrase: "パスフレーズ",
      certificate: "証明書",
      transportMode: "転送方式",
      aiProjectPath: "AI 作業ディレクトリ",
      jumpHost: "踏み台ホスト",
      jumpPort: "踏み台ポート",
      jumpUsername: "踏み台ユーザー名"
    },
    options: {
      authType: {
        password: "パスワード",
        privateKey: "秘密鍵",
        certificate: "証明書"
      }
    },
    placeholders: {
      tags: "prod,tokyo",
      aiProjectPath: "~/workspace/project"
    },
    directoryPicker: {
      openButton: "ディレクトリを選択",
      loading: "読み込み中",
      cancel: "キャンセル",
      apply: "適用"
    },
    modal: {
      socketDomainTitle: "Socket ドメイン未許可",
      socketDomainContent: "現在のゲートウェイ URL はミニプログラムの Socket 許可ドメインに含まれていません: {domainHint}",
      socketDomainContentNoHint: "現在のゲートウェイ URL はミニプログラムの Socket 許可ドメインに含まれていません",
      connectFailedTitle: "サーバーに接続できません",
      connectFailedContent: "{message}\nホスト、ポート、ユーザー名、認証情報が正しいか確認してください。"
    },
    toast: {
      opsConfigMissing: "運用設定がありません。管理者に連絡してください。",
      saved: "保存しました",
      connectFromSettings: "サーバー設定から接続を開始しました"
    }
  },
  terminal: {
    navTitle: "端末",
    disconnectedHint: "右上の再接続スイッチまたは左上の AI ボタンから再接続してください。",
    connectionAction: {
      reconnect: "再接続",
      disconnect: "切断"
    },
    stateLabels: {
      idle: "待機中",
      connecting: "接続中",
      auth_pending: "認証中",
      connected: "接続済み",
      reconnecting: "再接続中",
      disconnected: "切断済み",
      error: "エラー",
      config_required: "設定不足"
    },
    voice: {
      recordingHint: "録音中... 離して送信またはメモに保存",
      inputPlaceholder: "下の音声ボタンを長押しして入力を開始"
    },
    aiDialog: {
      title: "AI クイック起動",
      hint: "起動オプションは「全体設定 -> 接続 -> AI 接続」に移動しました",
      currentMode: "現在のモード",
      launchCodex: "Codex を起動",
      launchCopilot: "Copilot を起動",
      close: "閉じる"
    },
    toast: {
      aiAlreadyRunning: "{provider} はこのセッションですでに実行中です。再起動する前に終了してください"
    },
    fallback: {
      noProject: "プロジェクト未設定",
      unnamedServer: "名称未設定サーバー"
    },
    sessionInfo: {
      title: "セッション情報",
      nameLabel: "サーバー名",
      projectLabel: "作業ディレクトリ",
      addressLabel: "サーバーアドレス",
      jumpTargetLabel: "接続先サーバー",
      sshConnectionLabel: "SSH 接続",
      aiConnectionLabel: "AI 接続",
      connectedValue: "接続",
      disconnectedValue: "切断",
      emptyValue: "-"
    },
    modal: {
      socketDomainTitle: "Socket ドメイン未許可",
      socketDomainContent: "現在のゲートウェイ URL はミニプログラムの Socket 許可ドメインに含まれていません: {domainHint}",
      socketDomainContentNoHint: "現在のゲートウェイ URL はミニプログラムの Socket 許可ドメインに含まれていません"
    },
    diagnostics: {
      responseAxisCardLabel: "ゲートウェイ RTT (ms)",
      networkAxisCardLabel: "ネットワーク RTT (ms)",
      chartMinShort: "最小",
      chartMaxShort: "最大",
      chartAvgShort: "平均",
      chartStatEmpty: "--"
    },
    tts: {
      enable: "TTS を有効化",
      disable: "TTS を無効化",
      settingsTitle: "読み上げ設定",
      settingsDesc: "端末の音声再生と総読み上げ文字数を制御します",
      lengthLabel: "総読み上げ文字数",
      lengthUnit: " 文字",
      lengthHint: "アシスタントの応答のみを読み上げます。入力行とフッターは除外されます。",
      segmentHint: "長い内容は最初の音声までの待ち時間を短くするため、自動で小さな断片に分割されます。"
    },
    summary: {
      gatewayConnect: "ミニプログラムがゲートウェイ接続を開始しました",
      sessionRestored: "セッションを復元しました",
      sessionConnected: "セッションに接続しました"
    },
    errors: {
      serverNotFound: "サーバーが見つかりません",
      sessionNotConnected: "セッションは未接続です",
      opsConfigMissing: "運用設定がありません。管理者に連絡してください。",
      gatewayError: "ゲートウェイエラー",
      connectionException: "接続エラー",
      sessionReadyTimeout: "セッションの準備がタイムアウトしました",
      serverConfigIncomplete: "サーバー設定が不完全です",
      connectionFailed: "接続に失敗しました",
      sessionDisconnected: "セッションが切断されました",
      waitSessionTimeout: "セッション接続の待機がタイムアウトしました",
      codexLaunchFailed: "Codex の起動に失敗しました",
      copilotLaunchFailed: "Copilot の起動に失敗しました",
      codexNotInstalled: "サーバーに codex がインストールされていません",
      codexLaunching: "Codex はすでに起動中です",
      waitCodexTimeout: "Codex 起動結果の待機がタイムアウトしました",
      codexWorkingDirMissing: "Codex の作業ディレクトリ {projectPath} が存在しません",
      privacyAuthFailed: "プライバシー認可に失敗しました",
      privacyApiBanned:
        "ミニプログラム管理画面でプライバシー申告が未完了のため、録音 API が無効化されています。WeChat 公開プラットフォームで申告を補って再審査・公開してください。",
      privacyScopeUndeclared:
        "ミニプログラムのプライバシー指針に録音用途が記載されていません。WeChat 公開プラットフォームの「サービス内容声明 - ユーザープライバシー保護指針」にマイク収集用途を追加してください。",
      privacyDenied: "プライバシー規約に同意していないため、録音は利用できません",
      micPermissionDenied: "マイク権限が無効です。設定で録音を許可してください。",
      micPermissionReadFailed: "マイク権限の取得に失敗しました",
      recorderBusy: "レコーダーが使用中です。しばらくしてから再試行してください。",
      recordCaptureFailed: "録音の取得に失敗しました",
      asrFailed: "音声認識に失敗しました",
      asrGatewayFailed: "音声ゲートウェイ接続に失敗しました。ミニプログラムの Socket 許可ドメインを確認してください。",
      asrGatewayConnectFailed: "音声ゲートウェイ接続に失敗しました。ネットワークまたはゲートウェイ設定を確認してください。",
      asrTimeout: "音声サービス接続がタイムアウトしました。しばらくしてから再試行してください。",
      clipboardEmpty: "クリップボードが空です",
      clipboardReadFailed: "クリップボードの読み取りに失敗しました",
      noRecordContent: "保存できる内容がありません",
      recordSaved: "メモに保存しました",
      noSpeakableContent: "読み上げ可能な内容がありません",
      contentNotSpeakable: "現在の内容は読み上げに適していません",
      ttsTextTooLong: "読み上げテキストが長すぎます",
      ttsTimeout: "音声生成がタイムアウトしました。しばらくしてから再試行してください。",
      ttsUpstreamRejected: "TTS の認証または権限に失敗しました。管理者に TTS 設定の確認を依頼してください。",
      ttsSynthesizeFailed: "音声生成に失敗しました",
      ttsPlayFailed: "音声再生に失敗しました。ネットワークを確認してください。",
      ttsUnavailable: "TTS サービスが設定されていません"
    }
  }
};

const KO_I18N_OVERLAY = {
  common: {
    statusLabels: {
      idle: "대기 중",
      connecting: "연결 중",
      auth_pending: "인증 중",
      connected: "연결됨",
      reconnecting: "재연결 중",
      disconnected: "연결 끊김",
      error: "오류",
      config_required: "설정 필요"
    },
    runtimeStateLabels: {
      connected: "연결됨",
      disconnected: "연결 안 됨"
    },
    pageIndicator: "{page} / {total} 페이지"
  },
  bottomNav: {
    backText: "뒤로",
    pageTextLabels: {
      "open-terminal-shell": "터미널",
      "/pages/terminal/index": "터미널",
      "/pages/connect/index": "서버",
      "/pages/logs/index": "로그",
      "/pages/records/index": "메모",
      "/pages/settings/index": "설정",
      "/pages/about/index": "소개",
      "/pages/plugins/index": "플러그",
      default: "페이지"
    },
    modal: {
      noTerminalTitle: "열 수 있는 터미널이 없습니다",
      noTerminalContent: "먼저 서버 카드에서 세션을 시작한 뒤 터미널 페이지를 열어 주세요."
    }
  },
  settings: {
    navTitle: "설정",
    saveStatus: {
      synced: "로컬 설정이 동기화되었습니다",
      saving: "자동 저장 중...",
      saved: "자동 저장되었습니다"
    },
    tabs: {
      ui: "화면",
      shell: "터미널",
      connection: "연결",
      log: "기록"
    },
    sections: {
      languageTitle: "언어",
      languageDesc: "미니프로그램 인터페이스 언어를 전환합니다",
      uiTitle: "화면 설정",
      uiDesc: "앱 외형과 테마 모드",
      shellDisplayTitle: "표시 설정",
      shellDisplayDesc: "터미널 표시와 입력 경험",
      ttsTitle: "읽어주기 설정",
      ttsDesc: "단위는 글자 수입니다. 기본 총 길이 제한은 500, 분할 길이는 80입니다.",
      shellBufferTitle: "터미널 버퍼",
      shellBufferDesc: "실시간 버퍼와 재개 스냅샷 한도를 조정해 메모리 사용량을 줄입니다",
      connectionTitle: "연결 설정",
      connectionDesc: "연결 동작과 서버 기본값",
      aiConnectionTitle: "AI 연결",
      aiConnectionDesc: "Codex 와 Copilot 의 기본 실행 권한을 설정합니다",
      syncTitle: "동기화 설정",
      syncDesc: "설정 데이터를 클라우드에 동기화할지 제어합니다",
      recordTitle: "기록 설정",
      recordDesc: "메모와 로그의 보존 기간을 제어합니다",
      voiceCategoryTitle: "메모 분류",
      voiceCategoryDesc: "메모 분류를 관리합니다"
    },
    fields: {
      themeMode: "모드",
      themePreset: "테마",
      uiLanguage: "화면 언어",
      uiAccentColor: "강조색",
      uiBgColor: "배경색",
      uiTextColor: "텍스트 색",
      uiBtnColor: "버튼 색",
      shellBgColor: "터미널 배경",
      shellTextColor: "터미널 전경",
      shellAccentColor: "커서 강조색",
      shellFontFamily: "글꼴",
      shellFontSize: "글자 크기",
      shellLineHeight: "줄 높이",
      unicode11: "전각 문자 지원",
      shellActivationDebugOutline: "입력 영역 테두리",
      showVoiceInputButton: "음성 입력 버튼",
      ttsSpeakableMaxChars: "총 길이 제한",
      ttsSegmentMaxChars: "분할 길이",
      shellBufferMaxEntries: "최대 버퍼 줄 수",
      shellBufferMaxBytes: "최대 버퍼 바이트",
      shellBufferSnapshotMaxLines: "재개 스냅샷 줄 수",
      autoReconnect: "자동 재연결",
      reconnectLimit: "재연결 횟수 제한",
      backgroundSessionKeepAliveMinutes: "백그라운드 유지 시간(분)",
      defaultAuthType: "기본 인증 방식",
      aiDefaultProvider: "기본 AI",
      aiCodexSandboxMode: "Codex",
      aiCopilotPermissionMode: "Copilot",
      defaultPort: "기본 SSH 포트",
      defaultProjectPath: "기본 프로젝트 경로",
      defaultTimeoutSeconds: "기본 타임아웃(초)",
      defaultHeartbeatSeconds: "기본 하트비트(초)",
      syncConfigEnabled: "설정을 클라우드에 동기화",
      logRetentionDays: "보존 일수",
      voiceCategoryList: "분류 목록"
    },
    hints: {
      shellFontSizeReconnect: "글자 크기를 바꾼 뒤에는 표시 안정성을 위해 재연결을 권장합니다",
      shellActivationDebugOutline: "입력 영역을 누르면 소프트 키보드가 열리고, 다른 곳을 누르면 닫힙니다.",
      showVoiceInputButton: "오른쪽 아래의 플로팅 음성 버튼과 펼침 패널 표시 여부를 제어합니다.",
      ttsSpeakableMaxChars:
        "권장 범위는 120~1200자입니다. 읽어주는 대상은 어시스턴트 응답 본문만이며 입력 줄과 하단 바는 제외됩니다. 긴 내용은 첫 음성까지의 대기 시간을 줄이기 위해 자동 분할됩니다.",
      syncConfigLine1: "끄면 설정, 서버 프로필, 메모의 클라우드 동기화가 일시 중지됩니다.",
      syncConfigLine2: "로컬 저장, 터미널 연결, 현재 세션에는 영향을 주지 않습니다.",
      voicePreviewUnicodeOn: "켜짐",
      voicePreviewUnicodeOff: "꺼짐",
      terminalPreviewLine: "Unicode11: {unicodeState} | 한글 ABC 123 |_END_"
    },
    placeholders: {
      defaultProjectPath: "예: ~/workspace",
      newVoiceRecordCategory: "새 분류"
    },
    buttons: {
      addVoiceRecordCategory: "추가",
      setDefaultCategory: "기본값으로",
      removeSelectedCategory: "선택 삭제"
    },
    labels: {
      defaultBadge: "기본",
      ttsSpeakableCharsUnit: "자"
    },
    options: {
      authType: {
        password: "비밀번호",
        key: "키"
      },
      aiDefaultProvider: {
        codex: "Codex",
        copilot: "Copilot"
      },
      aiCodexSandboxMode: {
        readOnly: "읽기 전용",
        workspaceWrite: "프로젝트 읽기/쓰기",
        dangerFullAccess: "전체 권한"
      },
      aiCopilotPermissionMode: {
        default: "기본",
        experimental: "실험",
        allowAll: "전체 권한"
      },
      themeMode: {
        dark: "다크",
        light: "라이트"
      },
      uiLanguage: {
        "zh-Hans": "중국어 간체",
        "zh-Hant": "중국어 번체",
        en: "English",
        ja: "일본어",
        ko: "한국어"
      },
      themePresetDefaultSuffix: " (기본)",
      fontFallback: "고정폭 기본"
    },
    toast: {
      enterCategoryName: "분류 이름을 입력해 주세요",
      categoryExists: "이미 존재하는 분류입니다",
      maxCategories: "분류는 최대 10개까지 가능합니다",
      fallbackCannotDelete: "기본 분류는 삭제할 수 없습니다",
      keepAtLeastOneCategory: "최소 한 개의 분류를 남겨야 합니다"
    }
  },
  connect: {
    navTitle: "서버",
    pageTitle: "서버 목록",
    searchPlaceholder: "서버 검색",
    recentConnectionPrefix: "최근 연결",
    emptyTip: "일치하는 서버가 없습니다",
    unnamedServer: "이름 없는 서버",
    authTypeLabels: {
      password: "비밀번호",
      privateKey: "개인 키",
      certificate: "인증서"
    },
    textIcons: {
      create: "추가",
      remove: "삭제",
      selectAll: "전체",
      search: "검색",
      copy: "복제",
      connect: "SSH"
    },
    modal: {
      removeTitle: "서버 삭제",
      removeContent: "선택한 서버({count}개)를 삭제할까요?"
    },
    toast: {
      serverNotFound: "서버를 찾을 수 없습니다",
      serverToCopyNotFound: "복제할 서버를 찾을 수 없습니다",
      serverCopied: "서버를 복제했습니다",
      clearSearchBeforeSort: "순서를 바꾸기 전에 검색 조건을 지워 주세요"
    },
    summary: {
      connectFromList: "서버 목록에서 연결을 시작했습니다",
      aiFromList: "서버 목록에서 AI 빠른 실행을 시작했습니다"
    },
    fallback: {
      noConnection: "연결 기록 없음",
      newServerPrefix: "서버"
    },
    labels: {
      copyNameSuffix: " 복사본"
    },
    display: {
      projectPrefix: "작업"
    }
  },
  plugins: {
    navTitle: "플러그인",
    runtimeStatePrefix: "실행 상태: ",
    summary: "현재 미니프로그램 기준선 v3.0.0 에 맞춰 라이프사이클 제어, 가져오기/내보내기, 명령 실행, 실행 로그를 정렬했습니다.",
    sections: {
      pluginList: "플러그인 목록",
      importJson: "플러그인 JSON 가져오기",
      runCommand: "명령 실행",
      runtimeLogs: "실행 로그"
    },
    buttons: {
      enable: "사용",
      disable: "중지",
      reload: "새로고침",
      remove: "삭제",
      importJson: "가져오기",
      exportJson: "전체 내보내기(복사)"
    },
    empty: {
      noPlugins: "아직 플러그인이 없습니다",
      noCommands: "사용 가능한 명령이 없습니다. 연결된 세션과 등록된 플러그인 명령이 필요합니다.",
      noLogs: "아직 로그가 없습니다"
    },
    placeholder: {
      pluginJson: "[{\"manifest\":...,\"mainJs\":\"...\",\"stylesCss\":\"...\"}]"
    },
    modal: {
      removeTitle: "플러그인 삭제",
      removeContent: "플러그인 {id} 를 삭제할까요?"
    },
    toast: {
      bootstrapFailed: "플러그인 초기화에 실패했습니다",
      pastePluginJsonFirst: "먼저 플러그인 JSON 을 붙여 넣어 주세요",
      importSuccess: "가져왔습니다",
      importFailed: "가져오기에 실패했습니다",
      exportSuccess: "플러그인 JSON 을 복사했습니다",
      exportFailed: "내보내기에 실패했습니다",
      enabled: "사용으로 전환했습니다",
      enableFailed: "사용 전환에 실패했습니다",
      disabled: "중지했습니다",
      disableFailed: "중지에 실패했습니다",
      reloaded: "다시 불러왔습니다",
      reloadFailed: "다시 불러오기에 실패했습니다",
      removed: "삭제했습니다",
      removeFailed: "삭제에 실패했습니다",
      commandExecuted: "명령을 실행했습니다",
      commandExecuteFailed: "명령 실행에 실패했습니다"
    }
  },
  serverSettings: {
    navTitle: "서버 설정",
    sections: {
      basicTitle: "기본 정보",
      basicDesc: "대상 서버를 식별하고 지정합니다",
      authTitle: "인증",
      authDesc: "인증 방식에 따라 비밀번호 또는 키 정보를 입력합니다",
      connectTitle: "연결",
      connectDesc: "연결 경로와 작업 디렉터리를 정의합니다",
      jumpHostTitle: "점프 호스트",
      jumpHostDesc: "설정된 점프 호스트를 통해 대상 서버에 도달합니다"
    },
    fields: {
      name: "이름",
      tags: "태그",
      host: "호스트",
      port: "포트",
      username: "사용자명",
      authType: "인증 방식",
      password: "비밀번호",
      privateKey: "개인 키",
      passphrase: "패스프레이즈",
      certificate: "인증서",
      transportMode: "전송 방식",
      aiProjectPath: "AI 작업 디렉터리",
      jumpHost: "점프 호스트",
      jumpPort: "점프 포트",
      jumpUsername: "점프 사용자명"
    },
    options: {
      authType: {
        password: "비밀번호",
        privateKey: "개인 키",
        certificate: "인증서"
      }
    },
    placeholders: {
      tags: "prod,seoul",
      aiProjectPath: "~/workspace/project"
    },
    directoryPicker: {
      openButton: "디렉터리 선택",
      loading: "불러오는 중",
      cancel: "취소",
      apply: "적용"
    },
    modal: {
      socketDomainTitle: "Socket 도메인 미허용",
      socketDomainContent: "현재 게이트웨이 URL 이 미니프로그램 Socket 허용 도메인 목록에 없습니다: {domainHint}",
      socketDomainContentNoHint: "현재 게이트웨이 URL 이 미니프로그램 Socket 허용 도메인 목록에 없습니다",
      connectFailedTitle: "서버에 연결할 수 없습니다",
      connectFailedContent: "{message}\n호스트, 포트, 사용자명, 인증 정보가 올바른지 확인해 주세요."
    },
    toast: {
      opsConfigMissing: "운영 설정이 없습니다. 관리자에게 문의해 주세요.",
      saved: "저장했습니다",
      connectFromSettings: "서버 설정에서 연결을 시작했습니다"
    }
  },
  terminal: {
    navTitle: "터미널",
    disconnectedHint: "오른쪽 위 재연결 스위치 또는 왼쪽 위 AI 버튼으로 다시 연결해 주세요.",
    connectionAction: {
      reconnect: "재연결",
      disconnect: "연결 끊기"
    },
    stateLabels: {
      idle: "대기 중",
      connecting: "연결 중",
      auth_pending: "인증 중",
      connected: "연결됨",
      reconnecting: "재연결 중",
      disconnected: "연결 끊김",
      error: "오류",
      config_required: "설정 필요"
    },
    voice: {
      recordingHint: "녹음 중... 놓으면 전송하거나 메모에 저장합니다",
      inputPlaceholder: "아래 음성 버튼을 길게 눌러 입력을 시작하세요"
    },
    aiDialog: {
      title: "AI 빠른 실행",
      hint: "실행 옵션은 전역 설정 -> 연결 -> AI 연결로 이동했습니다",
      currentMode: "현재 모드",
      launchCodex: "Codex 실행",
      launchCopilot: "Copilot 실행",
      close: "닫기"
    },
    toast: {
      aiAlreadyRunning: "{provider} 가 이 세션에서 이미 실행 중입니다. 다시 시작하기 전에 종료해 주세요"
    },
    fallback: {
      noProject: "프로젝트 미설정",
      unnamedServer: "이름 없는 서버"
    },
    sessionInfo: {
      title: "세션 정보",
      nameLabel: "서버 이름",
      projectLabel: "작업 디렉터리",
      addressLabel: "서버 주소",
      jumpTargetLabel: "대상 서버",
      sshConnectionLabel: "SSH 연결",
      aiConnectionLabel: "AI 연결",
      connectedValue: "연결",
      disconnectedValue: "끊김",
      emptyValue: "-"
    },
    modal: {
      socketDomainTitle: "Socket 도메인 미허용",
      socketDomainContent: "현재 게이트웨이 URL 이 미니프로그램 Socket 허용 도메인 목록에 없습니다: {domainHint}",
      socketDomainContentNoHint: "현재 게이트웨이 URL 이 미니프로그램 Socket 허용 도메인 목록에 없습니다"
    },
    diagnostics: {
      responseAxisCardLabel: "게이트웨이 RTT (ms)",
      networkAxisCardLabel: "네트워크 RTT (ms)",
      chartMinShort: "최소",
      chartMaxShort: "최대",
      chartAvgShort: "평균",
      chartStatEmpty: "--"
    },
    tts: {
      enable: "TTS 켜기",
      disable: "TTS 끄기",
      settingsTitle: "읽어주기 설정",
      settingsDesc: "터미널 음성 재생과 총 읽기 길이를 제어합니다",
      lengthLabel: "총 읽기 길이",
      lengthUnit: "자",
      lengthHint: "어시스턴트 응답 본문만 읽어 주며, 입력 줄과 하단 바는 제외됩니다.",
      segmentHint: "긴 내용은 첫 음성까지의 대기 시간을 줄이기 위해 자동으로 더 작은 조각으로 나뉩니다."
    },
    summary: {
      gatewayConnect: "미니프로그램이 게이트웨이 연결을 시작했습니다",
      sessionRestored: "세션을 복원했습니다",
      sessionConnected: "세션에 연결했습니다"
    },
    errors: {
      serverNotFound: "서버를 찾을 수 없습니다",
      sessionNotConnected: "세션이 연결되어 있지 않습니다",
      opsConfigMissing: "운영 설정이 없습니다. 관리자에게 문의해 주세요.",
      gatewayError: "게이트웨이 오류",
      connectionException: "연결 오류",
      sessionReadyTimeout: "세션 준비 시간이 초과되었습니다",
      serverConfigIncomplete: "서버 설정이 완전하지 않습니다",
      connectionFailed: "연결에 실패했습니다",
      sessionDisconnected: "세션 연결이 끊겼습니다",
      waitSessionTimeout: "세션 연결 대기 시간이 초과되었습니다",
      codexLaunchFailed: "Codex 실행에 실패했습니다",
      copilotLaunchFailed: "Copilot 실행에 실패했습니다",
      codexNotInstalled: "서버에 codex 가 설치되어 있지 않습니다",
      codexLaunching: "Codex 가 이미 실행 중입니다",
      waitCodexTimeout: "Codex 실행 결과 대기 시간이 초과되었습니다",
      codexWorkingDirMissing: "Codex 작업 디렉터리 {projectPath} 가 존재하지 않습니다",
      privacyAuthFailed: "개인정보 권한 확인에 실패했습니다",
      privacyApiBanned:
        "미니프로그램 관리 콘솔에서 개인정보 고지가 완료되지 않아 녹음 API 가 비활성화되었습니다. WeChat 공개 플랫폼에서 고지를 보완한 뒤 다시 심사 및 배포해 주세요.",
      privacyScopeUndeclared:
        "미니프로그램 개인정보 가이드에 녹음 용도가 선언되어 있지 않습니다. WeChat 공개 플랫폼의 ‘서비스 내용 선언 - 사용자 개인정보 보호 가이드’에 마이크 수집 용도를 추가해 주세요.",
      privacyDenied: "개인정보 약관에 동의하지 않아 녹음을 사용할 수 없습니다",
      micPermissionDenied: "마이크 권한이 꺼져 있습니다. 설정에서 녹음을 허용해 주세요.",
      micPermissionReadFailed: "마이크 권한을 읽지 못했습니다",
      recorderBusy: "녹음기가 사용 중입니다. 잠시 후 다시 시도해 주세요.",
      recordCaptureFailed: "녹음 수집에 실패했습니다",
      asrFailed: "음성 인식에 실패했습니다",
      asrGatewayFailed: "음성 게이트웨이 연결에 실패했습니다. 미니프로그램 Socket 허용 도메인을 확인해 주세요.",
      asrGatewayConnectFailed: "음성 게이트웨이 연결에 실패했습니다. 네트워크 또는 게이트웨이 설정을 확인해 주세요.",
      asrTimeout: "음성 서비스 연결 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.",
      clipboardEmpty: "클립보드가 비어 있습니다",
      clipboardReadFailed: "클립보드를 읽지 못했습니다",
      noRecordContent: "저장할 내용이 없습니다",
      recordSaved: "메모에 저장했습니다",
      noSpeakableContent: "읽어줄 수 있는 내용이 없습니다",
      contentNotSpeakable: "현재 내용은 읽어주기에 적합하지 않습니다",
      ttsTextTooLong: "읽어줄 텍스트가 너무 깁니다",
      ttsTimeout: "음성 생성 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.",
      ttsUpstreamRejected: "TTS 인증 또는 권한에 실패했습니다. 관리자에게 TTS 설정 확인을 요청해 주세요.",
      ttsSynthesizeFailed: "음성 생성에 실패했습니다",
      ttsPlayFailed: "오디오 재생에 실패했습니다. 네트워크를 확인해 주세요.",
      ttsUnavailable: "TTS 서비스가 설정되어 있지 않습니다"
    }
  }
};

module.exports = {
  JA_I18N_OVERLAY,
  KO_I18N_OVERLAY
};

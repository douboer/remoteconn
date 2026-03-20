/* global module, require */

const { JA_I18N_OVERLAY, KO_I18N_OVERLAY } = require("./i18nCatalogLocaleOverlays");

function cloneCatalogValue(value) {
  if (Array.isArray(value)) return value.map((item) => cloneCatalogValue(item));
  if (value && typeof value === "object") {
    const next = {};
    Object.keys(value).forEach((key) => {
      next[key] = cloneCatalogValue(value[key]);
    });
    return next;
  }
  return value;
}

function applyCatalogOverlay(base, overlay) {
  if (!overlay || typeof overlay !== "object") return cloneCatalogValue(base);
  if (Array.isArray(base)) {
    const baseArray = Array.isArray(base) ? base : [];
    const overlayArray = Array.isArray(overlay) ? overlay : [];
    const length = Math.max(baseArray.length, overlayArray.length);
    const next = [];
    for (let index = 0; index < length; index += 1) {
      if (overlayArray[index] === undefined) {
        next.push(cloneCatalogValue(baseArray[index]));
        continue;
      }
      next.push(cloneCatalogValue(overlayArray[index]));
    }
    return next;
  }
  const next = cloneCatalogValue(base);
  Object.keys(overlay).forEach((key) => {
    const current = next[key];
    const patch = overlay[key];
    if (
      current &&
      typeof current === "object" &&
      !Array.isArray(current) &&
      patch &&
      typeof patch === "object" &&
      !Array.isArray(patch)
    ) {
      next[key] = applyCatalogOverlay(current, patch);
      return;
    }
    next[key] = cloneCatalogValue(patch);
  });
  return next;
}

/**
 * 小程序界面文案词典：
 * 1. 这里只放“产品自有界面文案”，不放用户输入、远端输出等动态内容；
 * 2. 页面层通过 namespace 读取，避免把整份大词典一次性塞进 setData；
 * 3. 词典先覆盖当前主流程页，后续新增文案继续往对应 namespace 里补。
 */
const I18N_CATALOG = {
  "zh-Hans": {
    common: {
      statusLabels: {
        idle: "空闲",
        connecting: "连接中",
        auth_pending: "认证中",
        connected: "已连接",
        reconnecting: "重连中",
        disconnected: "已断开",
        error: "异常",
        config_required: "配置缺失"
      },
      runtimeStateLabels: {
        connected: "已连接",
        disconnected: "未连接"
      },
      pageIndicator: "第 {page} / {total} 页"
    },
    bottomNav: {
      backText: "返",
      pageTextLabels: {
        "open-terminal-shell": "终",
        "/pages/terminal/index": "终",
        "/pages/connect/index": "服",
        "/pages/logs/index": "志",
        "/pages/records/index": "记",
        "/pages/settings/index": "设",
        "/pages/about/index": "关",
        "/pages/plugins/index": "插",
        default: "页"
      },
      modal: {
        noTerminalTitle: "暂无可打开终端",
        noTerminalContent: "请先通过服务器卡片右侧连接按钮建立会话，然后再打开终端页面。"
      }
    },
    settings: {
      navTitle: "设置",
      saveStatus: {
        synced: "已同步本地配置",
        saving: "自动保存中...",
        saved: "已自动保存"
      },
      tabs: {
        ui: "界面",
        shell: "终端",
        connection: "连接",
        log: "记录"
      },
      sections: {
        languageTitle: "语言设置",
        languageDesc: "切换小程序界面文案语言",
        uiTitle: "界面设置",
        uiDesc: "应用外观与主题模式",
        shellDisplayTitle: "显示设置",
        shellDisplayDesc: "终端显示和输入体验",
        ttsTitle: "播报设置",
        ttsDesc: "单位为字。默认总长度限制 500，默认分片长度 80。",
        shellBufferTitle: "终端缓冲",
        shellBufferDesc: "控制在线缓冲与续接快照上限，避免过度占用内存",
        connectionTitle: "连接设置",
        connectionDesc: "连接行为与服务器默认参数",
        aiConnectionTitle: "AI连接",
        aiConnectionDesc: "设置 Codex 与 Copilot 的默认启动权限",
        syncTitle: "同步配置",
        syncDesc: "控制配置类数据是否同步到云端",
        recordTitle: "记录设置",
        recordDesc: "控制闪念与日志的保留周期",
        voiceCategoryTitle: "闪念分类",
        voiceCategoryDesc: "维护管理闪念分类"
      },
      fields: {
        themeMode: "模式",
        themePreset: "主题",
        uiLanguage: "界面语言",
        uiAccentColor: "强调色",
        uiBgColor: "背景色",
        uiTextColor: "文本色",
        uiBtnColor: "按钮色",
        shellBgColor: "终端背景色",
        shellTextColor: "终端前景色",
        shellAccentColor: "光标强调色",
        shellFontFamily: "字体",
        shellFontSize: "字号",
        shellLineHeight: "行高",
        unicode11: "宽字符支持",
        shellActivationDebugOutline: "激活区外框",
        showVoiceInputButton: "语音输入按钮",
        ttsSpeakableMaxChars: "总长度限制",
        ttsSegmentMaxChars: "分片长度",
        shellBufferMaxEntries: "缓冲行数上限",
        shellBufferMaxBytes: "缓冲字节上限",
        shellBufferSnapshotMaxLines: "续接快照行数上限",
        autoReconnect: "自动重连",
        reconnectLimit: "重连次数上限",
        backgroundSessionKeepAliveMinutes: "后台保活时长（分钟）",
        defaultAuthType: "默认认证方式",
        aiDefaultProvider: "默认 AI",
        aiCodexSandboxMode: "Codex",
        aiCopilotPermissionMode: "Copilot",
        defaultPort: "默认 SSH 端口",
        defaultProjectPath: "默认项目路径",
        defaultTimeoutSeconds: "默认连接超时（秒）",
        defaultHeartbeatSeconds: "默认心跳间隔（秒）",
        syncConfigEnabled: "同步配置云端",
        logRetentionDays: "记录保留天数",
        voiceCategoryList: "分类列表"
      },
      hints: {
        shellFontSizeReconnect: "修改字号后建议断开重连",
        shellActivationDebugOutline: "点击激活区弹出软键盘，点击其它区域收回软键盘，方便用户操作",
        showVoiceInputButton: "控制终端右下角悬浮语音按钮及展开面板是否显示",
        ttsSpeakableMaxChars: "建议范围 120-1200 字。只播报回答正文，输入行和底部状态栏会被忽略；内部会自动分段以缩短首段等待时间。",
        syncConfigLine1: "关闭后将暂停设置、服务器配置与闪念记录的云端同步。",
        syncConfigLine2: "本地保存、终端连接与当前会话不受影响。",
        voicePreviewUnicodeOn: "on",
        voicePreviewUnicodeOff: "off",
        terminalPreviewLine: "Unicode11: {unicodeState} | 中文 ABC 123 |_END_"
      },
      placeholders: {
        defaultProjectPath: "例如：~/workspace",
        newVoiceRecordCategory: "新增分类"
      },
      buttons: {
        addVoiceRecordCategory: "新增",
        setDefaultCategory: "设默认",
        removeSelectedCategory: "删除所选"
      },
      labels: {
        defaultBadge: "默认",
        ttsSpeakableCharsUnit: "字"
      },
      options: {
        authType: {
          password: "密码",
          key: "密钥"
        },
        aiDefaultProvider: {
          codex: "Codex",
          copilot: "Copilot"
        },
        aiCodexSandboxMode: {
          readOnly: "只读",
          workspaceWrite: "项目目录读写",
          dangerFullAccess: "全部权限"
        },
        aiCopilotPermissionMode: {
          default: "默认",
          experimental: "实验",
          allowAll: "全部权限"
        },
        themeMode: {
          dark: "深色",
          light: "浅色"
        },
        uiLanguage: {
          "zh-Hans": "简体中文",
          "zh-Hant": "繁體中文",
          en: "English",
          ja: "日本語",
          ko: "한국어"
        },
        themePresetDefaultSuffix: "（默认）",
        fontFallback: "等宽默认"
      },
      toast: {
        enterCategoryName: "请输入分类名称",
        categoryExists: "分类已存在",
        maxCategories: "最多 10 个分类",
        fallbackCannotDelete: "未分类不能删除",
        keepAtLeastOneCategory: "至少保留一个分类"
      }
    },
    connect: {
      navTitle: "服务器",
      pageTitle: "我的服务器",
      searchPlaceholder: "搜索服务器",
      recentConnectionPrefix: "最近连接",
      emptyTip: "暂无匹配服务器",
      unnamedServer: "未命名服务器",
      authTypeLabels: {
        password: "密码",
        privateKey: "私钥",
        certificate: "证书"
      },
      textIcons: {
        create: "新",
        remove: "删",
        selectAll: "全",
        search: "搜",
        copy: "复",
        connect: "连"
      },
      swipeCopy: "复制",
      swipeDelete: "删除",
      modal: {
        removeTitle: "删除服务器",
        removeContent: "确认删除已选服务器（{count} 台）吗？",
        removeSingleContent: "确认删除服务器“{name}”吗？"
      },
      toast: {
        serverNotFound: "服务器不存在",
        serverToCopyNotFound: "未找到待复制服务器",
        serverCopied: "服务器已复制",
        serverDeleted: "服务器已删除",
        clearSearchBeforeSort: "请清空搜索后再调整顺序"
      },
      summary: {
        connectFromList: "从服务器列表发起连接",
        aiFromList: "从服务器列表发起 AI 快速启动"
      },
      fallback: {
        noConnection: "无连接",
        newServerPrefix: "服务器"
      },
      display: {
        projectPrefix: "pro"
      }
    },
    logs: {
      navTitle: "日志",
      exportButton: "导出脱敏日志",
      totalCount: "共 {total} 条",
      empty: "暂无日志",
      prev: "上一页",
      next: "下一页",
      toast: {
        copied: "日志已复制"
      }
    },
    records: {
      navTitle: "闪念",
      searchPlaceholder: "搜索闪念",
      allCategories: "全部分类",
      addButton: "新增",
      swipeCopy: "复制",
      swipeDelete: "删除",
      swipeProcessed: "已处理",
      swipeDiscarded: "已废弃",
      empty: "暂无闪念记录",
      prev: "上一页",
      next: "下一页",
      exportButton: "导出闪念",
      editPlaceholder: "编辑闪念内容",
      newRecordHint: "输入后自动保存为新闪念",
      updatedAtPrefix: "最近更新 {time}",
      closeEditAriaLabel: "关闭编辑窗口",
      contextFallback: "未设置上下文",
      exportFields: {
        createdAt: "创建时间",
        updatedAt: "更新时间",
        server: "服务器",
        category: "分类",
        context: "上下文"
      },
      toast: {
        deleted: "已删除",
        copied: "已复制",
        processed: "已处理",
        discarded: "已废弃",
        updateFailed: "更新失败",
        categoryUpdated: "分类已更新",
        exported: "闪念已复制"
      }
    },
    plugins: {
      navTitle: "插件",
      runtimeStatePrefix: "运行时状态：",
      summary: "对齐当前小程序基线 v3.0.0：启停、导入导出、命令执行、运行日志。",
      sections: {
        pluginList: "插件列表",
        importJson: "导入插件 JSON",
        runCommand: "运行命令",
        runtimeLogs: "运行时日志"
      },
      buttons: {
        enable: "启用",
        disable: "禁用",
        reload: "重载",
        remove: "移除",
        importJson: "导入",
        exportJson: "导出全部（复制）"
      },
      empty: {
        noPlugins: "暂无插件",
        noCommands: "当前无可执行命令（需会话连接且插件已注册）",
        noLogs: "暂无日志"
      },
      placeholder: {
        pluginJson: '[{"manifest":...,"mainJs":"...","stylesCss":"..."}]'
      },
      modal: {
        removeTitle: "移除插件",
        removeContent: "确认移除插件 {id} 吗？"
      },
      toast: {
        bootstrapFailed: "插件初始化失败",
        pastePluginJsonFirst: "请先粘贴插件 JSON",
        importSuccess: "导入成功",
        importFailed: "导入失败",
        exportSuccess: "插件 JSON 已复制",
        exportFailed: "导出失败",
        enabled: "已启用",
        enableFailed: "启用失败",
        disabled: "已禁用",
        disableFailed: "禁用失败",
        reloaded: "已重载",
        reloadFailed: "重载失败",
        removed: "已移除",
        removeFailed: "移除失败",
        commandExecuted: "命令已执行",
        commandExecuteFailed: "命令执行失败"
      }
    },
    serverSettings: {
      navTitle: "服务器配置",
      sections: {
        basicTitle: "基础信息",
        basicDesc: "用于标识并定位目标服务器",
        authTitle: "认证信息",
        authDesc: "按认证方式填写密码或密钥材料",
        connectTitle: "连接参数",
        connectDesc: "定义连接路径与工作目录",
        jumpHostTitle: "跳转主机",
        jumpHostDesc: "从基础信息中配置的服务器跳转至该服务器"
      },
      fields: {
        name: "名称",
        tags: "标签",
        host: "主机",
        port: "端口",
        username: "用户名",
        authType: "认证方式",
        password: "密码",
        privateKey: "私钥",
        passphrase: "密钥口令",
        certificate: "证书",
        transportMode: "传输方式",
        aiProjectPath: "AI工作目录",
        jumpHost: "跳转主机",
        jumpPort: "跳转端口",
        jumpUsername: "跳转用户名"
      },
      options: {
        authType: {
          password: "密码",
          privateKey: "私钥",
          certificate: "证书"
        }
      },
      placeholders: {
        tags: "prod,beijing",
        aiProjectPath: "~/workspace/project"
      },
      directoryPicker: {
        openButton: "选择目录",
        loading: "加载中",
        cancel: "取消",
        apply: "应用"
      },
      modal: {
        socketDomainTitle: "Socket 域名未配置",
        socketDomainContent: "当前网关地址不在小程序 socket 合法域名列表：{domainHint}",
        socketDomainContentNoHint: "当前网关地址不在小程序 socket 合法域名列表",
        connectFailedTitle: "无法连接服务器",
        connectFailedContent: "{message}\n请检查主机、端口、用户名和认证信息是否正确。"
      },
      toast: {
        opsConfigMissing: "运维配置缺失，请联系管理员",
        saved: "已保存",
        connectFromSettings: "从服务器配置页发起连接"
      }
    },
    terminal: {
      navTitle: "终端",
      disconnectedHint: "请点击右上角“重连”开关或左上角 AI 按钮，重新连接。",
      connectionAction: {
        reconnect: "重连",
        disconnect: "断开"
      },
      stateLabels: {
        idle: "空闲",
        connecting: "连接中",
        auth_pending: "认证中",
        connected: "已连接",
        reconnecting: "重连中",
        disconnected: "已断开",
        error: "异常",
        config_required: "配置缺失"
      },
      voice: {
        recordingHint: "正在收音，松开后发送或记录闪念",
        inputPlaceholder: "按住下方语音按钮开始输入"
      },
      aiDialog: {
        title: "AI 快速启动",
        hint: "启动参数已迁到 全局配置 -> 连接 -> AI连接",
        currentMode: "当前模式",
        launchCodex: "启动 Codex",
        launchCopilot: "启动 Copilot",
        close: "关闭"
      },
      toast: {
        aiAlreadyRunning: "{provider} 正在当前会话中运行，请先退出后再重启"
      },
      fallback: {
        noProject: "未设置项目",
        unnamedServer: "未命名服务器"
      },
      sessionInfo: {
        title: "会话信息",
        nameLabel: "服务器名称",
        projectLabel: "工作目录",
        addressLabel: "服务器地址",
        jumpTargetLabel: "跳至服务器",
        sshConnectionLabel: "SSH连接",
        aiConnectionLabel: "AI连接",
        connectedValue: "连接",
        disconnectedValue: "断开",
        emptyValue: "-"
      },
      modal: {
        socketDomainTitle: "Socket 域名未配置",
        socketDomainContent: "当前网关地址不在小程序 socket 合法域名列表：{domainHint}",
        socketDomainContentNoHint: "当前网关地址不在小程序 socket 合法域名列表"
      },
      diagnostics: {
        responseAxisCardLabel: "网关响应(ms)",
        networkAxisCardLabel: "网络时延(ms)",
        chartMinShort: "min",
        chartMaxShort: "max",
        chartAvgShort: "avg",
        chartStatEmpty: "--"
      },
      tts: {
        enable: "开启语音播报",
        disable: "关闭语音播报",
        settingsTitle: "播报设置",
        settingsDesc: "控制终端语音播报开关与总播报长度",
        lengthLabel: "总播报长度",
        lengthUnit: "字",
        lengthHint: "只播报回答正文，不读输入行和底部状态栏。",
        segmentHint: "内部会自动按更小段落顺序播报，优先缩短首段等待时间。"
      },
      summary: {
        gatewayConnect: "小程序端发起网关连接",
        sessionRestored: "会话已恢复",
        sessionConnected: "会话已连接"
      },
      errors: {
        serverNotFound: "服务器不存在",
        sessionNotConnected: "会话未连接",
        opsConfigMissing: "运维配置缺失，请联系管理员",
        gatewayError: "网关错误",
        connectionException: "连接异常",
        sessionReadyTimeout: "会话就绪超时",
        serverConfigIncomplete: "服务器配置不完整",
        connectionFailed: "连接失败",
        sessionDisconnected: "会话已断开",
        waitSessionTimeout: "等待会话连接超时",
        codexLaunchFailed: "Codex 启动失败",
        copilotLaunchFailed: "Copilot 启动失败",
        codexNotInstalled: "服务器未装codex",
        codexLaunching: "Codex 正在启动中",
        waitCodexTimeout: "等待 Codex 启动结果超时",
        micPermissionDenied: "麦克风权限未开启，请在设置中允许录音",
        micPermissionReadFailed: "读取麦克风权限失败",
        recorderBusy: "录音器忙，请稍后重试",
        recordCaptureFailed: "录音采集失败",
        asrFailed: "语音识别失败",
        asrGatewayFailed: "语音网关连接失败，请检查小程序 socket 合法域名",
        asrGatewayConnectFailed: "语音网关连接失败，请检查网络或网关配置",
        asrTimeout: "语音服务连接超时，请稍后重试",
        clipboardEmpty: "剪贴板为空",
        clipboardReadFailed: "读取剪贴板失败",
        noRecordContent: "无可记录内容",
        recordSaved: "已记录到闪念列表",
        noSpeakableContent: "当前没有可播报内容",
        contentNotSpeakable: "当前内容不适合播报",
        ttsTextTooLong: "播报文本过长",
        ttsTimeout: "语音生成超时，请稍后重试",
        ttsUpstreamRejected: "语音服务鉴权或权限失败，请联系管理员检查 TTS 配置",
        ttsSynthesizeFailed: "语音生成失败",
        ttsPlayFailed: "音频播放失败，请检查网络",
        ttsUnavailable: "TTS 服务未配置"
      }
    }
  },
  "zh-Hant": {
    common: {
      statusLabels: {
        idle: "空閒",
        connecting: "連線中",
        auth_pending: "驗證中",
        connected: "已連線",
        reconnecting: "重連中",
        disconnected: "已中斷",
        error: "異常",
        config_required: "設定缺失"
      },
      runtimeStateLabels: {
        connected: "已連線",
        disconnected: "未連線"
      },
      pageIndicator: "第 {page} / {total} 頁"
    },
    bottomNav: {
      backText: "返",
      pageTextLabels: {
        "open-terminal-shell": "終",
        "/pages/terminal/index": "終",
        "/pages/connect/index": "服",
        "/pages/logs/index": "誌",
        "/pages/records/index": "記",
        "/pages/settings/index": "設",
        "/pages/about/index": "關",
        "/pages/plugins/index": "插",
        default: "頁"
      },
      modal: {
        noTerminalTitle: "暫無可開啟終端",
        noTerminalContent: "請先透過伺服器卡片右側的連線按鈕建立會話，之後再開啟終端頁面。"
      }
    },
    settings: {
      navTitle: "設定",
      saveStatus: {
        synced: "已同步本地設定",
        saving: "自動儲存中...",
        saved: "已自動儲存"
      },
      tabs: {
        ui: "介面",
        shell: "終端",
        connection: "連線",
        log: "記錄"
      },
      sections: {
        languageTitle: "語言設定",
        languageDesc: "切換小程式介面文案語言",
        uiTitle: "介面設定",
        uiDesc: "應用外觀與主題模式",
        shellDisplayTitle: "顯示設定",
        shellDisplayDesc: "終端顯示與輸入體驗",
        ttsTitle: "播報設定",
        ttsDesc: "單位為字。預設總長度限制 500，預設分片長度 80。",
        shellBufferTitle: "終端緩衝",
        shellBufferDesc: "控制線上緩衝與續接快照上限，避免過度佔用記憶體",
        connectionTitle: "連線設定",
        connectionDesc: "連線行為與伺服器預設參數",
        aiConnectionTitle: "AI 連線",
        aiConnectionDesc: "設定 Codex 與 Copilot 的預設啟動權限",
        syncTitle: "同步設定",
        syncDesc: "控制設定類資料是否同步到雲端",
        recordTitle: "記錄設定",
        recordDesc: "控制閃念與日誌的保留週期",
        voiceCategoryTitle: "閃念分類",
        voiceCategoryDesc: "維護管理閃念分類"
      },
      fields: {
        themeMode: "模式",
        themePreset: "主題",
        uiLanguage: "介面語言",
        uiAccentColor: "強調色",
        uiBgColor: "背景色",
        uiTextColor: "文字色",
        uiBtnColor: "按鈕色",
        shellBgColor: "終端背景色",
        shellTextColor: "終端前景色",
        shellAccentColor: "游標強調色",
        shellFontFamily: "字體",
        shellFontSize: "字號",
        shellLineHeight: "行高",
        unicode11: "寬字元支援",
        shellActivationDebugOutline: "啟動區外框",
        showVoiceInputButton: "語音輸入按鈕",
        ttsSpeakableMaxChars: "總長度限制",
        ttsSegmentMaxChars: "分片長度",
        shellBufferMaxEntries: "緩衝行數上限",
        shellBufferMaxBytes: "緩衝位元組上限",
        shellBufferSnapshotMaxLines: "續接快照行數上限",
        autoReconnect: "自動重連",
        reconnectLimit: "重連次數上限",
        backgroundSessionKeepAliveMinutes: "背景保活時長（分鐘）",
        defaultAuthType: "預設驗證方式",
        aiDefaultProvider: "預設 AI",
        aiCodexSandboxMode: "Codex",
        aiCopilotPermissionMode: "Copilot",
        defaultPort: "預設 SSH 埠",
        defaultProjectPath: "預設專案路徑",
        defaultTimeoutSeconds: "預設連線逾時（秒）",
        defaultHeartbeatSeconds: "預設心跳間隔（秒）",
        syncConfigEnabled: "同步設定到雲端",
        logRetentionDays: "記錄保留天數",
        voiceCategoryList: "分類清單"
      },
      hints: {
        shellFontSizeReconnect: "修改字號後建議中斷重連",
        shellActivationDebugOutline: "點啟動區會彈出軟鍵盤，其它區域會收起軟鍵盤，操作更便捷",
        showVoiceInputButton: "控制終端右下角懸浮語音按鈕與展開面板是否顯示",
        ttsSpeakableMaxChars: "建議範圍 120-1200 字。只播報回答正文，輸入行與底部狀態列會被忽略；內部會自動分段以縮短首段等待時間。",
        syncConfigLine1: "關閉後將暫停設定、伺服器設定與閃念記錄的雲端同步。",
        syncConfigLine2: "本地儲存、終端連線與目前會話不受影響。",
        voicePreviewUnicodeOn: "on",
        voicePreviewUnicodeOff: "off",
        terminalPreviewLine: "Unicode11: {unicodeState} | 中文 ABC 123 |_END_"
      },
      placeholders: {
        defaultProjectPath: "例如：~/workspace",
        newVoiceRecordCategory: "新增分類"
      },
      buttons: {
        addVoiceRecordCategory: "新增",
        setDefaultCategory: "設為預設",
        removeSelectedCategory: "刪除所選"
      },
      labels: {
        defaultBadge: "預設",
        ttsSpeakableCharsUnit: "字"
      },
      options: {
        authType: {
          password: "密碼",
          key: "金鑰"
        },
        aiDefaultProvider: {
          codex: "Codex",
          copilot: "Copilot"
        },
        aiCodexSandboxMode: {
          readOnly: "唯讀",
          workspaceWrite: "專案目錄讀寫",
          dangerFullAccess: "全部權限"
        },
        aiCopilotPermissionMode: {
          default: "預設",
          experimental: "實驗",
          allowAll: "全部權限"
        },
        themeMode: {
          dark: "深色",
          light: "淺色"
        },
        uiLanguage: {
          "zh-Hans": "简体中文",
          "zh-Hant": "繁體中文",
          en: "English",
          ja: "日本語",
          ko: "한국어"
        },
        themePresetDefaultSuffix: "（預設）",
        fontFallback: "等寬預設"
      },
      toast: {
        enterCategoryName: "請輸入分類名稱",
        categoryExists: "分類已存在",
        maxCategories: "最多 10 個分類",
        fallbackCannotDelete: "未分類不能刪除",
        keepAtLeastOneCategory: "至少保留一個分類"
      }
    },
    connect: {
      navTitle: "伺服器",
      pageTitle: "我的伺服器",
      searchPlaceholder: "搜尋伺服器",
      recentConnectionPrefix: "最近連線",
      emptyTip: "暫無符合條件的伺服器",
      unnamedServer: "未命名伺服器",
      authTypeLabels: {
        password: "密碼",
        privateKey: "私鑰",
        certificate: "憑證"
      },
      textIcons: {
        create: "新",
        remove: "刪",
        selectAll: "全",
        search: "搜",
        copy: "複",
        connect: "連"
      },
      swipeCopy: "複製",
      swipeDelete: "刪除",
      modal: {
        removeTitle: "刪除伺服器",
        removeContent: "確認刪除已選伺服器（{count} 台）嗎？",
        removeSingleContent: "確認刪除伺服器「{name}」嗎？"
      },
      toast: {
        serverNotFound: "伺服器不存在",
        serverToCopyNotFound: "未找到待複製伺服器",
        serverCopied: "伺服器已複製",
        serverDeleted: "伺服器已刪除",
        clearSearchBeforeSort: "請先清空搜尋後再調整順序"
      },
      summary: {
        connectFromList: "從伺服器清單發起連線",
        aiFromList: "從伺服器清單發起 AI 快速啟動"
      },
      fallback: {
        noConnection: "無連線",
        newServerPrefix: "伺服器"
      },
      display: {
        projectPrefix: "pro"
      }
    },
    logs: {
      navTitle: "日誌",
      exportButton: "匯出脫敏日誌",
      totalCount: "共 {total} 條",
      empty: "暫無日誌",
      prev: "上一頁",
      next: "下一頁",
      toast: {
        copied: "日誌已複製"
      }
    },
    records: {
      navTitle: "閃念",
      searchPlaceholder: "搜尋閃念",
      allCategories: "全部分類",
      addButton: "新增",
      swipeCopy: "複製",
      swipeDelete: "刪除",
      swipeProcessed: "已處理",
      swipeDiscarded: "已廢棄",
      empty: "暫無閃念記錄",
      prev: "上一頁",
      next: "下一頁",
      exportButton: "匯出閃念",
      editPlaceholder: "編輯閃念內容",
      newRecordHint: "輸入後自動儲存為新閃念",
      updatedAtPrefix: "最近更新 {time}",
      closeEditAriaLabel: "關閉編輯視窗",
      contextFallback: "未設定上下文",
      exportFields: {
        createdAt: "建立時間",
        updatedAt: "更新時間",
        server: "伺服器",
        category: "分類",
        context: "上下文"
      },
      toast: {
        deleted: "已刪除",
        copied: "已複製",
        processed: "已處理",
        discarded: "已廢棄",
        updateFailed: "更新失敗",
        categoryUpdated: "分類已更新",
        exported: "閃念已複製"
      }
    },
    plugins: {
      navTitle: "外掛",
      runtimeStatePrefix: "執行時狀態：",
      summary: "對齊目前小程式基線 v3.0.0：啟停、匯入匯出、命令執行與執行日誌。",
      sections: {
        pluginList: "外掛清單",
        importJson: "匯入外掛 JSON",
        runCommand: "執行命令",
        runtimeLogs: "執行時日誌"
      },
      buttons: {
        enable: "啟用",
        disable: "停用",
        reload: "重載",
        remove: "移除",
        importJson: "匯入",
        exportJson: "匯出全部（複製）"
      },
      empty: {
        noPlugins: "暫無外掛",
        noCommands: "目前無可執行命令（需會話已連線且外掛已註冊）",
        noLogs: "暫無日誌"
      },
      placeholder: {
        pluginJson: '[{"manifest":...,"mainJs":"...","stylesCss":"..."}]'
      },
      modal: {
        removeTitle: "移除外掛",
        removeContent: "確認移除外掛 {id} 嗎？"
      },
      toast: {
        bootstrapFailed: "外掛初始化失敗",
        pastePluginJsonFirst: "請先貼上外掛 JSON",
        importSuccess: "匯入成功",
        importFailed: "匯入失敗",
        exportSuccess: "外掛 JSON 已複製",
        exportFailed: "匯出失敗",
        enabled: "已啟用",
        enableFailed: "啟用失敗",
        disabled: "已停用",
        disableFailed: "停用失敗",
        reloaded: "已重載",
        reloadFailed: "重載失敗",
        removed: "已移除",
        removeFailed: "移除失敗",
        commandExecuted: "命令已執行",
        commandExecuteFailed: "命令執行失敗"
      }
    },
    serverSettings: {
      navTitle: "伺服器設定",
      sections: {
        basicTitle: "基礎資訊",
        basicDesc: "用於標識並定位目標伺服器",
        authTitle: "驗證資訊",
        authDesc: "依驗證方式填寫密碼或金鑰材料",
        connectTitle: "連線參數",
        connectDesc: "定義連線路徑與工作目錄",
        jumpHostTitle: "跳轉主機",
        jumpHostDesc: "從基礎資訊中配置的伺服器跳轉至該伺服器"
      },
      fields: {
        name: "名稱",
        tags: "標籤",
        host: "主機",
        port: "埠",
        username: "使用者名稱",
        authType: "驗證方式",
        password: "密碼",
        privateKey: "私鑰",
        passphrase: "金鑰口令",
        certificate: "憑證",
        transportMode: "傳輸方式",
        aiProjectPath: "AI工作目錄",
        jumpHost: "跳轉主機",
        jumpPort: "跳轉埠",
        jumpUsername: "跳轉使用者名稱"
      },
      options: {
        authType: {
          password: "密碼",
          privateKey: "私鑰",
          certificate: "憑證"
        }
      },
      placeholders: {
        tags: "prod,beijing",
        aiProjectPath: "~/workspace/project"
      },
      directoryPicker: {
        openButton: "選擇目錄",
        loading: "載入中",
        cancel: "取消",
        apply: "套用"
      },
      modal: {
        socketDomainTitle: "Socket 網域未配置",
        socketDomainContent: "目前網關地址不在小程式 socket 合法網域清單：{domainHint}",
        socketDomainContentNoHint: "目前網關地址不在小程式 socket 合法網域清單",
        connectFailedTitle: "無法連線到伺服器",
        connectFailedContent: "{message}\n請檢查主機、埠、使用者名稱與驗證資訊是否正確。"
      },
      toast: {
        opsConfigMissing: "運維配置缺失，請聯絡管理員",
        saved: "已儲存",
        connectFromSettings: "從伺服器設定頁發起連線"
      }
    },
    terminal: {
      navTitle: "終端",
      disconnectedHint: "請點擊右上角「重連」開關或左上角 AI 按鈕，重新連線。",
      connectionAction: {
        reconnect: "重連",
        disconnect: "中斷"
      },
      stateLabels: {
        idle: "空閒",
        connecting: "連線中",
        auth_pending: "驗證中",
        connected: "已連線",
        reconnecting: "重連中",
        disconnected: "已中斷",
        error: "異常",
        config_required: "設定缺失"
      },
      voice: {
        recordingHint: "正在收音，鬆開後傳送或記錄閃念",
        inputPlaceholder: "按住下方語音按鈕開始輸入"
      },
      aiDialog: {
        title: "AI 快速啟動",
        hint: "啟動參數已移到 全域設定 -> 連線 -> AI 連線",
        currentMode: "目前模式",
        launchCodex: "啟動 Codex",
        launchCopilot: "啟動 Copilot",
        close: "關閉"
      },
      toast: {
        aiAlreadyRunning: "{provider} 正在目前工作階段中執行，請先退出後再重新啟動"
      },
      fallback: {
        noProject: "未設定專案",
        unnamedServer: "未命名伺服器"
      },
      sessionInfo: {
        title: "會話資訊",
        nameLabel: "伺服器名稱",
        projectLabel: "工作目錄",
        addressLabel: "伺服器地址",
        jumpTargetLabel: "跳至伺服器",
        sshConnectionLabel: "SSH連線",
        aiConnectionLabel: "AI連線",
        connectedValue: "連線",
        disconnectedValue: "斷開",
        emptyValue: "-"
      },
      modal: {
        socketDomainTitle: "Socket 網域未配置",
        socketDomainContent: "目前網關地址不在小程式 socket 合法網域清單：{domainHint}",
        socketDomainContentNoHint: "目前網關地址不在小程式 socket 合法網域清單"
      },
      diagnostics: {
        responseAxisCardLabel: "網關響應(ms)",
        networkAxisCardLabel: "網路時延(ms)",
        chartMinShort: "min",
        chartMaxShort: "max",
        chartAvgShort: "avg",
        chartStatEmpty: "--"
      },
      tts: {
        enable: "開啟語音播報",
        disable: "關閉語音播報",
        settingsTitle: "播報設定",
        settingsDesc: "控制終端語音播報開關與總播報長度",
        lengthLabel: "總播報長度",
        lengthUnit: "字",
        lengthHint: "只播報回答正文，不讀輸入行與底部狀態列。",
        segmentHint: "內部會自動按更小段落依序播報，優先縮短首段等待時間。"
      },
      summary: {
        gatewayConnect: "小程式端發起網關連線",
        sessionRestored: "會話已恢復",
        sessionConnected: "會話已連線"
      },
      errors: {
        serverNotFound: "伺服器不存在",
        sessionNotConnected: "會話未連線",
        opsConfigMissing: "運維配置缺失，請聯絡管理員",
        gatewayError: "網關錯誤",
        connectionException: "連線異常",
        sessionReadyTimeout: "會話就緒逾時",
        serverConfigIncomplete: "伺服器設定不完整",
        connectionFailed: "連線失敗",
        sessionDisconnected: "會話已中斷",
        waitSessionTimeout: "等待會話連線逾時",
        codexLaunchFailed: "Codex 啟動失敗",
        copilotLaunchFailed: "Copilot 啟動失敗",
        codexNotInstalled: "伺服器未安裝 codex",
        codexLaunching: "Codex 正在啟動中",
        waitCodexTimeout: "等待 Codex 啟動結果逾時",
        micPermissionDenied: "麥克風權限未開啟，請在設定中允許錄音",
        micPermissionReadFailed: "讀取麥克風權限失敗",
        recorderBusy: "錄音器忙碌中，請稍後重試",
        recordCaptureFailed: "錄音採集失敗",
        asrFailed: "語音辨識失敗",
        asrGatewayFailed: "語音網關連線失敗，請檢查小程式 socket 合法網域",
        asrGatewayConnectFailed: "語音網關連線失敗，請檢查網路或網關配置",
        asrTimeout: "語音服務連線逾時，請稍後重試",
        clipboardEmpty: "剪貼簿為空",
        clipboardReadFailed: "讀取剪貼簿失敗",
        noRecordContent: "沒有可記錄內容",
        recordSaved: "已記錄到閃念清單",
        noSpeakableContent: "目前沒有可播報內容",
        contentNotSpeakable: "目前內容不適合播報",
        ttsTextTooLong: "播報文字過長",
        ttsTimeout: "語音生成逾時，請稍後重試",
        ttsUpstreamRejected: "語音服務鑑權或權限失敗，請聯絡管理員檢查 TTS 配置",
        ttsSynthesizeFailed: "語音生成失敗",
        ttsPlayFailed: "音訊播放失敗，請檢查網路",
        ttsUnavailable: "TTS 服務未配置"
      }
    }
  },
  en: {
    common: {
      statusLabels: {
        idle: "Idle",
        connecting: "Connecting",
        auth_pending: "Authorizing",
        connected: "Connected",
        reconnecting: "Reconnecting",
        disconnected: "Disconnected",
        error: "Error",
        config_required: "Config Missing"
      },
      runtimeStateLabels: {
        connected: "Connected",
        disconnected: "Disconnected"
      },
      pageIndicator: "Page {page} / {total}"
    },
    bottomNav: {
      backText: "Back",
      pageTextLabels: {
        "open-terminal-shell": "Term",
        "/pages/terminal/index": "Term",
        "/pages/connect/index": "Srv",
        "/pages/logs/index": "Logs",
        "/pages/records/index": "Notes",
        "/pages/settings/index": "Cfg",
        "/pages/about/index": "About",
        "/pages/plugins/index": "Plug",
        default: "Page"
      },
      modal: {
        noTerminalTitle: "No terminal to open",
        noTerminalContent: "Start a session from a server card first, then open the terminal page."
      }
    },
    settings: {
      navTitle: "Settings",
      saveStatus: {
        synced: "Local settings synced",
        saving: "Autosaving...",
        saved: "Saved automatically"
      },
      tabs: {
        ui: "UI",
        shell: "Terminal",
        connection: "Connection",
        log: "Records"
      },
      sections: {
        languageTitle: "Language",
        languageDesc: "Switch the MiniProgram interface language",
        uiTitle: "UI Settings",
        uiDesc: "App appearance and theme mode",
        shellDisplayTitle: "Display Settings",
        shellDisplayDesc: "Terminal display and input experience",
        ttsTitle: "Speech Settings",
        ttsDesc: "Values are in characters. Default total limit is 500 and default segment length is 80.",
        shellBufferTitle: "Terminal Buffer",
        shellBufferDesc: "Control live buffer and resume snapshot limits to avoid excessive memory use",
        connectionTitle: "Connection Settings",
        connectionDesc: "Connection behavior and default server parameters",
        aiConnectionTitle: "AI Connection",
        aiConnectionDesc: "Set the default launch permissions for Codex and Copilot",
        syncTitle: "Sync Settings",
        syncDesc: "Control whether config data is synced to the cloud",
        recordTitle: "Record Settings",
        recordDesc: "Control retention for notes and logs",
        voiceCategoryTitle: "Note Categories",
        voiceCategoryDesc: "Manage note categories"
      },
      fields: {
        themeMode: "Mode",
        themePreset: "Theme",
        uiLanguage: "UI Language",
        uiAccentColor: "Accent",
        uiBgColor: "Background",
        uiTextColor: "Text",
        uiBtnColor: "Button",
        shellBgColor: "Terminal Background",
        shellTextColor: "Terminal Foreground",
        shellAccentColor: "Cursor Accent",
        shellFontFamily: "Font",
        shellFontSize: "Font Size",
        shellLineHeight: "Line Height",
        unicode11: "Wide Character Support",
        shellActivationDebugOutline: "Activation Outline",
        showVoiceInputButton: "Voice Input Button",
        ttsSpeakableMaxChars: "Total length limit",
        ttsSegmentMaxChars: "Segment length",
        shellBufferMaxEntries: "Max Buffered Lines",
        shellBufferMaxBytes: "Max Buffered Bytes",
        shellBufferSnapshotMaxLines: "Resume Snapshot Lines",
        autoReconnect: "Auto Reconnect",
        reconnectLimit: "Reconnect Limit",
        backgroundSessionKeepAliveMinutes: "Background Keepalive (min)",
        defaultAuthType: "Default Auth Type",
        aiDefaultProvider: "Default AI",
        aiCodexSandboxMode: "Codex",
        aiCopilotPermissionMode: "Copilot",
        defaultPort: "Default SSH Port",
        defaultProjectPath: "Default Project Path",
        defaultTimeoutSeconds: "Default Timeout (s)",
        defaultHeartbeatSeconds: "Default Heartbeat (s)",
        syncConfigEnabled: "Sync config to cloud",
        logRetentionDays: "Retention Days",
        voiceCategoryList: "Category List"
      },
      hints: {
        shellFontSizeReconnect: "Reconnect after changing font size for the cleanest result",
        shellActivationDebugOutline:
          "Tap the activation area to open the soft keyboard. Tapping elsewhere closes it for quicker control.",
        showVoiceInputButton:
          "Control whether the floating voice button and its expanded panel are shown in the lower-right corner.",
        ttsSpeakableMaxChars:
          "Recommended range: 120-1200 characters. Only the assistant response is spoken; input lines and the footer are skipped. Long text is split automatically to shorten the wait for the first chunk.",
        syncConfigLine1: "Turning this off pauses cloud sync for settings, server profiles and notes.",
        syncConfigLine2: "Local save, terminal connections and the current session are not affected.",
        voicePreviewUnicodeOn: "on",
        voicePreviewUnicodeOff: "off",
        terminalPreviewLine: "Unicode11: {unicodeState} | CJK ABC 123 |_END_"
      },
      placeholders: {
        defaultProjectPath: "e.g. ~/workspace",
        newVoiceRecordCategory: "New category"
      },
      buttons: {
        addVoiceRecordCategory: "Add",
        setDefaultCategory: "Set Default",
        removeSelectedCategory: "Delete Selected"
      },
      labels: {
        defaultBadge: "Default",
        ttsSpeakableCharsUnit: " chars"
      },
      options: {
        authType: {
          password: "Password",
          key: "Key"
        },
        aiDefaultProvider: {
          codex: "Codex",
          copilot: "Copilot"
        },
        aiCodexSandboxMode: {
          readOnly: "Read Only",
          workspaceWrite: "Project RW",
          dangerFullAccess: "Full Access"
        },
        aiCopilotPermissionMode: {
          default: "Default",
          experimental: "Experimental",
          allowAll: "Full Access"
        },
        themeMode: {
          dark: "Dark",
          light: "Light"
        },
        uiLanguage: {
          "zh-Hans": "简体中文",
          "zh-Hant": "繁體中文",
          en: "English",
          ja: "日本語",
          ko: "한국어"
        },
        themePresetDefaultSuffix: " (Default)",
        fontFallback: "Monospace Default"
      },
      toast: {
        enterCategoryName: "Enter a category name",
        categoryExists: "Category already exists",
        maxCategories: "Up to 10 categories",
        fallbackCannotDelete: "The fallback category cannot be deleted",
        keepAtLeastOneCategory: "Keep at least one category"
      }
    },
    connect: {
      navTitle: "Servers",
      pageTitle: "My Servers",
      searchPlaceholder: "Search servers",
      recentConnectionPrefix: "Last connected",
      emptyTip: "No matching servers",
      unnamedServer: "Unnamed Server",
      authTypeLabels: {
        password: "Password",
        privateKey: "Private Key",
        certificate: "Certificate"
      },
      textIcons: {
        create: "New",
        remove: "Del",
        selectAll: "All",
        search: "Go",
        copy: "Copy",
        connect: "SSH"
      },
      swipeCopy: "Copy",
      swipeDelete: "Delete",
      modal: {
        removeTitle: "Delete Servers",
        removeContent: "Delete the selected servers ({count})?",
        removeSingleContent: "Delete server \"{name}\"?"
      },
      toast: {
        serverNotFound: "Server not found",
        serverToCopyNotFound: "Server to copy was not found",
        serverCopied: "Server duplicated",
        serverDeleted: "Server deleted",
        clearSearchBeforeSort: "Clear the search filter before reordering"
      },
      summary: {
        connectFromList: "Started connection from the server list",
        aiFromList: "Started AI quick launch from the server list"
      },
      fallback: {
        noConnection: "Never connected",
        newServerPrefix: "server"
      },
      display: {
        projectPrefix: "project"
      }
    },
    logs: {
      navTitle: "Logs",
      exportButton: "Export Redacted Logs",
      totalCount: "{total} entries",
      empty: "No logs yet",
      prev: "Previous",
      next: "Next",
      toast: {
        copied: "Logs copied"
      }
    },
    records: {
      navTitle: "Notes",
      searchPlaceholder: "Search notes",
      allCategories: "All Categories",
      addButton: "Add",
      swipeCopy: "Copy",
      swipeDelete: "Delete",
      swipeProcessed: "Done",
      swipeDiscarded: "Discarded",
      empty: "No notes yet",
      prev: "Previous",
      next: "Next",
      exportButton: "Export Notes",
      editPlaceholder: "Edit note content",
      newRecordHint: "Type to autosave as a new note",
      updatedAtPrefix: "Updated {time}",
      closeEditAriaLabel: "Close editor",
      contextFallback: "No context",
      exportFields: {
        createdAt: "Created",
        updatedAt: "Updated",
        server: "Server",
        category: "Category",
        context: "Context"
      },
      toast: {
        deleted: "Deleted",
        copied: "Copied",
        processed: "Marked done",
        discarded: "Discarded",
        updateFailed: "Update failed",
        categoryUpdated: "Category updated",
        exported: "Notes copied"
      }
    },
    plugins: {
      navTitle: "Plugins",
      runtimeStatePrefix: "Runtime State: ",
      summary:
        "Aligned with the current MiniProgram baseline v3.0.0: lifecycle control, import/export, command execution and runtime logs.",
      sections: {
        pluginList: "Plugin List",
        importJson: "Import Plugin JSON",
        runCommand: "Run Command",
        runtimeLogs: "Runtime Logs"
      },
      buttons: {
        enable: "Enable",
        disable: "Disable",
        reload: "Reload",
        remove: "Remove",
        importJson: "Import",
        exportJson: "Export All (Copy)"
      },
      empty: {
        noPlugins: "No plugins yet",
        noCommands: "No commands are available. A live session and registered plugin commands are required.",
        noLogs: "No logs yet"
      },
      placeholder: {
        pluginJson: '[{"manifest":...,"mainJs":"...","stylesCss":"..."}]'
      },
      modal: {
        removeTitle: "Remove Plugin",
        removeContent: "Remove plugin {id}?"
      },
      toast: {
        bootstrapFailed: "Plugin bootstrap failed",
        pastePluginJsonFirst: "Paste plugin JSON first",
        importSuccess: "Imported",
        importFailed: "Import failed",
        exportSuccess: "Plugin JSON copied",
        exportFailed: "Export failed",
        enabled: "Enabled",
        enableFailed: "Enable failed",
        disabled: "Disabled",
        disableFailed: "Disable failed",
        reloaded: "Reloaded",
        reloadFailed: "Reload failed",
        removed: "Removed",
        removeFailed: "Remove failed",
        commandExecuted: "Command executed",
        commandExecuteFailed: "Command execution failed"
      }
    },
    serverSettings: {
      navTitle: "Server Settings",
      sections: {
        basicTitle: "Basic Info",
        basicDesc: "Identify and locate the target server",
        authTitle: "Authentication",
        authDesc: "Fill in the password or key material based on the auth mode",
        connectTitle: "Connection",
        connectDesc: "Define the connection path and working directory",
        jumpHostTitle: "Jump Host",
        jumpHostDesc: "Reach the target server through the configured jump host"
      },
      fields: {
        name: "Name",
        tags: "Tags",
        host: "Host",
        port: "Port",
        username: "Username",
        authType: "Auth Type",
        password: "Password",
        privateKey: "Private Key",
        passphrase: "Passphrase",
        certificate: "Certificate",
        transportMode: "Transport",
        aiProjectPath: "AI Working Dir",
        jumpHost: "Jump Host",
        jumpPort: "Jump Port",
        jumpUsername: "Jump Username"
      },
      options: {
        authType: {
          password: "Password",
          privateKey: "Private Key",
          certificate: "Certificate"
        }
      },
      placeholders: {
        tags: "prod,beijing",
        aiProjectPath: "~/workspace/project"
      },
      directoryPicker: {
        openButton: "Choose Directory",
        loading: "Loading",
        cancel: "Cancel",
        apply: "Apply"
      },
      modal: {
        socketDomainTitle: "Socket Domain Not Allowed",
        socketDomainContent:
          "The current gateway URL is not in the MiniProgram socket allowlist: {domainHint}",
        socketDomainContentNoHint: "The current gateway URL is not in the MiniProgram socket allowlist",
        connectFailedTitle: "Unable to Connect",
        connectFailedContent:
          "{message}\nCheck whether the host, port, username and authentication details are correct."
      },
      toast: {
        opsConfigMissing: "Ops configuration is missing. Contact the administrator.",
        saved: "Saved",
        connectFromSettings: "Started connection from server settings"
      }
    },
    terminal: {
      navTitle: "Terminal",
      disconnectedHint:
        "Use the reconnect switch in the top-right corner or the AI button in the top-left corner to reconnect.",
      connectionAction: {
        reconnect: "Reconnect",
        disconnect: "Disconnect"
      },
      stateLabels: {
        idle: "Idle",
        connecting: "Connecting",
        auth_pending: "Authorizing",
        connected: "Connected",
        reconnecting: "Reconnecting",
        disconnected: "Disconnected",
        error: "Error",
        config_required: "Config Missing"
      },
      voice: {
        recordingHint: "Recording... release to send or save as a note",
        inputPlaceholder: "Hold the voice button below to start input"
      },
      aiDialog: {
        title: "AI Quick Launch",
        hint: "Launch options moved to Global Settings -> Connection -> AI Connection",
        currentMode: "Current Mode",
        launchCodex: "Launch Codex",
        launchCopilot: "Launch Copilot",
        close: "Close"
      },
      toast: {
        aiAlreadyRunning: "{provider} is already running in this session. Exit it before relaunching"
      },
      fallback: {
        noProject: "No Project Set",
        unnamedServer: "Unnamed Server"
      },
      sessionInfo: {
        title: "Session Info",
        nameLabel: "Server Name",
        projectLabel: "Working Directory",
        addressLabel: "Server Address",
        jumpTargetLabel: "Target Server",
        sshConnectionLabel: "SSH Connection",
        aiConnectionLabel: "AI Connection",
        connectedValue: "Connected",
        disconnectedValue: "Disconnected",
        emptyValue: "-"
      },
      modal: {
        socketDomainTitle: "Socket Domain Not Allowed",
        socketDomainContent:
          "The current gateway URL is not in the MiniProgram socket allowlist: {domainHint}",
        socketDomainContentNoHint: "The current gateway URL is not in the MiniProgram socket allowlist"
      },
      diagnostics: {
        responseAxisCardLabel: "Gateway RTT (ms)",
        networkAxisCardLabel: "Network RTT (ms)",
        chartMinShort: "min",
        chartMaxShort: "max",
        chartAvgShort: "avg",
        chartStatEmpty: "--"
      },
      tts: {
        enable: "Enable TTS",
        disable: "Disable TTS",
        settingsTitle: "Speech Settings",
        settingsDesc: "Control terminal speech playback and total spoken length",
        lengthLabel: "Total spoken length",
        lengthUnit: " chars",
        lengthHint: "Only the assistant response is read aloud. Input lines and the footer are skipped.",
        segmentHint: "Long content is automatically split into smaller chunks to shorten the wait for the first chunk."
      },
      summary: {
        gatewayConnect: "MiniProgram started a gateway connection",
        sessionRestored: "Session resumed",
        sessionConnected: "Session connected"
      },
      errors: {
        serverNotFound: "Server not found",
        sessionNotConnected: "Session is not connected",
        opsConfigMissing: "Ops configuration is missing. Contact the administrator.",
        gatewayError: "Gateway error",
        connectionException: "Connection error",
        sessionReadyTimeout: "Session readiness timed out",
        serverConfigIncomplete: "Server configuration is incomplete",
        connectionFailed: "Connection failed",
        sessionDisconnected: "Session disconnected",
        waitSessionTimeout: "Timed out waiting for the session connection",
        codexLaunchFailed: "Codex launch failed",
        copilotLaunchFailed: "Copilot launch failed",
        codexNotInstalled: "codex is not installed on the server",
        codexLaunching: "Codex is already launching",
        waitCodexTimeout: "Timed out waiting for the Codex launch result",
        micPermissionDenied: "Microphone permission is disabled. Allow recording in settings first.",
        micPermissionReadFailed: "Failed to read microphone permission",
        recorderBusy: "Recorder is busy. Try again later.",
        recordCaptureFailed: "Audio capture failed",
        asrFailed: "Speech recognition failed",
        asrGatewayFailed: "Voice gateway connection failed. Check the MiniProgram socket allowlist.",
        asrGatewayConnectFailed:
          "Voice gateway connection failed. Check the network or gateway configuration.",
        asrTimeout: "Voice service connection timed out. Try again later.",
        clipboardEmpty: "Clipboard is empty",
        clipboardReadFailed: "Failed to read the clipboard",
        noRecordContent: "Nothing to save",
        recordSaved: "Saved to notes",
        noSpeakableContent: "Nothing suitable to read aloud",
        contentNotSpeakable: "The current content is not suitable for speech",
        ttsTextTooLong: "The speech text is too long",
        ttsTimeout: "Speech generation timed out. Try again later.",
        ttsUpstreamRejected: "TTS authentication or permissions failed. Ask the administrator to check the TTS configuration.",
        ttsSynthesizeFailed: "Speech generation failed",
        ttsPlayFailed: "Audio playback failed. Check the network.",
        ttsUnavailable: "The TTS service is not configured"
      }
    }
  }
};

I18N_CATALOG.ja = applyCatalogOverlay(I18N_CATALOG.en, JA_I18N_OVERLAY);
I18N_CATALOG.ko = applyCatalogOverlay(I18N_CATALOG.en, KO_I18N_OVERLAY);

module.exports = {
  I18N_CATALOG
};

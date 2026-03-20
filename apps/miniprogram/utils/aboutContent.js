/* global module, require */

const { ABOUT_JA_OVERLAY, ABOUT_KO_OVERLAY } = require("./aboutContentLocaleOverlays");

/**
 * 关于页内容统一收口：
 * 1. 首页与 5 个详情页共用同一份文案源，避免多处拷贝后失真；
 * 2. 首期先按静态信息页实现，优先满足审核与可访问性。
 */
function cloneValue(value) {
  if (Array.isArray(value)) return value.map((item) => cloneValue(item));
  if (value && typeof value === "object") {
    const next = {};
    Object.keys(value).forEach((key) => {
      next[key] = cloneValue(value[key]);
    });
    return next;
  }
  return value;
}

function applyOverlay(base, overlay) {
  if (!overlay || typeof overlay !== "object") return cloneValue(base);
  if (Array.isArray(base)) {
    const baseArray = Array.isArray(base) ? base : [];
    const overlayArray = Array.isArray(overlay) ? overlay : [];
    const length = Math.max(baseArray.length, overlayArray.length);
    const next = [];
    for (let i = 0; i < length; i += 1) {
      const baseItem = baseArray[i];
      const overlayItem = overlayArray[i];
      if (overlayItem === undefined) {
        next.push(cloneValue(baseItem));
        continue;
      }
      if (
        baseItem &&
        typeof baseItem === "object" &&
        !Array.isArray(baseItem) &&
        overlayItem &&
        typeof overlayItem === "object" &&
        !Array.isArray(overlayItem)
      ) {
        next.push(applyOverlay(baseItem, overlayItem));
        continue;
      }
      next.push(cloneValue(overlayItem));
    }
    return next;
  }
  const next = cloneValue(base);
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
      next[key] = applyOverlay(current, patch);
      return;
    }
    next[key] = cloneValue(patch);
  });
  return next;
}

const ABOUT_BRAND = {
  productName: "RemoteConn",
  chineseName: "AI矩连",
  platformLabel: "AI矩连小程序版",
  version: "v3.0.0",
  updatedAt: "2026-03-18",
  updatedAtCompact: "20260318",
  feedbackEmail: "douboer@gmail.com",
  summary: "管理服务器并在移动端执行AI终端操作。"
};

const ABOUT_HOME_ITEMS = [
  {
    key: "manual",
    title: "使用手册",
    subtitle: "查看各模块的实际操作说明与推荐使用顺序",
    path: "/pages/about-manual/index"
  },
  {
    key: "feedback",
    title: "问题反馈",
    subtitle: "查看反馈方式与建议附带的信息",
    path: "/pages/about-feedback/index"
  },
  {
    key: "privacy",
    title: "隐私政策",
    subtitle: "查看信息收集、使用与存储说明",
    path: "/pages/about-privacy/index"
  },
  {
    key: "changelog",
    title: "变更记录",
    subtitle: "查看完整版本历史与当前遗留问题",
    path: "/pages/about-changelog/index"
  },
  {
    key: "app",
    title: "关于",
    subtitle: "查看产品简介、版本信息与联系信息",
    path: "/pages/about-app/index"
  }
];

/**
 * 小程序使用手册配图统一从应用内静态资源读取：
 * 1. 只给手册页使用，避免 about 其他详情页无意间耦合；
 * 2. 统一走 `/assets/guide`，后续替换图片时只需要改这里；
 * 3. 每个条目保持独立对象，便于按章节组合多张图。
 */
const GUIDE_MOBILE_MEDIA = {
  serverList: { src: "/assets/guide/guide-mobile-01-server-list.jpg" },
  serverConfig: { src: "/assets/guide/guide-mobile-02-server-config.jpg" },
  terminal: { src: "/assets/guide/guide-mobile-03-terminal-status.jpg" },
  voice: { src: "/assets/guide/guide-mobile-04-voice-shortcuts.jpg" },
  settingsUi: { src: "/assets/guide/guide-mobile-05-settings-ui.jpg" },
  settingsTerminal: { src: "/assets/guide/guide-mobile-06-settings-terminal.jpg" },
  settingsConnection: { src: "/assets/guide/guide-mobile-07-settings-connection.jpg" },
  settingsRecords: { src: "/assets/guide/guide-mobile-08-settings-records.jpg" },
  records: { src: "/assets/guide/guide-mobile-09-records.jpg" },
  about: { src: "/assets/guide/guide-mobile-10-about.jpg" }
};

const ABOUT_DETAIL_CONTENT = {
  manual: {
    title: "使用手册",
    lead: "本手册按当前小程序页面结构说明实际操作路径。建议按照“服务器列表 -> 服务器配置 -> 终端 -> 闪念 / 日志 -> 设置 / 插件”的顺序使用，先完成一台服务器配置，再逐步扩展到 AI、语音和插件能力。",
    sections: [
      {
        title: "为什么需要这个APP？",
        bullets: [
          "在 AI 参与开发和运维之后，很多任务不再强依赖完整桌面 IDE，真正不可替代的入口反而是 shell。",
          "手机屏幕虽然小，但如果任务能通过 AI + 终端 + 语音 高效串起来，移动端就不仅是“应急入口”，而可以成为真实可用的工作入口。",
          "技术任务往往是持续迭代的，过程中会不断产生平行的想法、问题和待办。若没有顺手记录机制，这些上下文很容易丢失。"
        ]
      },
      {
        title: "1. 服务器列表：新增、整理和进入连接",
        mediaItems: [GUIDE_MOBILE_MEDIA.serverList],
        bullets: [
          "打开首页“服务器”，左上角第一个按钮用于新增服务器，第二个按钮删除已勾选服务器，第三个按钮全选或取消全选。",
          "顶部搜索框会按名称、主机、用户名、端口和标签过滤服务器；搜索状态下建议先清空关键词再调整顺序。",
          "点击服务器卡片主体会进入“服务器配置”；向左滑卡片可快速复制或删除当前服务器；长按卡片可拖动排序，便于把常用服务器放到前面。",
          "每张卡片右侧保留两个快捷按钮：AI、连接。AI 会直接进入终端并按“全局配置 -> 连接 -> AI连接”的默认 AI 启动；连接会进入该服务器终端；如需复制或删除，请左滑卡片使用动作按钮。",
          "连接中的服务器会在列表中高亮显示；如果该服务器已有可复用会话，再次点击“连接”会直接回到当前终端，而不是重新创建一条会话。"
        ]
      },
      {
        title: "2. 服务器配置：把一台服务器配到可连接状态",
        mediaItems: [GUIDE_MOBILE_MEDIA.serverConfig],
        bullets: [
          "基础信息至少填写名称、主机、端口和用户名；“标签”支持逗号分隔，保存后会显示在服务器卡片底部，便于按环境或项目区分。",
          "认证信息按实际方式填写：密码模式填写密码；私钥模式填写私钥和口令；证书模式再补证书内容。认证方式切换后，请确认对应字段已经完整填写。",
          "连接参数里的“AI工作目录”决定 AI 快速启动时进入的目录。可以手输，也可以点“选择目录”打开远程目录树，展开目录后点“应用”写回表单。",
          "如需跳板机，打开“跳转主机”开关，再分别填写跳板机主机、端口、用户名和独立认证信息；该配置会用于目录选择和终端连接的整条链路。",
          "底部按钮从左到右分别是返回、连接、保存、闪念、关于。建议先点“保存”，确认无误后再点“连接”；如果只是临时修改配置未保存，直接连接前页面也会先尝试落库。"
        ]
      },
      {
        title: "3. 终端：输入、重连、清屏和 AI 快速启动",
        mediaItems: [GUIDE_MOBILE_MEDIA.terminal],
        bullets: [
          "进入终端后，顶部会显示服务器名、连接状态和延迟。右侧开关在已连接时用于断开，在断开后用于重连；左上角按钮会按当前全局配置直接启动默认 AI，旁边是清屏；当 Codex 正在当前会话前台运行时，清屏按钮会禁用。",
          "点击终端输出区域会激活输入焦点并弹出系统键盘；输入框使用原生键盘代理，回车会把当前内容发送到远端终端。",
          "右下角键盘按钮可展开触摸工具区，里面提供方向键、Enter、Paste 和常用快捷键，适合在手机上执行命令行导航、补全和翻页操作。",
          "“Paste”会读取系统剪贴板并发送到当前会话；如果未连接或剪贴板为空，页面会直接提示，不会静默失败。",
          "点击左上角 Codex 图标会按“全局配置 -> 连接 -> AI连接”的当前默认 AI 直接启动。Codex 与 Copilot 的权限模式也在同一卡片中统一设置；前提是服务器配置里的 AI 工作目录存在，且远端已安装对应命令。"
        ]
      },
      {
        title: "4. 语音与闪念：先记录，再决定发送还是存档",
        mediaItems: [GUIDE_MOBILE_MEDIA.voice],
        bullets: [
          "终端右下角悬浮麦克风可拖动位置；点开后会出现语音输入面板，文本框里会显示当前草稿内容。",
          "按住主语音按钮开始录音，松开后把识别结果写入草稿；下方分类胶囊可以选择本次闪念记录要归入的分类。",
          "录音完成后，中间的“记录”按钮会把草稿保存到闪念列表；“发送”按钮会把草稿直接发送到终端执行；右侧两个按钮分别用于清空草稿和关闭面板。",
          "如果你暂时不想把内容发到服务器，优先使用“记录”而不是“发送”；这样可以先在闪念页整理，再决定是否执行。",
          "未连接终端时仍可记录闪念，但不能发送到会话；适合先记操作思路、排查步骤和待执行命令。"
        ]
      },
      {
        title: "5. 日志：看连接过程，导出排查信息",
        bullets: [
          "日志页按时间倒序展示连接相关记录，每条会显示服务器标识、状态、开始结束时间和摘要。",
          "顶部“导出脱敏日志”会把当前全部日志整理成文本并复制到剪贴板，适合发给开发者做排查；这里导出的是脱敏后的摘要，不是原始敏感凭据。",
          "日志页默认每页 15 条，可用“上一页 / 下一页”翻页；如果列表为空，说明当前设备上还没有产生连接日志或日志已被清理。"
        ]
      },
      {
        title: "6. 闪念：搜索、改分类、编辑和导出",
        mediaItems: [GUIDE_MOBILE_MEDIA.records],
        bullets: [
          "闪念页顶部输入框用于全文搜索；右侧下拉按钮可以按分类过滤，方便只看某一类记录。",
          "每条记录左滑后可直接“复制”或“删除”；适合快速把某条命令、报错或笔记重新贴回终端或外部沟通工具。",
          "点击分类标签会弹出快速改分类面板，可把记录移动到其他分类；点击记录卡片主体会打开编辑弹层，支持修改正文和分类。",
          "底部右侧保留“新增”和“导出闪念”两个按钮；“新增”会打开与编辑共用的弹层，输入后自动保存，“导出闪念”会把当前闪念内容复制到剪贴板。"
        ]
      },
      {
        title: "7. 设置：统一调整外观、连接默认值和分类规则",
        mediaItems: [
          GUIDE_MOBILE_MEDIA.settingsUi,
          GUIDE_MOBILE_MEDIA.settingsTerminal,
          GUIDE_MOBILE_MEDIA.settingsConnection,
          GUIDE_MOBILE_MEDIA.settingsRecords
        ],
        bullets: [
          "设置页分为“界面 / 终端 / 连接 / 记录”四个标签。界面标签调整应用主题、背景色、文本色和按钮色；终端标签调整终端配色、字体、字号、行高以及宽字符支持。",
          "如果终端显示密度不合适，可在“终端”标签调整字号和行高；当前版本修改字号后仍建议断开重连一次，避免出现显示未完全刷新。",
          "“连接”标签用于设置 SSH 非主动断开后的自动重连、重连次数上限、后台保活时长，以及默认认证方式、默认端口、默认项目路径、默认超时和心跳。",
          "“记录”标签除了设置记录保留天数，还可以新增闪念分类、设默认分类、删除分类，并通过长按拖动调整分类顺序。"
        ]
      },
      {
        title: "8. 插件与常见使用顺序",
        bullets: [
          "插件页支持粘贴 JSON 导入插件、导出全部插件、启用 / 禁用 / 重载 / 移除插件，并在会话连接后执行插件注册的命令。",
          "如果插件页里没有可执行命令，通常表示当前没有连接中的会话，或插件本身没有注册任何命令；先回终端建立连接，再回插件页刷新。",
          "推荐的新用户使用顺序是：先在“服务器”新增一台机器，进入“服务器配置”填完连接信息，保存并连接；连接稳定后，再尝试语音、闪念、AI 和插件能力。",
          "请仅连接你拥有合法权限的服务器；若出现连接失败、目录加载失败、AI 启动失败或显示异常，先查看日志和闪念记录，再把版本号、复现步骤、截图与日志摘要一并反馈。"
        ]
      },
      {
        title: "9. 关于与资料入口：统一查看版本、手册和反馈方式",
        mediaItems: [GUIDE_MOBILE_MEDIA.about],
        bullets: [
          "关于页集中展示品牌、版本号和产品简介，是说明类信息的统一入口。",
          "这里会收口使用手册、问题反馈、隐私政策、变更记录和关于说明，避免把审核口径和帮助信息散落到多个页面。",
          "当你需要确认版本、补充反馈信息或查看当前功能边界时，优先从关于页进入相关说明。"
        ]
      }
    ]
  },
  feedback: {
    title: "问题反馈",
    lead: "如果你在使用过程中遇到问题或有改进建议，可通过邮箱反馈联系我们。",
    sections: [
      {
        title: "反馈邮箱",
        paragraphs: ["douboer@gmail.com"],
        actionLabel: "反馈"
      },
      {
        title: "建议附带的信息",
        bullets: ["机型与系统版本", "小程序版本号", "复现步骤", "截图或日志摘要"]
      },
      {
        title: "反馈范围",
        bullets: ["连接失败", "终端显示异常", "记录或设置异常", "建议与体验反馈"]
      }
    ]
  },
  privacy: {
    title: "隐私政策",
    lead: "本隐私政策用于说明 RemoteConn（AI矩连）微信小程序在使用时如何收集、使用、存储、共享和保护你的个人信息。",
    sections: [
      {
        title: "我们会处理的信息",
        bullets: [
          "你主动保存的用户设置，例如界面主题、终端显示偏好、默认连接参数、闪念分类与记录保留策略。",
          "你主动保存的服务器配置，例如名称、标签、主机、端口、用户名、项目路径、跳转主机配置，以及为跨设备同步所需的认证信息。",
          "你主动保存的闪念记录，例如正文、分类、上下文标签和更新时间。",
          "当且仅当你在终端语音面板中主动长按语音按钮发起语音输入时，小程序会处理与该轮语音输入直接相关的信息，包括麦克风音频分片和实时语音转写文本。",
          "实现中，受保护字段不会以明文形式保存到服务端，而会在应用层加密后再进行同步存储。"
        ]
      },
      {
        title: "信息用途",
        bullets: [
          "用于保存和恢复服务器配置、用户设置与闪念记录。",
          "用于在你主动触发语音输入时，把录音内容实时转换成文字并回填到终端输入草稿。",
          "用于在你主动点击“发送”或“记录”后，将语音转写文本发送到终端或写入闪念。",
          "用于排查故障、优化稳定性、防范安全风险，并响应法律法规要求。"
        ]
      },
      {
        title: "信息存储方式",
        bullets: [
          "用户设置、服务器配置和闪念记录会保存在当前设备本地；在你开启同步配置能力的前提下，上述配置类数据也会同步保存到服务端存储，用于跨设备恢复。",
          "在语音识别场景下，我们会坚持最小必要原则，仅处理实现该功能所必需的音频分片与转写结果。",
          "系统错误日志、异常堆栈、基础版本信息、设备环境信息和连接状态信息可能在必要的排查场景下被处理。",
          "我们不会因为展示“关于”页面或隐私页面而额外收集与当前功能无关的个人信息。"
        ]
      },
      {
        title: "你的权利",
        bullets: [
          "你可以查询、更正或补充你主动保存的信息。",
          "你可以删除已保存的服务器配置、闪念记录和相关设置项。",
          "你可以关闭同步配置能力，停止后续配置类数据的云端同步。",
          "你可以通过微信系统权限管理关闭录音权限，停止语音输入功能对麦克风的访问。",
          "如对本政策或信息处理方式有疑问、建议或投诉，可通过“问题反馈”页提供的方式联系我们。"
        ]
      }
    ]
  },
  changelog: {
    title: "变更记录",
    lead: "当前页面完整同步仓库 `CHANGELOG.md` 的版本历史，便于直接查看连续版本演进。",
    sections: [
      {
        title: "索引说明",
        bullets: [
          "详细发布说明见 release.md。",
          "若 release.md 未单列某个 vx.y.0，则按 history.md 与 git 历史按连续版本规则补齐。",
          "x.y.z 的 patch 空档不额外补齐；历史补齐版本只用于保持序列连续。"
        ]
      },
      {
        title: "v3.0.0（2026-03-18）",
        bullets: [
          "当前版本新增两项终端交互稳定性修复：高频 stdout 期间的 caret 稳定窗口，以及软键盘仍可见时 shell 输入被动 blur 保护。",
          "README、发布说明、项目描述、关于页、多语言文案与当前基线文档已统一升级到 v3.0.0。",
          "当前版本不新增新的同步协议、终端协议或配置字段，继续沿用 v2.9.6 已明确的能力边界。"
        ]
      },
      {
        title: "v2.9.6（2026-03-13）",
        bullets: [
          "当前版本仅同步文档与对外口径，不引入新的功能、协议行为或交互变更。",
          "README、发布说明、项目描述、关于页、多语言文案与当前基线文档已统一升级到 v2.9.6。",
          "当前版本继续沿用 v2.9.5 已完成的现有终端、同步与时延诊断能力，以及当前语音播报边界口径。"
        ]
      },
      {
        title: "v2.9.5（2026-03-13）",
        bullets: [
          "当前版本仅同步文档与对外口径，不引入新的功能、协议行为或交互变更。",
          "README、发布说明、项目描述、关于页、多语言文案与当前基线文档已统一升级到 v2.9.5。",
          "新登记一条小程序终端语音播报遗留问题：当前播报文本提取与轮次稳定判定仍不够准确，长时间 Codex 交互时也会额外放大小程序端响应压力，现阶段暂不建议默认使用。"
        ]
      },
      {
        title: "v2.9.4（2026-03-12）",
        bullets: [
          "当前版本仅同步文档与对外口径，不引入新的功能、协议行为或交互变更。",
          "README、发布说明、项目描述、关于页、多语言文案与问题闭环记录已统一升级到 v2.9.4。",
          "小程序当前稳定基线继续沿用 v2.9.3 已完成的时延诊断面板与主题对比度收口结果。"
        ]
      },
      {
        title: "v2.9.3（2026-03-11）",
        bullets: [
          "小程序时延诊断浮窗已改成单张双轴平滑曲线图，左轴显示网关响应，右轴显示网络时延。",
          "原“诊断信息”文字卡已删除，顶部改为两张两行摘要卡；同一服务器断开重连后会优先延续最近 30 个采样点。",
          "时延面板现已跟随终端主题做反相配色，深色终端会额外切换一套更深的蓝橙曲线与指标色，保证浅底上的文字和曲线可读性。",
          "发布说明、README、项目描述、关于页与问题闭环记录统一更新到 v2.9.3。"
        ]
      },
      {
        title: "v2.9.1（2026-03-11）",
        bullets: [
          "小程序终端会话续接首次恢复已改为以 `lines + bufferCols / bufferRows` 为准，避免返回服务器列表后再次进入时出现历史区顶部空白与裸露 `5;2H`。",
          "启动阶段 `bootstrap` 合并配置完成后，首页服务器列表与底栏会立即刷新，不再需要重新进入页面才能看到同步后的配置。",
          "小程序用户隐私政策与 about 隐私页已按最新审核口径同步，补齐录音用途、处理范围与用户权利说明。",
          "发布说明、README、项目描述、关于页与问题闭环记录统一更新到 v2.9.1。"
        ]
      },
      {
        title: "v2.9.0（2026-03-11）",
        bullets: [
          "小程序终端已修复 Codex 持续输出期间底部提示块缺行、状态行被裁掉与区域反复闪动的问题。",
          "normal buffer viewport 会保留光标行之后仍真实存在的 footer，`CSI ? 2026 h/l` 同步刷新窗口也已完成兼容收口。",
          "整行统一高亮背景会优先提升到 line 层绘制，`> Use /skills to list available skills` 与代码块不再透出行间底色细线。",
          "会话续接恢复口径已修正：首次恢复优先使用 `lines + bufferCols / bufferRows` 还原当前屏幕，避免返回服务器列表后再次进入时出现历史区顶部空白与裸露 `5;2H`。",
          "当前版本最重要的变更聚焦在交互问题修复；发布说明、README、项目描述、关于页与问题闭环记录统一更新到 v2.9.0。"
        ]
      },
      {
        title: "v2.8.2（2026-03-10）",
        bullets: [
          "服务器列表 connect 按钮与底栏 shell 按钮在活动连接态统一改为高饱和实底高亮，不再依赖描边反馈。",
          "连接态 SVG 前景色改为运行时跟随界面前景色，保证高亮底色上的图标对比度。",
          "about 首页、详情页与 about-app 改为按界面配置推导配色；Web about 页同步切到同一套主题变量策略。",
          "新登记一条 about 反馈遗留问题：当前“反馈”按钮仍只复制邮箱地址，暂不支持直接拉起系统发送邮件组件。",
          "发布说明、README、项目描述与关于页版本口径统一更新到 v2.8.2。"
        ]
      },
      {
        title: "v2.8.1（2026-03-10）",
        bullets: [
          "文档、README、项目描述与关于页版本口径统一更新到 v2.8.1。",
          "终端语音区展开按钮默认全透明，仅保留 SVG 本体；分类胶囊改为贴文字高度，选中态切到更明显的实色背景。",
          "录音中的语音面板在输入框上方新增更显眼的双环脉冲提示，文案更新为“正在收音，松开后发送或记录闪念”。",
          "终端 VT 当前基线继续收口：OSC 10/11/12 返回真实 shell 主题色，备用屏与擦除空白位统一继承擦除背景。",
          "此前点击 Codex 连接选项后的首回显迟滞与等待期间按钮阻塞问题已收敛，当前版本不再将其列为遗留问题。",
          "另记录一个低频终端遗留问题：偶发新连接后首屏只显示光标、提示符稍后才出现；后续再优化连接就绪判定与 prompt 首屏兜底。"
        ]
      },
      {
        title: "v2.7.1（2026-03-10）",
        bullets: [
          "文档与关于页版本口径统一更新到 v2.7.1，并补齐同步 SQLite 的当前边界说明。",
          "明确 remoteconn-sync.db-wal 是 SQLite 写前日志，文件体积不直接等于当前有效同步数据量。",
          "当前跨设备同步仍仅覆盖 settings / servers / records；日志、插件运行时日志与终端会话缓冲继续保留本地。",
          "当前小程序终端仍存在明显交互卡顿：点击 Codex 连接选项后约 10 秒才出现回显，等待期间除上下滑动外其余按钮基本阻塞。"
        ]
      },
      {
        title: "v2.7.0（2026-03-09）",
        bullets: [
          "小程序设置、服务器配置与闪念记录接入 Gateway + SQLite 双层持久化，支持同一微信账号跨设备恢复。",
          "同步链路补齐 bootstrap 与 settings / servers / records 增量推送；服务器和闪念删除支持 tombstone 合并。",
          "SSH 密码、私钥、口令与证书等受保护字段改为服务端加密保存；终端会话缓冲仍不纳入第一阶段同步。"
        ]
      },
      {
        title: "v2.6.6（2026-03-09）",
        bullets: [
          "文档口径统一更新到 v2.6.6。",
          "将“通过 npm run mini 生成的 preview 预览包，不作为正式版本地缓存连续性验证依据”记录为当前遗留问题。",
          "服务器配置、用户设置与闪念记录改为本地 storage + Gateway 同步双层持久化；SSH 密码、私钥、口令与证书等受保护字段在服务端加密保存。"
        ]
      },
      {
        title: "v2.6.5（2026-03-08）",
        bullets: [
          "小程序终端 VT P0 基线收口，补齐双缓冲、备用屏幕切换、DSR / CPR / DA1 / DA2 / DECSTR 与基础局部重绘。",
          "修复 normal buffer 的 live tail 与滚动边界问题，并同步更新当前文档基线到 v2.6.5。"
        ]
      },
      {
        title: "v2.6.1（2026-03-08）",
        bullets: [
          "将“修改字号后偶发吃字/显示不完整”收口为已知遗留问题，并在设置页增加“修改字号后建议断开重连”提示。",
          "收敛数字输入、字体回退与设置页容错逻辑，移除排查阶段的 terminal.wrap 调试输出。"
        ]
      },
      {
        title: "v2.6.0（2026-03-07）",
        bullets: [
          "小程序补齐跳转主机、AI 快速启动、后台续接与连接反馈等主链路能力。",
          "小程序继续补齐终端可用性细节：光标位置计算修复，AI 启动链路正式落地到小程序端。",
          "SSH relay / 跳板机链路从“可配置”推进到“可经 A 主机直接转发连接 B 主机”。",
          "文档口径统一升级到 v2.6.0，并将历史 v2.4.0 说明并入当前对外版本。"
        ]
      },
      {
        title: "v2.5.0（历史补齐，2026-03-07）",
        bullets: [
          "依据 v2.3.0 -> v2.6.0 之间的历史记录，按 3 小时一个 minor 版本的规则补齐。",
          "该阶段主要是 v2.6.0 之前的小程序终端链路收口与 AI、跳板机场景串联，详细内容已并入 v2.6.0。"
        ]
      },
      {
        title: "v2.4.0（历史补齐，2026-03-07）",
        bullets: [
          "history.md 中明确出现版本号 v2.4.0，后续在 v2.6.0 中并档处理。",
          "该阶段集中于小程序终端光标、列宽与 cell 模型重构，以及相关分析文档沉淀，详细内容已并入 v2.6.0。"
        ]
      },
      {
        title: "v2.3.0（2026-03-06）",
        bullets: [
          "小程序完成一轮大范围能力对齐，补齐 connect / server settings / terminal / logs / records / settings / plugins 主页面链路。",
          "Web 端继续精修交互与稳定性，文档口径统一到 v2.3.0。"
        ]
      },
      {
        title: "v2.2.0（2026-03-06）",
        bullets: [
          "闪念增强定稿，补齐分类、编辑、搜索、过滤、快速改分类与上下文快照。",
          "全局配置补齐闪念分类治理、默认分类与拖拽排序。"
        ]
      },
      {
        title: "v2.1.0（历史补齐，2026-03-01）",
        bullets: [
          "依据 v2.0.0 -> v2.2.0 之间的历史记录，按 3 小时一个 minor 版本的规则补齐。",
          "该阶段主要完成小程序连接页、服务器配置页、远程目录选择与基础对齐链路，为 v2.2.0 的记录增强和 v2.3.0 的大范围对齐打底。"
        ]
      },
      {
        title: "v2.0.0（2026-02-27）",
        bullets: [
          "语音输入交互对齐 Figma，闪念记录闭环上线。",
          "日志与记录分页、资源缓存治理、文档与发布规范同步统一。",
          "语音层与键盘工具层的命中区继续收敛，修复工具栏被误判为外部点击后自动折叠的问题。"
        ]
      },
      {
        title: "v1.1.0（2026-02-26）",
        bullets: [
          "终端语音输入全链路、Gateway ASR 代理与 Web 稳定性增强。",
          "终端输入增强为“原生 textarea + 语音输入面板 + 发送确认”组合，并补入 TAB 辅助键。",
          "路由懒加载失败增加自动恢复，缩放防护补齐到 double-tap / dblclick 等路径。"
        ]
      },
      {
        title: "v1.0.9（2026-02-25）",
        bullets: [
          "连接体验治理、服务器列表拖拽排序与移动端防误触优化。",
          "连接与服务器管理继续收敛：支持连接重试次数与分组；新增服务器改为先进入配置页，未改动不落库。",
          "导航与配置页体验统一：返回语义按历史栈处理，终端配置页增加预览块，配置页 UI 完成一轮重构。",
          "终端工具与视觉细节补齐：新增 paste 辅助按钮，修复字体选择，补齐夜间模式与重连提示样式。",
          "会话恢复体验补强：同连接历史可延续，刷新“我的服务器”页默认不主动断开现有会话。"
        ]
      },
      {
        title: "v1.0.8（2026-02-24）",
        bullets: [
          "配置中心稳定性、深浅色模式与网关 runtime 配置落地。",
          "配置中心结构重组：服务器基础/认证绑定到当前服务器，终端/主题/安全切到全局配置。",
          "配置与工具区交互继续收敛：点击外部区域可折叠右下角键盘工具条，Figma 配置区交互并入当前基线。",
          "终端提示文案与初始化输出治理：连接提示更友好，中文输入初始化命令回显默认不展示。"
        ]
      },
      {
        title: "v1.0.6（2026-02-24）",
        bullets: ["Console 触摸工具区可点击性与误触防护优化。"]
      },
      {
        title: "v1.0.5（2026-02-23）",
        bullets: ["iPhone 触摸滚动动量阶段性优化。"]
      },
      {
        title: "v1.0.3（2026-02-23）",
        bullets: ["iOS 触摸焦点状态机稳定性修复。"]
      },
      {
        title: "v1.0.1（2026-02-23）",
        bullets: [
          "生产架构版稳定性更新，确立 Web、Gateway 与插件运行时的多包工程基线。",
          "补齐多服务器与多认证方式管理，最近连接日志可追溯。",
          "Codex 模式主链路可用：连接后自动切目录并启动 codex。",
          "主题与界面自定义基础能力上线，含字体、配色与基础配置中心。"
        ]
      }
    ]
  },
  app: {
    title: "关于",
    lead: "这里展示产品简介、版本信息和基础联系信息。",
    sections: [
      {
        title: "产品信息",
        bullets: [
          "产品名称：RemoteConn",
          "中文名称：AI矩连",
          "平台标识：AI矩连小程序版",
          "当前版本：v3.0.0",
          "修改时间：20260318",
          "数据口径：设置、服务器配置与闪念支持跨设备同步，敏感凭据服务端加密保存",
          "反馈邮箱：douboer@gmail.com",
          "更新时间：2026-03-18"
        ]
      }
    ],
    showBrandHero: true
  }
};

const ABOUT_I18N_OVERLAYS = {
  "zh-Hant": {
    brand: {
      chineseName: "AI矩連",
      platformLabel: "AI矩連小程式版",
      summary: "管理伺服器並在行動端執行 AI 終端操作。"
    },
    homeItems: {
      manual: {
        title: "使用手冊",
        subtitle: "查看各模組的實際操作說明與建議使用順序"
      },
      feedback: {
        title: "問題回饋",
        subtitle: "查看回饋方式與建議附帶資訊"
      },
      privacy: {
        title: "隱私政策",
        subtitle: "查看資訊收集、使用與儲存說明"
      },
      changelog: {
        title: "變更記錄",
        subtitle: "查看完整版本歷史與目前遺留問題"
      },
      app: {
        title: "關於",
        subtitle: "查看產品簡介、版本資訊與聯絡方式"
      }
    },
    details: {
      manual: {
        title: "使用手冊",
        lead: "本手冊依目前小程式頁面結構說明實際操作路徑。建議依照「伺服器清單 -> 伺服器設定 -> 終端 -> 閃念 / 日誌 -> 設定 / 外掛」的順序使用，先完成一台伺服器配置，再逐步擴展到 AI、語音與外掛能力。",
        sections: [
          {
            title: "為什麼需要這個APP？",
            bullets: [
              "在 AI 參與開發與維運之後，很多任務不再強依賴完整桌面 IDE，真正不可替代的入口反而是 shell。",
              "手機螢幕雖然小，但若任務能透過 AI + 終端 + 語音 高效串起來，行動端就不只是「應急入口」，而能成為真實可用的工作入口。",
              "技術任務往往是持續迭代的，過程中會不斷產生平行的想法、問題與待辦。若沒有順手記錄機制，這些上下文很容易遺失。"
            ]
          },
          {
            title: "1. 伺服器清單：新增、整理與進入連線",
            mediaItems: [GUIDE_MOBILE_MEDIA.serverList],
            bullets: [
              "開啟首頁「伺服器」，左上角第一個按鈕用於新增伺服器，第二個按鈕刪除已勾選伺服器，第三個按鈕全選或取消全選。",
              "頂部搜尋框會依名稱、主機、使用者名稱、埠與標籤過濾伺服器；搜尋狀態下建議先清空關鍵字再調整順序。",
              "點擊伺服器卡片主體會進入「伺服器設定」；向左滑卡片可快速複製或刪除目前伺服器；長按卡片可拖曳排序，便於把常用伺服器放在前面。",
              "每張卡片右側保留兩個快捷按鈕：AI、連線。AI 會直接進入終端並依「全域設定 -> 連線 -> AI 連線」的預設 AI 啟動；連線會進入該伺服器終端；如需複製或刪除，請向左滑卡片使用動作按鈕。",
              "連線中的伺服器會在清單中高亮顯示；若該伺服器已有可復用會話，再次點擊「連線」會直接回到目前終端，而不是重新建立一條會話。"
            ]
          },
          {
            title: "2. 伺服器設定：把一台伺服器配到可連線狀態",
            mediaItems: [GUIDE_MOBILE_MEDIA.serverConfig],
            bullets: [
              "基礎資訊至少填寫名稱、主機、埠與使用者名稱；「標籤」支援逗號分隔，儲存後會顯示在伺服器卡片底部，便於按環境或專案區分。",
              "驗證資訊依實際方式填寫：密碼模式填寫密碼；私鑰模式填寫私鑰與口令；憑證模式再補憑證內容。切換驗證方式後，請確認對應欄位已完整填寫。",
              "連線參數中的「AI 工作目錄」決定 AI 快速啟動時進入的目錄。可以手動輸入，也可以點「選擇目錄」開啟遠端目錄樹，展開後點「套用」寫回表單。",
              "如需跳板機，打開「跳轉主機」開關，再分別填寫跳板機主機、埠、使用者名稱與獨立驗證資訊；該配置會用於目錄選擇與終端連線的整條鏈路。",
              "底部按鈕從左到右分別是返回、連線、儲存、閃念、關於。建議先點「儲存」，確認無誤後再點「連線」；若只是臨時修改配置未儲存，直接連線前頁面也會先嘗試落庫。"
            ]
          },
          {
            title: "3. 終端：輸入、重連、清屏與 AI 快速啟動",
            mediaItems: [GUIDE_MOBILE_MEDIA.terminal],
            bullets: [
              "進入終端後，頂部會顯示伺服器名稱、連線狀態與延遲。右側開關在已連線時用於中斷，在中斷後用於重連；左上角按鈕會依目前全域設定直接啟動預設 AI，旁邊是清屏；當 Codex 正在目前會話前台運行時，清屏按鈕會停用。",
              "點擊終端輸出區域會啟用輸入焦點並彈出系統鍵盤；輸入框使用原生鍵盤代理，按 Enter 會把目前內容送到遠端終端。",
              "右下角鍵盤按鈕可展開觸控工具區，內含方向鍵、Enter、Paste 與常用快捷鍵，適合在手機上執行命令列導覽、補全與翻頁。",
              "「Paste」會讀取系統剪貼簿並送到目前會話；若未連線或剪貼簿為空，頁面會直接提示，不會靜默失敗。",
              "點擊左上角 Codex 圖示會依「全域設定 -> 連線 -> AI 連線」中的目前預設 AI 直接啟動。Codex 與 Copilot 的權限模式也會在同一卡片統一設定；前提是伺服器設定中的 AI 工作目錄存在，且遠端已安裝對應命令。"
            ]
          },
          {
            title: "4. 語音與閃念：先記錄，再決定送出還是存檔",
            mediaItems: [GUIDE_MOBILE_MEDIA.voice],
            bullets: [
              "終端右下角懸浮麥克風可拖曳位置；點開後會出現語音輸入面板，文字框中會顯示目前草稿內容。",
              "按住主語音按鈕開始錄音，鬆開後把辨識結果寫入草稿；下方分類膠囊可選擇本次閃念要歸入的分類。",
              "錄音完成後，中間的「記錄」按鈕會把草稿儲存到閃念清單；「送出」按鈕會把草稿直接送到終端執行；右側兩個按鈕分別用於清空草稿與關閉面板。",
              "若你暫時不想把內容發到伺服器，優先使用「記錄」而不是「送出」；這樣可以先在閃念頁整理，再決定是否執行。",
              "未連線終端時仍可記錄閃念，但不能送到會話；適合先記操作思路、排查步驟與待執行命令。"
            ]
          },
          {
            title: "5. 日誌：查看連線過程並匯出排查資訊",
            bullets: [
              "日誌頁依時間倒序展示連線相關記錄，每條會顯示伺服器標識、狀態、開始結束時間與摘要。",
              "頂部「匯出脫敏日誌」會把目前全部日誌整理成文字並複製到剪貼簿，適合發給開發者排查；這裡匯出的是脫敏摘要，不是原始敏感憑據。",
              "日誌頁預設每頁 15 筆，可用「上一頁 / 下一頁」翻頁；若清單為空，表示目前裝置上尚未產生連線日誌或日誌已被清理。"
            ]
          },
          {
            title: "6. 閃念：搜尋、改分類、編輯與匯出",
            mediaItems: [GUIDE_MOBILE_MEDIA.records],
            bullets: [
              "閃念頁頂部輸入框用於全文搜尋；右側下拉按鈕可依分類過濾，方便只查看某一類記錄。",
              "每條記錄左滑後可直接「複製」或「刪除」；適合快速把某條命令、報錯或筆記重新貼回終端或外部溝通工具。",
              "點擊分類標籤會彈出快速改分類面板，可把記錄移動到其他分類；點擊記錄卡片主體會打開編輯彈層，支援修改正文和分類。",
              "底部右側保留「新增」與「匯出閃念」兩個按鈕；「新增」會打開與編輯共用的彈層，輸入後自動儲存，「匯出閃念」會把目前閃念內容複製到剪貼簿。"
            ]
          },
          {
            title: "7. 設定：統一調整外觀、連線預設值與分類規則",
            mediaItems: [
              GUIDE_MOBILE_MEDIA.settingsUi,
              GUIDE_MOBILE_MEDIA.settingsTerminal,
              GUIDE_MOBILE_MEDIA.settingsConnection,
              GUIDE_MOBILE_MEDIA.settingsRecords
            ],
            bullets: [
              "設定頁分為「介面 / 終端 / 連線 / 記錄」四個標籤。介面標籤調整應用主題、背景色、文字色與按鈕色；終端標籤調整終端配色、字體、字號、行高與寬字元支援。",
              "若終端顯示密度不合適，可在「終端」標籤調整字號與行高；目前版本修改字號後仍建議中斷重連一次，避免顯示未完全刷新。",
              "「連線」標籤用於設定 SSH 非主動斷線後的自動重連、重連次數上限、背景保活時長，以及預設驗證方式、預設埠、預設專案路徑、預設逾時與心跳。",
              "「記錄」標籤除了設定保留天數，還可新增閃念分類、設為預設分類、刪除分類，並透過長按拖曳調整分類順序。"
            ]
          },
          {
            title: "8. 外掛與常見使用順序",
            bullets: [
              "外掛頁支援貼上 JSON 匯入外掛、匯出全部外掛、啟用 / 停用 / 重載 / 移除外掛，並在會話連線後執行外掛註冊的命令。",
              "若外掛頁中沒有可執行命令，通常表示目前沒有連線中的會話，或外掛本身沒有註冊任何命令；先回終端建立連線，再回外掛頁刷新。",
              "建議新使用者的使用順序是：先在「伺服器」新增一台機器，進入「伺服器設定」填完連線資訊，儲存並連線；連線穩定後，再嘗試語音、閃念、AI 與外掛能力。",
              "請只連線你擁有合法權限的伺服器；若出現連線失敗、目錄載入失敗、AI 啟動失敗或顯示異常，先查看日誌與閃念記錄，再把版本號、重現步驟、截圖與日誌摘要一併回饋。"
            ]
          },
          {
            title: "9. 關於與資料入口：統一查看版本、手冊與回饋方式",
            mediaItems: [GUIDE_MOBILE_MEDIA.about],
            bullets: [
              "關於頁集中展示品牌、版本號與產品簡介，是說明類資訊的統一入口。",
              "這裡會收口使用手冊、問題回饋、隱私政策、變更記錄與關於說明，避免把審核口徑與幫助資訊散落到多個頁面。",
              "當你需要確認版本、補充回饋資訊或查看目前功能邊界時，優先從關於頁進入相關說明。"
            ]
          }
        ]
      },
      feedback: {
        title: "問題回饋",
        lead: "如果你在使用過程中遇到問題或有改進建議，可透過郵件回饋與我們聯絡。",
        sections: [
          {
            title: "回饋郵箱",
            paragraphs: ["douboer@gmail.com"],
            actionLabel: "回饋"
          },
          {
            title: "建議附帶的資訊",
            bullets: ["機型與系統版本", "小程式版本號", "重現步驟", "截圖或日誌摘要"]
          },
          {
            title: "回饋範圍",
            bullets: ["連線失敗", "終端顯示異常", "記錄或設定異常", "建議與體驗回饋"]
          }
        ]
      },
      privacy: {
        title: "隱私政策",
        lead: "本隱私政策用於說明 RemoteConn（AI矩連）微信小程式在使用時如何蒐集、使用、儲存、共享與保護你的個人資訊。",
        sections: [
          {
            title: "我們會處理的資訊",
            bullets: [
              "你主動儲存的使用者設定，例如介面主題、終端顯示偏好、預設連線參數、閃念分類與記錄保留策略。",
              "你主動儲存的伺服器配置，例如名稱、標籤、主機、埠、使用者名稱、專案路徑、跳轉主機配置，以及跨裝置同步所需的驗證資訊。",
              "你主動儲存的閃念記錄，例如正文、分類、上下文標籤與更新時間。",
              "當且僅當你在終端語音面板中主動長按語音按鈕發起語音輸入時，小程式會處理與該輪語音輸入直接相關的資訊，包括麥克風音訊分片與即時語音轉寫文字。",
              "實作中，受保護欄位不會以明文形式保存到服務端，而會在應用層加密後再進行同步儲存。"
            ]
          },
          {
            title: "資訊用途",
            bullets: [
              "用於保存與恢復伺服器配置、使用者設定與閃念記錄。",
              "用於在你主動觸發語音輸入時，把錄音內容即時轉成文字並回填到終端輸入草稿。",
              "用於在你主動點擊「送出」或「記錄」後，將語音轉寫文字送到終端或寫入閃念。",
              "用於排查故障、優化穩定性、防範安全風險，並回應法律法規要求。"
            ]
          },
          {
            title: "資訊儲存方式",
            bullets: [
              "使用者設定、伺服器配置與閃念記錄會保存在目前裝置本地；在你開啟同步配置能力的前提下，上述配置類資料也會同步保存到服務端儲存，用於跨裝置恢復。",
              "在語音辨識場景下，我們會堅持最小必要原則，只處理實現該功能所必需的音訊分片與轉寫結果。",
              "系統錯誤日誌、異常堆疊、基礎版本資訊、裝置環境資訊與連線狀態資訊可能在必要的排查場景下被處理。",
              "我們不會因為展示「關於」頁面或隱私頁面而額外蒐集與目前功能無關的個人資訊。"
            ]
          },
          {
            title: "你的權利",
            bullets: [
              "你可以查詢、更正或補充你主動儲存的資訊。",
              "你可以刪除已儲存的伺服器配置、閃念記錄與相關設定項。",
              "你可以關閉同步配置能力，停止後續配置類資料的雲端同步。",
              "你可以透過微信系統權限管理關閉錄音權限，停止語音輸入功能對麥克風的存取。",
              "如對本政策或資訊處理方式有疑問、建議或投訴，可透過「問題回饋」頁提供的方式與我們聯絡。"
            ]
          }
        ]
      },
      changelog: {
        title: "變更記錄",
        lead: "目前頁面完整同步倉庫 `CHANGELOG.md` 的版本歷史，方便直接查看連續版本演進。",
        sections: [
          {
            title: "索引說明",
            bullets: [
              "詳細發布說明見 release.md。",
              "若 release.md 未單列某個 vx.y.0，則依 history.md 與 git 歷史按連續版本規則補齊。",
              "x.y.z 的 patch 空檔不另行補齊；歷史補齊版本僅用於保持序列連續。"
            ]
          },
          {
            title: "v3.0.0（2026-03-18）",
            bullets: [
              "目前版本新增兩項終端互動穩定性修復：高頻 stdout 期間的 caret 穩定視窗，以及軟鍵盤仍可見時 shell 輸入被動 blur 保護。",
              "README、發布說明、專案描述、關於頁、多語言文案與目前基線文件已統一升級到 v3.0.0。",
              "目前版本不新增新的同步協定、終端協定或配置欄位，繼續沿用 v2.9.6 已明確的能力邊界。"
            ]
          },
          {
            title: "v2.9.6（2026-03-13）",
            bullets: [
              "目前版本僅同步文件與對外口徑，不引入新的功能、協定行為或互動變更。",
              "README、發布說明、專案描述、關於頁、多語言文案與目前基線文件已統一升級到 v2.9.6。",
              "目前版本繼續沿用 v2.9.5 已完成的現有終端、同步與時延診斷能力，以及目前語音播報邊界口徑。"
            ]
          },
          {
            title: "v2.9.5（2026-03-13）",
            bullets: [
              "目前版本僅同步文件與對外口徑，不引入新的功能、協定行為或互動變更。",
              "README、發布說明、專案描述、關於頁、多語言文案與目前基線文件已統一升級到 v2.9.5。",
              "新登記一條小程式終端語音播報遺留問題：目前播報文字提取與輪次穩定判定仍不夠準確，長時間 Codex 互動時也會額外放大小程式端回應壓力，現階段暫不建議預設使用。"
            ]
          },
          {
            title: "v2.9.4（2026-03-12）",
            bullets: [
              "目前版本僅同步文件與對外口徑，不引入新的功能、協定行為或互動變更。",
              "README、發布說明、專案描述、關於頁、多語言文案與問題閉環記錄已統一升級到 v2.9.4。",
              "小程式目前穩定基線繼續沿用 v2.9.3 已完成的時延診斷面板與主題對比度收口結果。"
            ]
          },
          {
            title: "v2.9.3（2026-03-11）",
            bullets: [
              "小程式時延診斷浮窗已改成單張雙軸平滑曲線圖，左軸顯示網關回應，右軸顯示網路時延。",
              "原「診斷資訊」文字卡已移除，頂部改為兩張兩行摘要卡；同一伺服器斷開重連後會優先延續最近 30 個採樣點。",
              "時延面板現已跟隨終端主題做反相配色，深色終端會額外切換一套更深的藍橙曲線與指標色，確保淺底上的文字和曲線可讀性。",
              "發布說明、README、專案描述、關於頁與問題閉環記錄統一更新到 v2.9.3。"
            ]
          },
          {
            title: "v2.9.1（2026-03-11）",
            bullets: [
              "小程式終端會話續接首次恢復已改為以 `lines + bufferCols / bufferRows` 為準，避免返回伺服器清單後再次進入時出現歷史區頂部空白與裸露 `5;2H`。",
              "啟動階段 `bootstrap` 合併配置完成後，首頁伺服器清單與底欄會立即刷新，不再需要重新進入頁面才能看到同步後的配置。",
              "小程式使用者隱私政策與 about 隱私頁已按最新審核口徑同步，補齊錄音用途、處理範圍與使用者權利說明。",
              "發布說明、README、專案描述、關於頁與問題閉環記錄統一更新到 v2.9.1。"
            ]
          },
          {
            title: "v2.9.0（2026-03-11）",
            bullets: [
              "小程式終端已修復 Codex 持續輸出期間底部提示塊缺行、狀態行被裁掉與區域反覆閃動的問題。",
              "normal buffer viewport 會保留游標行之後仍真實存在的 footer，`CSI ? 2026 h/l` 同步刷新視窗也已完成相容收口。",
              "整行統一高亮背景會優先提升到 line 層繪製，`> Use /skills to list available skills` 與程式碼區塊不再透出行間底色細線。",
              "會話續接恢復口徑已修正：首次恢復優先使用 `lines + bufferCols / bufferRows` 還原目前畫面，避免返回伺服器清單後再次進入時出現歷史區頂部空白與裸露 `5;2H`。",
              "目前版本最重要的變更聚焦在互動問題修復；發布說明、README、專案描述、關於頁與問題閉環記錄統一更新到 v2.9.0。"
            ]
          },
          {
            title: "v2.8.2（2026-03-10）",
            bullets: [
              "伺服器清單 connect 按鈕與底欄 shell 按鈕在活動連線態統一改為高飽和實底高亮，不再依賴描邊回饋。",
              "連線態 SVG 前景色改為執行時跟隨介面前景色，保證高亮底色上的圖示對比度。",
              "about 首頁、詳情頁與 about-app 改為依介面配置推導配色；Web about 頁同步切到同一套主題變數策略。",
              "新登記一條 about 回饋遺留問題：目前「回饋」按鈕仍只複製郵箱地址，暫不支援直接拉起系統寄信元件。",
              "發布說明、README、專案描述與關於頁版本口徑統一更新到 v2.8.2。"
            ]
          },
          {
            title: "v2.8.1（2026-03-10）",
            bullets: [
              "文件、README、專案描述與關於頁版本口徑統一更新到 v2.8.1。",
              "終端語音區展開按鈕預設全透明，只保留 SVG 本體；分類膠囊改為貼齊文字高度，選中態切到更明顯的實色背景。",
              "錄音中的語音面板在輸入框上方新增更顯眼的雙環脈衝提示，文案更新為「正在收音，鬆開後送出或記錄閃念」。",
              "終端 VT 目前基線持續收口：OSC 10/11/12 回傳真實 shell 主題色，備用屏與擦除空白位統一繼承擦除背景。",
              "此前點擊 Codex 連線選項後的首回顯遲滯與等待期間按鈕阻塞問題已收斂，目前版本不再將其列為遺留問題。",
              "另記錄一個低頻終端遺留問題：偶發新連線後首屏只顯示游標、提示符稍後才出現；後續再優化連線就緒判定與 prompt 首屏兜底。"
            ]
          },
          {
            title: "v2.7.1（2026-03-10）",
            bullets: [
              "文件與關於頁版本口徑統一更新到 v2.7.1，並補齊同步 SQLite 的目前邊界說明。",
              "明確 remoteconn-sync.db-wal 是 SQLite 寫前日誌，檔案體積不直接等於目前有效同步資料量。",
              "目前跨裝置同步仍僅覆蓋 settings / servers / records；日誌、外掛執行時日誌與終端會話緩衝仍保留本地。",
              "目前小程式終端仍存在明顯互動卡頓：點擊 Codex 連線選項後約 10 秒才出現回顯，等待期間除上下滑動外其餘按鈕基本阻塞。"
            ]
          },
          {
            title: "v2.7.0（2026-03-09）",
            bullets: [
              "小程式設定、伺服器配置與閃念記錄接入 Gateway + SQLite 雙層持久化，支援同一微信帳號跨裝置恢復。",
              "同步鏈路補齊 bootstrap 與 settings / servers / records 增量推送；伺服器與閃念刪除支援 tombstone 合併。",
              "SSH 密碼、私鑰、口令與憑證等受保護欄位改為服務端加密保存；終端會話緩衝仍不納入第一階段同步。"
            ]
          },
          {
            title: "v2.6.6（2026-03-09）",
            bullets: [
              "文件口徑統一更新到 v2.6.6。",
              "將「透過 npm run mini 生成的 preview 預覽包，不作為正式版本本地快取連續性驗證依據」記錄為目前遺留問題。",
              "伺服器配置、使用者設定與閃念記錄改為本地 storage + Gateway 同步雙層持久化；SSH 密碼、私鑰、口令與憑證等受保護欄位在服務端加密保存。"
            ]
          },
          {
            title: "v2.6.5（2026-03-08）",
            bullets: [
              "小程式終端 VT P0 基線收口，補齊雙緩衝、備用螢幕切換、DSR / CPR / DA1 / DA2 / DECSTR 與基礎局部重繪。",
              "修復 normal buffer 的 live tail 與捲動邊界問題，並同步更新目前文件基線到 v2.6.5。"
            ]
          },
          {
            title: "v2.6.1（2026-03-08）",
            bullets: [
              "將「修改字號後偶發吃字 / 顯示不完整」收口為已知遺留問題，並在設定頁新增「修改字號後建議中斷重連」提示。",
              "收斂數字輸入、字型回退與設定頁容錯邏輯，移除排查階段的 terminal.wrap 調試輸出。"
            ]
          },
          {
            title: "v2.6.0（2026-03-07）",
            bullets: [
              "小程式補齊跳轉主機、AI 快速啟動、背景續接與連線回饋等主鏈路能力。",
              "小程式持續補齊終端可用性細節：修復游標位置計算，AI 啟動鏈路正式落地到小程式端。",
              "SSH relay / 跳板機鏈路從「可配置」推進到「可經 A 主機直接轉發連線 B 主機」。",
              "文件口徑統一升級到 v2.6.0，並將歷史 v2.4.0 說明併入目前對外版本。"
            ]
          },
          {
            title: "v2.5.0（歷史補齊，2026-03-07）",
            bullets: [
              "依據 v2.3.0 -> v2.6.0 之間的歷史記錄，按 3 小時一個 minor 版本的規則補齊。",
              "該階段主要是 v2.6.0 之前的小程式終端鏈路收口與 AI、跳板機場景串聯，詳細內容已併入 v2.6.0。"
            ]
          },
          {
            title: "v2.4.0（歷史補齊，2026-03-07）",
            bullets: [
              "history.md 中明確出現版本號 v2.4.0，後續在 v2.6.0 中併檔處理。",
              "該階段集中於小程式終端游標、列寬與 cell 模型重構，以及相關分析文件沉澱，詳細內容已併入 v2.6.0。"
            ]
          },
          {
            title: "v2.3.0（2026-03-06）",
            bullets: [
              "小程式完成一輪大範圍能力對齊，補齊 connect / server settings / terminal / logs / records / settings / plugins 主頁面鏈路。",
              "Web 端持續精修互動與穩定性，文件口徑統一到 v2.3.0。"
            ]
          },
          {
            title: "v2.2.0（2026-03-06）",
            bullets: [
              "閃念增強定稿，補齊分類、編輯、搜尋、過濾、快速改分類與上下文快照。",
              "全域配置補齊閃念分類治理、預設分類與拖曳排序。"
            ]
          },
          {
            title: "v2.1.0（歷史補齊，2026-03-01）",
            bullets: [
              "依據 v2.0.0 -> v2.2.0 之間的歷史記錄，按 3 小時一個 minor 版本的規則補齊。",
              "該階段主要完成小程式連線頁、伺服器設定頁、遠端目錄選擇與基礎對齊鏈路，為 v2.2.0 的記錄增強和 v2.3.0 的大範圍對齊打底。"
            ]
          },
          {
            title: "v2.0.0（2026-02-27）",
            bullets: [
              "語音輸入互動對齊 Figma，閃念記錄閉環上線。",
              "日誌與記錄分頁、資源快取治理、文件與發布規範同步統一。",
              "語音層與鍵盤工具層的命中區持續收斂，修復工具列被誤判為外部點擊後自動收合的問題。"
            ]
          },
          {
            title: "v1.1.0（2026-02-26）",
            bullets: [
              "終端語音輸入全鏈路、Gateway ASR 代理與 Web 穩定性增強。",
              "終端輸入增強為「原生 textarea + 語音輸入面板 + 送出確認」組合，並補入 TAB 輔助鍵。",
              "路由懶載入失敗增加自動恢復，縮放防護補齊到 double-tap / dblclick 等路徑。"
            ]
          },
          {
            title: "v1.0.9（2026-02-25）",
            bullets: [
              "連線體驗治理、伺服器清單拖曳排序與行動端防誤觸最佳化。",
              "連線與伺服器管理持續收斂：支援連線重試次數與分組；新增伺服器改為先進入設定頁，未改動不落庫。",
              "導航與設定頁體驗統一：返回語義按歷史棧處理，終端設定頁新增預覽區塊，設定頁 UI 完成一輪重構。",
              "終端工具與視覺細節補齊：新增 paste 輔助按鈕，修復字型選擇，補齊夜間模式與重連提示樣式。",
              "會話恢復體驗補強：同連線歷史可延續，重新整理「我的伺服器」頁預設不主動中斷現有會話。"
            ]
          },
          {
            title: "v1.0.8（2026-02-24）",
            bullets: [
              "設定中心穩定性、深淺色模式與 Gateway runtime 配置落地。",
              "設定中心結構重組：伺服器基礎 / 驗證綁定到目前伺服器，終端 / 主題 / 安全切到全域配置。",
              "配置與工具區互動持續收斂：點擊外部區域可收合右下角鍵盤工具列，Figma 配置區互動併入目前基線。",
              "終端提示文案與初始化輸出治理：連線提示更友善，中文輸入初始化命令回顯預設不展示。"
            ]
          },
          {
            title: "v1.0.6（2026-02-24）",
            bullets: ["Console 觸控工具區可點擊性與防誤觸最佳化。"]
          },
          {
            title: "v1.0.5（2026-02-23）",
            bullets: ["iPhone 觸控捲動慣性階段性最佳化。"]
          },
          {
            title: "v1.0.3（2026-02-23）",
            bullets: ["iOS 觸控焦點狀態機穩定性修復。"]
          },
          {
            title: "v1.0.1（2026-02-23）",
            bullets: [
              "生產架構版穩定性更新，確立 Web、Gateway 與外掛執行時的多包工程基線。",
              "補齊多伺服器與多驗證方式管理，最近連線日誌可追溯。",
              "Codex 模式主鏈路可用：連線後自動切目錄並啟動 codex。",
              "主題與介面自訂基礎能力上線，包含字型、配色與基礎設定中心。"
            ]
          }
        ]
      },
      app: {
        title: "關於",
        lead: "這裡展示產品簡介、版本資訊和基礎聯絡資訊。",
        sections: [
          {
            title: "產品資訊",
            bullets: [
              "產品名稱：RemoteConn",
              "中文名稱：AI矩連",
              "平台標識：AI矩連小程式版",
              "目前版本：v3.0.0",
              "修改時間：20260318",
              "資料口徑：設定、伺服器配置與閃念支援跨裝置同步，敏感憑據於服務端加密保存",
              "回饋郵箱：douboer@gmail.com",
              "更新時間：2026-03-18"
            ]
          }
        ]
      }
    },
    footerLinks: {
      manual: "使用說明",
      privacy: "隱私政策"
    },
    shareButton: "分享給朋友",
    copiedEmail: "已複製郵箱"
  },
  en: {
    brand: {
      chineseName: "AI JuLian",
      platformLabel: "RemoteConn MiniProgram",
      summary: "Manage servers and run AI terminal workflows on mobile."
    },
    homeItems: {
      manual: {
        title: "Manual",
        subtitle: "Learn the actual workflow and recommended usage order"
      },
      feedback: {
        title: "Feedback",
        subtitle: "See contact options and the info to include"
      },
      privacy: {
        title: "Privacy",
        subtitle: "Review data collection, usage and storage details"
      },
      changelog: {
        title: "Changelog",
        subtitle: "Browse version history and current known gaps"
      },
      app: {
        title: "About",
        subtitle: "Product summary, version info and contact details"
      }
    },
    details: {
      manual: {
        title: "Manual",
        lead: "This manual follows the current MiniProgram page structure and explains the actual workflow. Recommended order: Servers -> Server Settings -> Terminal -> Notes / Logs -> Settings / Plugins. Configure one server first, then expand to AI, voice and plugin features.",
        sections: [
          {
            title: "Why This App?",
            bullets: [
              "As AI becomes part of development and operations, many tasks no longer depend on a full desktop IDE. The shell remains the irreplaceable entry point.",
              "A phone screen is small, but if AI + Terminal + Voice are chained efficiently, mobile stops being only an emergency fallback and becomes a practical work entry point.",
              "Technical work is iterative. Ideas, issues and follow-up tasks appear in parallel, and without a lightweight capture path that context is easy to lose."
            ]
          },
          {
            title: "1. Server List: add, organize and connect",
            mediaItems: [GUIDE_MOBILE_MEDIA.serverList],
            bullets: [
              "Open the Servers home page. The first button in the top-left adds a server, the second deletes selected servers, and the third toggles select all.",
              "The search box filters by name, host, username, port and tags. Clear the query before reordering cards.",
              "Tap a server card to enter Server Settings. Swipe left on a card to quickly copy or delete that server. Long-press a card to drag and reorder frequently used servers.",
              "Each card keeps two quick actions on the right: AI and Connect. AI opens the terminal and immediately launches the default AI from Global Settings -> Connection -> AI Connection, and Connect enters the terminal for that server. Use the swipe actions to copy or delete a server.",
              "Connected servers are highlighted. If a reusable session already exists, tapping Connect returns to the current terminal instead of creating a new session."
            ]
          },
          {
            title: "2. Server Settings: make one server connectable",
            mediaItems: [GUIDE_MOBILE_MEDIA.serverConfig],
            bullets: [
              "Basic fields should include a name, host, port and username. Tags support comma-separated values and appear on the server card after saving.",
              "Fill authentication fields based on the selected mode: password, private key plus passphrase, or certificate mode with certificate content.",
              "AI Working Dir decides which directory AI quick launch enters. You can type it manually or use Select Directory to browse the remote tree and apply a folder.",
              "If a jump host is required, enable it and fill in the jump host address, port, username and its own credentials. The same chain is used for directory browsing and terminal connection.",
              "The bottom actions are Back, Connect, Save, Notes and About. Save first, then connect. If you connect with unsaved edits, the page still tries to persist the profile first."
            ]
          },
          {
            title: "3. Terminal: input, reconnect, clear and AI quick launch",
            mediaItems: [GUIDE_MOBILE_MEDIA.terminal],
            bullets: [
              "In Terminal, the top bar shows the server name, connection state and latency. The right switch disconnects an active session and reconnects after disconnection. The top-left AI button now launches the current default AI directly, and the adjacent button clears the screen unless Codex is currently holding the foreground of that session.",
              "Tap the terminal output area to focus input and open the system keyboard. Press Enter to send the current text to the remote terminal.",
              "The keyboard button in the lower-right expands the touch tool strip with arrow keys, Enter, Paste and common shortcuts for mobile command-line use.",
              "Paste reads from the system clipboard and sends it to the active session. If the session is offline or the clipboard is empty, the page shows an explicit message.",
              "Tap the Codex icon in the top-left to launch the current default AI configured under Global Settings -> Connection -> AI Connection. The permission modes for Codex and Copilot are also managed there, as long as the AI working directory exists and the remote command is installed."
            ]
          },
          {
            title: "4. Voice and Notes: capture first, decide later",
            mediaItems: [GUIDE_MOBILE_MEDIA.voice],
            bullets: [
              "The floating microphone in the lower-right can be dragged. Opening it reveals the voice input panel with the current draft text.",
              "Hold the main voice button to start recording. When you release, the recognition result is written into the draft. The category pills choose where the note will be stored.",
              "After recording, Record saves the draft into Notes, Send sends it directly to the terminal, and the two buttons on the right clear the draft or close the panel.",
              "If you do not want to execute the content immediately, use Record instead of Send so you can refine it in Notes first.",
              "Notes can still be recorded while the terminal is offline, but they cannot be sent to the session until the session is connected."
            ]
          },
          {
            title: "5. Logs: inspect connection flow and export diagnostics",
            bullets: [
              "Logs are listed in reverse chronological order. Each item shows the server identifier, status, timestamps and summary.",
              "Export Redacted Logs copies all current logs to the clipboard in text form. The export is redacted and meant for troubleshooting, not raw secret material.",
              "The page shows 15 items per page by default. Use Previous and Next to paginate. An empty list means no connection logs exist locally or they were cleaned up."
            ]
          },
          {
            title: "6. Notes: search, recategorize, edit and export",
            mediaItems: [GUIDE_MOBILE_MEDIA.records],
            bullets: [
              "The search box performs full-text filtering. Use the dropdown on the right to filter by category.",
              "Swipe left on a record to copy or delete it. This is useful for sending a command, error or note back to the terminal or another tool.",
              "Tap the category tag to open the quick recategorization panel. Tap the card body to open the editor and change both content and category.",
              "Two actions stay at the bottom right: Add and Export Notes. Add opens the shared editor and autosaves after input, while Export Notes copies the current note content to the clipboard."
            ]
          },
          {
            title: "7. Settings: unify appearance, defaults and category rules",
            mediaItems: [
              GUIDE_MOBILE_MEDIA.settingsUi,
              GUIDE_MOBILE_MEDIA.settingsTerminal,
              GUIDE_MOBILE_MEDIA.settingsConnection,
              GUIDE_MOBILE_MEDIA.settingsRecords
            ],
            bullets: [
              "Settings contains four tabs: UI, Terminal, Connection and Records. UI controls app theme, background, text and button colors. Terminal controls terminal colors, fonts, font size, line height and wide-character support.",
              "If the terminal density feels off, adjust font size and line height in Terminal. Reconnect after changing font size for the cleanest result.",
              "Connection controls auto reconnect after non-manual SSH disconnects, reconnect limit, background keepalive, default auth type, default port, default project path, timeout and heartbeat.",
              "Records controls retention days and lets you add, set default, delete and drag-sort note categories."
            ]
          },
          {
            title: "8. Plugins and the recommended workflow",
            bullets: [
              "Plugins supports pasting JSON to import plugins, exporting all plugins, enabling, disabling, reloading and removing plugins, and running registered commands after a session is connected.",
              "If no commands appear in Plugins, the usual reason is that there is no active session or the plugin did not register commands. Connect in Terminal first, then refresh Plugins.",
              "Recommended first-run flow: add one server in Servers, finish the profile in Server Settings, save and connect, then expand to voice, notes, AI and plugins.",
              "Only connect to servers you are authorized to use. If connection, directory loading, AI startup or rendering fails, collect the version, repro steps, screenshots and redacted logs before sending feedback."
            ]
          },
          {
            title: "9. About and support entry points",
            mediaItems: [GUIDE_MOBILE_MEDIA.about],
            bullets: [
              "The About page centralizes the brand, version and product summary, making it the main entry for explanatory information.",
              "It groups the Manual, Feedback, Privacy, Changelog and About pages so review-facing copy and help content do not get scattered across the app.",
              "When you need to confirm the version, attach support details or review the current feature boundaries, start from the About page."
            ]
          }
        ]
      },
      feedback: {
        title: "Feedback",
        lead: "If you hit a problem or have suggestions, contact us by email.",
        sections: [
          {
            title: "Email",
            paragraphs: ["douboer@gmail.com"],
            actionLabel: "Email"
          },
          {
            title: "Recommended details",
            bullets: [
              "Device model and OS version",
              "MiniProgram version",
              "Reproduction steps",
              "Screenshots or redacted logs"
            ]
          },
          {
            title: "Feedback scope",
            bullets: [
              "Connection failures",
              "Terminal rendering issues",
              "Notes or settings issues",
              "Suggestions and UX feedback"
            ]
          }
        ]
      },
      privacy: {
        title: "Privacy",
        lead: "This privacy notice explains how the RemoteConn MiniProgram collects, uses, stores, shares and protects your personal information during normal use.",
        sections: [
          {
            title: "What we process",
            bullets: [
              "Settings you save intentionally, such as UI theme, terminal display preferences, default connection parameters, note categories and retention rules.",
              "Server profiles you save intentionally, such as name, tags, host, port, username, project path, jump-host settings and the credentials required for cross-device sync.",
              "Notes you save intentionally, such as content, category, context label and updated time.",
              "Only when you actively hold the voice button in the terminal voice panel to start voice input does the MiniProgram process the information required for that round, including microphone audio chunks and live speech-to-text results.",
              "In the current implementation, protected fields are never stored on the server in plain text and are synced only after application-layer encryption."
            ]
          },
          {
            title: "Why we use the data",
            bullets: [
              "To save and restore server profiles, user settings and note records.",
              "To convert audio into text in real time when you explicitly start voice input and fill the terminal draft.",
              "To send speech-to-text results to the terminal or save them as notes only after you explicitly tap Send or Record.",
              "To troubleshoot issues, improve stability, prevent security risks and respond to legal or regulatory requirements."
            ]
          },
          {
            title: "How the data is stored",
            bullets: [
              "Settings, server profiles and notes are stored on the current device. When config sync is enabled, the same configuration data is also stored on the server side for cross-device recovery.",
              "For voice recognition, we follow a minimum-necessary principle and process only the audio chunks and transcription results required to provide that feature.",
              "System error logs, stack traces, version information, device environment information and connection status may be processed when necessary for troubleshooting.",
              "Opening the About pages or privacy pages does not trigger collection of unrelated personal information."
            ]
          },
          {
            title: "Your rights",
            bullets: [
              "You can query, correct or supplement the information you intentionally saved.",
              "You can delete saved server profiles, notes and related settings.",
              "You can turn off config sync to stop future cloud sync for configuration data.",
              "You can disable microphone permission in WeChat system settings to stop voice input from accessing the microphone.",
              "If you have questions, suggestions or complaints about this notice or data handling, contact us through the Feedback page."
            ]
          }
        ]
      },
      changelog: {
        title: "Changelog",
        lead: "This page mirrors the repository `CHANGELOG.md` so version history can be reviewed directly.",
        sections: [
          {
            title: "Index Notes",
            bullets: [
              "See release.md for detailed release notes.",
              "If release.md does not list a specific vx.y.0, fill the gap from history.md and git history to keep the sequence continuous.",
              "Patch gaps such as x.y.z are not backfilled; reconstructed versions exist only to preserve a continuous version line."
            ]
          },
          {
            title: "v3.0.0 (2026-03-18)",
            bullets: [
              "This version adds two terminal interaction stability fixes: a caret stabilization window during heavy stdout and a passive blur guard while the soft keyboard is still visible.",
              "README files, release notes, project description, About content, localized copy and the current baseline documents are all updated to v3.0.0.",
              "This version does not add new sync protocols, terminal protocols or configuration fields, and continues with the capability boundaries already stated in v2.9.6."
            ]
          },
          {
            title: "v2.9.6 (2026-03-13)",
            bullets: [
              "This version only aligns documentation and external version references, with no new feature, protocol or interaction changes.",
              "README files, release notes, project description, About content, localized copy and the current baseline documents are all updated to v2.9.6.",
              "This version continues with the existing terminal, sync and latency-diagnostics capabilities completed in v2.9.5, together with the current speech boundary wording."
            ]
          },
          {
            title: "v2.9.5 (2026-03-13)",
            bullets: [
              "This version only aligns documentation and external version references, with no new feature, protocol or interaction changes.",
              "README files, release notes, project description, About content, localized copy and the current baseline documents are all updated to v2.9.5.",
              "A new MiniProgram terminal speech legacy issue is now documented: text extraction and round-stability detection are still not accurate enough, and long Codex sessions can add extra responsiveness pressure on the MiniProgram client, so it is not recommended as a default-on capability yet."
            ]
          },
          {
            title: "v2.9.4 (2026-03-12)",
            bullets: [
              "This version only aligns documentation and external version references, with no new feature, protocol or interaction changes.",
              "README files, release notes, project description, About content, localized copy and the solved-issues record are all updated to v2.9.4.",
              "The current MiniProgram baseline still carries forward the latency diagnostics and theme-contrast refinements completed in v2.9.3."
            ]
          },
          {
            title: "v2.9.3 (2026-03-11)",
            bullets: [
              "The MiniProgram latency diagnostics panel now uses a single dual-axis smooth chart, with gateway response on the left axis and network latency on the right axis.",
              "The old text-based diagnostics card is removed. The top area now uses two two-line summary cards, and reconnecting to the same server tries to continue the latest 30 samples first.",
              "The latency panel now follows the terminal theme with an inverted surface. Dark terminal themes switch to a deeper blue/orange palette so text and curves remain readable on the lighter panel surface.",
              "Release notes, README files, project description, About content and the solved-issues record are all aligned to v2.9.3."
            ]
          },
          {
            title: "v2.9.1 (2026-03-11)",
            bullets: [
              "The MiniProgram terminal now uses saved `lines + bufferCols / bufferRows` as the source of truth on the first session restore, so reopening the same session no longer shows a blank history top area or exposed `5;2H` fragments.",
              "After `bootstrap` merges synced configuration during startup, the server list and bottom navigation refresh immediately instead of waiting for the page to be reopened.",
              "The MiniProgram privacy policy and the About privacy page are now aligned to the latest review wording, including microphone usage, processing scope and user-rights details.",
              "Release notes, README files, project description, About content and the solved-issues record are all aligned to v2.9.1."
            ]
          },
          {
            title: "v2.9.0 (2026-03-11)",
            bullets: [
              "The MiniProgram terminal now fixes the Codex interaction issue where the footer block lost lines, the status row was clipped, and the whole area flickered during sustained output.",
              "The normal-buffer viewport now preserves real footer rows after the cursor, and `CSI ? 2026 h/l` sync-update windows are folded correctly into the render flow.",
              "Uniform highlighted rows are now painted at the line layer first, so prompts like `> Use /skills to list available skills` and code blocks no longer leak thin background seams between lines.",
              "Session-resume recovery is now corrected: the first restore uses `lines + bufferCols / bufferRows` as the source of truth so reopening the same session no longer produces a blank history top area or exposed `5;2H` fragments.",
              "The most important change in this version is the interaction fix itself; release notes, README files, project description, About content and the solved-issues record are all aligned to v2.9.0."
            ]
          },
          {
            title: "v2.8.2 (2026-03-10)",
            bullets: [
              "The Connect button in the server list and the bottom-nav Shell button now use the same high-saturation solid highlight while a connection is active, instead of relying on outline feedback.",
              "Connected-state SVG foreground colors now follow the runtime UI foreground color so icons keep enough contrast on the highlighted background.",
              "The About home, detail pages and about-app now derive colors from the current UI theme settings. The Web About page moved to the same theme-token strategy.",
              "A remaining About feedback gap is now recorded: the Feedback button still copies the email address only and does not launch a system mail composer yet.",
              "Release notes, README files, project description and About version references were all updated to v2.8.2."
            ]
          },
          {
            title: "v2.8.1 (2026-03-10)",
            bullets: [
              "Docs, README files, project description and About version references were aligned to v2.8.1.",
              "The terminal voice expand button is now fully transparent by default, keeping only the SVG glyph. Category pills now hug the text height and use a stronger solid selected state.",
              "The recording voice panel now shows a more visible dual-ring pulse indicator above the input, with updated copy: recording now, release to send or save to notes.",
              "The current VT baseline was tightened further: OSC 10/11/12 returns real shell theme colors, and the alternate screen plus erased blank cells now inherit the erase background consistently.",
              "The first-echo delay and button blocking after tapping the Codex connect option has improved enough that this version no longer lists it as an outstanding issue.",
              "A low-frequency terminal gap is still tracked: sometimes a new connection shows only the cursor on the first screen and the prompt appears later. The next step is to improve ready-state detection and prompt bootstrapping."
            ]
          },
          {
            title: "v2.7.1 (2026-03-10)",
            bullets: [
              "Docs and About version references were aligned to v2.7.1, with the current SQLite sync boundary explained more clearly.",
              "It is now stated explicitly that remoteconn-sync.db-wal is the SQLite write-ahead log, and its file size does not equal the effective synced data volume.",
              "Cross-device sync still covers settings, servers and records only. Logs, plugin runtime logs and terminal session buffers remain local.",
              "The MiniProgram terminal still has noticeable interaction lag: after tapping the Codex connect option, output appears about 10 seconds later, and most buttons stay blocked during the wait except vertical scrolling."
            ]
          },
          {
            title: "v2.7.0 (2026-03-09)",
            bullets: [
              "MiniProgram settings, server profiles and notes now use Gateway plus SQLite dual persistence, allowing recovery across devices under the same WeChat account.",
              "The sync pipeline now includes bootstrap plus incremental pushes for settings, servers and records. Server and note deletions support tombstone merging.",
              "Protected fields such as SSH passwords, private keys, passphrases and certificates are now stored encrypted on the server side. Terminal session buffers are still outside phase one sync."
            ]
          },
          {
            title: "v2.6.6 (2026-03-09)",
            bullets: [
              "Documentation references were aligned to v2.6.6.",
              "The repo now records a current known issue: preview bundles generated by npm run mini are not treated as evidence for production local-cache continuity.",
              "Server profiles, user settings and notes now use local storage plus Gateway sync dual persistence. Protected SSH material such as passwords, private keys, passphrases and certificates is stored encrypted on the server side."
            ]
          },
          {
            title: "v2.6.5 (2026-03-08)",
            bullets: [
              "The MiniProgram terminal VT P0 baseline was closed out with double buffers, alternate screen switching, DSR / CPR / DA1 / DA2 / DECSTR and basic partial repaint support.",
              "The normal-buffer live tail and scroll-boundary issues were fixed, and the active document baseline was updated to v2.6.5."
            ]
          },
          {
            title: "v2.6.1 (2026-03-08)",
            bullets: [
              "The occasional missing-glyph / incomplete-render issue after changing font size is now tracked as a known gap, and Settings now recommends reconnecting after a font-size change.",
              "Numeric input, font fallback and Settings fault tolerance were tightened up, and the temporary terminal.wrap debugging output was removed."
            ]
          },
          {
            title: "v2.6.0 (2026-03-07)",
            bullets: [
              "The MiniProgram now includes the mainline capabilities for jump hosts, AI quick launch, background session resume and clearer connection feedback.",
              "Terminal usability continued to improve in the MiniProgram: cursor-position calculation was fixed, and the AI startup flow officially landed on mobile.",
              "The SSH relay / bastion chain moved from configurable in principle to directly connecting host B through host A.",
              "Documentation references were upgraded to v2.6.0, and the historical v2.4.0 notes were folded into the current external version line."
            ]
          },
          {
            title: "v2.5.0 (backfilled history, 2026-03-07)",
            bullets: [
              "This version was backfilled from the history between v2.3.0 and v2.6.0 using the rule of one minor version every three hours.",
              "That phase mainly covered MiniProgram terminal tightening before v2.6.0 and the stitching together of AI and bastion-host scenarios. Details were merged into v2.6.0."
            ]
          },
          {
            title: "v2.4.0 (backfilled history, 2026-03-07)",
            bullets: [
              "The version number v2.4.0 appears explicitly in history.md and was later merged into the v2.6.0 record.",
              "That phase focused on MiniProgram terminal cursor behavior, column width and cell-model refactoring, plus related analysis documents. Details were merged into v2.6.0."
            ]
          },
          {
            title: "v2.3.0 (2026-03-06)",
            bullets: [
              "The MiniProgram completed a broad capability alignment pass across the main pages: connect, server settings, terminal, logs, records, settings and plugins.",
              "The Web app kept refining interaction quality and stability, and documentation references were aligned to v2.3.0."
            ]
          },
          {
            title: "v2.2.0 (2026-03-06)",
            bullets: [
              "The notes enhancement was finalized with categories, editing, search, filtering, quick recategorization and context snapshots.",
              "Global configuration gained note-category governance, default category support and drag sorting."
            ]
          },
          {
            title: "v2.1.0 (backfilled history, 2026-03-01)",
            bullets: [
              "This version was backfilled from the history between v2.0.0 and v2.2.0 using the rule of one minor version every three hours.",
              "That phase mainly completed the MiniProgram connect page, server settings page, remote directory picker and baseline alignment, laying the groundwork for the notes enhancement in v2.2.0 and the broad alignment in v2.3.0."
            ]
          },
          {
            title: "v2.0.0 (2026-02-27)",
            bullets: [
              "Voice input interaction was aligned to Figma, and the notes capture loop officially launched.",
              "Logs and records pagination, resource-cache governance, and documentation plus release rules were aligned together.",
              "The hit areas for the voice layer and keyboard tool layer were tightened further, fixing the issue where the toolbar collapsed after being mistaken for an outside click."
            ]
          },
          {
            title: "v1.1.0 (2026-02-26)",
            bullets: [
              "The full terminal voice-input path, Gateway ASR proxy and Web stability were improved together.",
              "Terminal input was upgraded into a native textarea plus voice-input panel plus send confirmation flow, with a TAB helper key added.",
              "Lazy-route load failures now recover automatically, and zoom protection was extended to paths such as double-tap and dblclick."
            ]
          },
          {
            title: "v1.0.9 (2026-02-25)",
            bullets: [
              "Connection experience, drag sorting in the server list and mobile mis-touch protection were improved.",
              "Connection and server management were tightened further: connection retry counts and grouping are supported, and creating a new server now goes to the settings page first instead of writing unchanged data immediately.",
              "Navigation and settings-page behavior were unified: back navigation now follows history semantics, the terminal settings page gained a preview block, and the settings UI went through a full redesign pass.",
              "Terminal tools and visual details were completed further: a Paste helper button was added, font selection was fixed, and dark-mode plus reconnect prompt styles were aligned.",
              "Session recovery was strengthened: connection history can continue across revisits, and refreshing the My Servers page no longer disconnects active sessions by default."
            ]
          },
          {
            title: "v1.0.8 (2026-02-24)",
            bullets: [
              "Config-center stability, light/dark mode support and Gateway runtime configuration were landed.",
              "The config center was restructured: server basics and authentication are now scoped to the current server, while terminal, theme and security moved to global settings.",
              "Config and tool-area interaction was tightened further: tapping outside collapses the lower-right keyboard toolbar, and the Figma config-area interaction was folded into the current baseline.",
              "Terminal prompt copy and initialization output were refined: connection prompts are friendlier, and the echo for the Chinese-input initialization command is hidden by default."
            ]
          },
          {
            title: "v1.0.6 (2026-02-24)",
            bullets: ["Clickability and mis-touch protection for the Console touch toolbar were improved."]
          },
          {
            title: "v1.0.5 (2026-02-23)",
            bullets: ["Momentum scrolling on iPhone received a staged optimization pass."]
          },
          {
            title: "v1.0.3 (2026-02-23)",
            bullets: ["The iOS touch-focus state machine was stabilized."]
          },
          {
            title: "v1.0.1 (2026-02-23)",
            bullets: [
              "The production-architecture branch received a stability update, establishing the multi-package baseline for Web, Gateway and the plugin runtime.",
              "Multi-server management, multiple authentication modes and traceable recent connection logs were completed.",
              "The Codex mainline became usable: after connecting, the app switches directory and starts codex automatically.",
              "Baseline theme and UI customization launched, including fonts, color schemes and the initial settings center."
            ]
          }
        ]
      },
      app: {
        title: "About",
        lead: "This page shows the product summary, version and contact details.",
        sections: [
          {
            title: "Product Info",
            bullets: [
              "Product: RemoteConn",
              "Chinese Name: AI JuLian",
              "Platform: RemoteConn MiniProgram",
              "Version: v3.0.0",
              "Build Date: 20260318",
              "Data Scope: settings, server profiles and notes support cross-device sync; sensitive credentials are encrypted server-side",
              "Feedback: douboer@gmail.com",
              "Updated: 2026-03-18"
            ]
          }
        ]
      }
    },
    footerLinks: {
      manual: "Manual",
      privacy: "Privacy"
    },
    shareButton: "Share with Friends",
    copiedEmail: "Email copied"
  }
};

ABOUT_I18N_OVERLAYS.ja = applyOverlay(ABOUT_I18N_OVERLAYS.en, ABOUT_JA_OVERLAY);
ABOUT_I18N_OVERLAYS.ko = applyOverlay(ABOUT_I18N_OVERLAYS.en, ABOUT_KO_OVERLAY);

const ABOUT_LANGUAGE_FALLBACKS = {
  ja: "en",
  ko: "en"
};

function resolveOverlay(language) {
  const normalized = String(language || "").trim();
  return ABOUT_I18N_OVERLAYS[normalized] || ABOUT_I18N_OVERLAYS[ABOUT_LANGUAGE_FALLBACKS[normalized]] || null;
}

function getAboutBrand(language) {
  const overlay = resolveOverlay(language);
  return applyOverlay(ABOUT_BRAND, overlay && overlay.brand);
}

function getAboutHomeItems(language) {
  const overlay = resolveOverlay(language);
  const homeItemOverlay = (overlay && overlay.homeItems) || {};
  return ABOUT_HOME_ITEMS.map((item) => applyOverlay(item, homeItemOverlay[item.key]));
}

function getAboutDetailContent(key, language) {
  const content = ABOUT_DETAIL_CONTENT[key] || ABOUT_DETAIL_CONTENT.app;
  const overlay = resolveOverlay(language);
  const detailOverlay = overlay && overlay.details ? overlay.details[key] || overlay.details.app : null;
  return applyOverlay(content, detailOverlay);
}

function getAboutFooterLinks(language) {
  const overlay = resolveOverlay(language);
  const footerLinks = (overlay && overlay.footerLinks) || {};
  return [
    {
      key: "manual",
      title: footerLinks.manual || "使用说明",
      path: "/pages/about-manual/index"
    },
    {
      key: "privacy",
      title: footerLinks.privacy || "隐私政策",
      path: "/pages/about-privacy/index"
    }
  ];
}

function getAboutUiCopy(language) {
  const overlay = resolveOverlay(language);
  return {
    shareButton: (overlay && overlay.shareButton) || "分享给朋友",
    copiedEmail: (overlay && overlay.copiedEmail) || "已复制邮箱"
  };
}

module.exports = {
  ABOUT_BRAND,
  ABOUT_HOME_ITEMS,
  getAboutBrand,
  getAboutDetailContent,
  getAboutFooterLinks,
  getAboutHomeItems,
  getAboutUiCopy
};

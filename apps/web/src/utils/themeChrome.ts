type MetaLike = {
  name: string;
  content: string;
};

export type ThemeChromeDocument<TMeta extends MetaLike> = {
  head: {
    appendChild: (node: TMeta) => unknown;
  };
  querySelector: (selector: string) => TMeta | null;
  createElement: (tagName: string) => TMeta;
};

/**
 * 提取用于浏览器/宿主顶栏的主题色。
 * 约束：
 * - 优先使用当前 UI 背景色，保证“顶部工具栏上方区域”跟随界面主题；
 * - 若运行时变量缺失，回退到稳定深色默认值，避免写入空字符串。
 */
export function resolveThemeChromeColor(
  themeVars: Record<string, string | undefined>,
  fallback = "#192b4d"
): string {
  const nextColor = themeVars["--bg"]?.trim();
  return nextColor && nextColor.length > 0 ? nextColor : fallback;
}

/**
 * 同步浏览器/宿主顶栏颜色。
 * 说明：
 * - Android Chrome、部分 WebView/PWA 会读取 meta[name="theme-color"] 渲染顶部宿主栏；
 * - 若主题切换后不更新这个 meta，用户会看到“工具栏上方颜色锁死”。
 */
export function applyThemeChromeColor<TMeta extends MetaLike>(
  themeColor: string,
  doc: ThemeChromeDocument<TMeta>
): void {
  const nextColor = themeColor.trim();
  if (!nextColor) {
    return;
  }
  const targetDocument = doc;
  let themeMeta = targetDocument.querySelector('meta[name="theme-color"]');
  if (!themeMeta) {
    themeMeta = targetDocument.createElement("meta");
    themeMeta.name = "theme-color";
    targetDocument.head.appendChild(themeMeta);
  }
  if (themeMeta.content !== nextColor) {
    themeMeta.content = nextColor;
  }
}

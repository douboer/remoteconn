# 已解决问题记录

## 目录

1. [Q1：iOS 长按选词后继续拖动，选区消失（2026-02-23）](#q1ios-长按选词后继续拖动选区消失2026-02-23)
2. [Q2：iPhone 软键盘弹出后立刻收起（2026-02-23）](#q2iphone-软键盘弹出后立刻收起2026-02-23)
3. [Q3：iOS 长按选中后继续移动手指，选区消失（2026-02-23）](#q3ios-长按选中后继续移动手指选区消失2026-02-23)
4. [Q4：iPhone 快速滑动时仅移动少量行、体感卡顿（2026-02-23）](#q4iphone-快速滑动时仅移动少量行体感卡顿2026-02-23)
5. [Q5：工具菜单易误触 shell，移动端按钮命中偏小（2026-02-24）](#q5工具菜单易误触-shell移动端按钮命中偏小2026-02-24)
6. [Q6：SSH 终端两类高频故障速查（中文显示 + 初始化回显）（2026-02-25）](#q6ssh-终端两类高频故障速查中文显示--初始化回显2026-02-25)
7. [Q7：iPhone 软键盘“闪现即收起”终版修复方案（2026-02-26）](#q7iphone-软键盘闪现即收起终版修复方案2026-02-26)
8. [Q8：mac mini Nginx 3000 转发配置丢失，全链路恢复（2026-02-26）](#q8mac-mini-nginx-3000-转发配置丢失全链路恢复2026-02-26)
9. [Q9：前端动态导入失败导致白屏，自动恢复方案（2026-02-26）](#q9前端动态导入失败导致白屏自动恢复方案2026-02-26)
10. [Q10：键盘工具栏点击会折叠（语音层拦截范围过大）（2026-02-27）](#q10键盘工具栏点击会折叠语音层拦截范围过大2026-02-27)
11. [Q11：刷新后终端与图标加载慢（静态资源缓存策略修复）（2026-02-27）](#q11刷新后终端与图标加载慢静态资源缓存策略修复2026-02-27)
12. [Q12：小程序“选择目录”长时间加载后超时（目录命令外层兼容性修复）（2026-03-06）](#q12小程序选择目录长时间加载后超时目录命令外层兼容性修复2026-03-06)
13. [Q13：小程序终端光标定位重大重构（xterm cell 对齐 + 中文宽字符修复）（2026-03-07）](#q13小程序终端光标定位重大重构xterm-cell-对齐--中文宽字符修复2026-03-07)
14. [Q14：小程序终端历史内容可继续上滑（scroll-view 底部与 live tail 不一致）（2026-03-08）](#q14小程序终端历史内容可继续上滑scroll-view-底部与-live-tail-不一致2026-03-08)
15. [Q15：小程序终端 `Codex` 交互严重卡顿与按钮无响应（对照 xterm.js 的时间片写入优化）（2026-03-10）](#q15小程序终端-codex-交互严重卡顿与按钮无响应对照-xtermjs-的时间片写入优化2026-03-10)
16. [Q16：小程序 Codex 底部提示块缺行与闪动（footer 裁剪 + 同步刷新中间态暴露）（2026-03-11）](#q16小程序-codex-底部提示块缺行与闪动footer-裁剪--同步刷新中间态暴露2026-03-11)
17. [Q17：小程序 Codex 会话续接后，历史区顶部空白并偶发裸露 `5;2H`（2026-03-11）](#q17小程序-codex-会话续接后历史区顶部空白并偶发裸露-52h2026-03-11)
18. [Q18：小程序 Codex 多轮交互后持续卡顿（真机日志二次归因 + stdout 渲染降频）（2026-03-17）](#q18小程序-codex-多轮交互后持续卡顿真机日志二次归因--stdout-渲染降频2026-03-17)
19. [Q19：小程序终端滚动到顶部偶发空白（viewport 补刷时机偏晚）（2026-03-17）](#q19小程序终端滚动到顶部偶发空白viewport-补刷时机偏晚2026-03-17)

---

## Q1：iOS 长按选词后继续拖动，选区消失（2026-02-23）

### 现象

1. 长按终端文字 → 震动反馈 + 放大镜出现 + 当前单词被选中（高亮）。
2. **放开手指**：选区正常保留，左右手柄出现，可拖动扩缩选区 ✓
3. **保持按住并继续移动手指**：放大镜跟随手指，但选中高亮消失。
4. **放开手指**：无任何选中，无手柄 ✗

### 根因

iOS Safari 在长按手势期间，根据"**是否有聚焦的可编辑元素**"选择两条完全不同的交互路径：

| 场景                                                 | iOS 手势模式                                | 行为                                                              |
| ---------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------- |
| 有聚焦的可编辑元素（如 `<textarea readOnly=false>`） | **放大镜光标定位模式**（cursor drag）       | 手指移动 = 移动文本光标；抬手后只更改光标位置，**无选区、无手柄** |
| 无聚焦元素 / 只读元素                                | **文本选区扩展模式**（text selection drag） | 长按选词后，手指移动 = 扩展选区；抬手后**选区保留 + 手柄出现**    |

根本问题：上一次 `FOCUS_KEYBOARD` 操作让 `helperTextarea` 保持了聚焦（`readOnly=false`），是"有聚焦的可编辑元素"状态，iOS 于是走了光标定位模式，导致拖动期间选区消失。

"放开后拖手柄正确"的场景，恰好是 `helperTextarea` 已失焦（空心光标状态），iOS 走了文本选区扩展路径。

### 关键点

这个问题与 xterm.js 的 JS 监听器（`removeAllRanges()`）**叠加**，使得：

- JS 层面：xterm `pointermove` handler 清除 `window.getSelection()`（用 `stopImmediatePropagation()` 已阻断）
- iOS 系统层面：`helperTextarea` 有焦点 → 系统直接走光标定位模式，根本不进入选区扩展路径（无法被 JS 拦截）

### 解决方案

在 `pointerdown` capture 阶段，**任何触摸手势开始时立即执行**：

```typescript
helperTextarea.readOnly = true;
const prevActive = document.activeElement as HTMLElement | null;
if (prevActive instanceof HTMLElement && containerRef.value?.contains(prevActive)) {
  prevActive.blur();
}
```

强制 iOS 在整个触摸手势期间进入**文本选区扩展模式**。

若最终 `pointerup` 判定为 `FOCUS_KEYBOARD`，再执行 `readOnly=false + focus()`，键盘正常弹出。

### 附：完整事件链分析（iOS Safari tap/long-press）

```
touchstart (系统 touch 层)
  → pointerdown (JS, capture 先运行)
  → [长按等待 / 震动反馈]
  → [若长按超过系统阈值, touch 层建立选区]
  → pointermove* (JS)
  → pointerup (JS) 或 pointercancel (系统接管)
  → mousedown (JS, 合成)
  → mouseup  (JS, 合成)
  → click    (JS, 合成)
```

系统 touch 层（选区建立/扩展/手柄）与 JS pointer 事件独立运行，`stopImmediatePropagation()` 只阻止 JS listener，不影响系统层行为。

### 验收确认

- 长按 → 震动 → 选词 → 保持按住滑动 → 选区扩展正常，放大镜跟随 ✓
- 放开手指 → 选区保留，手柄出现，可拖动扩缩 ✓
- 点击激活带 → 弹键盘 ✓
- 点击非激活带 → 空心光标，不弹键盘 ✓
- 纵向滚动 → 丝滑，无焦点闪烁 ✓

### 涉及文件

- `apps/web/src/components/TerminalPanel.vue`（`onTouchKeyboardPointerDown` 函数）

### 解决时间

2026-02-23

---

## Q2：iPhone 软键盘弹出后立刻收起（2026-02-23）

### 现象

1. 在 iPhone Safari 中点击终端激活带区域。
2. 软键盘短暂弹出（约 0.5 秒内）。
3. 软键盘立刻自动收起，无法输入 ✗
4. iPad 上同样操作正常 ✓

### 根因（双重）

**根因 1：标志设置时序错误（blur 事件同步性）**

`onTextareaBlur` 中有保护逻辑：`focusKeyboardInProgress === true` 时跳过 `readOnly=true`。然而 `focusKeyboardInProgress = true` 原来放在 `ae.blur()` **之后**调用，而 iOS 上 blur 事件是**同步**触发的——`ae.blur()` 返回之前 `onTextareaBlur` 便已执行完毕，此时 flag 仍为 `false`，`readOnly=true` 照常写入，键盘激活被立即打断。

**根因 2：iPhone `visualViewport` 地址栏折叠引发误判**

Safari 在软键盘弹出**之前**先将顶部地址栏折叠，导致 `visualViewport.height` 短暂**增大**（地址栏收起让可视区变高），随后才因键盘占位缩小。原有"高度一增大就判定键盘收起"的单一条件把这次增大误判为键盘收起，触发 `readOnly=true + blur()`，软键盘刚弹出就被 JS 关掉。

> iPad 无地址栏折叠行为，故 iPad 不受影响。

### 解决方案

1. **修复时序**：将 `focusKeyboardInProgress = true` 移到 `ae.blur()` 调用**之前**。
2. **延长保护窗口至 400ms**：iPhone 键盘动画约 300ms，400ms 定时器既负责 focus 重试（确保键盘稳定弹出），也负责 400ms 后解除 `focusKeyboardInProgress`；定时器 ID 保存供 `touchstart` 取消。
3. **visualViewport 两阶段检测**：
   - 引入 `keyboardViewportShrinkDetected` 布尔状态。
   - Phase 1：检测到"明显缩小"（>120px）且 `helperTextarea` 聚焦 → 置 `true`（认为键盘已打开）。
   - Phase 2：仅在 Phase 1 成立后，"明显增大"（>120px）才视为键盘收起；触发后重置状态。
   - `BLUR_ONLY`/`FOCUS_KEYBOARD` 发生时显式重置，保证状态机干净切换。

### 验收确认

- iPhone 点激活带 → 键盘弹出并稳定保持 ✓
- iPhone 键盘弹出后上下滚动 → 滚动正常，键盘不异常收起 ✓
- iPhone 手动关键盘后再次点激活带 → 再次弹出 ✓
- iPad 行为不变 ✓

### 涉及文件

- `apps/web/src/components/TerminalPanel.vue`（`onTouchKeyboardPointerUp` FOCUS_KEYBOARD 分支、`onViewportKeyboardHide`）

### 解决时间

2026-02-23

---

## Q3：iOS 长按选中后继续移动手指，选区消失（2026-02-23）

### 现象

1. 长按终端文字 → 震动反馈 + 放大镜出现 + 当前单词选中高亮 ✓
2. **保持按住并继续移动手指**：放大镜跟随移动，但选中高亮消失。
3. 放开手指：无任何选中，无手柄 ✗

> Q1 记录的是"有焦点可编辑元素导致走光标定位模式"，已在 v1.0.1 解决。本条为剩余的第二层问题。

### 根因

iOS Safari 在长按进入系统选区后，通常先触发 `pointercancel`（系统接管手势控制），后续手指移动改为 **`touchmove`** 事件驱动放大镜与手柄扩选。

`pointercancel` 触发后，pointer 门控（`touchGatePointerId`）已重置，`pointermove` 拦截不再生效。后续 `touchmove` 直接透传到 xterm 的事件监听器，xterm 在此链路调用 `window.getSelection().removeAllRanges()`，将系统刚建立的原生选区清空。

### 解决方案

新增 `touchmove` capture 拦截器，**仅在终端区域内存在原生选区时**触发：

```typescript
onTouchKeyboardTouchMove = (event: TouchEvent) => {
  const hasSelection = hasActiveNativeSelectionInTerminal();
  if (hasSelection) {
    lastTouchAction = "PASS_NATIVE";
    event.stopImmediatePropagation(); // 阻断 xterm；不 preventDefault，不影响滚动
  }
};
containerRef.value.addEventListener("touchmove", onTouchKeyboardTouchMove, true);
```

同时在 `pointercancel` 中：若已有原生选区，将 `lastTouchAction` 置为 `PASS_NATIVE`，确保后续合成 `mousedown/click` 受保护。

### 验收确认

- 长按 → 保持按住移动手指 → 选区持续扩展，放大镜跟随，放手后手柄出现 ✓
- 放开后拖动手柄扩缩选区 ✓
- 正常上下滑动不受影响 ✓
- 点激活带弹键盘不受影响 ✓

### 涉及文件

- `apps/web/src/components/TerminalPanel.vue`（`onTouchKeyboardTouchMove`、`onTouchKeyboardPointerCancel`）

### 解决时间

2026-02-23

---

## Q4：iPhone 快速滑动时仅移动少量行、体感卡顿（2026-02-23）

### 现象

1. 在 iPhone 上快速短甩（flick）终端内容。
2. 列表往往只移动 1~2 行后很快停住，惯性不足。
3. 中速滑动可滚动，但“甩动距离”和原生列表相比偏短。

### 根因

触摸动量初版使用“单次事件位移”近似速度，且对事件时间窗口过于严格；在 iOS 低采样或帧抖动场景中，快速手势的速度被低估，`touchend` 时初始动量过小，导致只滚少量行。

### 解决方案（阶段性）

1. 将触摸速度估算改为**按时间归一化**：`(deltaY / dt) * (1000/60)`，统一到“每帧速度”尺度。
2. 采用更高权重的 EMA 融合瞬时速度，提升快速手势响应。
3. 在 `touchend/touchcancel` 启动动量续滚（RAF + 指数衰减）。
4. 参数调优：提高阻尼与速度上限，降低停止阈值，并引入 `TOUCH_SCROLL_BOOST`。
5. 若检测到原生选区（长按选区链路），不触发动量续滚，避免与选区交互冲突。

### 当前结果

- 快速滑动体验较修复前明显提升。
- 与原生 iOS 滚动手感仍有差距，暂定“阶段性达成”，后续继续参数微调。

### 涉及文件

- `apps/web/src/components/TerminalPanel.vue`

### 解决时间

2026-02-23

---

## Q5：工具菜单易误触 shell，移动端按钮命中偏小（2026-02-24）

### 现象

1. 右下角工具菜单展开后，点击按钮附近空白区会误落到 shell，触发终端焦点/输入。
2. 工具菜单收起后，若仍保留大保护区，会影响终端正常点击。
3. 22x22 / 24x24 小按钮在手机上命中偏低，容易点不中。

### 根因

1. 交互层未实现 Figma `frame 2251` 的“展开态保护区”语义，只有视觉层 `frame 2248`。
2. 工具菜单展开/折叠缺少统一的“外部点击折叠”逻辑。
3. 按钮命中区与视觉尺寸一致，未做 touch 端 hit-slop 扩展。

### 解决方案

1. 工具区改为“展开态保护、折叠态不保护”：

- 展开时启用 `97x205` 保护区（对齐 `frame 2251` 语义），保护区内点击不响应 shell。
- 折叠时仅保留 `22x22` 键盘按钮命中区，不拦截周边 shell 点击。

2. 菜单展开时在 `pointerdown capture` 监听外部点击，点击保护区外自动折叠。
3. 全应用按钮统一增加四周 `8px` 点击扩展：

- 通过全局样式 `button::before { inset: -8px; }` 实现；
- 视觉尺寸不变，仅扩大命中区（如 `22x22 -> 38x38`）。

### 验收确认

- 展开态：保护区内点击不透传 shell ✓
- 展开态：点击保护区外自动折叠 ✓
- 折叠态：终端区域点击不被保护区拦截 ✓
- 全应用按钮：小按钮命中明显改善 ✓

### 涉及文件

- `apps/web/src/components/TerminalPanel.vue`
- `apps/web/src/styles/main.css`

### 解决时间

2026-02-24

---

## Q6：SSH 终端两类高频故障速查（中文显示 + 初始化回显）（2026-02-25）

### 现象 A：中文显示/输入异常

1. 输入法空格选词阶段就出现乱码（尚未回车）。
2. 回显出现 `<008b>`、`\M-^X` 等高位异常字符。

### 现象 B：初始化回显泄漏

连接后出现不该给用户看的内部命令：

1. `stty -echo; echo '__RCSBEGIN_7f3a__'`
2. `stty iutf8 ... setopt MULTIBYTE ...`
3. `stty echo; echo '__RCSDONE_7f3a__'`

### 根因总结

1. 中文问题本质是“shell 行编辑 UTF-8/多字节模式”与“输入流归一”未稳定。
2. 回显泄漏本质是“初始化静默窗口未可靠命中”且缺少超时兜底净化。

### 标准修复（当前基线，按此执行）

1. 中文显示链路：

- 保留 `encodeInputForSsh()` 的输入归一逻辑；
- 保留 `stty iutf8`、`setopt MULTIBYTE PRINT_EIGHT_BIT`、`LANG/LC_*` 初始化；
- 仅清理 C1 控制字符（`0x80-0x9F`），不要扩大误删范围。

2. 初始化回显链路：

- 保留双哨兵窗口：`INIT_BEGIN -> INIT_DONE`；
- 哨兵匹配同时支持 `\n` 与 `\r\n`；
- 保留 `sanitizeInitLeakOutput()` 超时兜底净化（即使哨兵未命中，仍清理内部命令行）。

### 快速排查顺序（固定流程）

1. 先看首屏是否泄漏 `stty/setopt` 内部命令。
2. 再看中文是否在“选词未回车”阶段异常。
3. 对照 `apps/gateway/src/ssh/sshSession.ts` 四个关键点：

- `encodeInputForSsh()`
- `findSentinelLine()`
- `sanitizeInitLeakOutput()`
- 三段初始化命令（W1/W2/W3）

4. 只做最小改动，不再堆叠临时补丁。

### 回归测试（必须）

文件：`apps/gateway/src/ssh/sshSession.test.ts`

1. BEGIN 前 banner 保留；BEGIN->DONE 期间回显丢弃；DONE 后提示符正常。
2. LF-only 场景不泄漏内部命令。
3. BEGIN/DONE 未命中并超时时，兜底净化仍生效。

### 提交前验证

```bash
npm run test
npm run typecheck
npm run lint
npm run build
./scripts/gatewayctl.sh deploy
```

### 结论

后续再出现这两类问题，先按本节执行，不再从零试错，避免重复耗费半天以上时间。

---

## Q7：iPhone 软键盘“闪现即收起”终版修复方案（2026-02-26）

### 现象（最终确认口径）

1. iPhone 点击终端“激活带”后，软键盘有时只闪一下就收起。
2. 同一会话里偶发，复现与手势节奏、地址栏动画、焦点竞争有关。
3. iPad 与桌面端通常不复现或复现概率极低。

### 旧方案为何不稳定

1. 仅靠 `visualViewport` 高度变化推断“键盘开/关”在 iPhone Safari 上不可靠。
2. iOS 会先做地址栏折叠，再做键盘动画，期间高度会出现“先增后减”抖动。
3. 若在该抖动窗口把 `helperTextarea` 改回 `readOnly=true` 或触发 `blur()`，键盘会立刻被收回。
4. `blur` 事件与 `readOnly/focus` 的时序若处理不当，会出现“刚 focus 又被 blur 回滚”。

### 最终落地方案（当前稳定基线）

1. **取消 viewport 推断链路**：
   - 不再使用 `visualViewport resize` 反推键盘收起，彻底移除该脆弱信号源。
2. **把焦点控制收敛到触摸状态机**：
   - 统一由 `pointerdown/pointerup/touchstart` 决定四类动作：
   - `BLUR_ONLY`：仅失焦，不弹键盘。
   - `FOCUS_KEYBOARD`：执行受保护的 blur->focus 序列。
   - `PASS_NATIVE`：交给 iOS 原生选区，不抢焦点。
   - `PASS_SCROLL`：交给滚动链路，不抢焦点。
3. **FOCUS_KEYBOARD 关键时序修复**：
   - `focusKeyboardInProgress = true` 必须在 `ae.blur()` 之前设置。
   - 先 `blur` 当前容器内活动元素，再 `helperTextarea.readOnly = false`，再 `focusHelperTextarea()`。
4. **引入保护窗口，阻止“异步 blur 回滚”**：
   - 在保护窗口内，`onTextareaBlur` 不执行 `readOnly=true` 回写；
   - 保护窗口结束后仅清 flag，不做二次强制 focus，避免焦点打架。
5. **增加有限次数补焦兜底**：
   - iOS 键盘动画期间若出现瞬时 blur，仅做最多 2 次、16ms 间隔补焦；
   - 超过次数不再重试，避免无限抢焦点。
6. **新手势开始即取消旧 focus 定时器**：
   - `touchstart` 里取消遗留 timer，防止旧流程在手势中途改写 `readOnly`。

### 关键参数（已验证）

1. `TOUCH_KEYBOARD_FOCUS_GUARD_MS = 900`
2. `TOUCH_KEYBOARD_BLUR_RECOVER_DELAY_MS = 16`
3. `TOUCH_KEYBOARD_BLUR_RECOVER_MAX = 2`
4. `TOUCH_KEYBOARD_TAP_MAX_MOVE_PX = 10`

### 关键代码位置

1. `apps/web/src/components/TerminalPanel.vue`
2. 重点函数：
   - `onTouchKeyboardPointerUp`（`FOCUS_KEYBOARD` / `BLUR_ONLY` 分支）
   - `onTextareaBlur`
   - `scheduleFocusKeyboardBlurRecover`
   - `onTouchKeyboardTouchStart`
3. 重点状态：
   - `focusKeyboardInProgress`
   - `focusKeyboardTimerId`
   - `focusKeyboardRecoverTimerId`
   - `lastTouchAction`

### 事件链（用于排障）

1. 触摸路径：`touchstart -> pointerdown -> pointerup -> mousedown(click 合成前) -> click`
2. 键盘稳定弹出依赖：
   - `FOCUS_KEYBOARD` 分支完成 `blur -> readOnly=false -> focus`；
   - 保护窗口内不得被 `onTextareaBlur` 回写 `readOnly=true`；
   - `mousedown/click` 需要在 capture 阶段按动作拦截，避免 xterm 抢焦点覆盖状态机。

### 验收用例（必须全过）

1. iPhone 点击激活带：键盘稳定弹出，不闪退。
2. iPhone 点击非激活带：不弹键盘，仅空心光标。
3. 激活后立刻滑动滚动：滚动正常，键盘不被误收起。
4. 连续快速点按激活带 10 次：不出现“偶发闪现”。
5. 长按选区与手柄拖动：不受键盘逻辑干扰。

### 回归结论

本问题的核心不是“键盘 API 调不调”，而是“**iOS 焦点时序 + 手势状态机 + 异步 blur 回滚**”三者一致性。后续若再出现同类现象，先检查本节 6 条落地方案和 4 个参数，禁止再引入 `visualViewport` 推断式补丁。

---

## Q8：mac mini Nginx 3000 转发配置丢失，全链路恢复（2026-02-26）

### 问题背景

RemoteConn 当前公网链路不是“云机直接跑 web/gateway”，而是：

1. 云服务器负责 TLS 入口（`conn.biboer.cn:443`）。
2. 云服务器把流量转发到本机 `127.0.0.1:13000`。
3. `13000` 来自 frp 反向映射，实际落到 mac mini 的 `127.0.0.1:3000`。
4. mac mini 的 Nginx `3000` 再拆分：
   - `/ws/*` -> `127.0.0.1:8787`（gateway）
   - 其他路径 -> `apps/web/dist`（前端静态 + SPA 回退）

这意味着 **mac mini 的 `3000` server 块丢失/失效** 会直接导致公网不可用。

### 全链路证据（本次实测）

#### A. 云服务器入口层（主机：`kvm-douboer`）

1. 云端 Nginx/OpenResty 在线：`openresty/1.25.3.1`
2. 云端监听端口包含：`80/443/7000/13000`
3. 云端配置文件：`/etc/nginx/conf.d/conn.biboer.cn.conf`
   - `location /` -> `proxy_pass http://127.0.0.1:13000;`
   - `location /ws/` -> `proxy_pass http://127.0.0.1:13000;`

#### B. 云服务器 frps 层

1. frps 进程：`/usr/local/bin/frps -c /etc/frp/frps.toml`
2. frps 配置：`/etc/frp/frps.toml`
   - `bindPort = 7000`
   - `allowPorts = [{ single = 13000 }, { single = 13001 }]`

#### C. mac mini frpc 层

1. frpc 配置：`/opt/homebrew/etc/frp/frpc.toml`
   - `serverAddr = "24.233.3.126"`
   - `serverPort = 7000`
   - `remoteconn_web`: `localIP=127.0.0.1 localPort=3000 remotePort=13000`
2. frpc 服务在线：`launchctl list` 可见 `homebrew.mxcl.frpc`

#### D. mac mini Nginx 3000 层（关键）

1. 配置文件：`/opt/homebrew/etc/nginx/servers/conn.biboer.cn.conf`
2. 核心配置：
   - `listen 3000;`
   - `/ws/` -> `proxy_pass http://127.0.0.1:8787;`
   - `/gateway-health` -> `proxy_pass http://127.0.0.1:8787/health;`
   - `root /Users/gavin/remoteconn/apps/web/dist;`
   - `location / { try_files $uri $uri/ /index.html; }`

### 根因归纳

“3000 端口转发配置丢失”本质是 **mac mini Nginx 的 `conn.biboer.cn.conf` 不存在或未被加载**，导致：

1. frp 链路仍在（云端 13000 可连），但后端 `3000` 不再提供预期路由。
2. 公网 `conn.biboer.cn` 经过云端代理后，得到错误页面/错误状态（或 ws 失败）。

### 标准恢复步骤（必须按顺序）

1. 在 mac mini 恢复文件：`/opt/homebrew/etc/nginx/servers/conn.biboer.cn.conf`
2. mac mini 校验并重载 Nginx：
   - `nginx -t`
   - `brew services restart nginx`（或等价重载）
3. 确认 frpc 在线：
   - `launchctl list | rg frpc`
   - `ps -ef | rg frpc`
4. 逐跳验证（从里到外）：
   - mac 本地：`curl -I http://127.0.0.1:3000/`
   - mac 本地：`curl http://127.0.0.1:3000/gateway-health`
   - 云端映射：`curl -I http://24.233.3.126:13000/`
   - 云端映射：`curl http://24.233.3.126:13000/gateway-health`
   - 公网入口：`curl -I https://conn.biboer.cn/`
   - 公网入口：`curl https://conn.biboer.cn/gateway-health`

### 本次恢复后的验收结果

1. `http://24.233.3.126:13000/` 返回 RemoteConn `index.html`（证明 frp -> mac:3000 通）
2. `http://24.233.3.126:13000/gateway-health` 返回 `{"ok":true,...}`（证明 `/ws|gateway` 转发链路通）
3. `https://conn.biboer.cn/gateway-health` 返回 `200 + {"ok":true,...}`（证明公网入口恢复）

### 防再发建议（运维基线）

1. 将 mac 侧 `conn.biboer.cn.conf` 纳入版本化备份（与项目同仓或私有运维仓）。
2. 每次变更后固定执行 6 条逐跳 `curl` 冒烟，不只看首页。
3. 在云端保留 `13000` 直连探针（仅白名单）用于快速判断“云入口问题 vs frp/mac 后端问题”。

---

## Q9：前端动态导入失败导致白屏，自动恢复方案（2026-02-26）

### 现象

1. 用户进入某个路由时偶发白屏。
2. 控制台常见错误包含：
   - `Importing a module script failed`
   - `Failed to fetch dynamically imported module`
   - `error loading dynamically imported module`
3. 刷新后通常可恢复，但用户侧没有明确引导。

### 根因

1. 前端采用按路由拆分 chunk，发布窗口内可能出现“HTML 指向新 chunk、CDN/缓存仍旧版本”短暂不一致。
2. 网络抖动或代理缓存异常时，动态模块请求会失败并直接中断路由渲染。
3. 若不做节流，简单“捕获后强刷”会在 chunk 持续不可用时进入刷新死循环。

### 解决方案

新增 `dynamicImportGuard` 恢复机制：

1. 在 `router.onError` 识别“动态导入失败”错误文案。
2. 命中后尝试自动刷新当前目标路由。
3. 使用 `sessionStorage` 记录重试时间戳，`15s` 窗口内只允许一次自动刷新。
4. 路由成功就绪后清理重试标记，保证后续新故障仍可触发一次恢复。
5. 当 `sessionStorage` 不可用时，降级为记录错误日志，不抛二次异常。

### 验收确认

1. Safari/Chromium/Firefox 常见文案均能被识别。
2. 重试窗口内第二次失败不再自动刷新，避免循环。
3. 超过窗口后允许再次自动恢复。
4. 单元测试覆盖识别、窗口限流、标记清理逻辑。

### 涉及文件

- `apps/web/src/utils/dynamicImportGuard.ts`
- `apps/web/src/utils/dynamicImportGuard.test.ts`
- `apps/web/src/main.ts`

### 解决时间

2026-02-26

---

## Q10：键盘工具栏点击会折叠（语音层拦截范围过大）（2026-02-27）

### 现象

1. 键盘工具栏展开后，点击工具栏区域有概率被直接折叠。
2. 表现上像是“点击了工具栏外部”，但用户实际点位在工具区附近。
3. 折叠态下语音按钮周边区域也会出现额外拦截，影响 shell 正常点击。

### 根因

1. 语音层 `terminal-voice-layer` 的层级高于键盘工具层（语音层 `z-index: 5`，键盘层 `z-index: 4`）。
2. `terminal-voice-hitbox` 在折叠态也常驻，并对 `pointer/touch` 全量 `stop + prevent`，导致上层拦截范围过大。
3. 键盘工具栏的“外部点击折叠”依赖 `document pointerdown capture`，当事件目标落在语音命中层而非键盘工具容器时，会被判定为外部点击并触发折叠。
4. 语音按钮命中区叠加了全局 `button::before` 扩展，进一步放大了折叠态的遮挡面积。

### 解决方案

1. 语音保护区改为“展开态保护、折叠态不保护”：

- 仅在 `panelVisible=true` 时渲染 `terminal-voice-hitbox`；
- 折叠态不再保留大面积拦截层。

2. 折叠态只保护 `voice.svg` 本体：

- 语音按钮的 `::before` 命中区收回到组件本体（`inset: 0`），不再扩展到周边 shell 区域。

3. 保持展开态语音面板的保护区拦截能力，避免面板内操作误透传到底层 shell。
4. 修复“拖动后键盘开合把 voice 按钮顶到顶部”：

- 增加 `lastUserPlacedButtonPosition`，记录用户拖动后的稳定坐标；
- 在 `keyboard-open` 期间（且用户已手动摆放）不再按“临时缩高容器”夹紧 `y`，仅校正 `x`；
- 键盘收回后再回到常规 clamp，并把当前合法坐标回写为新的稳定坐标。

### 验收确认

- 键盘工具栏展开后，点击工具按钮不再被误判为“外部点击折叠” ✓
- 键盘工具栏展开后，点击工具区外仍可正常自动折叠 ✓
- 语音折叠态下，`voice.svg` 周边 shell 点击恢复正常 ✓
- 语音展开态下，面板区域继续阻断透传 shell ✓
- 刷新后拖动 voice 按钮，再经历“弹键盘 -> 收键盘”，按钮不再被推到顶部，位置可保持/恢复 ✓

### 涉及文件

- `apps/web/src/components/TerminalVoiceInput.vue`
- `apps/web/src/styles/main.css`

### 解决时间

2026-02-27

## Q11：刷新后终端与图标加载慢（静态资源缓存策略修复）（2026-02-27）

### 现象

1. 页面刷新后，Terminal 首屏与 `svg` 图标加载体感偏慢。
2. 每次刷新都出现静态资源重新校验/重新请求，尤其在网络有抖动时更明显。

### 根因

1. 静态资源响应头为 `Cache-Control: no-cache`，浏览器刷新会频繁 revalidate。
2. `/icons/*.svg` 使用稳定 URL（非 hash 文件名），若不单独制定缓存策略，会持续产生请求开销。
3. 缓存策略应下沉到家庭机（mac）Nginx 的 `3000` 静态入口；云主机（kvm）仅做反向代理，不是静态资源根源。

### 解决方案

1. 明确链路分工：

- kvm：保留 TLS/入口反代，不承担静态缓存策略主配置。
- mac：在 `listen 3000` 的 Nginx `server` 内配置静态缓存头。

2. 按资源类型拆分缓存：

- `/assets/*`（构建 hash 产物）：`public, max-age=31536000, immutable`。
- `/icons/*`（稳定文件名）：`public, max-age=2592000`（30 天，不使用 immutable，便于图标迭代）。
- `/` 与 `/index.html`：`no-cache`，保证发版后入口可及时更新。

3. 目标配置文件：

- `/opt/homebrew/etc/nginx/servers/conn.biboer.cn.conf`

### 验收确认

- `curl -I http://127.0.0.1:3000/` 返回 `Cache-Control: no-cache` ✓
- `curl -I http://127.0.0.1:3000/icons/voice.svg` 返回 `max-age=2592000` ✓
- `curl -I http://127.0.0.1:3000/assets/index-*.js` 返回 `max-age=31536000` 与 `immutable` ✓
- 页面刷新后图标与终端相关静态资源请求显著减少（命中缓存） ✓

### 涉及文件

- `/opt/homebrew/etc/nginx/servers/conn.biboer.cn.conf`

### 解决时间

2026-02-27

---

## Q12：小程序“选择目录”长时间加载后超时（目录命令外层兼容性修复）（2026-03-06）

### 现象

1. 小程序进入“服务器配置”页，点击“选择目录”。
2. 弹出目录选择面板后，根目录长时间显示“加载中”。
3. 十余秒后弹出“无法连接服务器 / 目录读取超时，请稍后再试”。
4. 同一台服务器从终端页正常连接，说明主机、端口、用户名和认证信息本身没有问题。

### 根因

目录读取命令原先拼成了这类形式：

```sh
__RC_BEGIN=... __RC_END=... __RC_REL=... sh -lc '...'
```

这要求“远端当前登录 shell”支持 `A=B cmd` 这种前缀赋值语法。该假设并不稳。当前 shell 一旦不按这套语法解释，真正的 `sh -lc '...'` 目录脚本就不会正常启动，前端也就一直收不到 begin/end 标记，最终只能超时。

### 解决方案

将变量赋值移入 `sh -lc` 内部脚本，只让外层执行标准的 shell 调用：

```sh
sh -lc '__RC_BEGIN=...; __RC_END=...; __RC_REL=...; ...'
```

这样外层不再依赖远端默认 shell 对前缀赋值语法的支持，目录读取恢复正常。

### 验收确认

- 点击“选择目录”后可正常拉取根目录；
- 展开子目录不再稳定复现超时；
- 服务器终端连接链路不受影响。

### 涉及文件

- `apps/miniprogram/utils/remoteDirectory.js`

### 解决时间

2026-03-06

---

## Q13：小程序终端光标定位重大重构（xterm cell 对齐 + 中文宽字符修复）（2026-03-07）

### 现象

1. 第二行输入几个中文后，光标会跳回第一行行首；继续输入又跳回第二行，再输入到一定长度又回到第一行。
2. 英文连续输入到右侧时，看起来没有右侧 padding，内容几乎贴到物理屏幕最右边。
3. 中文输入过程中，光标与文本尾部的空白会越来越大；到换行边界时，光标已经到边界，但文本右侧还留着一段空白。
4. 前几轮局部修补后，现象仍然几乎不变，说明问题不在单个偏移量，而在终端坐标模型本身。

### 根因

这次问题最终确认不是一个点，而是旧模型的多层叠加：

1. **连接层仍固定 `80x24`**
   远端 PTY 按固定列数回显，本地页面却按真实屏宽显示，两边从一开始就不是同一个终端几何。

2. **本地输出解析仍是“字符数组 + 事后补偿”**
   旧实现写入时按字符推进，后面再按显示列、prompt、wrap 补偿去反推光标，等于先错一次，再补一次。

3. **宽字符 continuation 在渲染层丢失**
   buffer 里宽字符应占 2 列，但页面把整行重新拼回自然文本流后，continuation 不再参与宽度占位，导致：
   - buffer 里的 `cursorCol` 按 2 列走；
   - 页面文本只画出 1 个 glyph 宽度；
   - 中文输入越多，光标和文本尾部偏差越大。

4. **单列宽度测量使用了错误 probe**
   旧测量用 `0` 字符估算单列宽度，实际英文字宽和 CJK fallback 字体宽度并不等于这个 probe，英文右侧 padding 和中文换行边界都会被带偏。

5. **padding 和内容布局不在同一坐标系**
   旧实现把左右 padding 挂在 `scroll-view`，而光标与激活区又按另一套公式定位，导致“红框看起来有 padding，但文本实际顶边”。

### 解决方案

本次不再继续补丁式修正，而是直接按 xterm 的 cell 模型重构终端定位链路：

1. **连接前先测量真实终端几何**
   - 先测量输出区域宽高；
   - 再计算真实 `cols/rows`；
   - 用真实 `cols/rows` 建连和 `resize`。

2. **输出缓冲区重写为固定列 cell 模型**
   - 普通字符占 1 列；
   - 宽字符写 owner cell + continuation cell；
   - 组合字符附着到前一个 owner cell，不推进列；
   - 右边界判断改成 `cursorCol + width - 1 >= cols`。

3. **渲染层改成按 cell run 输出**
   - 连续窄字符按样式合并成 run；
   - 宽字符 owner 独立成 fixed run；
   - fixed run 显式占 `2 * charWidth` 的像素宽度，continuation 不再丢失。

4. **可见光标改为终端自绘**
   - 原生 `input` 只保留“隐藏键盘代理”职责；
   - 视觉 caret 由 `cursorRow/cursorCol` 直接推导，不再借用原生 caret 的字符串长度逻辑。

5. **测量链路改为双 probe**
   - 用 `W` probe 测单列宽度，贴近 xterm 的单列测量思路；
   - 用 CJK probe 做兜底，确保 2 列槽位能装下当前字体的宽字符 glyph。

6. **padding 改到真实输出行**
   - 把左右 padding 从 `scroll-view` 挪到 `.output-line`；
   - 输出文本、光标、激活区统一使用同一套内容区坐标。

### 关键落地点

1. 终端逻辑从“字符串心智”彻底切到“cell 心智”。
2. 光标与文本都从同一个 buffer 派生，不再存在“显示光标”和“逻辑光标”两套来源。
3. 宽字符不再依赖浏览器自然文本流碰运气，而是显式占位。
4. 小程序仍保留原生 `scroll-view` 和原生输入法能力，没有走“纯自绘输入框”这种高风险路线。

### 验收确认

1. 第一轮重构后，用户确认核心输入/宽字符/换行问题已经解决。
2. 第二行输入中文后不再回跳第一行。
3. 英文输入到右侧时，右边 padding 恢复正常。
4. 中文输入过程中，光标与文本尾部不再持续拉开。
5. 中文到换行边界时，光标与文本右边界对齐关系恢复正常。

### 同日追加修复：Linux 重连纵向偏移 + caret 显示层收口

#### 追加现象

1. Linux 服务器连接/重连时，`last login...` 之前通常还有额外 banner 与空白行；提示符 caret 的纵向中心会逐次偏离，`clear` 后又恢复正常。
2. 自绘 caret 需要先点击终端才出现。
3. Shell 区左上角还会出现一个原生闪烁 caret。

#### 最终根因

1. 纵向偏移不是 Linux 那几行文字“字体更高”，而是**空白 buffer 行的 DOM 高度和 caret 公式使用的行高不一致**。
   - 空白 buffer 行不会生成渲染 segment；
   - 页面里的空白 `.output-line` 之前只靠 `min-height: 1em` 占高；
   - caret 却按像素 `lineHeight * cursorRow` 推导位置；
   - Linux 首屏与重连 banner 更容易出现额外空行，因此重连次数越多，累计误差越大；`clear` 后只剩当前提示符那一行，误差自然归零。
2. 自绘 caret 的显示条件绑定在 `shellInputFocus`，所以未点击时不会显示。
3. 隐藏输入代理仍停留在左上角（`top: 0; left: 0; z-index: 1`），原生 caret 仍有机会被系统绘制出来。

#### 最终修复

1. `refreshOutputLayout()` 新增 `outputLineHeightPx`，并把当前计算出来的 `lineHeight` 下发到每一条输出行。
2. `.output-line` 显式设置 `min-height` 与 `line-height` 为 `outputLineHeightPx`，把空白行真实 DOM 高度强制对齐到终端 buffer 使用的像素行高。
3. `queryOutputRect()` 同时读取 `.terminal-output` 的 `scrollOffset`，`refreshOutputLayout()` 改成“先更新内容，再设置 `scroll-top`，最后在布局落地后同步 overlay”的时序，避免 Linux 首屏较长时 overlay 提前读取过旧滚动状态。
4. 自绘 caret 改为 `statusClass === "connected"` 时显示，并在 `setStatus()` 状态变化后立即同步 overlay。
5. 隐藏输入代理移出可视区：`position: fixed; top/left: -2000px; z-index: -1; pointer-events: none;`，彻底去掉左上角原生 caret。
6. 上述修复全部只落在显示层与布局层，没有再修改 `appendOutput()`、`cursorRow/cursorCol`、宽字符 continuation 或 cell 计算路径。

#### 追加验收

1. 用户已确认：Linux 连接/重连场景下，光标纵向位置问题已修复。
2. caret 常显与左上角原生 caret 隐藏已实现，并作为后续小程序真机回归项继续保留。

### 涉及文件

- `apps/miniprogram/pages/terminal/index.js`
- `apps/miniprogram/pages/terminal/index.wxml`
- `apps/miniprogram/pages/terminal/index.wxss`
- `apps/miniprogram/pages/terminal/terminalCursorModel.js`
- `apps/miniprogram/pages/terminal/terminalCursorModel.test.ts`
- `docs/xterm-cursor-algorithm-2026-03-07.md`
- `docs/miniprogram-terminal-cursor-gap-analysis-2026-03-07.md`
- `docs/miniprogram-terminal-shell-input-plan-2026-02-28.md`
- `README.md`
- `apps/miniprogram/README.md`

### 验证命令

```bash
node --check apps/miniprogram/pages/terminal/index.js
node --check apps/miniprogram/pages/terminal/terminalCursorModel.js
npx --no-install eslint apps/miniprogram/pages/terminal/index.js apps/miniprogram/pages/terminal/terminalCursorModel.js apps/miniprogram/pages/terminal/terminalCursorModel.test.ts
npx --no-install vitest run apps/miniprogram/pages/terminal/terminalCursorModel.test.ts
npx --no-install tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --types vitest/globals,node apps/miniprogram/pages/terminal/terminalCursorModel.test.ts
npm run test
npm run typecheck
npm run lint
npm run build
```

### 解决时间

2026-03-07

---

## Q14：小程序终端历史内容可继续上滑（scroll-view 底部与 live tail 不一致）（2026-03-08）

### 现象

1. 小程序终端中，光标和红框位置看起来是对的，没有随着手指滚动随意漂移。
2. 但手动浏览历史时，即使当前命令行已经回到视口底部，历史内容仍然可以继续向上滑。
3. 历史不满一屏时，理论上不应存在真实滚动区，但页面仍可能表现出“还能继续拖”的内容高度。

### 根因

这次不是光标逻辑错了，而是页面层同时维护了两套“底部”：

1. **逻辑底部**  
   overlay caret 和红框的最大滚动值，按 `cursorRow` 推导：
   `maxScrollable = max(0, (cursorRow - visibleRows + 1) * lineHeight)`。

2. **原生内容底部**  
   `scroll-view` 的真实内容高度，来自 `outputRenderLines` 的总行数。

旧实现里，`outputRenderLines` 直接渲染 `outputCells` 的全部行；而 normal buffer 在 prompt 之后可能还保留尾部空行。结果就是：

- overlay 认为已经到底了；
- `scroll-view` 仍认为内容更长；
- 用户继续上滑时，历史内容还能动，但光标和红框不会再继续跟着上推。

### 解决方案

不修改 VT buffer 写入逻辑，只在页面投影层统一“渲染尾部”和“最大滚动值”的口径：

1. 新增 `terminalViewportModel.js`，专门计算终端视口状态。
2. **normal buffer** 只渲染到当前 `cursorRow`，把 prompt 后面的虚假尾部空行裁掉。
3. **alternate screen** 保留整屏语义，不做裁剪，避免破坏全屏程序的屏幕模型。
4. `scroll-view` 的内容高度和 overlay 的 `maxScrollTop` 都从同一份 `viewportState` 推导，彻底消除“两套底部”。

### 避免回归的约束

后续凡是继续补 VT 功能、滚动逻辑或视口投影，必须守住下面两条：

1. `scroll-view` 的真实渲染行数和 overlay 的最大滚动值，必须来自同一份 viewport state。
2. normal buffer 的页面投影不能直接渲染 `cursorRow` 之后的尾部空行；alternate screen 例外，仍按整屏保留。

本次已经用纯函数测试把这两条钉住，避免以后补 `top/vim/less` 支持时把 normal buffer 的滚动边界打回去。

### 验收确认

1. 历史超过一屏时，回到底部后，当前命令行不再继续被往上推。
2. 历史不满一屏时，不再存在真实可滚动空间。
3. 光标和红框仍保持原本正确行为，没有因为这次修复被拖着漂移。

### 涉及文件

- `apps/miniprogram/pages/terminal/index.js`
- `apps/miniprogram/pages/terminal/terminalViewportModel.js`
- `apps/miniprogram/pages/terminal/terminalViewportModel.test.ts`
- `docs/miniprogram-terminal-vt-guardrails-2026-03-08.md`

### 验证命令

```bash
node --check apps/miniprogram/pages/terminal/terminalViewportModel.js
node --check apps/miniprogram/pages/terminal/index.js
npx --no-install eslint apps/miniprogram/pages/terminal/index.js apps/miniprogram/pages/terminal/terminalViewportModel.js apps/miniprogram/pages/terminal/terminalViewportModel.test.ts
npx vitest run apps/miniprogram/pages/terminal/terminalViewportModel.test.ts apps/miniprogram/pages/terminal/terminalBufferState.test.ts apps/miniprogram/pages/terminal/terminalBufferSet.test.ts apps/miniprogram/pages/terminal/terminalKeyEncoder.test.ts
npm run test
npm run typecheck
npm run lint
npm run build
```

### 解决时间

2026-03-08

---

## Q15：小程序终端 `Codex` 交互严重卡顿与按钮无响应（对照 xterm.js 的时间片写入优化）（2026-03-10）

### 现象

1. 点击 `Codex` 连接项后，首个可见回显有时需要数秒到 `10s+` 才出现。
2. 等待与输出洪峰期间，除上下滑动外，右上角连接按钮、工具按钮、输入区聚焦、软键盘输入等交互经常无响应或出现超长延时。
3. 右上角时延显示会被拉高到 `10s+`，但与实际网络状态不一致。

### 根因

根因分两层：

1. **第一层：布局刷新风暴**
   - 小程序终端早期实现里，碎片化 `stdout` 会高频触发 `query -> setData -> postLayout -> overlay` 全链路刷新；
   - `layout.refresh.long` 一度达到 `3s~4s`，主线程与视图层桥接严重堆积。
2. **第二层：stdout 批处理仍是长同步任务**
   - 在完成 `stdout` 合批和 layout 单飞后，瓶颈继续收敛到 `captureTerminalBufferState -> applyTerminalOutput -> applyTerminalBufferState`；
   - `cloneCostMs + applyCostMs + stateApplyCostMs` 能达到数秒；
   - 按钮点击、输入框事件、`pong` 时延更新虽然逻辑上异步，但最终都运行在同一个小程序页面 JS 主线程，因此会被这段同步任务整体堵住。

右上角时延显示异常的本质也在这里：

1. 时延值来自 `pingAt -> pong` 的时间差；
2. 一旦主线程晚处理 `pong`，显示出来的就是“网络 RTT + 主线程排队延迟”；
3. 因此过去看到的 `10s+` 更像消息处理延迟，而不是纯网络 RTT。

### 解决方案

本次按 `xterm.js` 的 `WriteBuffer` 思路，分阶段把小程序终端改造成“短时间片、可续跑、优先让出主线程”的模型：

#### 第一阶段：stdout 合批 + layout 单飞

1. `stdout` 不再每个 chunk 都立刻刷新页面，而是先进入 `terminalRenderScheduler` 合批。
2. 同一时刻只允许一轮真实的 `layout + overlay` 在飞；in-flight 期间的新输出只合并成下一轮待处理请求。
3. overlay 直接复用 layout 的 `rect/cursorMetrics`，避免额外再做一次查询。

#### 第二阶段：安全切片 + 时间片推进

1. 新增 `takeTerminalReplaySlice(...)`，保证 `CSI / OSC / DCS / ESC / CRLF` 不会被从中间切断。
2. stdout 批处理改成时间片推进：
   - 单轮只处理一个很短的 slice 窗口；
   - 当前轮结束后用 `setTimeout(..., 0)` 续跑；
   - 用户刚点击按钮、聚焦输入区、发送控制键时，本轮 slice 会更早让出主线程。
3. 新增 `stdout.slice` 过程日志，用于区分“单 slice 耗时”和“整批 append 耗时”。

#### 第三阶段：运行态复用，继续压缩深拷贝成本

1. `stdout task` 创建时只复制一次运行态，后续 slice 直接复用这份已隔离状态；
2. `applyTerminalOutput(...)` 支持在运行态上原地推进，不再每个 slice 重复复制 `normal/alt buffer`；
3. 页面层发布 active buffer 时改为引用发布，减少 `stateApply` 阶段的再次深拷贝。

### 解决结果

1. `Codex` 启动后的首个可见回显等待时间已显著缩短，不再长期停留在“点击后数秒到十秒以上无反馈”的状态。
2. 输出洪峰期间，按钮、工具区、输入区聚焦的无响应现象已显著缓解，主问题按“已解决”收口。
3. `layout.refresh` 已从秒级下降到几十毫秒量级；当前主要长尾已从布局风暴收敛到 stdout 写入热路径，并在本轮继续被压缩。
4. 右上角时延显示不再频繁被主线程阻塞拉高；同时文档口径明确了旧问题本质不是纯网络 RTT。

### 当前边界

1. 极端大输出、长时间连续洪峰下，仍有继续压缩长尾的空间。
2. 后续若继续优化，重点会落在 `applyTerminalOutput` 的更细粒度增量化、字符串/字节统计成本和更激进的 stdout 时间片预算控制。

### 涉及文件

- `apps/miniprogram/pages/terminal/index.js`
- `apps/miniprogram/pages/terminal/vtParser.js`
- `apps/miniprogram/pages/terminal/vtParser.test.ts`
- `apps/miniprogram/pages/terminal/terminalBufferState.js`
- `apps/miniprogram/pages/terminal/terminalBufferState.test.ts`
- `apps/miniprogram/pages/terminal/terminalBufferSet.js`
- `apps/miniprogram/pages/terminal/terminalBufferSet.test.ts`
- `apps/miniprogram/pages/terminal/terminalRenderScheduler.js`
- `docs/miniprogram-terminal-xterm-stall-optimization-plan-2026-03-10.md`
- `release.md`

### 验证命令

```bash
npx vitest run apps/miniprogram/pages/terminal/terminalBufferSet.test.ts apps/miniprogram/pages/terminal/terminalBufferState.test.ts apps/miniprogram/pages/terminal/vtParser.test.ts apps/miniprogram/pages/terminal/terminalRenderScheduler.test.ts apps/miniprogram/pages/terminal/terminalKeyEncoder.test.ts apps/miniprogram/pages/terminal/touchShiftState.test.ts
npm run test
npm run typecheck
npm run lint
npm run build
npm run mini
```

### 解决时间

2026-03-10

---

## Q16：小程序 Codex 底部提示块缺行与闪动（footer 裁剪 + 同步刷新中间态暴露）（2026-03-11）

### 现象

1. 小程序终端进入 `Codex` 持续输出阶段后，底部本应稳定存在的提示块经常只剩上半部分。
2. 提示块下方的状态/路径行会被裁掉，偶尔短暂出现，但大多数时间不可见。
3. 输出高频刷新期间，底部区域会反复上下闪动，给人的观感是“交互区不稳定”。
4. 在 `> Use /skills to list available skills`、代码块等整行高亮区域里，部分行与行之间还能看到终端底色细线透出来。

### 根因

根因分两层：

1. **第一层：normal buffer viewport 裁尾过猛**
   - 原先 viewport 近似只保留到 `cursorRow + 1`；
   - 当 `Codex` 的真实 footer 位于光标行之后时，footer 虽然已经写进 buffer，却会在投影阶段被直接裁掉。
2. **第二层：同步刷新窗口未收口**
   - `Codex` 会用 `CSI ? 2026 h/l` 包裹一批局部重绘；
   - 若不处理这组同步刷新边界，小程序会把整批 repaint 的中间态逐帧暴露出来，于是底部区域出现明显闪动。
3. **第三层：整行高亮背景仍按 segment 行盒绘制**
   - 小程序终端把 ANSI 背景色挂在行内 `text segment` 上，而不是整行容器上；
   - 当字体实际占高与行高存在余量时，segment 背景不会覆盖整行高度，于是高亮块行间会露出底色细线；
   - 这个问题不属于控制流漏处理，而是渲染层背景承载位置不对。

### 解决方案

本次按“最小风险修复”落地：

1. viewport 保留 `cursorRow` 之后仍真实存在的 footer，不再简单按光标行截断 normal buffer。
2. stdout 入口对 `CSI ? 2026 h/l` 同步刷新窗口做收口，降低中间态直接显示到界面的概率。
3. 新增 2026-03-11 真实 PTY 抓包回放用例，并补齐 footer 保留与同步刷新窗口相关回归测试。
4. 对“整行统一背景”的 render line，将背景提升到 line 容器层绘制；混合背景行继续保留原有 segment 语义，不新增渲染节点，也避免高亮块行间透底。

### 解决结果

1. `Codex` 持续输出期间，底部提示块与状态行已能稳定显示完整高度，不再长期缺最后几行。
2. 输出过程中的明显上下闪动已显著收敛，交互观感恢复稳定。
3. `> Use /skills to list available skills`、代码块与同类整行高亮区域不再透出行间底色细线。
4. 当前版本 `v2.9.4` 已将该问题按“已解决”收口，并同步更新到对外文档口径。

### 涉及文件

- `apps/miniprogram/pages/terminal/vtParser.js`
- `apps/miniprogram/pages/terminal/vtParser.test.ts`
- `apps/miniprogram/pages/terminal/terminalViewportModel.js`
- `apps/miniprogram/pages/terminal/terminalViewportModel.test.ts`
- `apps/miniprogram/pages/terminal/terminalCursorModel.js`
- `apps/miniprogram/pages/terminal/terminalCursorModel.test.ts`
- `apps/miniprogram/pages/terminal/index.js`
- `apps/miniprogram/pages/terminal/index.wxml`
- `apps/miniprogram/pages/terminal/codexCaptureFixture.js`
- `apps/miniprogram/pages/terminal/codexCaptureReplay.test.ts`
- `docs/miniprogram-codex-footer-flicker-optimization-plan-2026-03-11.md`
- `release.md`

### 验证命令

```bash
npx vitest run apps/miniprogram/pages/terminal/vtParser.test.ts apps/miniprogram/pages/terminal/terminalViewportModel.test.ts apps/miniprogram/pages/terminal/terminalCursorModel.test.ts apps/miniprogram/pages/terminal/codexCaptureReplay.test.ts
npm run test
npm run typecheck
npm run lint
npm run build
```

### 解决时间

2026-03-11

---

## Q18：小程序 Codex 多轮交互后持续卡顿（真机日志二次归因 + stdout 渲染降频）（2026-03-17）

### 现象

1. 小程序终端进入 `Codex` 多轮交互后，响应会越来越慢，按钮、输入聚焦和滚动都开始卡顿。
2. 慢的时候手机侧耗电明显升高，说明问题更像 JS 主线程 / 视图桥接持续吃 CPU，而不是单纯网络慢。
3. 旧日志里经常出现 `scheduler_backlog`、`stdout.append.long`，一次卡顿可持续数秒到十几秒。

### 根因

根因这次靠真机日志收敛得比较明确，不再停留在“可能是 buffer 太大”的猜测层面：

1. **`scheduler_backlog` 是结果，不是第一根因**
   - 真机日志里最慢样本虽然经常表现为 `queueWaitMs / schedulerWaitMs` 很大；
   - 但拆开看，真正拖住前一轮任务的主成本是重复的 `layout + overlay`，不是排队逻辑本身。
2. **同一个 `stdout task` 被重复刷新太多次**
   - 典型慢样本里，`26KB ~ 55KB` 的 stdout task 会在几秒执行窗口内触发 `11 ~ 14` 轮 `render/layout/overlay`；
   - 同一批数据不是“一次大刷新太重”，而是“中等刷新反复发生太多次”；
   - `lastRenderDecisionReason="remaining_below_threshold"` 说明旧策略在 task 尾段容易形成 render 风暴。
3. **真正重的是页面层桥接和 overlay，不是 VT 解析本身**
   - 真机日志里 `layoutCostMs + overlayCostMs` 长期显著高于 `cloneCostMs + applyCostMs + trimCostMs + stateApplyCostMs`；
   - `renderBuildCostMs` 本身不高，问题更多集中在 `setData` / overlay 这类页面提交成本。
4. **这次问题不是要“重做一个 xterm”**
   - 现有小程序方案必须保留原生软键盘、焦点、滚动和输入代理约束；
   - 可以借鉴 `xterm` 的调度思路，但不能把整个渲染架构照搬过去。

### 解决方案

本次按“保持小程序壳层轻量，只收敛真正热点”的原则落地：

1. **先加低噪声诊断日志，不刷屏**
   - 增加 `perf.summary / perf.snapshot / stdout.append.long / main_thread_lag` 聚合日志；
   - 同时记录 `renderPassCount / layoutPassCount / overlayPassCount / totalSetDataCostMs` 等字段，把卡顿从“感觉慢”变成可量化归因。
2. **stdout 改成 task 级渲染冷却**
   - 不再因为尾段 `remaining_below_threshold` 就连续触发多次 render；
   - task 完成、用户输入相关场景仍可立即刷新，避免影响交互正确性。
3. **overlay 从 stdout 主链路里进一步降频**
   - 非必要 render 不再每次都跟一次 overlay；
   - 只有最终帧、首次帧、用户输入相关场景或冷却到期时才同步 overlay。
4. **滚动补刷与顶部空白修复已单独拆分记录**
   - 本条只保留与持续卡顿直接相关的 stdout 调度、render 冷却与 overlay 降频；
   - 滚动顶部空白另见下方独立问题记录。

### 解决结果

1. 真机新日志已经从“单个 task 十几轮刷新”收敛到更低频：
   - 例如 `4.9KB` 的 stdout task 现在是 `sliceCount=5`、`renderPassCount=2`、`layoutPassCount=2`、`overlayPassCount=2`；
   - 同类任务的 `activeStdoutAgeMs` 已收敛到亚秒级。
2. `layout / overlay / setData` 的累计成本明显下降，旧的 render 风暴特征不再持续出现。
3. 当前结论已经明确：
   - **卡顿主因不是 buffer 体量**
   - **主因是 stdout task 内重复页面刷新过多**

### 当前边界

1. 当前版本已经把主要热点从“单个 task 十几轮刷新”压到更低频，但极端大输出下仍需继续观察。
2. 后续若还要继续优化，优先方向仍是：
   - 继续用真机日志验证是否还存在大 task 的 render 风暴；
   - 继续压缩 stdout task 内的页面刷新次数；
   - 继续控制 overlay 在高频输出期间的参与频率。

### 涉及文件

- `apps/miniprogram/pages/terminal/index.js`
- `apps/miniprogram/pages/terminal/terminalStdoutRenderPolicy.js`
- `apps/miniprogram/pages/terminal/terminalStdoutRenderPolicy.test.ts`
- `apps/miniprogram/pages/terminal/terminalRenderScheduler.js`
- `apps/miniprogram/pages/terminal/terminalRenderScheduler.test.ts`
- `apps/miniprogram/pages/terminal/terminalPerfLogBuffer.js`
- `apps/miniprogram/pages/terminal/terminalPerfLogBuffer.test.ts`
- `apps/miniprogram/pages/terminal/terminalBufferState.js`
- `docs/miniprogram-terminal-cpu-diagnostics-plan-2026-03-17.md`

### 验证命令

```bash
npx vitest run apps/miniprogram/pages/terminal/terminalStdoutRenderPolicy.test.ts apps/miniprogram/pages/terminal/terminalRenderScheduler.test.ts apps/miniprogram/pages/terminal/terminalPerfLogBuffer.test.ts
npm test
npm run typecheck
npm run lint
npm run build
```

### 解决时间

2026-03-17

---

## Q19：小程序终端滚动到顶部偶发空白（viewport 补刷时机偏晚）（2026-03-17）

### 现象

1. 终端历史较长时，用户快速向上滑动或继续下拉顶部区域。
2. 顶部有时会先出现一大片空白，随后正文才补进来。
3. 这个问题主要影响滚动观感，不是持续卡顿主链路的主因。

### 根因

1. 终端为了控制 `scroll-view` 负担，只渲染正文窗口，其他高度通过上下 spacer 保持。
2. 旧逻辑即使已经接近甚至进入 `top spacer`，仍然会等待一轮预取定时器再补刷正文。
3. 因此用户快速滚到顶部时，会先看到 spacer 空白，再等正文窗口换入。

### 解决方案

1. 增加“立即补刷”判断：
   - 一旦当前可视区已经压进 `top spacer / bottom spacer`，立刻触发窗口补刷。
2. 滚动补刷单独走 `scrollViewport` 模式：
   - 只在手势浏览历史时放大正文窗口预算；
   - 正常 stdout 输出仍保留默认轻量预算。
3. 滚动期正文窗口预算提升到 `224` 行，边缘 buffer 提升到 `40` 行，减少快速滑动时的换窗次数。

### 解决结果

1. 顶部空白按当前复现路径已收口。
2. 快速滑动历史时，正文换窗频率下降，体感比原先更连续。
3. 这个问题已从持续卡顿主问题中拆出，后续独立跟踪。

### 涉及文件

- `apps/miniprogram/pages/terminal/index.js`
- `apps/miniprogram/pages/terminal/terminalViewportModel.js`
- `apps/miniprogram/pages/terminal/terminalViewportModel.test.ts`
- `apps/miniprogram/pages/terminal/terminalLayoutReuse.test.ts`

### 验证命令

```bash
npx vitest run apps/miniprogram/pages/terminal/terminalViewportModel.test.ts apps/miniprogram/pages/terminal/terminalLayoutReuse.test.ts
npm test
npm run typecheck
npm run lint
npm run build
```

### 解决时间

2026-03-17

---

## Q17：小程序 Codex 会话续接后，历史区顶部空白并偶发裸露 `5;2H`（2026-03-11）

### 现象

1. 在小程序终端连接 `Codex` 并完成一轮输出后，返回服务器列表，再次进入同一服务器会话。
2. 恢复后的终端底部输入区与 footer 大体还在，但向下翻历史记录时，顶部会出现大块空白。
3. 部分场景顶部第一行还会出现类似 `5;2H` 这样的裸露定位参数。
4. 同一轮会话在挂起前的尾部缓冲其实是正确的，问题出现在“恢复第一页”这一步，而不是原始输出阶段。

### 根因

根因分两层：

1. **第一层：恢复时错误地优先使用了被裁剪过的 replayText**
   - 终端挂起时同时保存了：
     - 最近屏幕行快照 `lines`
     - 用于几何变化后重建的尾部 `replayText`
   - 其中 `replayText` 会被裁剪到 `128 KiB`，它不保证一定从一条完整业务行或一次完整 TUI 重绘边界开始。
2. **第二层：恢复发生在真实几何测量之前**
   - 终端页 `onLoad` 时默认仍是 `80x24`；
   - 旧逻辑在这一阶段就直接拿 `replayText` 做 buffer 重建；
   - 于是原本正确的 `lines` 快照被新的错误重建结果覆盖，历史行数从正确值掉到更少的值，并出现空白和半截 footer。

日志证据已经明确证明了这点：

1. 挂起前 `buffer.snapshot.persist` 里 `lineCount = 168`，尾部 `› Improve documentation in @filename` 与 footer 均完整。
2. 恢复后旧逻辑的 `buffer.snapshot.restore.replay_applied` 立刻变成更少的行数，并出现半截 `89` 一类残留。
3. 也就是说，问题不在“快照保存错了”，而在“恢复时用错了恢复源”。

### 解决方案

本次按“最小范围修复，保留后续几何重建能力”的思路落地：

1. 挂起时继续保存 `lines + replayText`，但额外把当时的 `bufferCols / bufferRows` 一起写进快照。
2. 恢复第一页时不再优先用 `replayText` 重建，而是：
   - 先按快照里的 `bufferCols / bufferRows` 恢复当时的逻辑几何；
   - 再直接用 `lines` 快照还原当前屏幕内容。
3. `replayText` 仍保留，但只留给“后续真实发生列数变化”的重建场景使用，不再在首次恢复时抢占权威来源。
4. 新增终端快照测试，锁住 `bufferCols / bufferRows` 的持久化与恢复前提，避免这类问题再次回归。

### 解决结果

1. 再次进入同一服务器会话时，历史区不再因为首次恢复误用 `replayText` 而塌缩成空白。
2. 向下翻历史记录时，顶部空白与裸露 `5;2H` 问题已收口。
3. 会话续接的当前口径已明确：
   - **第一页恢复以 `lines` 快照为准**
   - **几何变化后的再排版才使用 `replayText`**

### 涉及文件

- `apps/miniprogram/pages/terminal/index.js`
- `apps/miniprogram/utils/terminalSession.js`
- `apps/miniprogram/utils/terminalSession.test.ts`
- `apps/miniprogram/README.md`
- `CHANGELOG.md`
- `release.md`

### 验证命令

```bash
npx vitest run apps/miniprogram/utils/terminalSession.test.ts apps/miniprogram/pages/terminal/terminalBufferState.test.ts apps/miniprogram/pages/terminal/terminalRenderScheduler.test.ts apps/miniprogram/utils/storage.test.ts apps/miniprogram/utils/terminalNavigation.test.ts apps/miniprogram/utils/terminalSessionState.test.ts
npx eslint apps/miniprogram/pages/terminal/index.js apps/miniprogram/pages/connect/index.js apps/miniprogram/utils/terminalSession.js apps/miniprogram/utils/terminalSession.test.ts
npm run typecheck
npm run lint
npm run build
```

### 解决时间

2026-03-11

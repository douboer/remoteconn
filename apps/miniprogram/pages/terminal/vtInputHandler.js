/* global module, require */

/**
 * 轻量 VT 输入处理层：
 * 1. 承接“模式位切换 / 查询响应 / 软重置”这类协议状态逻辑；
 * 2. 不直接持有 buffer 数据结构，只通过上下文回调读写运行态；
 * 3. 先把最容易继续膨胀的协议分支从 `terminalBufferState` 中拆出，为后续继续下沉 CSI/ESC 处理铺路。
 */

const { DEFAULT_TERMINAL_MODES } = require("./terminalBufferSet.js");

function createTerminalVtInputHandler(options) {
  const source = options && typeof options === "object" ? options : {};
  const responses = Array.isArray(source.responses) ? source.responses : [];
  const runtimeColors = source.runtimeColors && typeof source.runtimeColors === "object" ? source.runtimeColors : {};
  const runtimeState = source.runtimeState && typeof source.runtimeState === "object" ? source.runtimeState : {};
  const bufferCols = Math.max(1, Math.round(Number(source.bufferCols) || 0));
  const bufferRows = Math.max(1, Math.round(Number(source.bufferRows) || 0));
  const cloneAnsiState =
    typeof source.cloneAnsiState === "function"
      ? source.cloneAnsiState
      : (state) => ({ ...(state && typeof state === "object" ? state : {}) });
  const toOscRgbString =
    typeof source.toOscRgbString === "function" ? source.toOscRgbString : () => "";
  const getActiveBuffer =
    typeof source.getActiveBuffer === "function" ? source.getActiveBuffer : () => null;
  const setCursorRow = typeof source.setCursorRow === "function" ? source.setCursorRow : () => {};
  const getCursorCol = typeof source.getCursorCol === "function" ? source.getCursorCol : () => 0;
  const setCursorCol = typeof source.setCursorCol === "function" ? source.setCursorCol : () => {};
  const getScrollTop = typeof source.getScrollTop === "function" ? source.getScrollTop : () => 0;
  const setScrollTop = typeof source.setScrollTop === "function" ? source.setScrollTop : () => {};
  const getScrollBottom =
    typeof source.getScrollBottom === "function" ? source.getScrollBottom : () => Math.max(0, bufferRows - 1);
  const setScrollBottom =
    typeof source.setScrollBottom === "function" ? source.setScrollBottom : () => {};
  const setAnsiState = typeof source.setAnsiState === "function" ? source.setAnsiState : () => {};
  const moveCursorUp = typeof source.moveCursorUp === "function" ? source.moveCursorUp : () => {};
  const moveCursorDown = typeof source.moveCursorDown === "function" ? source.moveCursorDown : () => {};
  const moveCursorRight =
    typeof source.moveCursorRight === "function" ? source.moveCursorRight : () => {};
  const moveCursorLeft = typeof source.moveCursorLeft === "function" ? source.moveCursorLeft : () => {};
  const moveCursorNextLine =
    typeof source.moveCursorNextLine === "function" ? source.moveCursorNextLine : () => {};
  const moveCursorPreviousLine =
    typeof source.moveCursorPreviousLine === "function" ? source.moveCursorPreviousLine : () => {};
  const setCursorColumn1 =
    typeof source.setCursorColumn1 === "function" ? source.setCursorColumn1 : () => {};
  const setCursorRow1 = typeof source.setCursorRow1 === "function" ? source.setCursorRow1 : () => {};
  const setCursorPosition1 =
    typeof source.setCursorPosition1 === "function" ? source.setCursorPosition1 : () => {};
  const clearDisplayByMode =
    typeof source.clearDisplayByMode === "function" ? source.clearDisplayByMode : () => {};
  const clearLineByMode =
    typeof source.clearLineByMode === "function" ? source.clearLineByMode : () => {};
  const eraseChars = typeof source.eraseChars === "function" ? source.eraseChars : () => {};
  const insertChars = typeof source.insertChars === "function" ? source.insertChars : () => {};
  const deleteChars = typeof source.deleteChars === "function" ? source.deleteChars : () => {};
  const insertLines = typeof source.insertLines === "function" ? source.insertLines : () => {};
  const deleteLines = typeof source.deleteLines === "function" ? source.deleteLines : () => {};
  const scrollRegionUp =
    typeof source.scrollRegionUp === "function" ? source.scrollRegionUp : () => {};
  const scrollRegionDown =
    typeof source.scrollRegionDown === "function" ? source.scrollRegionDown : () => {};
  const setScrollRegion =
    typeof source.setScrollRegion === "function" ? source.setScrollRegion : () => {};
  const resetCursorForOriginMode =
    typeof source.resetCursorForOriginMode === "function" ? source.resetCursorForOriginMode : null;
  const indexDown = typeof source.indexDown === "function" ? source.indexDown : () => {};
  const nextLine = typeof source.nextLine === "function" ? source.nextLine : () => {};
  const reverseIndex =
    typeof source.reverseIndex === "function" ? source.reverseIndex : () => {};
  const getScreenCursorRow =
    typeof source.getScreenCursorRow === "function" ? source.getScreenCursorRow : () => 0;
  const saveCurrentCursor =
    typeof source.saveCurrentCursor === "function" ? source.saveCurrentCursor : () => {};
  const restoreCurrentCursor =
    typeof source.restoreCurrentCursor === "function" ? source.restoreCurrentCursor : () => {};
  const switchActiveBuffer =
    typeof source.switchActiveBuffer === "function" ? source.switchActiveBuffer : () => {};
  const ansiResetState =
    source.ansiResetState && typeof source.ansiResetState === "object" ? source.ansiResetState : {};

  function pushDeviceStatusResponse(privateMarker, code) {
    if (code === 5) {
      responses.push(`${privateMarker === "?" ? "\u001b[?" : "\u001b["}0n`);
      return;
    }
    if (code === 6) {
      const row = getScreenCursorRow() + 1;
      const col = Math.min(bufferCols, getCursorCol()) + 1;
      responses.push(privateMarker === "?" ? `\u001b[?${row};${col}R` : `\u001b[${row};${col}R`);
    }
  }

  /**
   * 设备属性查询只回报当前实现真实支持的“最小可用口径”，
   * 避免把不存在的终端特性伪装成已支持。
   */
  function pushDeviceAttributesResponse(privateMarker, code) {
    if (code > 0) {
      return;
    }
    if (privateMarker === ">") {
      responses.push("\u001b[>0;276;0c");
      return;
    }
    responses.push("\u001b[?1;2c");
  }

  function pushOscColorReport(ident) {
    let color = "";
    if (ident === "10") {
      color = runtimeColors.defaultForeground;
    } else if (ident === "11") {
      color = runtimeColors.defaultBackground;
    } else if (ident === "12") {
      color = runtimeColors.defaultCursor;
    }
    const rgb = toOscRgbString(color);
    if (!rgb) {
      return;
    }
    responses.push(`\u001b]${ident};${rgb}\u001b\\`);
  }

  /**
   * OSC 10/11/12 允许把多个查询串在一条指令里，这里只对当前已实现的颜色槽位做查询响应。
   */
  function handleOscSequence(ident, data) {
    const base = Number(ident);
    if (![10, 11, 12].includes(base)) {
      return;
    }
    const slots = String(data || "").split(";");
    for (let offset = 0; offset < slots.length; offset += 1) {
      const slotIdent = String(base + offset);
      if (!["10", "11", "12"].includes(slotIdent)) {
        break;
      }
      if (slots[offset] === "?") {
        pushOscColorReport(slotIdent);
      }
    }
  }

  function pushModeStatusResponse(privateMarker, mode, status) {
    const prefix = privateMarker === "?" ? "?" : "";
    responses.push(`\u001b[${prefix}${mode};${status}$y`);
  }

  /**
   * 这里只回报当前运行态里真实维护的模式位。
   * 未实现模式统一返回 0，避免协议层把“未知能力”冒充成“已支持”。
   */
  function resolveModeStatus(privateMarker, value) {
    const mode = Math.round(Number(value) || 0);
    if (!mode) return 0;
    if (privateMarker !== "?") {
      if (mode === 4) {
        return runtimeState.modes.insertMode ? 1 : 2;
      }
      return 0;
    }
    if (mode === 1) return runtimeState.modes.applicationCursorKeys ? 1 : 2;
    if (mode === 6) return runtimeState.modes.originMode ? 1 : 2;
    if (mode === 7) return runtimeState.modes.wraparound ? 1 : 2;
    if (mode === 25) return runtimeState.modes.cursorHidden ? 2 : 1;
    if (mode === 45) return runtimeState.modes.reverseWraparound ? 1 : 2;
    if (mode === 66) return runtimeState.modes.applicationKeypad ? 1 : 2;
    if (mode === 47 || mode === 1047 || mode === 1049) {
      const activeBuffer = getActiveBuffer();
      return activeBuffer && activeBuffer.isAlt ? 1 : 2;
    }
    if (mode === 1048) return 1;
    if (mode === 1004) return runtimeState.modes.sendFocus ? 1 : 2;
    if (mode === 2004) return runtimeState.modes.bracketedPasteMode ? 1 : 2;
    return 0;
  }

  function pushModeReport(privateMarker, value) {
    const mode = Math.round(Number(value) || 0);
    if (!mode) return;
    pushModeStatusResponse(privateMarker, mode, resolveModeStatus(privateMarker, mode));
  }

  function pushStatusStringResponse(payload) {
    const value = String(payload || "");
    if (value === "m") {
      responses.push("\u001bP1$r0m\u001b\\");
      return;
    }
    if (value === "r") {
      responses.push(`\u001bP1$r${getScrollTop() + 1};${getScrollBottom() + 1}r\u001b\\`);
      return;
    }
    if (value === " q") {
      responses.push("\u001bP1$r2 q\u001b\\");
      return;
    }
    if (value === '"q') {
      responses.push('\u001bP1$r0"q\u001b\\');
      return;
    }
    if (value === '"p') {
      responses.push('\u001bP1$r61;1"p\u001b\\');
      return;
    }
    responses.push("\u001bP0$r\u001b\\");
  }

  /**
   * DECSTR 只做软重置，不清屏、不搬动当前 cursor。
   * 这部分逻辑必须保持和现有主链路一致，避免复杂 TUI 在软重置后发生可见跳变。
   */
  function softResetTerminal() {
    runtimeState.modes = { ...DEFAULT_TERMINAL_MODES };
    setAnsiState(cloneAnsiState(ansiResetState));
    setScrollTop(0);
    setScrollBottom(Math.max(0, bufferRows - 1));

    const activeBuffer = getActiveBuffer();
    if (activeBuffer) {
      activeBuffer.savedCursorRow = 0;
      activeBuffer.savedCursorCol = 0;
      activeBuffer.savedAnsiState = cloneAnsiState(ansiResetState);
    }
  }

  function handlePrivateMode(enabled, value) {
    const mode = Math.round(Number(value) || 0);
    if (!mode) return;
    if (mode === 1) {
      runtimeState.modes.applicationCursorKeys = enabled;
      return;
    }
    if (mode === 6) {
      runtimeState.modes.originMode = enabled;
      if (resetCursorForOriginMode) {
        resetCursorForOriginMode(enabled);
        return;
      }
      const activeBuffer = getActiveBuffer();
      setCursorRow(enabled && activeBuffer && activeBuffer.isAlt ? getScrollTop() : 0);
      setCursorCol(0);
      return;
    }
    if (mode === 45) {
      runtimeState.modes.reverseWraparound = enabled;
      return;
    }
    if (mode === 66) {
      runtimeState.modes.applicationKeypad = enabled;
      return;
    }
    if (mode === 7) {
      runtimeState.modes.wraparound = enabled;
      return;
    }
    if (mode === 25) {
      runtimeState.modes.cursorHidden = !enabled;
      return;
    }
    if (mode === 47 || mode === 1047) {
      switchActiveBuffer(enabled ? "alt" : "normal", enabled);
      return;
    }
    if (mode === 1048) {
      if (enabled) {
        saveCurrentCursor();
      } else {
        restoreCurrentCursor();
      }
      return;
    }
    if (mode === 1049) {
      if (enabled) {
        saveCurrentCursor();
        switchActiveBuffer("alt", true);
      } else {
        switchActiveBuffer("normal", false);
        restoreCurrentCursor();
      }
      return;
    }
    if (mode === 2004) {
      runtimeState.modes.bracketedPasteMode = enabled;
      return;
    }
    if (mode === 1004) {
      runtimeState.modes.sendFocus = enabled;
    }
  }

  function handleAnsiMode(enabled, value) {
    const mode = Math.round(Number(value) || 0);
    if (!mode) return;
    if (mode === 4) {
      runtimeState.modes.insertMode = enabled;
    }
  }

  function resolveCsiNumber(values, index, fallback) {
    const value = values && Number(values[index]);
    if (!Number.isFinite(value)) return fallback;
    const normalized = Math.round(value);
    if (normalized < 0) return 0;
    return normalized;
  }

  /**
   * 这里只下沉“CSI -> 光标动作”的协议解释：
   * 1. handler 负责默认参数、1-based 行列语义和 final byte 分派；
   * 2. bufferState 仍负责真实行列边界、history/alt buffer 与 origin mode 的具体落点。
   */
  function handleCursorControl(final, values) {
    const code = String(final || "");
    if (code === "A") {
      moveCursorUp(Math.max(1, resolveCsiNumber(values, 0, 1)));
      return true;
    }
    if (code === "B") {
      moveCursorDown(Math.max(1, resolveCsiNumber(values, 0, 1)));
      return true;
    }
    if (code === "C") {
      moveCursorRight(Math.max(1, resolveCsiNumber(values, 0, 1)));
      return true;
    }
    if (code === "D") {
      moveCursorLeft(Math.max(1, resolveCsiNumber(values, 0, 1)));
      return true;
    }
    if (code === "E") {
      moveCursorNextLine(Math.max(1, resolveCsiNumber(values, 0, 1)));
      return true;
    }
    if (code === "F") {
      moveCursorPreviousLine(Math.max(1, resolveCsiNumber(values, 0, 1)));
      return true;
    }
    if (code === "G") {
      setCursorColumn1(Math.max(1, resolveCsiNumber(values, 0, 1)));
      return true;
    }
    if (code === "d") {
      setCursorRow1(Math.max(1, resolveCsiNumber(values, 0, 1)));
      return true;
    }
    if (code === "H" || code === "f") {
      setCursorPosition1(
        Math.max(1, resolveCsiNumber(values, 0, 1)),
        Math.max(1, resolveCsiNumber(values, 1, 1))
      );
      return true;
    }
    return false;
  }

  /**
   * 擦除类 CSI 只在这里解释参数语义：
   * 1. `J / K` 走“显示/行清除模式”；
   * 2. `X` 走“从当前光标起擦除 N 列”，默认值保持 1。
   */
  function handleEraseControl(final, values) {
    const code = String(final || "");
    if (code === "J") {
      clearDisplayByMode(resolveCsiNumber(values, 0, 0));
      return true;
    }
    if (code === "K") {
      clearLineByMode(resolveCsiNumber(values, 0, 0));
      return true;
    }
    if (code === "X") {
      eraseChars(Math.max(1, resolveCsiNumber(values, 0, 1)));
      return true;
    }
    return false;
  }

  /**
   * 编辑/滚动类 CSI 仍然只解释“协议参数 -> buffer 动作”的映射，
   * 真正的 cell 变更、滚动区约束和 viewport/history 处理继续留在 bufferState。
   */
  function handleEditControl(final, values) {
    const code = String(final || "");
    if (code === "@") {
      insertChars(Math.max(1, resolveCsiNumber(values, 0, 1)));
      return true;
    }
    if (code === "P") {
      deleteChars(Math.max(1, resolveCsiNumber(values, 0, 1)));
      return true;
    }
    if (code === "L") {
      insertLines(Math.max(1, resolveCsiNumber(values, 0, 1)));
      return true;
    }
    if (code === "M") {
      deleteLines(Math.max(1, resolveCsiNumber(values, 0, 1)));
      return true;
    }
    if (code === "S") {
      scrollRegionUp(Math.max(1, resolveCsiNumber(values, 0, 1)));
      return true;
    }
    if (code === "T") {
      scrollRegionDown(Math.max(1, resolveCsiNumber(values, 0, 1)));
      return true;
    }
    if (code === "r") {
      const top = Math.max(1, resolveCsiNumber(values, 0, 1));
      const rawBottom = values && values.length > 1 ? resolveCsiNumber(values, 1, bufferRows) : bufferRows;
      const bottom = rawBottom > 0 ? rawBottom : bufferRows;
      setScrollRegion(top, bottom);
      return true;
    }
    return false;
  }

  /**
   * 保存/恢复光标这类协议动作目前同时存在于 CSI 与 ESC 两条入口：
   * 1. `CSI s / u`
   * 2. `ESC 7 / 8`
   * 这里统一只做协议语义分派，真实保存内容仍由 bufferState 维护。
   */
  function handleCursorSaveRestoreControl(final) {
    const code = String(final || "");
    if (code === "s" || code === "7") {
      saveCurrentCursor();
      return true;
    }
    if (code === "u" || code === "8") {
      restoreCurrentCursor();
      return true;
    }
    return false;
  }

  /**
   * 查询类 CSI 统一在这里做协议分派，减少主循环里零散的条件判断：
   * 1. `DECRQM`：`CSI Ps $ p` / `CSI ? Ps $ p`
   * 2. `DSR / CPR`：`CSI n` / `CSI ? n`
   * 3. `DA1 / DA2`：`CSI c` / `CSI > c`
   */
  function handleQueryControl(privateMarker, intermediates, final, values) {
    const marker = String(privateMarker || "");
    const middle = String(intermediates || "");
    const code = String(final || "");

    if (middle === "$" && code === "p" && (marker === "" || marker === "?")) {
      (Array.isArray(values) && values.length > 0 ? values : [0]).forEach((mode) => {
        pushModeReport(marker, mode);
      });
      return true;
    }
    if (code === "n" && (marker === "" || marker === "?")) {
      pushDeviceStatusResponse(marker, resolveCsiNumber(values, 0, 0));
      return true;
    }
    if (code === "c" && (marker === "" || marker === ">")) {
      pushDeviceAttributesResponse(marker, resolveCsiNumber(values, 0, 0));
      return true;
    }
    return false;
  }

  /**
   * ESC 入口目前只保留真正的 ESC 协议语义分派：
   * 1. `ESC 7 / 8` 保存恢复光标
   * 2. `ESC D / E / M` index / next line / reverse index
   */
  function handleEscControl(final) {
    const code = String(final || "");
    if (handleCursorSaveRestoreControl(code)) {
      return true;
    }
    if (code === "D") {
      indexDown();
      return true;
    }
    if (code === "E") {
      nextLine();
      return true;
    }
    if (code === "M") {
      reverseIndex();
      return true;
    }
    return false;
  }

  /**
   * `CSI` 顶层分派只负责“协议入口 -> 已有子处理器”的路由：
   * 1. 查询类、模式切换、软重置优先处理，保持和现有协议优先级一致；
   * 2. 普通 ANSI 模式与无私有前缀的光标/擦除/编辑动作继续复用已有细分处理器；
   * 3. `SGR` 仍留在 bufferState，因为它直接作用于当前 ansiState 运行态。
   */
  function handleCsiControl(privateMarker, intermediates, final, values) {
    const marker = String(privateMarker || "");
    const code = String(final || "");

    if (handleQueryControl(marker, intermediates, code, values)) {
      return true;
    }
    if (marker === "?") {
      if (code === "h" || code === "l") {
        const enabled = code === "h";
        (Array.isArray(values) && values.length > 0 ? values : [0]).forEach((mode) =>
          handlePrivateMode(enabled, mode)
        );
        return true;
      }
      return false;
    }
    if (marker === "!" && code === "p") {
      softResetTerminal();
      return true;
    }
    if (!marker && (code === "h" || code === "l")) {
      values.forEach((value) => {
        handleAnsiMode(code === "h", value);
      });
      return true;
    }
    if (marker) {
      return false;
    }
    return (
      handleCursorControl(code, values) ||
      handleEraseControl(code, values) ||
      handleEditControl(code, values) ||
      handleCursorSaveRestoreControl(code)
    );
  }

  return {
    handleCsiControl,
    handleCursorControl,
    handleEraseControl,
    handleEditControl,
    handleCursorSaveRestoreControl,
    handleQueryControl,
    handleEscControl,
    handleAnsiMode,
    handleOscSequence,
    handlePrivateMode,
    pushDeviceAttributesResponse,
    pushDeviceStatusResponse,
    pushModeReport,
    pushStatusStringResponse,
    softResetTerminal
  };
}

module.exports = {
  createTerminalVtInputHandler
};

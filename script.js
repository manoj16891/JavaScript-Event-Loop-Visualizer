const presets = {
  timeoutPromiseRace: {
    label: "setTimeout + Promise",
    code: `console.log("script start");

setTimeout(() => {
  console.log("timeout callback");
}, 4);

Promise.resolve().then(() => {
  console.log("promise then callback");
});

console.log("script end");`,
    entry: "global",
    callbacks: {
      global: {
        label: "Global Script",
        startLine: 1,
        ops: [
          { type: "log", value: "script start", line: 1 },
          { type: "timeout", delay: 4, callback: "timerA", line: 3 },
          { type: "microtask", callback: "promiseThen", line: 7 },
          { type: "log", value: "script end", line: 11 }
        ]
      },
      promiseThen: {
        label: "Promise.then callback",
        startLine: 8,
        ops: [{ type: "log", value: "promise then callback", line: 8 }]
      },
      timerA: {
        label: "setTimeout callback",
        startLine: 4,
        ops: [{ type: "log", value: "timeout callback", line: 4 }]
      }
    }
  },

  nestedTimeouts: {
    label: "Nested Timeouts",
    code: `console.log("script start");

setTimeout(() => {
  console.log("first timeout");

  Promise.resolve().then(() => {
    console.log("microtask from timeout");
  });

  setTimeout(() => {
    console.log("second timeout");
  }, 2);
}, 3);

console.log("script end");`,
    entry: "global",
    callbacks: {
      global: {
        label: "Global Script",
        startLine: 1,
        ops: [
          { type: "log", value: "script start", line: 1 },
          { type: "timeout", delay: 3, callback: "firstTimeout", line: 3 },
          { type: "log", value: "script end", line: 15 }
        ]
      },
      firstTimeout: {
        label: "first setTimeout callback",
        startLine: 4,
        ops: [
          { type: "log", value: "first timeout", line: 4 },
          { type: "microtask", callback: "innerMicrotask", line: 6 },
          { type: "timeout", delay: 2, callback: "secondTimeout", line: 10 }
        ]
      },
      innerMicrotask: {
        label: "microtask from timeout",
        startLine: 7,
        ops: [{ type: "log", value: "microtask from timeout", line: 7 }]
      },
      secondTimeout: {
        label: "second setTimeout callback",
        startLine: 11,
        ops: [{ type: "log", value: "second timeout", line: 11 }]
      }
    }
  },

  asyncAwaitFlow: {
    label: "Async/Await Flow",
    code: `async function run() {
  console.log("async start");
  await Promise.resolve();
  console.log("after await");
  Promise.resolve().then(() => {
    console.log("chained then");
  });
}

run();
setTimeout(() => {
  console.log("timeout after async flow");
}, 2);`,
    entry: "global",
    callbacks: {
      global: {
        label: "Global Script",
        startLine: 2,
        ops: [
          { type: "log", value: "async start", line: 2 },
          { type: "microtask", callback: "awaitResume", line: 3 },
          { type: "timeout", delay: 2, callback: "timeoutAfterAsync", line: 11 }
        ]
      },
      awaitResume: {
        label: "await continuation",
        startLine: 4,
        ops: [
          { type: "log", value: "after await", line: 4 },
          { type: "microtask", callback: "chainedThen", line: 5 }
        ]
      },
      chainedThen: {
        label: "chained Promise.then callback",
        startLine: 6,
        ops: [{ type: "log", value: "chained then", line: 6 }]
      },
      timeoutAfterAsync: {
        label: "setTimeout callback",
        startLine: 12,
        ops: [{ type: "log", value: "timeout after async flow", line: 12 }]
      }
    }
  }
};

const CUSTOM_KEY = "__custom__";
const HISTORY_LIMIT = 500;

const dom = {
  presetRow: document.getElementById("presetRow"),
  scenarioEditor: document.getElementById("scenarioEditor"),
  editorStatus: document.getElementById("editorStatus"),
  applyCodeBtn: document.getElementById("applyCodeBtn"),
  loadPresetBtn: document.getElementById("loadPresetBtn"),
  callStack: document.getElementById("callStackList"),
  webApi: document.getElementById("webApiList"),
  microtask: document.getElementById("microtaskList"),
  macrotask: document.getElementById("macrotaskList"),
  logList: document.getElementById("logList"),
  tickLabel: document.getElementById("tickLabel"),
  stateLabel: document.getElementById("stateLabel"),
  presetLabel: document.getElementById("presetLabel"),
  speedRange: document.getElementById("speedRange"),
  speedValue: document.getElementById("speedValue"),
  prevBtn: document.getElementById("prevBtn"),
  playBtn: document.getElementById("playBtn"),
  nextBtn: document.getElementById("nextBtn"),
  resetBtn: document.getElementById("resetBtn")
};

const state = {
  tick: 0,
  timeMs: 0,
  timerCounter: 0,
  running: false,
  completed: false,
  speed: Number(dom.speedRange.value),
  pendingGlobal: true,
  activePresetKey: "timeoutPromiseRace",
  selectedPresetKey: "timeoutPromiseRace",
  preset: null,
  customPreset: null,
  executionStack: [],
  callStack: [],
  webApis: [],
  microtasks: [],
  macrotasks: [],
  logs: [],
  history: [],
  currentLine: null
};

let loopHandle = null;

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function setEditorStatus(message, tone) {
  dom.editorStatus.textContent = message;
  dom.editorStatus.className = tone ? `editor-status ${tone}` : "editor-status";
}

function getActivePresetSource() {
  if (state.activePresetKey === CUSTOM_KEY) {
    if (!state.customPreset) {
      throw new Error("No custom scenario loaded.");
    }
    return state.customPreset;
  }

  const preset = presets[state.activePresetKey];
  if (!preset) {
    throw new Error(`Unknown preset key: ${state.activePresetKey}`);
  }
  return preset;
}

function readCallbackLabel(id) {
  const callback = state.preset.callbacks[id];
  return callback ? callback.label : `Unknown callback (${id})`;
}

function appendLog(message) {
  const stamp = `[tick ${String(state.tick).padStart(2, "0")} | t=${state.timeMs}ms]`;
  state.logs.unshift(`${stamp} ${message}`);
  if (state.logs.length > 90) {
    state.logs.pop();
  }
}

function queueTimeout(delay, callbackId) {
  state.timerCounter += 1;
  state.webApis.push({
    id: state.timerCounter,
    callbackId,
    remaining: Math.max(0, Number(delay) || 0)
  });
  appendLog(`setTimeout registered -> ${readCallbackLabel(callbackId)} (delay ${delay}ms)`);
}

function queueMicrotask(callbackId) {
  state.microtasks.push(callbackId);
  appendLog(`Microtask queued -> ${readCallbackLabel(callbackId)}`);
}

function pushFrame(callbackId, source) {
  const callback = state.preset.callbacks[callbackId];
  if (!callback) {
    appendLog(`Missing callback: ${callbackId}`);
    return;
  }

  state.executionStack.push({
    callbackId,
    source,
    opIndex: 0,
    entered: false
  });
}

function executeOp(op) {
  if (!op || !op.type) {
    return;
  }

  if (op.type === "log") {
    appendLog(`console.log: ${op.value}`);
    return;
  }

  if (op.type === "timeout") {
    queueTimeout(op.delay, op.callback);
    return;
  }

  if (op.type === "microtask") {
    queueMicrotask(op.callback);
    return;
  }

  if (op.type === "sync") {
    pushFrame(op.callback, "sync call");
  }
}

function processActiveFrame() {
  if (state.executionStack.length === 0) {
    return false;
  }

  const frame = state.executionStack[state.executionStack.length - 1];
  const callback = state.preset.callbacks[frame.callbackId];
  if (!callback) {
    state.executionStack.pop();
    return true;
  }

  if (!frame.entered) {
    frame.entered = true;
    state.callStack.push(callback.label);
    state.currentLine = callback.startLine || null;
    appendLog(`${callback.label} entered (${frame.source})`);
    return true;
  }

  if (frame.opIndex < callback.ops.length) {
    const op = callback.ops[frame.opIndex];
    frame.opIndex += 1;
    state.currentLine = op.line || callback.startLine || null;
    executeOp(op);
    return true;
  }

  appendLog(`${callback.label} completed`);
  state.executionStack.pop();
  state.callStack.pop();

  if (state.executionStack.length === 0) {
    state.currentLine = null;
  }
  return true;
}

function releaseReadyTimers(advanceBy) {
  for (const timer of state.webApis) {
    timer.remaining -= advanceBy;
  }

  const stillRunning = [];
  for (const timer of state.webApis) {
    if (timer.remaining <= 0) {
      state.macrotasks.push(timer.callbackId);
      appendLog(`Timer #${timer.id} moved to macrotask queue -> ${readCallbackLabel(timer.callbackId)}`);
    } else {
      stillRunning.push(timer);
    }
  }

  state.webApis = stillRunning;
}

function advanceTimersToNextEvent() {
  if (state.webApis.length === 0) {
    return false;
  }

  let minRemaining = Infinity;
  for (const timer of state.webApis) {
    if (timer.remaining < minRemaining) {
      minRemaining = timer.remaining;
    }
  }

  if (!Number.isFinite(minRemaining)) {
    return false;
  }

  const advanceBy = Math.max(0, minRemaining);
  state.timeMs += advanceBy;
  releaseReadyTimers(advanceBy);
  appendLog(`Clock advanced by ${advanceBy}ms`);
  return true;
}

function isSimulationComplete() {
  return !state.pendingGlobal &&
    state.executionStack.length === 0 &&
    state.microtasks.length === 0 &&
    state.macrotasks.length === 0 &&
    state.webApis.length === 0;
}

function captureSnapshot() {
  return {
    tick: state.tick,
    timeMs: state.timeMs,
    timerCounter: state.timerCounter,
    completed: state.completed,
    pendingGlobal: state.pendingGlobal,
    executionStack: deepClone(state.executionStack),
    callStack: deepClone(state.callStack),
    webApis: deepClone(state.webApis),
    microtasks: deepClone(state.microtasks),
    macrotasks: deepClone(state.macrotasks),
    logs: deepClone(state.logs),
    currentLine: state.currentLine
  };
}

function restoreSnapshot(snapshot) {
  state.tick = snapshot.tick;
  state.timeMs = snapshot.timeMs;
  state.timerCounter = snapshot.timerCounter;
  state.completed = snapshot.completed;
  state.pendingGlobal = snapshot.pendingGlobal;
  state.executionStack = deepClone(snapshot.executionStack);
  state.callStack = deepClone(snapshot.callStack);
  state.webApis = deepClone(snapshot.webApis);
  state.microtasks = deepClone(snapshot.microtasks);
  state.macrotasks = deepClone(snapshot.macrotasks);
  state.logs = deepClone(snapshot.logs);
  state.currentLine = snapshot.currentLine;
}

function saveHistory() {
  state.history.push(captureSnapshot());
  if (state.history.length > HISTORY_LIMIT) {
    state.history.shift();
  }
}

function runNextStep() {
  if (state.completed) {
    return;
  }

  saveHistory();
  state.tick += 1;

  if (processActiveFrame()) {
    render();
    return;
  }

  if (state.pendingGlobal) {
    state.pendingGlobal = false;
    pushFrame(state.preset.entry, "initial script");
    render();
    return;
  }

  if (state.microtasks.length > 0) {
    const nextMicrotask = state.microtasks.shift();
    pushFrame(nextMicrotask, "microtask queue");
    render();
    return;
  }

  if (state.macrotasks.length > 0) {
    const nextMacrotask = state.macrotasks.shift();
    pushFrame(nextMacrotask, "macrotask queue");
    render();
    return;
  }

  if (advanceTimersToNextEvent()) {
    render();
    return;
  }

  if (isSimulationComplete()) {
    state.completed = true;
    state.currentLine = null;
    appendLog("Simulation complete - all tasks finished");
    pauseLoop();
    render();
    return;
  }

  appendLog("Event loop idle");
  render();
}

function startLoop() {
  if (state.running || state.completed) {
    return;
  }

  state.running = true;
  loopHandle = window.setInterval(runNextStep, state.speed);
  renderStatus();
}

function pauseLoop(skipRender) {
  state.running = false;
  if (loopHandle !== null) {
    window.clearInterval(loopHandle);
    loopHandle = null;
  }
  if (!skipRender) {
    renderStatus();
  }
}

function togglePlay() {
  if (state.running) {
    pauseLoop();
  } else {
    startLoop();
  }
}

function stepBack() {
  pauseLoop();
  if (state.history.length === 0) {
    return;
  }

  const snapshot = state.history.pop();
  restoreSnapshot(snapshot);
  render();
}

function resetState(options) {
  const syncEditor = !options || options.syncEditor !== false;
  pauseLoop(true);

  const sourcePreset = getActivePresetSource();
  state.preset = deepClone(sourcePreset);

  state.tick = 0;
  state.timeMs = 0;
  state.timerCounter = 0;
  state.running = false;
  state.completed = false;
  state.pendingGlobal = true;
  state.executionStack = [];
  state.callStack = [];
  state.webApis = [];
  state.microtasks = [];
  state.macrotasks = [];
  state.history = [];
  state.currentLine = null;
  state.logs = ["[tick 00 | t=0ms] Ready. Use Play or Next to start execution."];

  if (syncEditor) {
    dom.scenarioEditor.value = state.preset.code;
  }

  render();
}

function renderLane(element, entries, laneClass) {
  element.textContent = "";

  if (entries.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "Empty";
    element.appendChild(empty);
    return;
  }

  for (const text of entries) {
    const item = document.createElement("li");
    item.className = `lane-item ${laneClass}`;
    item.textContent = text;
    element.appendChild(item);
  }
}

function renderLogs() {
  dom.logList.textContent = "";
  for (const line of state.logs) {
    const item = document.createElement("li");
    item.className = "log-item";
    item.textContent = line;
    dom.logList.appendChild(item);
  }
}

function highlightEditorLine(lineNumber) {
  if (!lineNumber || lineNumber < 1) {
    return;
  }

  const text = dom.scenarioEditor.value;
  let start = 0;
  let currentLine = 1;
  while (currentLine < lineNumber && start < text.length) {
    const nextBreak = text.indexOf("\n", start);
    if (nextBreak === -1) {
      return;
    }
    start = nextBreak + 1;
    currentLine += 1;
  }

  let end = text.indexOf("\n", start);
  if (end === -1) {
    end = text.length;
  }

  dom.scenarioEditor.setSelectionRange(start, end);
  const lineHeight = Number.parseFloat(window.getComputedStyle(dom.scenarioEditor).lineHeight) || 20;
  dom.scenarioEditor.scrollTop = Math.max(0, (lineNumber - 2) * lineHeight);
}

function renderStatus() {
  let mode;
  if (state.completed) {
    mode = "Complete";
  } else if (state.running) {
    mode = "Running";
  } else {
    mode = "Paused";
  }

  const lineLabel = state.currentLine ? `line ${state.currentLine}` : "-";
  dom.tickLabel.textContent = `Tick: ${state.tick} | Time: ${state.timeMs}ms`;
  dom.stateLabel.textContent = `State: ${mode} | Current: ${lineLabel}`;
  dom.presetLabel.textContent = `Preset: ${state.preset ? state.preset.label : "-"}`;
  dom.speedValue.textContent = `${state.speed}ms`;

  dom.playBtn.textContent = state.running ? "||" : "\u25B6";
  dom.playBtn.title = state.running ? "Pause" : "Play";
  dom.prevBtn.disabled = state.running || state.history.length === 0;
  dom.nextBtn.disabled = state.running || state.completed;
}

function renderPresetButtons() {
  dom.presetRow.textContent = "";

  Object.entries(presets).forEach(([key, preset]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preset-btn";
    button.textContent = preset.label;

    if (key === state.activePresetKey) {
      button.classList.add("active");
    }

    button.addEventListener("click", () => {
      state.activePresetKey = key;
      state.selectedPresetKey = key;
      setEditorStatus(`Loaded preset: ${preset.label}`, "ok");
      resetState();
    });

    dom.presetRow.appendChild(button);
  });

  if (state.customPreset) {
    const customButton = document.createElement("button");
    customButton.type = "button";
    customButton.className = "preset-btn";
    customButton.textContent = "Custom Code";

    if (state.activePresetKey === CUSTOM_KEY) {
      customButton.classList.add("active");
    }

    customButton.addEventListener("click", () => {
      state.activePresetKey = CUSTOM_KEY;
      setEditorStatus("Loaded custom code.", "ok");
      resetState({ syncEditor: false });
    });

    dom.presetRow.appendChild(customButton);
  }
}

function render() {
  const stackView = [...state.callStack].reverse();
  renderLane(dom.callStack, stackView, "stack");

  const webApiView = state.webApis.map((timer) => {
    const callbackLabel = readCallbackLabel(timer.callbackId);
    return `Timer #${timer.id}: ${timer.remaining}ms -> ${callbackLabel}`;
  });
  renderLane(dom.webApi, webApiView, "web");

  const microtaskView = state.microtasks.map((id) => readCallbackLabel(id));
  renderLane(dom.microtask, microtaskView, "micro");

  const macrotaskView = state.macrotasks.map((id) => readCallbackLabel(id));
  renderLane(dom.macrotask, macrotaskView, "macro");

  renderLogs();
  renderPresetButtons();
  renderStatus();
  highlightEditorLine(state.currentLine);
}

function stringifyLogArg(value) {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined) {
    return "undefined";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "function") {
    return "[function]";
  }
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return String(value);
  }
}

function inferUserLineFromStack(stack, maxCodeLines) {
  if (!stack) {
    return null;
  }

  const matches = [...stack.matchAll(/<anonymous>:(\d+):\d+/g)];
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const raw = Number(matches[index][1]);
    if (!Number.isFinite(raw)) {
      continue;
    }

    const normalized = raw - 1;
    if (normalized >= 1 && normalized <= maxCodeLines) {
      return normalized;
    }
  }
  return null;
}

function compileScenarioFromCode(code) {
  if (!code || !code.trim()) {
    throw new Error("Editor is empty.");
  }

  if (/\bawait\b/.test(code)) {
    throw new Error("Custom editor does not support await yet. Use Promise.then(...) or a preset.");
  }

  if (/\bsetInterval\b/.test(code)) {
    throw new Error("setInterval is not supported in custom editor.");
  }

  const callbacks = {
    global: {
      label: "Global Script",
      startLine: 1,
      ops: []
    }
  };

  let callbackCounter = 0;
  const codeLineCount = code.split("\n").length;
  const opStack = [callbacks.global.ops];

  function currentOps() {
    return opStack[opStack.length - 1];
  }

  function captureCurrentLine() {
    return inferUserLineFromStack(new Error().stack, codeLineCount);
  }

  function recordCallback(kind, fn, startLine) {
    if (typeof fn !== "function") {
      throw new Error(`${kind} expects a function callback.`);
    }

    callbackCounter += 1;
    const callbackId = `cb_${callbackCounter}`;
    callbacks[callbackId] = {
      label: `${kind} #${callbackCounter}`,
      startLine: startLine || null,
      ops: []
    };

    opStack.push(callbacks[callbackId].ops);
    try {
      fn();
    } finally {
      opStack.pop();
    }

    return callbackId;
  }

  const consoleMock = {
    log: (...args) => {
      currentOps().push({
        type: "log",
        value: args.map((arg) => stringifyLogArg(arg)).join(" "),
        line: captureCurrentLine()
      });
    }
  };

  const setTimeoutMock = (fn, delay) => {
    const line = captureCurrentLine();
    const callbackId = recordCallback("setTimeout callback", fn, line);
    currentOps().push({
      type: "timeout",
      delay: Math.max(0, Number(delay) || 0),
      callback: callbackId,
      line
    });
    return callbackCounter;
  };

  const queueMicrotaskMock = (fn) => {
    const line = captureCurrentLine();
    const callbackId = recordCallback("queueMicrotask callback", fn, line);
    currentOps().push({
      type: "microtask",
      callback: callbackId,
      line
    });
  };

  const PromiseMock = {
    resolve: (value) => ({
      then: (fn) => {
        const line = captureCurrentLine();
        const callbackId = recordCallback("Promise.then callback", fn, line);
        currentOps().push({
          type: "microtask",
          callback: callbackId,
          line
        });
        return PromiseMock.resolve(value);
      },
      catch: () => PromiseMock.resolve(value),
      finally: (fn) => {
        if (typeof fn === "function") {
          const line = captureCurrentLine();
          const callbackId = recordCallback("Promise.finally callback", fn, line);
          currentOps().push({
            type: "microtask",
            callback: callbackId,
            line
          });
        }
        return PromiseMock.resolve(value);
      }
    })
  };

  const execute = new Function(
    "console",
    "setTimeout",
    "Promise",
    "queueMicrotask",
    `"use strict";\n${code}`
  );

  execute(consoleMock, setTimeoutMock, PromiseMock, queueMicrotaskMock);

  return {
    label: "Custom Code",
    code,
    entry: "global",
    callbacks
  };
}

function applyEditorCode() {
  pauseLoop();
  const code = dom.scenarioEditor.value;

  try {
    const compiled = compileScenarioFromCode(code);
    state.customPreset = compiled;
    state.activePresetKey = CUSTOM_KEY;
    setEditorStatus("Custom code compiled and loaded.", "ok");
    resetState({ syncEditor: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setEditorStatus(`Compile failed: ${message}`, "error");
  }
}

function loadSelectedPresetIntoEditor() {
  const preset = presets[state.selectedPresetKey];
  if (!preset) {
    setEditorStatus("No preset available to load.", "error");
    return;
  }

  dom.scenarioEditor.value = preset.code;
  setEditorStatus(`Preset code loaded: ${preset.label}. Click Apply Code to run editor code.`, "ok");
}

function wireEditorIndentation() {
  dom.scenarioEditor.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") {
      return;
    }

    event.preventDefault();
    const start = dom.scenarioEditor.selectionStart;
    const end = dom.scenarioEditor.selectionEnd;
    const value = dom.scenarioEditor.value;
    dom.scenarioEditor.value = `${value.slice(0, start)}  ${value.slice(end)}`;
    dom.scenarioEditor.selectionStart = start + 2;
    dom.scenarioEditor.selectionEnd = start + 2;
  });
}

function wireEvents() {
  dom.prevBtn.addEventListener("click", stepBack);
  dom.playBtn.addEventListener("click", togglePlay);
  dom.nextBtn.addEventListener("click", () => {
    pauseLoop();
    runNextStep();
  });
  dom.resetBtn.addEventListener("click", () => resetState({ syncEditor: false }));

  dom.applyCodeBtn.addEventListener("click", applyEditorCode);
  dom.loadPresetBtn.addEventListener("click", loadSelectedPresetIntoEditor);

  dom.speedRange.addEventListener("input", (event) => {
    state.speed = Number(event.target.value);
    dom.speedValue.textContent = `${state.speed}ms`;

    if (state.running) {
      pauseLoop();
      startLoop();
    }
  });

  wireEditorIndentation();
}

wireEvents();
setEditorStatus("Ready. Edit code and click Apply Code.", "ok");
resetState();

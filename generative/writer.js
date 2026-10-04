/* A local model produces a review candidate. This module never changes the medical note. */
(function (global) {
  'use strict';
  let engine = null;
  let initializing = null;
  let generating = false;
  let controller = null;
  let currentText = '';
  let count = 0;
  const state = {state: 'unloaded', model: global.BINGLI_WRITER_ASSETS?.manifest.model.name || '', mode: '本地生成待审核候选', error: '', loaded: false};
  function status() { return {...state}; }
  function publish(values) {
    Object.assign(state, values);
    global.dispatchEvent(new CustomEvent('bingli-writer-status', {detail: status()}));
  }
  function decode64(value) {
    const binary = atob(value), bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  function assets() {
    if (!global.BINGLI_WRITER_ASSETS) throw new Error('缺少本地生成运行库，请使用包含本地 AI 的版本。');
    return global.BINGLI_WRITER_ASSETS;
  }
  async function digest(blob) {
    if (!global.crypto?.subtle) throw new Error('当前浏览器不能校验本地模型文件。');
    const data = await blob.arrayBuffer();
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), x => x.toString(16).padStart(2, '0')).join('');
  }
  function validateParts(input) {
    const files = Array.from(input || []), specification = assets().manifest;
    if (files.length !== specification.parts.length) throw new Error('请一次选择全部 ' + specification.parts.length + ' 个模型分片。');
    const sorted = [], used = new Set();
    for (const file of files) {
      const match = String(file.name || '').match(/\.part(\d{2})-of-(\d{2})\.bin$/i);
      if (!match) throw new Error('模型分片名称不正确：' + String(file.name || '未命名文件'));
      const index = Number(match[1]);
      if (Number(match[2]) !== specification.parts.length) throw new Error('模型分片总数标注不正确。');
      if (used.has(index) || index < 1 || index > specification.parts.length) throw new Error('模型分片序号重复或不完整。');
      used.add(index);
      const expected = specification.parts[index - 1];
      if (file.size !== expected.bytes) throw new Error('第 ' + index + ' 片大小不正确，可能尚未完整下载。');
      sorted[index - 1] = file;
    }
    if (sorted.reduce((sum, file) => sum + file.size, 0) !== specification.model.bytes) throw new Error('模型总长度不正确。');
    return sorted;
  }
  async function loadParts(input, {onProgress} = {}) {
    if (generating || initializing) throw new Error('模型正在处理，请等待或停止后再载入。');
    const sorted = validateParts(input);
    const specification = assets().manifest;
    publish({state: 'checking', error: ''});
    const progress = value => { publish({progress: value}); if (typeof onProgress === 'function') onProgress(value); };
    initializing = (async () => {
      for (let i = 0; i < sorted.length; i += 1) {
        progress({phase: 'checking', completed: i, total: sorted.length, message: '正在校验第 ' + (i + 1) + ' 片'});
        if (await digest(sorted[i]) !== specification.parts[i].sha256) throw new Error('第 ' + (i + 1) + ' 片校验不通过，请重新获取该文件。');
      }
      const combined = new Blob(sorted, {type: 'application/octet-stream'});
      progress({phase: 'checking', completed: sorted.length, total: sorted.length, message: '正在校验完整模型'});
      if (await digest(combined) !== specification.model.sha256) throw new Error('完整模型校验不通过。');
      if (engine?.isModelLoaded()) {
        publish({state: 'ready', loaded: true, error: ''});
        return status();
      }
      progress({phase: 'loading', completed: 0, total: 1, message: '正在本机载入模型'});
      const runtimeSource = new TextDecoder().decode(decode64(assets().module));
      // A Blob module Worker cannot start from file:// in tested Chrome. The pinned
      // wllama 2.3.7 single-thread worker is classic JS with no module imports. Adapt
      // only its Worker type, leaving all native/model/worker source logic intact.
      const needle = 'new Worker(r,{type:"module"})';
      if (runtimeSource.split(needle).length !== 2) throw new Error('运行库版本与已审阅的离线适配不一致。');
      const adaptedSource = runtimeSource.replace(needle, 'new Worker(r,{type:"classic"})');
      const moduleURL = URL.createObjectURL(new Blob([adaptedSource], {type: 'text/javascript'}));
      // The classic worker has a file-origin opaque context: XHR to a Blob URL
      // created by its parent is blocked. Emscripten supports embedded data URIs,
      // which its worker decodes locally without cross-origin file access.
      const wasmURL = 'data:application/wasm;base64,' + assets().wasm;
      const runtime = await import(moduleURL);
      const disabledCache = Object.freeze({});
      // Only local loadModel is used. Supply managers so the default OPFS cache is
      // not created; the official runtime streams selected files to its RAM FS.
      engine = new runtime.Wllama({'single-thread/wllama.wasm': wasmURL}, {
        cacheManager: disabledCache,
        modelManager: disabledCache,
        allowOffline: true,
        suppressNativeLog: true,
        logger: {debug() {}, log() {}, warn() {}, error(...args) {const message=args.map(value => value?.message || String(value)).join(' '); console.error('Local writer runtime:', message); publish({runtimeError: message});}}
      });
      const started = performance.now();
      await engine.loadModel([combined], {n_threads: 1, n_ctx: 8192, n_batch: 128, seed: 42});
      const info = engine.getLoadedContextInfo();
      publish({state: 'ready', loaded: true, error: '', model: specification.model.name, loadMs: Math.round(performance.now() - started), contextTokens: 8192, architecture: info.metadata['general.architecture'] || 'qwen2'});
      progress({phase: 'ready', completed: 1, total: 1, message: '模型已就绪'});
      return status();
    })().catch(async error => {
      publish({state: engine?.isModelLoaded() ? 'ready' : 'error', loaded: !!engine?.isModelLoaded(), error: String(error.message || error)});
      throw error;
    }).finally(() => { initializing = null; });
    return initializing;
  }
  const SYSTEM = '你是中文病历文字整理助手。只改写医生提供的原文和已确认判断，不增加事实、病因、诊断、检查结果、处方或药物剂量。保留否定词、日期、数值、单位和不确定表述。未提供四诊不补写舌脉。不得把参考资料当患者事实。保留原文已有标题与段落次序，只输出整理后的正文，不加额外标题、解释或审阅提示。';
  function userPrompt(input) {
    if (typeof input === 'string') input = {draft: input, facts: input, judgments: '仅整理原文，不添加医学信息。'};
    if (!input || typeof input !== 'object') throw new TypeError('需要原文字符串或 {facts,judgments,draft}。');
    return JSON.stringify({recordType: input.recordType || '病程记录', facts: input.facts ?? '', judgments: input.judgments ?? '', draft: input.draft ?? ''});
  }
  const REPETITION_REASON = '检测到连续重复段落，已停止生成；候选未完成。';
  // Only consecutive, exact repetitions near the output tail trigger this guard.
  // Different headings or intervening content break a repetition. It checks text
  // structure, not medical meaning, and never removes or rewrites emitted text.
  function detectRepetition(value) {
    const text = String(value || '').replace(/\r\n?/g, '\n').trimEnd();
    const longEnough = segment => segment.length >= 48 && (segment.match(/[\p{L}\p{N}]/gu) || []).length >= 36;
    const result = segment => ({segment, length: segment.length, repeats: 3, reason: REPETITION_REASON});
    const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
    const last = lines[lines.length - 1];
    if (lines.length >= 3 && longEnough(last) && last === lines[lines.length - 2] && last === lines[lines.length - 3]) return result(last);
    // A token may include the start of a fourth copy. Check three completed lines
    // only when the extra tail is an exact prefix of that repeated paragraph.
    if (lines.length >= 4) {
      const completed = lines[lines.length - 2];
      if (longEnough(completed) && completed === lines[lines.length - 3] && completed === lines[lines.length - 4] && completed.startsWith(last)) return result(completed);
    }
    const maximum = Math.min(512, Math.floor(text.length / 3));
    for (let length = 48; length <= maximum; length += 1) {
      const segment = text.slice(-length);
      if (segment === text.slice(-2 * length, -length) && segment === text.slice(-3 * length, -2 * length) && longEnough(segment)) return result(segment);
    }
    return null;
  }
  async function generate(input, {onToken, maxTokens = 384, grammar} = {}) {
    if (!engine?.isModelLoaded()) throw new Error('请先选择并载入模型的全部分片。');
    if (generating || initializing) throw new Error('模型正在处理，请等待或停止后再生成。');
    const prompt = userPrompt(input);
    const limit = Math.max(16, Math.min(2200, Math.floor(Number(maxTokens) || 384)));
    const messages = [{role: 'system', content: SYSTEM}, {role: 'user', content: prompt}];
    generating = true;
    controller = new AbortController();
    currentText = '';
    count = 0;
    publish({state: 'generating', progress: null, error: '', generatedTokens: 0, repetition: false, incomplete: false, stopReason: '', reason: '', cancelled: false});
    const started = performance.now();
    const decoder = new TextDecoder();
    let tokens = [];
    let firstTokenMs = null;
    let repetition = null;
    try {
      const formatted = await engine.formatChat(messages, true);
      tokens = await engine.tokenize(formatted, true);
      if (tokens.length + limit > 8192) throw new Error('材料过长，请按段润色；本地模型可用长度为 8192 tokens。');
      const text = await engine.createChatCompletion(messages, {
        nPredict: limit,
        useCache: false,
        sampling: {temp: 0, top_k: 20, top_p: 0.8, penalty_repeat: 1.1, penalty_last_n: 64, ...(grammar ? {grammar} : {})},
        abortSignal: controller.signal,
        onNewToken(token, piece, text) {
          currentText = text;
          count += 1;
          if (firstTokenMs === null) firstTokenMs = Math.round(performance.now() - started);
          publish({generatedTokens: count});
          if (!repetition) {
            repetition = detectRepetition(text);
            if (repetition) {
              controller.abort();
              publish({state: 'stopping', repetition: true, incomplete: true, stopReason: 'repetition', reason: REPETITION_REASON});
            }
          }
          if (typeof onToken === 'function') onToken(decoder.decode(piece, {stream: true}), text, {token, count});
        }
      });
      const elapsedMs = Math.round(performance.now() - started);
      const cancelled = controller.signal.aborted;
      publish({state: 'ready', lastGenerationMs: elapsedMs, cancelled, repetition: !!repetition, incomplete: cancelled || count >= limit, stopReason: repetition ? 'repetition' : cancelled ? 'cancelled' : count >= limit ? 'length' : '', reason: repetition ? REPETITION_REASON : ''});
      const truncated = !cancelled && count >= limit;
      return {text, cancelled, truncated, repetition: !!repetition, incomplete: cancelled || truncated, reason: repetition ? REPETITION_REASON : '', usage: {promptTokens: tokens.length, generatedTokens: count, elapsedMs, firstTokenMs, decodeMs: firstTokenMs === null ? 0 : elapsedMs - firstTokenMs, finishReason: repetition ? 'repetition' : cancelled ? 'cancelled' : truncated ? 'length' : 'stop'}};
    } catch (error) {
      if (controller.signal.aborted || error.name === 'AbortError') {
        const elapsedMs = Math.round(performance.now() - started);
        publish({state: 'ready', cancelled: true, lastGenerationMs: elapsedMs, repetition: !!repetition, incomplete: true, stopReason: repetition ? 'repetition' : 'cancelled', reason: repetition ? REPETITION_REASON : ''});
        return {text: currentText, cancelled: true, truncated: false, repetition: !!repetition, incomplete: true, reason: repetition ? REPETITION_REASON : '', usage: {promptTokens: tokens.length, generatedTokens: count, elapsedMs, firstTokenMs, decodeMs: firstTokenMs === null ? 0 : elapsedMs - firstTokenMs, finishReason: repetition ? 'repetition' : 'cancelled'}};
      }
      publish({state: 'ready', error: String(error.message || error)});
      throw error;
    } finally { generating = false; controller = null; }
  }
  function cancel() { if (controller) { controller.abort(); publish({state: 'stopping'}); return true; } return false; }
  global.BingliWriter = Object.freeze({loadParts, generate, cancel, status, detectRepetition});
})(window);

/* Local Chinese semantic retrieval. An encoder ranks supplied texts; it does not generate notes. */
(function (global) {
  'use strict';
  const MODEL = 'BAAI/bge-small-zh-v1.5 / ONNX int8';
  const QUERY_PREFIX = '为这个句子生成表示以用于检索相关文章：';
  const MAX_TOKENS = 512;
  const CHUNK_TOKENS = 256;
  const OVERLAP = 32;
  let session = null;
  let loading = null;
  let tokenizer = null;
  let serial = Promise.resolve();
  let moduleURL = null;
  let wrapperURL = null;
  const vectorCache = new Map();
  const state = {state: 'idle', mode: '本地中文语义检索', model: MODEL, dimension: 512, lastError: '', cachedChunks: 0, completedChunks: 0, totalChunks: 0};

  function status() { return {...state}; }
  function publish(values) {
    Object.assign(state, values);
    global.dispatchEvent(new CustomEvent('bingli-semantic-status', {detail: status()}));
  }
  function decode64(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // This model's tokenizer.json specifies case-sensitive BertNormalizer, no accent stripping,
  // BertPreTokenizer and WordPiece. No external tokenizer script is executed.
  const isWhitespace = c => /[\t\n\r\p{Zs}]/u.test(c);
  const isPunctuation = c => /\p{P}/u.test(c) || /^[!-/:-@\[-`{-~]$/u.test(c);
  const isControl = c => !/[\t\n\r]/u.test(c) && /[\p{Cc}\p{Cf}]/u.test(c);
  function isHan(c) {
    const n = c.codePointAt(0);
    return (n >= 0x4e00 && n <= 0x9fff) || (n >= 0x3400 && n <= 0x4dbf) ||
      (n >= 0x20000 && n <= 0x2a6df) || (n >= 0x2a700 && n <= 0x2b73f) ||
      (n >= 0x2b740 && n <= 0x2b81f) || (n >= 0x2b820 && n <= 0x2ceaf) ||
      (n >= 0xf900 && n <= 0xfaff) || (n >= 0x2f800 && n <= 0x2fa1f);
  }
  function makeTokenizer(config) {
    const norm = config.normalizer;
    const model = config.model;
    if (norm.type !== 'BertNormalizer' || norm.lowercase !== false || norm.strip_accents !== null ||
        config.pre_tokenizer.type !== 'BertPreTokenizer' || model.type !== 'WordPiece') {
      throw new Error('分词配置与已审阅的模型不一致。');
    }
    const vocab = model.vocab;
    const unknown = vocab[model.unk_token];
    const special = new Map(config.added_tokens.filter(t => t.special).map(t => [t.content, t.id]));
    function wordpiece(word) {
      const chars = Array.from(word);
      if (chars.length > model.max_input_chars_per_word) return [unknown];
      const output = [];
      for (let start = 0; start < chars.length;) {
        let end = chars.length;
        let found = null;
        while (end > start) {
          const piece = (start ? model.continuing_subword_prefix : '') + chars.slice(start, end).join('');
          if (Object.prototype.hasOwnProperty.call(vocab, piece)) { found = vocab[piece]; break; }
          end -= 1;
        }
        if (found === null) return [unknown];
        output.push(found);
        start = end;
      }
      return output;
    }
    function pieces(text) {
      const output = [];
      for (const part of String(text).split(/(\[PAD\]|\[UNK\]|\[CLS\]|\[SEP\]|\[MASK\])/g)) {
        if (special.has(part)) { output.push(special.get(part)); continue; }
        let word = '';
        function flush() { if (word) { output.push(...wordpiece(word)); word = ''; } }
        for (const c of part) {
          if (c === '\u0000' || c === '\ufffd' || isControl(c)) continue;
          if (isWhitespace(c)) { flush(); continue; }
          if (isHan(c) || isPunctuation(c)) { flush(); output.push(...wordpiece(c)); }
          else word += c;
        }
        flush();
      }
      return output;
    }
    return {pieces, addSpecial: ids => [vocab['[CLS]'], ...ids.slice(0, MAX_TOKENS - 2), vocab['[SEP]']]};
  }

  async function initialize() {
    if (session) return session;
    if (loading) return loading;
    publish({state: 'loading', lastError: ''});
    loading = (async () => {
      const assets = global.BINGLI_SEMANTIC_ASSETS;
      if (!assets || !global.ort) throw new Error('缺少本地模型或运行库；请打开语义检索增强版。');
      if (!global.WebAssembly || !global.BigInt64Array) throw new Error('当前浏览器缺少模型所需的 WebAssembly 支持。');
      tokenizer = makeTokenizer(assets.tokenizer);
      global.ort.env.wasm.numThreads = 1;
      global.ort.env.wasm.proxy = false;
      global.ort.env.wasm.initTimeout = 15000;
      global.ort.env.wasm.wasmBinary = decode64(assets.wasm);
      moduleURL = URL.createObjectURL(new Blob([new TextDecoder().decode(decode64(assets.module))], {type: 'text/javascript'}));
      // ORT 1.22's unmodified Emscripten module still resolves a relative .wasm URL
      // before using wasmBinary; a blob: import has no relative URL base. Supply a
      // wrapper locateFile callback. This placeholder is never fetched: the runtime
      // must receive its embedded wasmBinary, or the wrapper rejects initialization.
      const wrapper = 'import factory from ' + JSON.stringify(moduleURL) + ';' +
        'export default function(args){if(!args.wasmBinary)throw new Error("Missing embedded WASM");' +
        'return factory({...args,locateFile:()=>"data:application/wasm;base64,AGFzbQEAAAA="});}';
      wrapperURL = URL.createObjectURL(new Blob([wrapper], {type: 'text/javascript'}));
      global.ort.env.wasm.wasmPaths = {mjs: wrapperURL};
      const started = performance.now();
      session = await global.ort.InferenceSession.create(decode64(assets.model), {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
        executionMode: 'sequential',
        externalData: [{path: 'model_quantized.onnx_data', data: decode64(assets.weights)}]
      });
      if (!session.inputNames.includes('input_ids') || !session.outputNames.includes('last_hidden_state')) {
        throw new Error('模型输入输出与已审阅的编码器不一致。');
      }
      publish({state: 'ready', initializationMs: Math.round(performance.now() - started), inputNames: [...session.inputNames], outputNames: [...session.outputNames]});
      return session;
    })().catch(error => {
      publish({state: 'error', lastError: String(error.message || error)});
      throw error;
    });
    return loading;
  }

  async function embedIds(ids) {
    await initialize();
    const tokens = tokenizer.addSpecial(ids);
    const dims = [1, tokens.length];
    const values = BigInt64Array.from(tokens, BigInt);
    const ones = new BigInt64Array(tokens.length).fill(1n);
    const zeros = new BigInt64Array(tokens.length);
    const feeds = {input_ids: new global.ort.Tensor('int64', values, dims)};
    if (session.inputNames.includes('attention_mask')) feeds.attention_mask = new global.ort.Tensor('int64', ones, dims);
    if (session.inputNames.includes('token_type_ids')) feeds.token_type_ids = new global.ort.Tensor('int64', zeros, dims);
    let outputs;
    try {
      outputs = await session.run(feeds);
      const tensor = outputs.last_hidden_state;
      const dimension = tensor.dims[tensor.dims.length - 1];
      if (dimension !== 512) throw new Error('编码器维数与模型声明不一致。');
      const vector = Float32Array.from(tensor.data.slice(0, dimension));
      let norm = 0;
      for (const x of vector) norm += x * x;
      norm = Math.sqrt(norm);
      if (!Number.isFinite(norm) || norm === 0) throw new Error('模型没有返回有效的语义向量。');
      for (let i = 0; i < vector.length; i += 1) vector[i] /= norm;
      return vector;
    } finally {
      for (const tensor of Object.values(feeds)) tensor.dispose();
      if (outputs) for (const tensor of Object.values(outputs)) tensor.dispose();
    }
  }
  function enqueue(task) {
    const current = serial.then(task, task);
    serial = current.catch(() => {});
    return current;
  }
  async function embedding(text, {query = false} = {}) {
    return enqueue(async () => {
      await initialize();
      const ids = tokenizer.pieces((query ? QUERY_PREFIX : '') + String(text));
      const vector = await embedIds(ids);
      return {vector: Array.from(vector), dimension: vector.length, tokenCount: Math.min(ids.length + 2, MAX_TOKENS), truncated: ids.length > MAX_TOKENS - 2};
    });
  }
  function dot(a, b) {
    let value = 0;
    for (let i = 0; i < a.length; i += 1) value += a[i] * b[i];
    return Math.min(1, Math.max(-1, value));
  }
  function normalizeDocuments(documents) {
    if (!Array.isArray(documents)) throw new TypeError('documents 需要是文本或 {id, text} 数组。');
    return documents.map((document, index) => {
      const text = typeof document === 'string' ? document : document && document.text;
      if (typeof text !== 'string') throw new TypeError('每条语料需要 text 字符串。');
      return {document, id: typeof document === 'string' ? String(index) : String(document.id ?? index), text, index};
    }).filter(item => item.text.trim());
  }
  async function search(query, documents, {limit = 5} = {}) {
    if (typeof query !== 'string' || !query.trim()) return [];
    const items = normalizeDocuments(documents);
    if (!items.length) return [];
    const resultLimit = Math.max(1, Math.min(50, Number.isFinite(Number(limit)) ? Math.floor(Number(limit)) : 5));
    return enqueue(async () => {
      await initialize();
      const started = performance.now();
      const queryIds = tokenizer.pieces(QUERY_PREFIX + query);
      const queryVector = await embedIds(queryIds);
      const work = items.map(item => {
        const ids = tokenizer.pieces(item.text);
        const chunks = [];
        for (let start = 0; start < ids.length; start += CHUNK_TOKENS - OVERLAP) {
          chunks.push({start, ids: ids.slice(start, start + CHUNK_TOKENS)});
          if (start + CHUNK_TOKENS >= ids.length) break;
        }
        return {...item, chunks: chunks.length ? chunks : [{start: 0, ids: []}]};
      });
      const total = work.reduce((sum, item) => sum + item.chunks.length, 0);
      publish({state: 'searching', completedChunks: 0, totalChunks: total, queryTruncated: queryIds.length > MAX_TOKENS - 2});
      let completed = 0;
      const results = [];
      try {
        for (const item of work) {
          let best = {score: -Infinity, chunkIndex: 0};
          for (let index = 0; index < item.chunks.length; index += 1) {
            const chunk = item.chunks[index];
            const key = chunk.ids.join(',');
            let vector = vectorCache.get(key);
            if (!vector) {
              vector = await embedIds(chunk.ids);
              if (vectorCache.size >= 1024) vectorCache.delete(vectorCache.keys().next().value);
              vectorCache.set(key, vector);
            }
            const score = dot(queryVector, vector);
            if (score > best.score) best = {score, chunkIndex: index};
            completed += 1;
            publish({completedChunks: completed, cachedChunks: vectorCache.size});
            // Give the browser time to paint progress between document chunks.
            await new Promise(resolve => setTimeout(resolve, 0));
          }
          results.push({id: item.id, text: item.text, document: item.document, index: item.index, ...best});
        }
        results.sort((a, b) => b.score - a.score || a.index - b.index);
        publish({state: 'ready', lastSearchMs: Math.round(performance.now() - started), lastError: ''});
        return results.slice(0, resultLimit);
      } catch (error) {
        publish({state: 'error', lastError: String(error.message || error)});
        throw error;
      }
    });
  }
  function tokenize(text) {
    if (!tokenizer) {
      const assets = global.BINGLI_SEMANTIC_ASSETS;
      if (!assets) throw new Error('缺少本地分词表。');
      tokenizer = makeTokenizer(assets.tokenizer);
    }
    const ids = tokenizer.pieces(String(text));
    return {ids: tokenizer.addSpecial(ids), totalTokens: ids.length + 2, truncated: ids.length > MAX_TOKENS - 2};
  }
  global.BingliSemantic = Object.freeze({search, embedding, tokenize, initialize, status, clearCache() {vectorCache.clear(); publish({cachedChunks: 0});}});
})(window);

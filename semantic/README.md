# 本地中文语义检索原型

这是编码器检索，不是自由生成病程的语言模型。`semantic-demo.html` 含模型、分词表和官方 ONNX Runtime，可在已有 Chrome 中直接以 `file://` 打开，不需要安装、服务器、浏览器扩展或参数修改。

已在 macOS Google Chrome 154.0.8037.95 的隔离断网上下文测试。15 项检查通过，HTTP 请求、Storage 写入、IndexedDB 打开和未捕获页面异常均为 0。首次 512 维向量含初始化 190ms，6 段语料首次检索 199ms，复用语料向量后的查询 19ms。具体数据见 `test-results/result.json`。Windows 运行环境尚未测试；旧版 Chrome 的兼容性也未验证。

模型为 BAAI/bge-small-zh-v1.5 的 ONNX int8 转换，CLS 池化并 L2 归一化，中文短查询加官方检索前缀，长语料按 256 WordPiece tokens 分块并重叠 32 tokens，使用最高块相似度排序。最多 512 tokens 的查询截断会记录在 `status().queryTruncated`，原文不被改写。

中文否定测试中，“无发热、无咳嗽、无咳痰”相同语句得分 0.814，相反阳性语句仍有 0.774。这个差距说明相似度不能保证否定、日期、患者和医学事实识别，不能作为诊断置信度。混合英文报告中的部分大写单位及缩写按模型原始大小写敏感分词表产生 `[UNK]`，不能宣称具备可靠报告理解能力。

模型固定 commit 为 `9507db33464b5da99a532ac26b2a251767cbc62b`，图和权重与官方文件页面公开 SHA256 一致。官方域名直连超时，下载经 hf-mirror.com 完成，运行时无需镜像或网络。官方 onnxruntime-web npm 1.22.0 tarball 的 npm SHA512 integrity 已核对。原模型卡标为 MIT，转换仓库只链接原模型，未单独提供 LICENSE。ORT MIT 及第三方许可文本已包含在 HTML 中。详细来源、版本和每文件哈希见 `manifest.json`。

## 构建与集成

```sh
python3 semantic/build-semantic.py
python3 semantic/build-semantic.py --input 病历书写简版.html --output 病历书写语义检索版.html
```

也可通过 importlib 加载构建脚本并调用 `semantic_scripts()`，得到可在 `</body>` 前加入的全部内嵌脚本。必要资产共 35,585,568 bytes，独立试验单 HTML 为 47,559,542 bytes。

```js
const matches = await BingliSemantic.search(
  '化疗后乏力，血红蛋白下降',
  [{id: 'anemia', text: '已审核的贫血评估语料'}],
  {limit: 5}
);
// [{id,text,document,index,score,chunkIndex}, ...]
const state = BingliSemantic.status();
window.addEventListener('bingli-semantic-status', event => renderStatus(event.detail));
```

`embedding(text,{query:false})` 返回 `{vector,dimension,tokenCount,truncated}`，用于验证或预计算；`tokenize(text)` 可检查分词，`clearCache()` 清除内存语料向量。不会自动把结果写入正文、保存患者资料或发起 HTTP 请求。

离线运行的特殊处理：官方 ORT 1.22 Emscripten 模块在 Blob URL 中仍尝试解析相对 WASM URL。自写的小模块包装器传入 `locateFile`，同时强制要求已内嵌的 `wasmBinary`；官方运行库和 WASM 字节保持原样，未执行模型仓库脚本。

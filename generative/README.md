# 本地病历文字模型：基线浏览器部署

这份原型使用官方 **未微调的** Qwen2.5-0.5B-Instruct Q2_K。它不是已完成训练的产品。运行库、模型和待审核候选均在本机处理，不需要在目标电脑安装程序、使用服务器、扩展、管理员权限或更改 Chrome 参数。

运行文件为 `writer-demo.html`（约 3.2MB），模型在 `parts/` 中分为五片：前四片 90,000,000 bytes，第五片 55,182,688 bytes。打开 HTML 后，一次选择全部五片即可；选择顺序可任意。程序核对序号、片数、大小、每片 SHA256 及完整模型 SHA256，随后用 Blob 在内存中合并，不生成硬盘合并文件，不自动保存患者资料。

官方固定模型 commit 为 `9217f5db79a29953eb74d5343926648285ec7e67`。完整文件 415,182,688 bytes，SHA256 为 `9ee36184e616dfc76df4f5dd66f908dbde6979524ae36e6cefb67f532f798cb8`，与官方 Hugging Face 文件页公布的值一致。官方域名直连超时，下载经 hf-mirror.com；实际运行无需网络。模型 Apache-2.0，wllama 2.3.7 为 MIT，llama.cpp 与 wasm-feature-detect 的许可也嵌入 HTML。

## 已验证的范围

macOS Chrome 154.0.8037.95，`file://`，隔离断网上下文：基线运行 11 项检查通过。包括五片乱序加载、真实 qwen2 模型生成、流式 token 回调、停止后可再次生成、原文保持和手机 390px。HTTP 请求、Storage/IndexedDB/OPFS 自动访问、未捕获页面异常均为 0。总加载含校验约 1011ms，60 tokens 短段约 25.5 秒。

另 6 项护栏检查通过：相同大小但字节损坏的分片会被 SHA 拒绝，已有模型继续可用；重复序号拒绝；超过 8192 上下文的材料在生成前拒绝；并发请求拒绝；停止有效。155-token 输入的一次测量首 token 等待约 12.127 秒，后续 4-token 解码约 389ms。首 token 指标包含提示处理与首步采样，并非纯 prefill 的底层内核计时。两份证据为 `test-results/result.json` 和 `test-results/guards.json`。

两条基线病例的日期、86/92 数值、否定及未定病因保留，但输出几乎逐字复制已有原文。**当前只证明部署和有限保真，尚未证明医学分析或文字整理增益。** Windows 10 和不同 Chrome 版本尚未实际运行测试。较长全文会更慢；候选必须经医师审阅，不能自动诊断、补四诊或制定处方。

另一个合成范例隔离挑战 **失败**：即使明确“只参考格式，不采用范例中的任何患者事实”，基线模型仍把他人范例的发热 38.8℃、黑便、血红蛋白 42、血小板 20、紫杉醇及输血整体复制成候选，丢失当前患者的无发热、无黑便和血红蛋白 86/92。证据见 `test-results/example-isolation.json`。因此不能向当前基线传入完整他人病案作为格式范例；功能测试通过不等于临床质量通过。训练后也须另行通过此挑战。

初版微调 v1 已实际训练并导出 GGUF，但独立文字质量测试失败，未作为发布模型。`experiment-v1/runtime-result.json` 仅证明它的 338,606,944-byte GGUF（四片）可在上述 Chrome 离线环境载入并推理：校验与加载约 945ms，105-token 短段约 14.314 秒；输出新增“无明显不适”并连续重复。重复早停保护实际触发，候选标记为未完成。Q2_K 是 llama.cpp 的量化预设名称，该小模型的张量实际采用 F32、Q8_0、Q4_0、Q5_0、Q3_K，不能称所有权重都是 2 bit。v1 的低验证损失不构成文字或医学质量合格。

v2 的当前定位也为**未通过质量验收的实验版本**，仅供合成病例试写与对照。它使用 48 条合成训练记录、8 条独立验证记录，真实完成 96 步并按验证损失选定 72 步；另 8 条新留出病例用于质量检查，不参与本模块的训练或选择。本团队的独立检查仍发现病理、症状改写及检查状态遗漏。生产页面的一条短段功能测试保持事实并逐字复制原稿，28 tokens 约 10.370 秒；这既不能证明整理增益，也不能推翻独立质量失败。真实 GGUF SHA256 为 `dc4b0b935d8ec4fc6008c15083a906d6809a7cc48d81fd6b32b0bcaaa79a958e`，四片合计 338,606,944 bytes。带实验提示前的运行证据保留于 `test-results/v2-before-experimental-notice/`，最终提示版会另留完整页面证据。

## 集成 API

```js
await BingliWriter.loadParts(fileInput.files, {
  onProgress(progress) { /* {phase,completed,total,message} */ }
});
const result = await BingliWriter.generate({
  recordType: '主治查房',
  facts: '所有事实以待整理正文为准。',
  judgments: '只润色当前草稿，保留其事实、数值、日期、否定及医师判断，不添加诊断、症状、检查、药物、分期或未实施的治疗。',
  draft: originalText
}, {
  maxTokens: 2200,
  onToken(pieceText, fullText, meta) { candidate.value = fullText; }
});
// {text,cancelled,truncated,repetition,incomplete,reason,usage:{promptTokens,generatedTokens,elapsedMs,
//    firstTokenMs,decodeMs,finishReason}}
BingliWriter.cancel();
const state = BingliWriter.status();
```

`maxTokens` 范围 16–2200；默认 384，上下文为 8192，单线程 CPU WASM。生产 UI 限单次 1000 字符以内，以较短段落为宜；这不是即时速度或医学质量保证。若 `truncated`、`cancelled`、`repetition` 或 `incomplete` 为真，不能当作完整稿采用。`bingli-writer-status` 自定义事件的 detail 为状态副本。模块只返回候选，不改 qNote、患者表单或病案库。

连续完全相同的长段重复三次时自动停止。检测只匹配尾部连续重复，不同标题或中间内容会打断；它不判断医学含义。状态 `stopReason='repetition'` 与结果 `usage.finishReason='repetition'` 区别于手动停止。纯正反例及自有模拟运行库流式回调 Chrome 测试通过 16 项，证据 `test-results/repetition.json`；v1 真实模型也已触发此保护。采样参数按官方 wllama 2.3.7 文档使用 `penalty_repeat:1.1, penalty_last_n:64`。较早基线实验误用了 `repeat_penalty` 字段，不能认为这些旧实验已应用该重复惩罚。

训练与推理需保持同一 system 文本（见 `writer.js`），user 为无缩进、固定键顺序 `JSON.stringify({recordType,facts,judgments,draft})`，Qwen 内置聊天模板负责序列化。生产 UI 的病例事实仅来自 `draft`；`facts` 固定为“所有事实以待整理正文为准。”，`judgments` 为上例固定约束，至多添加已白名单映射的表达要求，不传完整参考病例或自由偏好。原文字符串输入也转成这四键结构。不要用训练后的名称包装未经训练的基线文件。

## 构建

```sh
python3 generative/build-generative.py
python3 generative/build-generative.py --input 病历书写简版.html --output 病历本地AI版.html
```

可通过 importlib 加载 `build-generative.py` 并调用 `writer_scripts(manifest_override=None)`，将返回的脚本放到主页面 UI 初始化之前。后续训练模型可传新 manifest：

```json
{
  "model": {"name":"真实模型名称", "bytes":415182688, "sha256":"完整SHA256"},
  "parts": [
    {"index":1,"name":"model.gguf.part01-of-05.bin","bytes":90000000,"sha256":"该片SHA256"}
  ]
}
```

数组必须包括全部分片，按 index 递增；名称尾部 `partNN-of-TT.bin`，TT 与 parts.length 一致。模型来源、训练记录、固定基础版本及运行库信息也应保留在 manifest 中。构建时会核验所嵌官方 runtime 两个资产的已固定 SHA256。

当前模型原文件在 `assets/` 只用于制作与校验；交付仅需 HTML 和五个小于 100MB 的分片，不能把 415MB 原文件重复放进交付包。

对实际已导出的训练 GGUF，使用独立打包脚本，不改原基线分片：

```sh
python3 generative/package-model.py --model training/实际导出.gguf --out 离线病历AI --training-metadata training/metadata.json --model-name '实际训练模型名称'
```

脚本支持 GGUF v2/v3 头，分片和完整 SHA256、来源训练 metadata 及许可文本均写入新目录，输出目录已有不同模型 manifest 时拒绝覆盖。模型许可证没有提供时记为 `UNVERIFIED`，不会替任意 GGUF 猜测来源。脚本只打包，不训练或量化，也不验证完整模型的可推理性；后者必须再用真实浏览器测试。测试已覆盖 90MB 边界、合并哈希、中文名称、相同内容重试和不同模型拒绝覆盖。

## file:// 适配

原始官方 npm 2.3.7 资产保持原样并已核对 npm SHA512 integrity。运行时仅对其单线程 createWorker 的唯一锚点作受控替换：`type:"module"` → `type:"classic"`。该包生成的单线程 worker 无 ES module import/export。在实测 Chrome 的不透明 file 来源中，Blob module Worker 会直接失败，classic Worker 可以运行。WASM 改用已内嵌 data URI，避免 worker 对父页面 Blob 的跨来源 XHR。无需放宽浏览器权限。变更和原资产哈希记录在 manifest，简单探针为 `worker-probe.html`。

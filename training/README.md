# 本地文字整理模型训练记录

本目录只处理人工合成病程的表达整理。权重与训练过程未上传患者资料；训练和评估使用本地离线模型。训练完成不等于病案合格。

## v1 已真实完成，独立质量审查未通过

- 固定基础模型：`mlx-community/Qwen2.5-0.5B-Instruct-4bit`，commit `a5339a4131f135d0fdc6a5c8b5bbed2753bbe0f3`，上游 `Qwen/Qwen2.5-0.5B-Instruct`。
- MLX LM 0.32.0；Apple M4 Metal 实际训练 96 步，4 层 LoRA、rank 8、batch 1。32 条合成 train、8 条 valid；16 条独立 test 未参与训练和 checkpoint 选择。
- 每24步保存，按 valid completion loss 选择96步（1.299；同起点 baseline 1.929）。该数值不能作为病案事实保持的合格证据。
- 独立生成审查发现拟实施治疗被写成已实施、医师新判断被旧稿覆盖，以及页面短段反复输出。`releaseApproved=false`，不可自动作为主产品已通过模型。
- 真实训练后 GGUF：`experiment-v1/bingli-style-v1-Q2_K.gguf`，338,606,944 bytes，SHA256 `7b091ff3eb60147a1349726a6befed9fc5e3c20465882c0d16eb5adbfbd9e7af`。
- 采用 llama.cpp Q2_K 预设；因张量尺寸，144/290 tensors 正常回退。实际类型：F32×121、Q8_0×1、Q4_0×120、Q5_0×24、Q3_K×24。不能将此文件描述为所有张量均2bit。

准确来源、数据哈希、训练步数和导出命令在 `experiment-v1/model-metadata.json`；独立结果在 `experiment-v1/writing-evaluation/comparison.json`。模型沿用上游 Apache-2.0，全文在 `model-LICENSE.txt`；社区 modelcard 在 `base-model-card.md`。

## v2 已真实完成，仍为试验模型

重新从同一原始固定 base 训练，未续用 v1 adapter。采用实际页面契约：病例事实仅在 `draft`，其它字段为固定整理要求；48条新train、8条新valid、8条全新holdout。完成96步（25.113秒），只按valid选定72步adapter，valid completion loss 0.114；同契约base为0.653，不能与v1数据的loss直接比较。

真实导出 `experiment-v2/bingli-style-v2-Q2_K.gguf`，338,606,944 bytes，SHA256 `dc4b0b935d8ec4fc6008c15083a906d6809a7cc48d81fd6b32b0bcaaa79a958e`。量化preset和实际tensor类型与v1相同。实际元数据冻结在 `experiment-v2/model-metadata.json`，不把质量评估结论内嵌到分发manifest。

独立MLX生成复核已发现病理否定、疼痛部位和日期/培养事实等遗漏或改变，不能宣称全面事实保真或临床合格；原始评估与实际Q2_K部署评估由独立审查脚本另存。分发用途只能是短段整理候选，仍须逐句核对原文，不自动替换完整病案。

## 可重用本地管线

`run_training.py` 的 `train`、`select`、`fuse` 三阶段分别记录日志。新实验使用新数据目录和新 run 目录，不覆盖已有结果，也不续用 v1 adapter。`select` 只读取 valid 文件和训练已记录的 valid 哈希。完整 chat 预检遇到超过 max-seq-length 的样本直接停止，防止截断。

转换工具为官方 `ggml-org/llama.cpp` 固定 commit `836d57176dc699a726c55418e4f96b8ca628e1bf`。稀疏源码和原生量化器均在 `tools/`，不依赖用户电脑安装训练工具。MLX 对 qwen2 不能直接导出 GGUF，已实际使用以下路线：LoRA融合并反量化 → HF float权重 → convert_hf_to_gguf.py F16 → llama-quantize Q2_K。

后续实验仍须用全新 holdout 评估事实、日期、数值、否定、医师判断、原标题、循环输出，再用真实浏览器对量化权重抽验；单靠 loss 下降不得发布。浏览器发布包另由 `generative/package-model.py` 分片，训练工具和约1GB中间权重不需要传给用户。

# 中医肿瘤病程辅助（TCMEMR）

这是个人使用的中文中医肿瘤病程辅助程序，提供首次病程、主治查房、主任查房和日常病程的资料整理、草稿生成与人工审核。程序按已录入事实和医生判断整理内容，保留中医四诊、辨证、病机、治法说明与西医问题分析。实际诊断、治疗和处方由医生核对、决定。

## 直接下载（每个文件均小于100MB）

- [常规版：病历书写简版.html，约2.2MB](https://github.com/jdioplus/tcmemr/raw/refs/heads/main/%E7%97%85%E5%8E%86%E4%B9%A6%E5%86%99%E7%AE%80%E7%89%88.html)
- 实验AI只供合成病例试写。下面的网页和4个模型分包需放在同一文件夹；保持文件名不变。

| 文件 | 大小（十进制MB） |
| --- | ---: |
| [病历书写AI.html](https://github.com/jdioplus/tcmemr/raw/refs/heads/main/%E7%A6%BB%E7%BA%BF%E7%97%85%E5%8E%86AI/%E7%97%85%E5%8E%86%E4%B9%A6%E5%86%99AI.html) | 52.98 |
| [bingli-style-v2-Q2_K.gguf.part01-of-04.bin](https://github.com/jdioplus/tcmemr/raw/refs/heads/main/%E7%A6%BB%E7%BA%BF%E7%97%85%E5%8E%86AI/bingli-style-v2-Q2_K.gguf.part01-of-04.bin) | 90.00 |
| [bingli-style-v2-Q2_K.gguf.part02-of-04.bin](https://github.com/jdioplus/tcmemr/raw/refs/heads/main/%E7%A6%BB%E7%BA%BF%E7%97%85%E5%8E%86AI/bingli-style-v2-Q2_K.gguf.part02-of-04.bin) | 90.00 |
| [bingli-style-v2-Q2_K.gguf.part03-of-04.bin](https://github.com/jdioplus/tcmemr/raw/refs/heads/main/%E7%A6%BB%E7%BA%BF%E7%97%85%E5%8E%86AI/bingli-style-v2-Q2_K.gguf.part03-of-04.bin) | 90.00 |
| [bingli-style-v2-Q2_K.gguf.part04-of-04.bin](https://github.com/jdioplus/tcmemr/raw/refs/heads/main/%E7%A6%BB%E7%BA%BF%E7%97%85%E5%8E%86AI/bingli-style-v2-Q2_K.gguf.part04-of-04.bin) | 68.61 |

[先读我.txt](%E7%A6%BB%E7%BA%BF%E7%97%85%E5%8E%86AI/%E5%85%88%E8%AF%BB%E6%88%91.txt)

[训练与测试说明.txt](%E7%A6%BB%E7%BA%BF%E7%97%85%E5%8E%86AI/%E8%AE%AD%E7%BB%83%E4%B8%8E%E6%B5%8B%E8%AF%95%E8%AF%B4%E6%98%8E.txt)

[试写对照.txt](%E7%A6%BB%E7%BA%BF%E7%97%85%E5%8E%86AI/%E8%AF%95%E5%86%99%E5%AF%B9%E7%85%A7.txt)

[SHA256SUMS.txt](%E7%A6%BB%E7%BA%BF%E7%97%85%E5%8E%86AI/SHA256SUMS.txt)

若浏览器直接显示HTML源码，请右键下载链接“另存为”。模型分包无需手动合并；网页的“选择模型分包”会核验并在内存中合并。不要把整个源码ZIP作为一个大文件传入工作电脑。

## 直接使用常规版

下载根目录的 **[病历书写简版.html](病历书写简版.html)**，用浏览器打开即可。常规版为约2.2MB的单文件，完整语料和辅助工具已内嵌，运行不需要模型、服务器或安装程序。

选择病程类型与患者，粘贴本次资料，核对日期、症状、检查、四诊及医生意见后生成草稿。语料库、检查分析、分期核对、处方分析、详细编辑及病案功能保留。工具的参考内容需确认后带回；不会作为已发生的患者事实自动套用。范例库可导入、导出和查阅，完整范例中的他人病例事实不送入本地生成模型。

## 离线AI实验版

`离线病历AI/` 是单独的实验包：用已有 Chrome 打开其中的 `病历书写AI.html`，一次选齐同目录4个 `.bin` 模型分片。模型总计338,606,944字节，前三片各90,000,000字节，最后一片68,606,944字节；每个传输文件均小于100MB。网页还包含本地运行库及语义检索资产，模型分包以 `manifest.json` 为准，全部交付文件大小及SHA256另见 `SHA256SUMS.txt`。文件选择顺序不限，程序校验每片及整体哈希后在本机推理。

该模型确实进行了本地训练：固定Qwen2.5-0.5B社区MLX4bit起点，48条人工合成训练记录、8条独立验证记录，完成96步；按验证集选定72步，未用另8条新留出病例选择checkpoint。随后融合、导出并实际量化成浏览器GGUF。训练来源、数据哈希、工具版本和导出命令保留在训练元数据中。

**实验AI未通过病案文字质量验收，只供合成病例试写与对照。** 独立检查发现病理否定、疼痛部位、日期及培养状态遗漏或改写；实际分发量化模型还把Na131/129改为145/138，出现重复或拒答。训练loss下降、部署成功和少数短段保持原文，不构成临床合格或可靠医学分析证明。完整病案仍由常规程序组织，AI只生成短段候选，不能自动采用，也不能把未发生的诊疗写成已实施。重复、停止和截断候选会提示未完成；这些技术保护不判断医学含义。

运行时模型和输入均在本机处理；程序未接入外部生成服务，不自动上传病案。模型载入和生成较慢，Windows及不同Chrome版本尚未完成实际兼容测试。

## 维护与复建

源码目录：

- `minimal/`：主界面、资料解析、临床文字和工具回填。
- `knowledge/`：古籍短摘、证据规则和公开西医资料的来源/版本。核对日期为2026-10-04，不表示所有原指南均在该年发布。
- `tests/`：常规页面构建、规则及合成病例验收脚本。
- `semantic/`、`generative/`：本地语义检索和浏览器生成运行代码、已固定运行资产及许可证。
- `training/`：本次合成数据、训练/评估脚本、实际元数据和独立原始评估结果。虚拟环境、缓存、原始模型及GPU工具不在仓库内。
- `123.html`、`123-v6.3.html`：保留的早期程序源与构建/兼容性测试依赖；其中范例已替换为明确的人工合成短例。
- `skills/oncology-tcm-records/`：项目专用的病程起草和核对skill。

常规版只需Python标准库即可复建：

```sh
python3 tests/build-minimal.py
```

在本地运行已有Node.js规则测试：

```sh
node tests/decision-rules-test.cjs
```

浏览器测试需开发环境已安装Playwright，并有Chrome可用；测试脚本采用标准 `playwright` 模块，也可通过 `PLAYWRIGHT_MODULE` 指定模块路径；用 `CHROME_PATH` 指定本机Chrome可执行文件，未指定时使用已安装的Chrome通道。运行程序本身不需要这些开发工具。

最终实验页面可用同一仓库资产和最终分片manifest复建：

```sh
python3 tests/build-offline-ai.py --manifest 离线病历AI/manifest.json --output 离线病历AI/病历书写AI.html
```

此步骤不训练，也不下载模型。原始未微调的415MB基线模型及其五片未重复放入仓库；`generative/manifest.json` 记录基线来源，正式实验包使用自己的manifest。模型原始巨型GGUF不在仓库内，仅提供用于浏览器加载的分片。

## 公开资料与许可证

公开内容限本次程序、规则、公开知识短摘、人工合成训练/测试资料及结果，没有患者数据库、用户导入范例或原始患者文件。旧版本内的详细原例已在公开源和构建产物中替换；267条通用语料保留。

TCM.Skill改编规则遵循CC BY-NC 4.0，CaseMark查房规则遵循Apache-2.0，出处、署名、改编说明与完整许可证保留在 `knowledge/skill-adaptations/`。Qwen模型采用Apache-2.0；wllama、llama.cpp、ONNX Runtime及其它运行资源分别保留原许可证和第三方NOTICE。本仓库为不同许可资源的组合，没有将所有第三方内容重新许可为同一种许可证；个人非商业使用的定位不改变各资源原有许可。

源码首批白名单和每文件哈希见 `publication-manifest.json`。模型与最终HTML的发布完整性以各离线包manifest为准。

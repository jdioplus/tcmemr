# V3 独立留出复核

结论：不发布 V3 适配器，不接入现有病历生成页面。2026-10-04，复核 native MLX 的 20 条基线输出及 20 条适配器输出；数据来自 5 组合成留出场景，并非真实临床验证。训练和 checkpoint 选择未使用这些留出数据。

训练完成不等于临床合格。验证损失降低，但适配器在陌生场景出现严重事实错误，不能用于完整病历自由改写。未因本次验收结果重新选择 checkpoint，也未在这一留出集上调参后重复声称独立通过。

代表性缺陷（完整输入、输出见 results.json）：

- pathology_provenance_negative-1：添加“既往无乙状结肠腺癌诊断依据”，遗漏外院病理日期、分化级别、脉管侵犯未见及否定症状。
- pathology_provenance_negative-2：将“拟…评估分期”写为“评估分期”，弱化计划状态。
- pathology_provenance_negative-3：添加“经核实”及后续诊疗计划，遗漏今天无新腹痛。
- pathology_provenance_negative-4：添加“既往无特殊”。
- culture_pending_decision-1、3：遗漏“尚未决定新增抗菌药物”；第1条还遗漏昨晚无发热。
- drainage_partial_total-1、4：遗漏“本次未实施换管或拔管”及部分复评安排。
- drainage_partial_total-2：增加 50+35=85 mL 的算术归纳。算术正确，但不符合本轮原始记录只整理、不增衍生数值的要求；并非全部新增数字都属于幻觉。
- molecular_method_distinction-2：遗漏 ALK 项目名称和血液检测日期。
- pleural_procedure_status-1：捏造胸部 X 线所见、胸水蛋白及细胞数；把明天评估改成今日评估；把积液相关判断改为肿瘤相关判断；重复段落。此项单独足以阻止发布。
- pleural_procedure_status-3：添加主任关于进一步诊疗计划的意见。
- pleural_procedure_status-4：遗漏“考虑胸闷可能与积液有关”和“本次未做穿刺”的完整记录。

部分输出保留事实较好，例如 culture_pending_decision-2、4，drainage_partial_total-3；但不能抵消上述缺陷。不能以平均字面相似度或标题完整度评价医学正确性。

基线也未达到最终写作目标：多数保留“背景项/实际观察项”等输入标签；culture_pending_decision-1、2添加就诊/复诊叙述，-3把日期具体化为送检日期；pleural_procedure_status-2将“没说好转”改为“未见好转”。因此也未将基线作为可自由生成完整病历的替代发布。

自动数字差异有分词误报：YYYY-MM-DD 在源侧与输出侧分词规则不同；不能把所有 numericMissing/Added 作为漏写或幻觉计数。上文依据原始文字逐项复核。后续若修改训练数据或策略，应另建未参与开发的留出场景。

现有发布模型和分包保持原样。本次提供对话资料管理、事务预览及原有离线规则分析；界面明确标注分析来源，不把规则输出伪称为模型推理。

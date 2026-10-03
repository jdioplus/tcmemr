"""Replace the legacy supplied case with a wholly synthetic public demo.

The original workspace HTML is retained unless --in-place is explicitly used
on a publication copy. No clinical corpus or program logic is removed.
"""
from pathlib import Path
import argparse
import json
import re

SYNTHETIC_FIRST_EXAMPLE = {
    'recordType': '首次病程记录', 'outputMode': 'full',
    'recordTime': '2030-01-02 09:00:00', 'doctor': '合成示例医师',
    'patientName': '合成示例甲（非真实患者）', 'sex': '女', 'age': '50',
    'admissionTime': '2030年01月02日08时00分',
    'chiefComplaint': '乏力、纳食减少2天', 'cancer': '胃癌', 'tcmDisease': '胃癌',
    'diagnosis': '胃腺癌（合成示例）', 'stage': '',
    'history': '本示例完全合成，仅用于展示录入和审核流程。示例患者既往胃活检示腺癌。',
    'symptoms': '乏力、纳食减少，无发热，无呕血及黑便',
    'tongue': '淡', 'coat': '薄白', 'pulse': '细', 'fourExtra': '',
    'exam': '腹软，无反跳痛（合成查体资料）',
    'pathologyReport': '2029年12月10日示例胃活检：腺癌（非真实报告）',
    'molecularReport': '', 'imagingReport': '',
    'diagnosisBasis': '示例胃活检报告',
    'admissionDiagnoses': '胃腺癌（合成示例）',
    'syndrome': '', 'assessment': '', 'nursingPlan': '', 'dietPlan': '',
    'checkPlan': '示例医师拟核对血常规及实际摄入量',
    'tcmPlan': '', 'externalPlan': '', 'tumorPlan': '', 'supportPlan': '',
    'followPlan': '示例医师拟于次日复评体力和摄入情况', 'communication': ''
}

def sanitize(source):
    pattern = r'const FIRST_EXAMPLE\s*=\s*\{.*?\};'
    replacement = 'const FIRST_EXAMPLE=' + json.dumps(SYNTHETIC_FIRST_EXAMPLE, ensure_ascii=False) + ';'
    result, count = re.subn(pattern, lambda _: replacement, source, flags=re.S)
    if count != 1:
        raise ValueError(f'Expected one legacy FIRST_EXAMPLE, found {count}')
    return result

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--in-place', nargs='+', type=Path, required=True)
    args = parser.parse_args()
    for path in args.in_place:
        path.write_text(sanitize(path.read_text()))
        print('Synthetic public example:', path)

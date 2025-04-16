"""
summary_entry.py
Node与Python数据摘要桥接脚本：接收JSON数据文件路径，调用summary.py的generate_summary函数，输出摘要结果（JSON字符串）。
"""
import sys
import json
import pandas as pd
from summary import generate_summary
import numpy as np

def nan_to_none(obj):
    if isinstance(obj, float) and (np.isnan(obj) or obj is None):
        return None
    if isinstance(obj, dict):
        return {k: nan_to_none(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [nan_to_none(v) for v in obj]
    return obj


def main():
    """
    主入口：读取JSON数据文件，生成摘要并输出
    """
    if len(sys.argv) < 2:
        print(json.dumps({'error': '缺少数据文件路径'}))
        sys.exit(1)
    file_path = sys.argv[1]
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        df = pd.DataFrame(data)
        summary = generate_summary(df)
        summary = nan_to_none(summary)
        print(json.dumps(summary, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)

if __name__ == '__main__':
    main() 
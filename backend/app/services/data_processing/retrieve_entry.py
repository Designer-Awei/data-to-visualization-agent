"""
retrieve_entry.py
Node与Python数据检索采样桥接脚本：接收JSON数据文件路径和检索参数，调用retrieve.py相关方法，输出结果（JSON字符串）。
"""
import sys
import json
import pandas as pd
from retrieve import filter_by_fields, filter_by_condition, random_sample, groupby_sample, range_sample


def main():
    """
    主入口：读取JSON数据文件和检索参数，执行检索/采样并输出结果
    """
    if len(sys.argv) < 3:
        print(json.dumps({'error': '缺少参数'}))
        sys.exit(1)
    file_path = sys.argv[1]
    params = json.loads(sys.argv[2])
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        df = pd.DataFrame(data)
        action = params.get('action')
        if action == 'random_sample':
            n = params.get('n', 10)
            result = random_sample(df, n=n).to_dict(orient='records')
        elif action == 'filter_by_fields':
            fields = params.get('fields', [])
            result = filter_by_fields(df, fields).to_dict(orient='records')
        elif action == 'filter_by_condition':
            condition = params.get('condition', {})
            result = filter_by_condition(df, condition).to_dict(orient='records')
        elif action == 'groupby_sample':
            by = params.get('by')
            n = params.get('n', 3)
            result = groupby_sample(df, by, n=n).to_dict(orient='records')
        elif action == 'range_sample':
            field = params.get('field')
            min_value = params.get('min_value')
            max_value = params.get('max_value')
            result = range_sample(df, field, min_value, max_value).to_dict(orient='records')
        else:
            result = []
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)

if __name__ == '__main__':
    main() 
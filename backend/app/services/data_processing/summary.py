"""
summary.py
数据摘要模块：用于对上传的Excel/CSV数据进行字段统计、分布、极值、缺失值、样本行采样等摘要处理。
"""
import pandas as pd
import numpy as np
from typing import Dict, Any


def generate_summary(df: pd.DataFrame, sample_size: int = 10) -> Dict[str, Any]:
    """
    生成数据摘要，包括字段统计、分布、极值、缺失值、样本行等。
    :param df: pandas DataFrame，上传的数据表
    :param sample_size: 样本行数量，默认10
    :return: 摘要信息字典
    """
    summary = {
        'columns': [],
        'row_count': len(df),
        'sample_head': df.head(sample_size).to_dict(orient='records'),
        'sample_tail': df.tail(sample_size).to_dict(orient='records'),
    }
    for col in df.columns:
        col_data = df[col]
        col_summary = {
            'name': col,
            'dtype': str(col_data.dtype),
            'unique': int(col_data.nunique()),
            'null_count': int(col_data.isnull().sum()),
            'min': col_data.min() if np.issubdtype(col_data.dtype, np.number) else None,
            'max': col_data.max() if np.issubdtype(col_data.dtype, np.number) else None,
            'mean': col_data.mean() if np.issubdtype(col_data.dtype, np.number) else None,
            'std': col_data.std() if np.issubdtype(col_data.dtype, np.number) else None,
            'top': col_data.mode().iloc[0] if not col_data.mode().empty else None
        }
        summary['columns'].append(col_summary)
    return summary 
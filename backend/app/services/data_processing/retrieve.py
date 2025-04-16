"""
retrieve.py
数据检索与采样模块：支持根据字段名、条件、采样方式（如随机采样、分组采样、区间采样等）从DataFrame中检索和采样数据。
"""
import pandas as pd
from typing import List, Dict, Any, Optional
import numpy as np


def filter_by_fields(df: pd.DataFrame, fields: List[str]) -> pd.DataFrame:
    """
    按字段名筛选DataFrame的部分列
    :param df: 原始DataFrame
    :param fields: 需要保留的字段名列表
    :return: 筛选后的DataFrame
    """
    return df[fields]


def filter_by_condition(df: pd.DataFrame, condition: Dict[str, Any]) -> pd.DataFrame:
    """
    按条件筛选DataFrame的行
    :param df: 原始DataFrame
    :param condition: 形如{"字段名": 值}的条件字典
    :return: 筛选后的DataFrame
    """
    for k, v in condition.items():
        df = df[df[k] == v]
    return df


def random_sample(df: pd.DataFrame, n: int = 10, random_state: Optional[int] = None) -> pd.DataFrame:
    """
    随机采样DataFrame的若干行
    :param df: 原始DataFrame
    :param n: 采样行数
    :param random_state: 随机种子
    :return: 采样后的DataFrame
    """
    return df.sample(n=min(n, len(df)), random_state=random_state)


def groupby_sample(df: pd.DataFrame, by: str, n: int = 3) -> pd.DataFrame:
    """
    按某字段分组后，每组采样若干行
    :param df: 原始DataFrame
    :param by: 分组字段名
    :param n: 每组采样行数
    :return: 采样后的DataFrame
    """
    return df.groupby(by).apply(lambda x: x.sample(n=min(n, len(x)))).reset_index(drop=True)


def range_sample(df: pd.DataFrame, field: str, min_value: Any, max_value: Any) -> pd.DataFrame:
    """
    按字段区间筛选DataFrame的行
    :param df: 原始DataFrame
    :param field: 字段名
    :param min_value: 区间下界
    :param max_value: 区间上界
    :return: 筛选后的DataFrame
    """
    return df[(df[field] >= min_value) & (df[field] <= max_value)] 
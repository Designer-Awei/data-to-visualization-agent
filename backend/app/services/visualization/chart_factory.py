"""
图表生成工厂模块
"""
from typing import Dict, Any, Optional
import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
import io
import base64

class ChartFactory:
    """
    图表生成工厂类，负责生成不同类型的图表
    """
    
    @staticmethod
    def create_chart(
        data: pd.DataFrame,
        chart_type: str,
        x_column: str,
        y_column: str,
        title: Optional[str] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        创建图表并返回base64编码的图片数据
        
        Args:
            data: pandas DataFrame对象
            chart_type: 图表类型 ('line', 'bar', 'scatter', 'pie', 'box', etc.)
            x_column: X轴数据列名
            y_column: Y轴数据列名
            title: 图表标题
            **kwargs: 其他图表参数
            
        Returns:
            Dict包含base64编码的图片数据和图表元数据
        """
        # 设置样式
        plt.style.use('seaborn')
        fig, ax = plt.subplots(figsize=(10, 6))
        
        # 根据图表类型选择绘图方法
        if chart_type == 'line':
            sns.lineplot(data=data, x=x_column, y=y_column, ax=ax)
        elif chart_type == 'bar':
            sns.barplot(data=data, x=x_column, y=y_column, ax=ax)
        elif chart_type == 'scatter':
            sns.scatterplot(data=data, x=x_column, y=y_column, ax=ax)
        elif chart_type == 'pie':
            plt.pie(data[y_column], labels=data[x_column], autopct='%1.1f%%')
        elif chart_type == 'box':
            sns.boxplot(data=data, x=x_column, y=y_column, ax=ax)
        else:
            raise ValueError(f"Unsupported chart type: {chart_type}")
            
        # 设置标题
        if title:
            plt.title(title)
            
        # 优化布局
        plt.tight_layout()
        
        # 将图表转换为base64字符串
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', dpi=300, bbox_inches='tight')
        buffer.seek(0)
        image_base64 = base64.b64encode(buffer.getvalue()).decode()
        plt.close()
        
        return {
            'image_data': image_base64,
            'chart_type': chart_type,
            'title': title,
            'x_column': x_column,
            'y_column': y_column
        }

    @staticmethod
    def get_supported_charts() -> Dict[str, str]:
        """
        获取支持的图表类型列表
        
        Returns:
            Dict[str, str]: 图表类型及其描述
        """
        return {
            'line': '折线图 - 适用于展示趋势变化',
            'bar': '柱状图 - 适用于分类数据比较',
            'scatter': '散点图 - 适用于展示数据分布和相关性',
            'pie': '饼图 - 适用于展示占比关系',
            'box': '箱线图 - 适用于展示数据分布特征'
        } 
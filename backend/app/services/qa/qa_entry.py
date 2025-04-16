"""
qa_entry.py
Node与Python智能问答桥接脚本：接收问题、数据摘要、样本、检索片段等参数，调用LLM（如SiliconFlow）并输出答案。
"""
import sys
import json
import os
from openai import OpenAI


def main():
    """
    主入口：读取参数，调用LLM并输出答案
    """
    if len(sys.argv) < 2:
        print(json.dumps({'error': '缺少参数'}))
        sys.exit(1)
    params = json.loads(sys.argv[1])
    question = params.get('question')
    summary = params.get('summary')
    samples = params.get('samples')
    related = params.get('related')
    model = os.environ.get('MODEL_NAME', 'Qwen/Qwen2.5-Coder-32B-Instruct')
    api_key = os.environ.get('SILICONFLOW_API_KEY')
    if not api_key:
        print(json.dumps({'error': '缺少SILICONFLOW_API_KEY'}))
        sys.exit(1)
    # 构建prompt
    prompt = f"你是数据分析专家。以下是数据摘要：{summary}\n样本数据：{samples}\n问题：{question}"
    if related:
        prompt += f"\n相关片段：{related}"
    client = OpenAI(api_key=api_key, base_url="https://api.siliconflow.cn/v1")
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "你是一个专业的AI助手。遇到用户要求"用markdown格式输出"、"请给我markdown源码"、"请输出json格式"、"请输出代码"等类似需求时,"
                        "请务必将相关内容包裹在对应的代码块中（如用三个反引号markdown、json、python等开头和结尾），正文和代码块分开输出。"
                        "其他普通回答正常输出。"
                    )
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=2048,
            top_p=0.9,
            frequency_penalty=0.5
        )
        answer = response.choices[0].message.content
        answer = nan_to_none(answer)
        print(json.dumps({'answer': answer}, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)

if __name__ == '__main__':
    main() 
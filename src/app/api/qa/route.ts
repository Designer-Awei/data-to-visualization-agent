/**
 * 问答API路由处理程序
 */
import { NextResponse } from 'next/server'
import { OpenAI } from 'openai'
import { LLMModel } from '@/types/qa'

// 初始化OpenAI客户端
const client = new OpenAI({
  apiKey: process.env.SILICONFLOW_API_KEY,
  baseURL: 'https://api.siliconflow.cn/v1'
})

/**
 * 获取模型参数配置
 */
function getModelConfig(model: LLMModel) {
  // 基础配置，用于防止乱码
  const baseConfig = {
    temperature: 0.7,    // 控制创造性
    top_p: 0.9,         // 核采样，仅考虑概率累积90%的词集
    top_k: 50,          // 只保留概率最高的50个token
    frequency_penalty: 0.5, // 降低重复内容的概率
    stream: true        // 启用流式输出防止超时
  }

  // 根据不同模型设置最大token限制
  switch (model) {
    case 'THUDM/GLM-4-9B-0414':
      return { ...baseConfig, max_tokens: 4096 }
    case 'Qwen/Qwen2.5-7B-Instruct':
      return { ...baseConfig, max_tokens: 4096 }
    case 'THUDM/GLM-Z1-32B-0414':
      return { ...baseConfig, max_tokens: 8192 }
    case 'deepseek-ai/DeepSeek-V3':
      return { ...baseConfig, max_tokens: 16384 }
    default:
      return { ...baseConfig, max_tokens: 4096 }
  }
}

export async function POST(request: Request) {
  try {
    const { question, model = 'THUDM/GLM-4-9B-0414' } = await request.json()

    if (!question) {
      return NextResponse.json(
        { error: '问题不能为空' },
        { status: 400 }
      )
    }

    // 获取模型配置
    const modelConfig = getModelConfig(model as LLMModel)

    // 构建系统提示词
    const systemPrompt = `你是一个专业的数据分析助手。请根据用户的问题提供准确、专业的回答。
回答要求：
1. 保持客观专业
2. 如果涉及数据分析，请给出分析思路
3. 如果不确定，请明确说明
4. 回答要简洁清晰，避免冗长
5. 使用中文回答`

    try {
      const completion = await client.chat.completions.create({
        model: model,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: question
          }
        ],
        ...modelConfig
      })

      // 处理流式响应
      let fullResponse = ''
      for await (const chunk of completion) {
        if (chunk.choices[0]?.delta?.content) {
          fullResponse += chunk.choices[0].delta.content
        }
      }

      // 计算一个简单的置信度（基于回答长度和完整性）
      const confidence = Math.min(
        0.95,
        Math.max(0.6, fullResponse.length / 1000)
      )

      return NextResponse.json({
        answer: fullResponse,
        confidence,
        relatedData: [] // 如果有相关数据可以在这里添加
      })

    } catch (error: any) {
      // 处理常见错误码
      const statusCode = error.response?.status || 500
      let errorMessage = '服务器内部错误'

      switch (statusCode) {
        case 400:
          errorMessage = '请求参数错误，请检查输入'
          break
        case 401:
          errorMessage = 'API密钥无效或已过期'
          break
        case 403:
          errorMessage = '没有权限使用该模型，可能需要实名认证'
          break
        case 429:
          errorMessage = '请求频率超限，请稍后再试'
          break
        case 503:
        case 504:
          errorMessage = '模型服务暂时不可用，请稍后再试'
          break
      }

      console.error('LLM API错误:', error)
      return NextResponse.json(
        { 
          error: errorMessage,
          details: error.response?.data || error.message
        },
        { status: statusCode }
      )
    }

  } catch (error) {
    console.error('请求处理错误:', error)
    return NextResponse.json(
      { error: '处理请求时发生错误' },
      { status: 500 }
    )
  }
} 
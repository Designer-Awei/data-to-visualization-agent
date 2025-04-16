/**
 * 问答API路由处理程序
 * @module api/qa/route
 * @description 接收用户问题和数据，调用SiliconFlow LLM进行智能问答，支持数据驱动的分析。
 */
import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { Message } from '@/types/qa'

// 初始化OpenAI客户端，使用SiliconFlow配置
const client = new OpenAI({
  apiKey: process.env.SILICONFLOW_API_KEY,
  baseURL: 'https://api.siliconflow.cn/v1'
})

/**
 * 处理POST请求，进行智能问答
 * @param {Request} req - 请求对象，包含question、model、data、messages等
 * @returns {Promise<NextResponse>} - 返回LLM的回答
 */
export async function POST(req: Request) {
  try {
    const { question, model = process.env.DEFAULT_MODEL, data, messages = [] } = await req.json()

    if (!question?.trim()) {
      return NextResponse.json(
        { error: '请输入问题' },
        { status: 400 }
      )
    }

    // 构建系统提示词，若有数据则附加数据内容
    let systemPrompt = ''
    if (data && Array.isArray(data) && data.length > 0) {
      // 只展示前10条数据，防止prompt过长
      const previewRows = data.slice(0, 10)
      const dataPreview = JSON.stringify(previewRows, null, 2)
      systemPrompt = `你是一个数据分析助手。我会给你一些数据和问题，请帮我分析数据并回答问题。\n当前数据集包含 ${data.length} 条记录，数据示例：\n${dataPreview}\n请基于这些数据来回答问题。如果问题无法从数据中得到答案，请明确告知。回答要客观、准确，并尽可能给出数据支持。`
    } else {
      systemPrompt = '你是一个智能助手，请帮我回答问题。'
    }

    // 构建对话历史
    const conversationMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.slice(-5), // 保留最近5条消息作为上下文
      { role: 'user', content: question }
    ]

    try {
      // 调用模型API
      const completion = await client.chat.completions.create({
        model,
        messages: conversationMessages,
        temperature: 0.7,
        max_tokens: 4096,
        top_p: 0.9,
        frequency_penalty: 0.5,
        presence_penalty: 0.5,
        stream: false
      })

      const answer = completion.choices[0]?.message?.content || '抱歉，我无法回答这个问题。'
      // 计算置信度（基于回答长度和完整性）
      const confidence = Math.min(
        0.95,
        Math.max(0.5, answer.length / 1000)
      )

      return NextResponse.json({
        answer,
        confidence,
        relatedData: [] // TODO: 实现相关数据检索
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
  } catch (error: any) {
    console.error('请求处理错误:', error)
    return NextResponse.json(
      { error: '处理请求时发生错误' },
      { status: 500 }
    )
  }
}
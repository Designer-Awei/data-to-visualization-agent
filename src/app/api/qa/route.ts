/**
 * 问答API路由处理程序
 * @module api/qa/route
 * @description 接收用户问题和数据，调用SiliconFlow LLM进行智能问答，支持数据驱动的分析。
 */
import { NextResponse } from 'next/server'
import { OpenAI } from 'openai'
import { Message } from '@/types/qa'

/**
 * 意图识别agent：判断用户问题属于问答还是绘图
 * @param {string} question - 用户输入
 * @returns {Promise<'qa'|'plot'|null>} - 返回意图类型
 */
async function detectIntent(question: string): Promise<'qa'|'plot'|null> {
  const prompt = `你是一个智能助手，请判断用户的问题属于哪一类，只能返回如下JSON：{ "intent": "qa" } 或 { "intent": "plot" }。\n- "qa"表示普通问答（如数据分析、解释、总结等）\n- "plot"表示需要生成可视化图表（如画图、可视化、趋势、分布等）\n用户问题：${question}`
  const client = new OpenAI({
    apiKey: process.env.SILICONFLOW_API_KEY,
    baseURL: 'https://api.siliconflow.cn/v1'
  })
  const res = await client.chat.completions.create({
    model: process.env.MODEL_NAME || 'Qwen/Qwen2.5-Coder-32B-Instruct',
    messages: [
      { role: 'system', content: '你是意图识别agent，只返回JSON结构。' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2,
    max_tokens: 64
  })
  let intentJson = res.choices[0]?.message?.content || ''
  try {
    intentJson = intentJson.replace(/```json|```/g, '').trim()
    // eslint-disable-next-line
    const { intent } = JSON.parse(intentJson)
    console.log(`[意图识别agent] 用户问题: ${question} => 识别为: ${intent}`)
    if (intent === 'qa' || intent === 'plot') return intent
    return null
  } catch {
    console.log(`[意图识别agent] 解析失败: ${intentJson}`)
    return null
  }
}

/**
 * 智能分流API：支持对话记忆，前端传入messages，分流时一并传递
 * @param {Request} request - POST请求，包含question, data, columns, messages
 */
export async function POST(request: Request) {
  try {
    const params = await request.json()
    const question = params.question
    const data = params.data || []
    const columns = params.columns || (data[0] ? Object.keys(data[0]) : [])
    const messages = params.messages || []

    // 1. 先意图识别
    const intent = await detectIntent(question)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    if (intent === 'plot') {
      // 分流到绘图API
      const resp = await fetch(`${baseUrl}/api/visualization/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, data, columns, messages })
      })
      const result = await resp.json()
      return NextResponse.json(result)
    } else if (intent === 'qa') {
      // 分流到问答API
      const resp = await fetch(`${baseUrl}/api/qa/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, data, columns, messages })
      })
      const result = await resp.json()
      return NextResponse.json(result)
    } else {
      return NextResponse.json({ answer: '未能识别你的问题意图，请重试或换种表达。', plotly_figure: null })
    }
  } catch (error) {
    console.error('智能分流API错误:', error)
    return NextResponse.json({ error: '处理请求时发生错误' }, { status: 500 })
  }
}
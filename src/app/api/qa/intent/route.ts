import { NextResponse } from 'next/server'
import { callLLMWithRetry } from '@/utils/llm'

/**
 * 意图识别agent：判断用户问题意图（绘图/问答/计算）
 * @param {string} question 用户问题
 * @param {string} model LLM模型名称
 * @returns {Promise<'general'|'calc'|'plot'>} 意图分类结果
 */
async function detectIntent(question: string, model: string): Promise<'general'|'calc'|'plot'> {
  // 使用LLM进行意图识别
  const prompt = `
请分析用户问题的意图，判断是以下哪种类型（只返回JSON格式的结果，不要解释）:
1. plot: 需要绘图的问题，包含"画图""绘制""可视化""柱状图""饼图""折线图"等词语
2. calc: 需要数据计算的问题，包含"计算""求""统计""分析""最大""最小""平均""汇总"等词语
3. general: 一般闲聊或无需特殊处理的问题

用户问题: "${question}"

请返回格式如下：
{"intent": "plot/calc/general"}
`
  const res = await callLLMWithRetry({
    model,
    messages: [
      { role: 'system', content: '你是意图识别专家，只返回JSON格式结果' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.1,
    max_tokens: 32
  })

  // 解析LLM返回的内容
  try {
    const content = res.choices[0]?.message?.content || ''
    const result = JSON.parse(content.replace(/```json|```/g, '').trim())
    if (['plot', 'calc', 'general'].includes(result.intent)) {
      console.log(`[意图识别agent] 识别结果: ${result.intent}, 问题: ${question.slice(0, 50)}${question.length > 50 ? '...' : ''}`)
      return result.intent
    }
  } catch (e) {
    console.error('[意图识别agent] JSON解析错误:', e)
  }
  
  // 兜底返回general
  return 'general'
}

/**
 * 意图识别API
 * @param {Request} request - 包含question和model的POST请求
 * @returns {Promise<Response>} - 包含intent字段的JSON响应
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { question, model } = body
    
    if (!question) {
      return NextResponse.json({ error: '缺少问题' }, { status: 400 })
    }
    
    // 使用默认模型兜底
    const useModel = model || (globalThis as any).currentLLMModel || process.env.MODEL_NAME || 'THUDM/GLM-4-9B-0414'
    
    // 调用意图识别
    const intent = await detectIntent(question, useModel)
    
    return NextResponse.json({ intent })
  } catch (error) {
    console.error('[意图识别API] 错误:', error)
    return NextResponse.json({ error: '处理请求时发生错误', intent: 'general' }, { status: 500 })
  }
} 
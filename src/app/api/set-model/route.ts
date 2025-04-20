import { NextResponse } from 'next/server'

/**
 * 设置全局LLM模型名API，前端切换模型时调用
 * @param {Request} request - POST请求，body: { model: string }
 * @returns {Promise<Response>} - { success: true, model }
 */
export async function POST(request: Request) {
  const { model } = await request.json()
  if (typeof model !== 'string' || !model.trim()) {
    return NextResponse.json({ error: '模型名无效' }, { status: 400 })
  }
  (globalThis as any).currentLLMModel = model
  return NextResponse.json({ success: true, model })
} 
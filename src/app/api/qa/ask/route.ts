import { NextResponse } from 'next/server'
import { spawn } from 'child_process'

/**
 * 调用Python脚本进行智能问答
 * @param {object} params - 问题、摘要、样本、检索片段等参数
 * @returns {Promise<any>} - LLM答案
 */
async function askLLM(params: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const py = spawn('python', [
      'backend/app/services/qa/qa_entry.py',
      JSON.stringify(params)
    ], {
      env: { ...process.env }
    })
    let output = ''
    py.stdout.on('data', (data) => {
      output += data.toString()
    })
    py.stderr.on('data', (data) => {
      console.error('Python错误:', data.toString())
    })
    py.on('close', (code) => {
      if (code === 0) {
        try {
          resolve(JSON.parse(output))
        } catch (e) {
          reject(e)
        }
      } else {
        reject(new Error('Python问答脚本执行失败'))
      }
    })
  })
}

/**
 * POST /api/qa/ask
 * @description 智能问答API，接收问题、摘要、样本、检索片段等参数，返回LLM答案
 * @param {Request} request - 请求对象，body需包含question、summary、samples、related等
 * @returns {Promise<Response>} - LLM答案
 */
export async function POST(request: Request) {
  try {
    const params = await request.json()
    if (!params.question) {
      return NextResponse.json({ error: '缺少问题参数' }, { status: 400 })
    }
    const result = await askLLM(params)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('智能问答API错误:', error)
    return NextResponse.json({ error: '处理问答请求时发生错误' }, { status: 500 })
  }
} 
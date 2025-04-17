import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

/**
 * 计算agent：只负责数据检索、代码执行、或口算
 * @param {Request} request - POST请求，包含code, data, manual（可选）
 * @returns {Promise<Response>} - {result, method, code, error}
 */
export async function POST(request: Request) {
  try {
    const { code, data, manual } = await request.json()
    if (manual) {
      // 口算模式，直接返回manual结果
      return NextResponse.json({ result: manual, method: 'manual', code: null, error: null })
    }
    if (!code || !data) {
      return NextResponse.json({ result: null, method: null, code, error: '缺少code或data' }, { status: 400 })
    }
    // 执行Python代码
    const tmpData = path.join(process.cwd(), 'tmp_compute_data.json')
    const tmpCode = path.join(process.cwd(), 'tmp_compute_code.py')
    fs.writeFileSync(tmpData, JSON.stringify(data, null, 2))
    const pyCode = `import json\nwith open(r'${tmpData}', 'r', encoding='utf-8') as f:\n    data = json.load(f)\n${code}\nprint(json.dumps(result, ensure_ascii=False))\n`
    fs.writeFileSync(tmpCode, pyCode)
    let output = ''
    let errorMsg = ''
    await new Promise((resolve) => {
      const py = spawn('python', [tmpCode])
      py.stdout.on('data', (d) => { output += d.toString() })
      py.stderr.on('data', (d) => { errorMsg += d.toString() })
      py.on('close', () => { resolve(null) })
    })
    fs.unlinkSync(tmpData)
    fs.unlinkSync(tmpCode)
    if (errorMsg) {
      return NextResponse.json({ result: null, method: 'python', code, error: errorMsg })
    }
    try {
      const result = JSON.parse(output)
      return NextResponse.json({ result, method: 'python', code, error: null })
    } catch (e) {
      return NextResponse.json({ result: null, method: 'python', code, error: '结果解析失败: ' + (e instanceof Error ? e.message : String(e)) })
    }
  } catch (error) {
    return NextResponse.json({ result: null, method: null, code: null, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
} 
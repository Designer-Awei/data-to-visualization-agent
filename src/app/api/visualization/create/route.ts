import { NextResponse } from 'next/server'
import { OpenAI } from 'openai'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

/**
 * 调用Python脚本安全执行plotly代码
 * @param {string} code - LLM生成的plotly代码
 * @param {any[]} data - 数据
 * @returns {Promise<any>} - plotly_figure
 */
async function runPlotlyPython(code: string, data: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const tmpData = path.join(process.cwd(), 'tmp_plot_data.json')
    const tmpCode = path.join(process.cwd(), 'tmp_plot_code.py')
    fs.writeFileSync(tmpData, JSON.stringify(data, null, 2))
    // 拼接完整python脚本
    const pyCode = `import json\nimport plotly.graph_objs as go\nwith open(r'${tmpData}', 'r', encoding='utf-8') as f:\n    data = json.load(f)\n${code}\nprint(json.dumps(result, ensure_ascii=False))\n`
    fs.writeFileSync(tmpCode, pyCode)
    const py = spawn('python', [tmpCode])
    let output = ''
    py.stdout.on('data', (d) => { output += d.toString() })
    py.stderr.on('data', (d) => { console.error('Python错误:', d.toString()) })
    py.on('close', (code) => {
      fs.unlinkSync(tmpData)
      fs.unlinkSync(tmpCode)
      if (code === 0) {
        try {
          resolve(JSON.parse(output))
        } catch (e) {
          reject(e)
        }
      } else {
        reject(new Error('Python绘图脚本执行失败'))
      }
    })
  })
}

/**
 * 智能绘图API
 * @param {Request} request - POST请求，包含question, data, columns
 * @returns {Promise<Response>} - plotly_figure及answer
 */
export async function POST(request: Request) {
  try {
    const params = await request.json()
    const question = params.question
    const data = params.data || []
    const columns = params.columns || (data[0] ? Object.keys(data[0]) : [])
    const preview = data.slice(0, 3)

    // 1. 调用LLM判断是否需要绘图及推荐类型
    const intentPrompt = `你是一个数据可视化助手，请判断用户的问题是否需要生成图表，并给出推荐的plotly图表类型。只返回如下JSON格式：\n{"need_plot": true/false, "plot_type": "bar/line/pie/..."}\n用户问题：${question}\n数据字段：${columns}`
    const client = new OpenAI({
      apiKey: process.env.SILICONFLOW_API_KEY,
      baseURL: 'https://api.siliconflow.cn/v1'
    })
    const intentRes = await client.chat.completions.create({
      model: process.env.MODEL_NAME || 'Qwen/Qwen2.5-Coder-32B-Instruct',
      messages: [
        { role: 'system', content: '你是数据可视化助手，只返回JSON结构。' },
        { role: 'user', content: intentPrompt }
      ],
      temperature: 0.2,
      max_tokens: 256
    })
    let intentJson = intentRes.choices[0]?.message?.content || ''
    try {
      intentJson = intentJson.replace(/```json|```/g, '').trim()
      // eslint-disable-next-line
      var { need_plot, plot_type } = JSON.parse(intentJson)
    } catch {
      return NextResponse.json({ answer: '未能识别绘图意图', plotly_figure: null })
    }
    if (!need_plot) {
      return NextResponse.json({ answer: '无需绘图，已为你完成分析。', plotly_figure: null })
    }

    // 2. 需要绘图，调用LLM生成plotly代码
    const plotPrompt = `你是数据可视化专家。请根据用户需求和数据，生成plotly的Python代码（只输出代码，不要解释说明）。\n要求：\n- 图表类型为：${plot_type}\n- 变量名必须用fig，必须用plotly.graph_objs（如go.Bar、go.Scatter等）。\n- 数据变量名为data，类型为list[dict]，每个dict的key为字段名。\n- 代码最后必须有：result = fig.to_plotly_json()\n- 只输出完整可运行的Python代码，不要输出markdown、注释或多余内容。\n- 不要使用matplotlib、seaborn等其他库。\n用户问题：${question}\n数据字段：${columns}\n数据示例：${JSON.stringify(preview)}\n`
    const plotRes = await client.chat.completions.create({
      model: process.env.MODEL_NAME || 'Qwen/Qwen2.5-Coder-32B-Instruct',
      messages: [
        { role: 'system', content: '你是数据可视化专家，擅长用plotly生成图表。' },
        { role: 'user', content: plotPrompt }
      ],
      temperature: 0.3,
      max_tokens: 1024
    })
    let code = plotRes.choices[0]?.message?.content || ''
    code = code.replace(/```python|```/g, '').trim()

    // 3. 调用python脚本安全执行plotly代码
    let plotly_figure = null
    try {
      plotly_figure = await runPlotlyPython(code, data)
    } catch (e) {
      return NextResponse.json({ answer: '图表生成失败，原因：' + String(e) + '\nLLM代码如下：\n' + code, plotly_figure: null })
    }

    // 4. 返回结构
    return NextResponse.json({
      answer: '已为你生成图表，支持下载PNG/SVG/HTML。',
      plotly_figure
    })
  } catch (error) {
    console.error('智能绘图API错误:', error)
    return NextResponse.json({ error: '处理绘图请求时发生错误' }, { status: 500 })
  }
} 
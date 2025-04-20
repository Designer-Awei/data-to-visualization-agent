import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

/**
 * 调用Python脚本安全执行plotly代码，兼容多行JSON输出，只取最后一行合法JSON
 * @param {string} code - LLM生成的plotly代码
 * @param {any[]} data - 数据
 * @returns {Promise<any>} - plotly_figure
 */
async function runPlotlyPython(code: string, data: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const tmpData = path.join(process.cwd(), 'tmp_plot_data.json')
    const tmpCode = path.join(process.cwd(), 'tmp_plot_code.py')
    fs.writeFileSync(tmpData, JSON.stringify(data, null, 2))
    // 拼接完整python脚本，强制utf-8输出，防止中文乱码
    const pyCode = `import sys\nimport io\nsys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')\nsys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')\nimport json\nimport plotly.graph_objs as go\nwith open(r'${tmpData}', 'r', encoding='utf-8') as f:\n    data = json.load(f)\n${code}\nprint(json.dumps(result, ensure_ascii=False))\n`
    fs.writeFileSync(tmpCode, pyCode)
    const py = spawn('python', [tmpCode])
    py.stdout.setEncoding('utf8')
    py.stderr.setEncoding('utf8')
    let output = ''
    let stderr = ''
    py.stdout.on('data', (d) => { output += d.toString() })
    py.stderr.on('data', (d) => { stderr += d.toString(); console.error('Python错误:', d.toString()) })
    py.on('close', (codeNum) => {
      fs.unlinkSync(tmpData)
      fs.unlinkSync(tmpCode)
      if (codeNum === 0) {
        try {
          /**
           * 兼容多行JSON输出，只取最后一行合法JSON
           */
          const lines = output.split('\n').map(line => line.trim()).filter(Boolean)
          let lastValid = null
          for (let i = lines.length - 1; i >= 0; i--) {
            try {
              lastValid = JSON.parse(lines[i])
              break
            } catch {}
          }
          if (lastValid) {
            resolve(lastValid)
          } else {
            reject({
              error: 'Python输出无有效JSON',
              detail: output
            })
          }
        } catch (e) {
          reject({
            error: 'Python绘图脚本执行失败（JSON解析异常）',
            detail: `Node.js JSON.parse异常: ${e instanceof Error ? e.message : String(e)}\nPython stderr: ${stderr}\nPython输出: ${output}`
          })
        }
      } else {
        reject({
          error: 'Python绘图脚本执行失败',
          detail: `Python stderr: ${stderr}\nPython输出: ${output}`
        })
      }
    })
  })
}

/**
 * 用fetch直连SiliconFlow LLM API，兼容OpenAI chat.completions.create参数
 * @param {object} params - 请求参数，需包含model、messages等
 * @param {number} [maxRetry=2] - 最大重试次数
 * @returns {Promise<any>} - LLM响应
 */
async function callLLMWithRetry(params: any, maxRetry = 2) {
  let lastError: any = null
  let tryMessages = params.messages || []
  for (let i = 0; i <= maxRetry; i++) {
    try {
      const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SILICONFLOW_API_KEY}`
        },
        body: JSON.stringify({ ...params, messages: tryMessages, stream: false })
      })
      if (!res.ok) throw new Error(await res.text())
      return await res.json()
    } catch (e: any) {
      lastError = e
      if (tryMessages.length > 1) {
        tryMessages = tryMessages.slice(1)
      } else {
        break
      }
    }
  }
  throw lastError
}

/**
 * 构建通用型智能绘图agent的system prompt，适配各类业务场景
 * @param {string[]} userFields 相关字段
 * @param {any[]} dataPreview 数据预览
 * @param {string} question 用户问题
 * @returns {string}
 */
function buildUniversalPlotSystemPrompt(userFields: string[], dataPreview: any[], question: string): string {
  return `你是一个通用数据分析和可视化专家，面对实验、仓储、财务、销售等各类表格。无论用户如何提问，你只能输出Python代码块（用\u0060\u0060\u0060python ... \u0060\u0060\u0060包裹），且代码最后必须有如下格式：\nresult = {...}\nprint(json.dumps(result, ensure_ascii=False))\n不能输出其他print语句或分析文本，否则会被判为错误。\n你只能直接使用变量 data（类型为 list[dict]，每个 dict 的 key 为字段名），禁止使用 pd.read_excel、open、os、path 等任何本地文件读取操作。\n【重要约束】：\n- 你只能对如下\"相关字段\"进行聚合、绘图等操作，不能用 row.values()、item.values() 等方式：\n  ${userFields.join('、')}\n- 字段名必须严格按数据示例中的字段名书写，且为字符串类型。\n- 相关字段的名称可能为中文、英文、拼音、缩写或数字，请严格按给定字段名处理。\n- 禁止生成fig.show()、plt.show()、open_browser等任何弹窗或本地显示相关代码，只能生成plotly图表对象并输出其figure的JSON。\n- 你的代码最后必须有result = fig.to_dict()，并print(json.dumps(result, ensure_ascii=False))，不能有fig.show()。\n数据示例（仅供参考）：\n${JSON.stringify(dataPreview, null, 2)}\n用户问题：${question}\n\n【Python代码示例】\nfields = ${JSON.stringify(userFields)}\n# 以聚合为例，计算每行相关字段的和\ntotals = [sum([item[f] for f in fields]) for item in data]\n# ... 你的绘图代码 ...`;
}

/**
 * 校验LLM生成的代码是否定义了result变量
 * @param {string} code LLM生成的Python代码
 * @returns {boolean} true=未定义result，false=已定义
 */
function hasNoResultDefinition(code: string): boolean {
  // 检查是否有 result = ... 赋值
  return !/result\s*=/.test(code)
}

/**
 * 泛化型绘图字段提取agent，完全依赖LLM智能判断，且只返回真实存在的字段
 * @param {string} question 用户问题
 * @param {any[]} data 原始数据
 * @returns {Promise<string[]>} 相关字段
 */
async function extractPlotFieldsLLM(question: string, data: any[]): Promise<string[]> {
  const allFields = data[0] ? Object.keys(data[0]) : []
  const dataPreview = data.slice(0, 5)
  const prompt = `
你是一个通用数据分析专家。请根据用户问题和数据字段，返回本轮绘图最相关的字段名数组（只返回JSON数组，不要解释）：\n用户问题：${question}\n所有字段：${JSON.stringify(allFields)}\n数据示例：${JSON.stringify(dataPreview, null, 2)}\n`
  // 调用LLM
  const res = await callLLMWithRetry({
    model: getCurrentModel(),
    messages: [
      { role: 'system', content: '你是数据分析专家，只返回JSON数组。' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2,
    max_tokens: 128
  })
  let fields: string[] = []
  try {
    const content = res.choices[0]?.message?.content || ''
    fields = JSON.parse(content.replace(/```json|```/g, '').trim())
  } catch {
    // 兜底：只用所有数值型字段
    fields = allFields.filter(f => typeof data[0][f] === 'number')
  }
  // 只保留真实存在的字段，防止LLM脑补
  fields = fields.filter(f => allFields.includes(f))
  return fields
}

/**
 * 绘图数据整理agent：提取与绘图相关的字段，并结构化为DataFrame（对象数组）
 * @param {string} question 用户问题
 * @param {any[]} data 原始数据
 * @returns {Object} { plotFields: string[], plotData: any[] }
 */
async function extractPlotFieldsAndData(question: string, data: any[]): Promise<{ plotFields: string[], plotData: any[] }> {
  const plotFields = await extractPlotFieldsLLM(question, data)
  // 结构化为对象数组（DataFrame）
  const plotData = data.map(row => {
    const obj: any = {}
    plotFields.forEach(f => obj[f] = row[f])
    return obj
  })
  return { plotFields, plotData }
}

/**
 * 数据处理逻辑agent：判断绘图数据是否需要二次计算
 * @param {string} question 用户问题
 * @param {string[]} plotFields 绘图相关字段
 * @param {any[]} plotData 结构化数据
 * @returns {Promise<'origin'|'todo'|'both'>}
 */
async function detectPlotDataStatus(question: string, plotFields: string[], plotData: any[]): Promise<'origin'|'todo'|'both'> {
  const prompt = `
你是一个数据分析专家。请根据用户问题、字段和数据样本，判断绘图数据是否需要二次计算，返回如下JSON格式（只返回JSON，不要解释）：\n{"status": "origin/todo/both"}\norigin：可直接用原始数据绘图\ntodo：需要对原始数据做二次计算（如总分、均值、分组统计等）后才能绘图\nboth：既需要原始数据又需要二次计算后的数据\n用户问题：${question}\n字段：${JSON.stringify(plotFields)}\n数据样本：${JSON.stringify(plotData.slice(0, 5), null, 2)}\n`
  const res = await callLLMWithRetry({
    model: getCurrentModel(),
    messages: [
      { role: 'system', content: '你是数据分析专家，只返回JSON结构。' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2,
    max_tokens: 32
  })
  let status: 'origin'|'todo'|'both' = 'origin'
  try {
    const content = res.choices[0]?.message?.content || ''
    const json = JSON.parse(content.replace(/```json|```/g, '').trim())
    if (["origin", "todo", "both"].includes(json.status)) {
      status = json.status
    }
  } catch {
    // 兜底
    status = 'origin'
  }
  return status
}

/**
 * 绘图数据计算agent：根据用户问题和结构化数据，生成并执行pandas数据处理代码，返回新数据
 * 仅在数据状态为'todo'或'both'时调用
 * @param {string} question 用户问题
 * @param {any[]} plotData 结构化数据（DataFrame）
 * @returns {Promise<any[]>} 处理后的新数据
 */
async function calcPlotDataWithLLM(question: string, plotData: any[]): Promise<any[]> {
  // 取前5行样本，构造prompt
  const dataPreview = plotData.slice(0, 5)
  const fields = plotData[0] ? Object.keys(plotData[0]) : []
  const prompt = `你是一个资深数据分析师。请根据用户问题和数据样本，生成pandas代码对数据做二次计算（如总分、均值、分组统计等），并输出新的DataFrame（只返回代码块，变量名为df，结果变量为result_df，必须print(result_df.to_json(orient='records', force_ascii=False))）。\n【重要约束】你只能用pandas做数据处理，禁止生成任何matplotlib、seaborn、plt等绘图库相关代码，禁止import这些库。字段名必须严格按样本数据中的字段名书写，禁止随意拼写、换行、添加空格，禁止用fields=...硬编码。\n用户问题：${question}\n字段：${JSON.stringify(fields)}\n数据样本：${JSON.stringify(dataPreview, null, 2)}\n【代码示例】\nimport pandas as pd\ndf = pd.DataFrame(data)\n# ... 你的处理 ...\nresult_df = ... # 处理后的DataFrame\nprint(result_df.to_json(orient='records', force_ascii=False))\n`
  // 调用LLM生成代码
  const res = await callLLMWithRetry({
    model: getCurrentModel(),
    messages: [
      { role: 'system', content: '你是数据分析专家，只返回Python代码块。' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2,
    max_tokens: 512
  })
  let code = ''
  try {
    const content = res.choices[0]?.message?.content || ''
    code = content.match(/```python([\s\S]*?)```/)
      ? content.match(/```python([\s\S]*?)```/)[1]
      : content.replace(/```/g, '').trim()
  } catch {
    throw new Error('LLM未能生成有效的pandas代码')
  }
  // 用Python执行代码，传入plotData
  const tmpData = path.join(process.cwd(), 'tmp_calc_data.json')
  const tmpCode = path.join(process.cwd(), 'tmp_calc_code.py')
  fs.writeFileSync(tmpData, JSON.stringify(plotData, null, 2), { encoding: 'utf-8' })
  // 拼接完整python脚本，强制utf-8
  const pyCode = `import sys\nimport io\nsys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')\nsys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')\nimport json\nimport pandas as pd\nwith open(r'${tmpData}', 'r', encoding='utf-8') as f:\n    data = json.load(f)\n${code}\n`
  fs.writeFileSync(tmpCode, pyCode, { encoding: 'utf-8' })
  return new Promise((resolve, reject) => {
    const py = spawn('python', [tmpCode])
    let output = ''
    py.stdout.on('data', (d) => { output += d.toString() })
    py.stderr.on('data', (d) => { console.error('Python错误:', d.toString()) })
    py.on('close', (code) => {
      fs.unlinkSync(tmpData)
      fs.unlinkSync(tmpCode)
      if (code === 0) {
        try {
          const result = JSON.parse(output)
          resolve(result)
        } catch (e) {
          reject(e)
        }
      } else {
        reject(new Error('Python数据计算脚本执行失败'))
      }
    })
  })
}

/**
 * 获取当前全局LLM模型名，优先用globalThis.currentLLMModel，没有则用.env默认
 * @returns {string}
 */
function getCurrentModel() {
  return (globalThis as any).currentLLMModel || process.env.DEFAULT_MODEL
}

/**
 * 智能绘图API（新版链路）
 * @param {Request} request - POST请求，包含question, data, columns
 * @returns {Promise<Response>} - plotly_figure及answer
 */
export async function POST(request: Request) {
  try {
    const params = await request.json()
    const question = params.question
    const data = params.data || []
    if (!question || !Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: '缺少问题或数据' }, { status: 400 })
    }

    const model = getCurrentModel()
    console.log('[LLM调用] 当前模型:', model)

    // 1. 字段提取agent：提取与绘图相关的字段和结构化数据
    const { plotFields, plotData } = await extractPlotFieldsAndData(question, data)
    console.log('[字段提取agent] 用户问题:', question, '\n可用字段:', plotFields, '\n样本数据:', plotData.slice(0, 3))
    if (!plotFields.length) {
      return NextResponse.json({ error: '未能识别出可用字段' }, { status: 400 })
    }

    // 2. 数据处理逻辑agent：判断是否需要二次计算
    const dataStatus = await detectPlotDataStatus(question, plotFields, plotData)
    console.log('[数据处理逻辑agent] 数据状态:', dataStatus)
    let finalPlotData = plotData
    // 3. 绘图数据计算agent：如需，生成并执行pandas代码
    if (dataStatus === 'todo' || dataStatus === 'both') {
      try {
        finalPlotData = await calcPlotDataWithLLM(question, plotData)
        console.log('[绘图数据计算agent] 处理后数据样本:', finalPlotData.slice(0, 3))
      } catch (e) {
        console.error('[绘图数据计算agent] 数据二次计算失败:', e)
        return NextResponse.json({ error: '[绘图数据计算agent] 数据二次计算失败', detail: String(e) }, { status: 500 })
      }
    }

    // 4. 智能绘图agent：用LLM生成plotly代码
    const dataPreview = finalPlotData.slice(0, 5)
    const systemPrompt = buildUniversalPlotSystemPrompt(plotFields, dataPreview, question)
    let llmCode = ''
    let retryCount = 0
    const maxRetry = 3
    let userPrompt = question
    while (retryCount < maxRetry) {
      const res = await callLLMWithRetry({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2,
        max_tokens: 1024
      })
      const content = res.choices[0]?.message?.content || ''
      llmCode = content.match(/```python([\s\S]*?)```/)
        ? content.match(/```python([\s\S]*?)```/)[1]
        : content.replace(/```/g, '').trim()
      console.log(`[智能绘图agent] 第${retryCount + 1}次LLM生成代码:\n`, llmCode)
      if (hasNoResultDefinition(llmCode)) {
        retryCount++
        userPrompt += '\n你的代码最后必须有result = ...，并print(json.dumps(result, ensure_ascii=False))，否则会报错！'
        continue
      }
      break
    }
    if (!llmCode || hasNoResultDefinition(llmCode)) {
      console.error('[智能绘图agent] LLM未能生成有效的plotly代码（缺少result定义）')
      return NextResponse.json({ error: 'LLM未能生成有效的plotly代码（缺少result定义）' }, { status: 500 })
    }

    // 5. 执行plotly代码，返回figure json
    let plotly_figure = null
    try {
      plotly_figure = await runPlotlyPython(llmCode, finalPlotData)
      console.log('[Python执行] plotly_figure生成成功')
    } catch (e: any) {
      /**
       * 捕获runPlotlyPython的详细错误，完整返回error、detail、llmCode
       */
      const errMsg = e?.error || '图表生成失败'
      const errDetail = e?.detail || (e instanceof Error ? e.message : String(e))
      console.error('[Python执行] 图表生成失败:', errMsg, errDetail, '\nLLM代码如下:\n', llmCode)
      return NextResponse.json({ error: errMsg, detail: errDetail, llmCode }, { status: 500 })
    }

    // 6. 返回结构
    return NextResponse.json({
      answer: '已为你生成图表，支持下载PNG/SVG/HTML。',
      plotly_figure
    })
  } catch (error) {
    console.error('智能绘图API错误:', error)
    return NextResponse.json({ error: '处理绘图请求时发生错误' }, { status: 500 })
  }
} 
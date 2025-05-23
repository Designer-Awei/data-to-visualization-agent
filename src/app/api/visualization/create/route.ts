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
 * 清洗LLM生成的Python代码，移除所有fig.show()、plt.show()、open_browser等本地弹窗/浏览器打开命令
 * 以及所有data重新定义相关代码
 * @param {string} code - LLM生成的Python代码
 * @returns {string} - 清洗后的代码
 */
function cleanPlotlyCode(code: string): string {
  return code
    // 移除fig.show/plt.show/open_browser/webbrowser.open等
    .replace(/\bfig\.show\s*\(.*?\)\s*;?/g, '')
    .replace(/\bplt\.show\s*\(.*?\)\s*;?/g, '')
    .replace(/\bopen_browser\s*\(.*?\)\s*;?/g, '')
    .replace(/\bimport\s+webbrowser\b.*/g, '')
    .replace(/webbrowser\.open\s*\(.*?\)\s*;?/g, '')
    // 移除所有data重新定义相关代码
    // 兼容低版本JS，避免使用gs标志
    .replace(/data\s*=\s*\[[\s\S]*?\](\s*#.*)?/g, '') // data = [ ... ]
    .replace(/data\s*=\s*list\(.*?\)(\s*#.*)?/g, '') // data = list(...)
    .replace(/data\s*=\s*json\.loads\(.*?\)(\s*#.*)?/g, '') // data = json.loads(...)
    .replace(/data\s*=\s*pd\.read_.*?\(.*?\)(\s*#.*)?/g, '') // data = pd.read_...
    .replace(/data\s*=\s*open\(.*?\)(\s*#.*)?/g, '') // data = open(...)
    .replace(/data\s*=\s*.*?DataFrame\(.*?\)(\s*#.*)?/g, '') // data = ...DataFrame(...)
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
 * 构建通用绘图systemPrompt，禁止任何"假设data是后端传入的数据"注释，示例代码只保留直接遍历data的正例。
 * @param {string[]} userFields - 用户相关字段
 * @param {any[]} dataPreview - 数据样本
 * @param {string} question - 用户问题
 * @returns {string} - systemPrompt
 */
function buildUniversalPlotSystemPrompt(userFields: string[], dataPreview: any[], question: string): string {
  return `你是一个通用数据分析和可视化专家，面对实验、仓储、财务、销售等各类表格。无论用户如何提问，你只能输出Python代码块（用\u0060\u0060\u0060python ... \u0060\u0060\u0060包裹），且代码最后必须有如下格式：\nresult = {...}\nprint(json.dumps(result, ensure_ascii=False))\n不能输出其他print语句或分析文本，否则会被判为错误。\n你只能直接使用变量 data（类型为 list[dict]，每个 dict 的 key 为字段名），禁止使用 pd.read_excel、open、os、path 等任何本地文件读取操作。\n【重要约束】：\n- 你只能对如下"相关字段"进行聚合、绘图等操作，不能用 row.values()、item.values() 等方式：\n  ${userFields.join('、')}\n- 字段名必须严格按数据示例中的字段名书写，且为字符串类型。\n- 相关字段的名称可能为中文、英文、拼音、缩写或数字，请严格按给定字段名处理。\n- 禁止生成fig.show()、plt.show()、open_browser等任何弹窗或本地显示相关代码，只能生成plotly图表对象并输出其figure的JSON。\n- 你的代码最后必须有result = fig.to_dict()，并print(json.dumps(result, ensure_ascii=False))，不能有fig.show()。\n- 【禁止】在代码中出现 data = [...]、data = [{{...}}]、data = list(...)、data = json.loads(...) 等任何重新定义data变量的写法，必须直接使用后端传入的data变量，否则只会画出部分数据。\n数据示例（仅供参考）：\n${JSON.stringify(dataPreview, null, 2)}\n用户问题：${question}\n\n【Python代码正例】\nfields = ${JSON.stringify(userFields)}\n# 直接遍历data变量\ntotals = [sum([item[f] for f in fields]) for item in data]\n# ... 你的绘图代码 ...`;
}

/**
 * 错误推理agent，分析代码报错原因并给出修改建议
 * @param {string} userQuestion 用户问题
 * @param {string} lastCode 上次代码
 * @param {string} errorMsg 报错信息
 * @param {string} model LLM模型名
 * @returns {Promise<string>} 错误分析和修改建议
 */
async function errorAnalysisAgent(userQuestion: string, lastCode: string, errorMsg: string, model: string): Promise<string> {
  const prompt = `你是一个代码错误分析专家。请根据用户问题、上次生成的Python代码和报错信息，推理错误原因，并给出详细的修改建议。只输出分析和建议，不要输出代码。
【用户问题】${userQuestion}
【上次代码】
${lastCode}
【报错信息】
${errorMsg}`
  const res = await callLLMWithRetry({
    model,
    messages: [
      { role: 'system', content: '你是代码错误分析专家，只输出分析和建议。' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2,
    max_tokens: 512
  })
  return res.choices[0]?.message?.content || ''
}

/**
 * 智能代码修复agent prompt生成，强化禁止写死data的约束，给出正反例。
 * 泛化：无论是二维、三维、极坐标、堆叠、分组等任意类型的plotly图表，只要x/y/z/angle/r等参数不是原始data的字段，都必须先用原始data生成适配的中间DataFrame，再绘图。
 * @param {string} userQuestion
 * @param {any[]} dataPreview
 * @param {string} lastCode
 * @param {string} errorMsg
 * @param {string} [errorAnalysis] 错误推理agent输出的分析和建议
 * @returns {string}
 */
function buildCodeFixAgentPrompt(userQuestion: string, dataPreview: any[], lastCode: string, errorMsg: string, errorAnalysis?: string): string {
  return `你是一个代码修复专家。用户希望基于如下数据和问题生成plotly图表，但你上次生成的Python代码执行报错。请根据报错信息和错误分析，推理错误原因，并修正代码，只返回修正后的完整Python代码块（用\u0060\u0060\u0060python ... \u0060\u0060\u0060包裹），代码最后必须有result = ...并print(json.dumps(result, ensure_ascii=False))。
【用户问题】${userQuestion}
【数据样本】${JSON.stringify(dataPreview, null, 2)}
【上次代码】
${lastCode}
【报错信息】
${errorMsg}
${errorAnalysis ? `【错误分析和修改建议】\n${errorAnalysis}` : ''}

【重要约束】：
- 你只能直接使用变量data（类型为list[dict]），禁止在代码中出现data = [...]、data = list(...)、data = json.loads(...)等任何重新定义data变量的写法，否则会被判为错误。
- 只允许直接遍历data变量，不能重新赋值data。
- 如果你不确定data的内容，直接用data变量，不要重新定义。
- 【泛化要求】无论是二维、三维、极坐标、堆叠、分组等任意类型的plotly图表，只要x/y/z/angle/r等参数不是原始data的字段，都必须先用原始data生成适配的中间DataFrame，再绘图。
- 如果报错信息中包含"字段不存在"或"x/y/z/angle/r不是data中的字段"，你必须先用原始data生成适配结构的数据，再用该DataFrame绘图。
- 例如：先用pandas或列表推导生成"学科-平均分"、"极坐标的角度-半径"、"三维x/y/z"结构的数据，再用plotly绘制。

【反例】（错误写法）：
fig = px.scatter(data, x="极角", y="半径")  # data中没有"极角"或"半径"字段
fig = px.scatter_3d(data, x="x", y="y", z="z")  # data中没有x/y/z字段
fig = px.bar(data, x="分组", y="总分")  # data中没有"分组"或"总分"字段

【正例】（正确写法）：
# 极坐标
polar_data = []
for item in data:
    angle = ... # 由原始字段推导
    r = ...     # 由原始字段推导
    polar_data.append({"极角": angle, "半径": r})
fig = px.scatter(polar_data, x="极角", y="半径")

# 三维
scatter3d_data = []
for item in data:
    x = ... # 由原始字段推导
    y = ... # 由原始字段推导
    z = ... # 由原始字段推导
    scatter3d_data.append({"x": x, "y": y, "z": z})
fig = px.scatter_3d(scatter3d_data, x="x", y="y", z="z")

# 分组/堆叠
group_data = []
for item in data:
    group = ... # 由原始字段推导
    total = ... # 由原始字段推导
    group_data.append({"分组": group, "总分": total})
fig = px.bar(group_data, x="分组", y="总分")
`;
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
 * @param {string} model LLM模型名
 * @returns {Promise<string[]>} 相关字段
 */
async function extractPlotFieldsLLM(question: string, data: any[], model: string): Promise<string[]> {
  const allFields = data[0] ? Object.keys(data[0]) : []
  const dataPreview = data.slice(0, 5)
  const prompt = `
你是一个通用数据分析专家。请根据用户问题和数据字段，返回本轮绘图最相关的字段名数组（只返回JSON数组，不要解释）：\n用户问题：${question}\n所有字段：${JSON.stringify(allFields)}\n数据示例：${JSON.stringify(dataPreview, null, 2)}\n`
  // 调用LLM
  const res = await callLLMWithRetry({
    model,
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
 * @param {string} model LLM模型名
 * @returns {Object} { plotFields: string[], plotData: any[] }
 */
async function extractPlotFieldsAndData(question: string, data: any[], model: string): Promise<{ plotFields: string[], plotData: any[] }> {
  const plotFields = await extractPlotFieldsLLM(question, data, model)
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
 * @param {string} model LLM模型名
 * @returns {Promise<'origin'|'todo'|'both'>}
 */
async function detectPlotDataStatus(question: string, plotFields: string[], plotData: any[], model: string): Promise<'origin'|'todo'|'both'> {
  const prompt = `
你是一个数据分析专家。请根据用户问题、字段和数据样本，判断绘图数据是否需要二次计算，返回如下JSON格式（只返回JSON，不要解释）：\n{"status": "origin/todo/both"}\norigin：可直接用原始数据绘图\ntodo：需要对原始数据做二次计算（如总分、均值、分组统计等）后才能绘图\nboth：既需要原始数据又需要二次计算后的数据\n用户问题：${question}\n字段：${JSON.stringify(plotFields)}\n数据样本：${JSON.stringify(plotData.slice(0, 5), null, 2)}\n`
  const res = await callLLMWithRetry({
    model,
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
 * @param {string} model LLM模型名
 * @returns {Promise<any[]>} 处理后的新数据
 */
async function calcPlotDataWithLLM(question: string, plotData: any[], model: string): Promise<any[]> {
  // 取前5行样本，构造prompt
  const dataPreview = plotData.slice(0, 5)
  const fields = plotData[0] ? Object.keys(plotData[0]) : []
  const prompt = `你是一个资深数据分析师。请根据用户问题和数据样本，生成pandas代码对数据做二次计算（如总分、均值、分组统计等），并输出新的DataFrame（只返回代码块，变量名为df，结果变量为result_df，必须print(result_df.to_json(orient='records', force_ascii=False))）。\n【重要约束】你只能用pandas做数据处理，禁止生成任何matplotlib、seaborn、plt等绘图库相关代码，禁止import这些库。字段名必须严格按样本数据中的字段名书写，禁止随意拼写、换行、添加空格，禁止用fields=...硬编码。\n用户问题：${question}\n字段：${JSON.stringify(fields)}\n数据样本：${JSON.stringify(dataPreview, null, 2)}\n【代码示例】\nimport pandas as pd\ndf = pd.DataFrame(data)\n# ... 你的处理 ...\nresult_df = ... # 处理后的DataFrame\nprint(result_df.to_json(orient='records', force_ascii=False))\n`
  // 调用LLM生成代码
  const res = await callLLMWithRetry({
    model,
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
 * 调用代码修复agent，支持错误分析输入
 * @param {object} params - { userQuestion, plotData, lastCode, errorMsg, errorAnalysis }
 * @param {string} model LLM模型名
 * @returns {Promise<string>} 修正后的代码
 */
async function callCodeFixAgent(params: { userQuestion: string, plotData: any[], lastCode: string, errorMsg: string, errorAnalysis?: string }, model: string): Promise<string> {
  const { userQuestion, plotData, lastCode, errorMsg, errorAnalysis } = params
  const dataPreview = plotData.slice(0, 5)
  const prompt = buildCodeFixAgentPrompt(userQuestion, dataPreview, lastCode, errorMsg, errorAnalysis)
  const res = await callLLMWithRetry({
    model,
    messages: [
      { role: 'system', content: '你是代码修复专家，只输出修正后的完整Python代码块。' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2,
    max_tokens: 1024
  })
  // 只提取代码块
  const content = res.choices[0]?.message?.content || ''
  const codeMatch = content.match(/```python([\s\S]*?)```/)
  const fixedCode = codeMatch ? codeMatch[1].trim() : content.trim()
  console.log('[代码修复agent] 执行状态: 成功')
  console.log('[代码修复agent] 修复后的代码：\n```python\n' + fixedCode + '\n```')
  return fixedCode
}

/**
 * 智能代码生成agent：根据绘图需求，生成可执行的plotly Python代码
 * @param {string} systemPrompt - 绘图需求prompt
 * @param {string} userQuestion - 用户问题
 * @param {string} model - LLM模型名
 * @returns {Promise<string>} - 生成的Python代码
 */
async function callCodeGenAgent(systemPrompt: string, userQuestion: string, model: string): Promise<string> {
  const res = await callLLMWithRetry({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userQuestion }
    ],
    temperature: 0.2,
    max_tokens: 1024
  })
  const content = res.choices[0]?.message?.content || ''
  let llmCode = content.match(/```python([\s\S]*?)```/)
    ? content.match(/```python([\s\S]*?)```/)[1]
    : content.replace(/```/g, '').trim()
  
  if (llmCode && !hasNoResultDefinition(llmCode)) {
    console.log('[智能代码生成agent] 执行状态: 成功')
    console.log('[智能代码生成agent] 生成的代码：\n```python\n' + llmCode + '\n```')
  } else {
    console.log('[智能代码生成agent] 执行状态: 失败（缺少result定义）')
  }
  return llmCode
}

/**
 * 将各种报错对象序列化为详细字符串，优先包含error/detail字段内容
 * @param {any} e - 错误对象
 * @returns {string} - 详细报错信息
 */
function getErrorMsg(e: any): string {
  if (!e) return ''
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  if (typeof e === 'object') {
    let msg = ''
    if (e.error) msg += `[error] ${e.error}\n`
    if (e.detail) msg += `[detail] ${e.detail}\n`
    if (!msg) msg = JSON.stringify(e, null, 2)
    return msg
  }
  return String(e)
}

/**
 * 新增：后端自动检测x/y与data字段是否匹配，若不匹配则自动提示修复agent补充中间数据生成逻辑
 * @param {any[]} data - 数据
 * @param {string} x - x字段
 * @param {string} y - y字段
 * @returns {boolean} - 是否匹配
 */
function checkXYFieldsMatch(data: any[], x: string, y: string): boolean {
  if (!Array.isArray(data) || data.length === 0) return true
  const keys = Object.keys(data[0])
  return keys.includes(x) && keys.includes(y)
}

/**
 * 在runPlotlyPython前后，自动检测x/y与data字段是否匹配，若不匹配则自动提示修复agent
 * 在autoFixWithCodeRepairAgent中runCodeFn前加检测
 * @param {string} code - LLM生成的Python代码
 * @param {any[]} data - 数据
 * @returns {Promise<any>} - 处理后的数据
 */
const originalRunCodeFn = runPlotlyPython
async function runCodeWithAutoFieldCheck(code: string, data: any[]): Promise<any> {
  // 尝试从code中提取x/y参数
  let x = '', y = ''
  const xMatch = code.match(/x\s*=\s*['\"]([^'\"]+)['\"]/)
  const yMatch = code.match(/y\s*=\s*['\"]([^'\"]+)['\"]/)
  if (xMatch) x = xMatch[1]
  if (yMatch) y = yMatch[1]
  if (x && y && !checkXYFieldsMatch(data, x, y)) {
    throw new Error(`[autoCheck] x/y字段与data不匹配，需先生成中间DataFrame。如需绘制"学科-平均分"，请先用原始data生成"学科-平均分"结构的数据，再绘图。`)
  }
  // 自动清洗fig.show等命令和data重新定义
  return await originalRunCodeFn(cleanPlotlyCode(code), data)
}

/**
 * 通用自动修复agent，支持多次修复尝试
 * @param {object} params - { userQuestion, plotData, lastCode, errorMsg, model, maxRetry, runCodeFn }
 * @returns {Promise<any>} - 修复后执行结果
 */
async function autoFixWithCodeRepairAgent({
  userQuestion,
  plotData,
  lastCode,
  errorMsg,
  model,
  maxRetry = 3,
  runCodeFn
}: {
  userQuestion: string,
  plotData: any[],
  lastCode: string,
  errorMsg: string,
  model: string,
  maxRetry?: number,
  runCodeFn: (code: string, data: any[]) => Promise<any>
}): Promise<any> {
  let tryCode = lastCode
  let lastError = errorMsg
  for (let fixCount = 0; fixCount <= maxRetry; fixCount++) {
    try {
      const errorAnalysis = await errorAnalysisAgent(userQuestion, tryCode, lastError, model)
      console.log('[错误推理agent] 执行状态: 成功')
      console.log('[错误推理agent] 错误分析：\n' + errorAnalysis)
      
      tryCode = await callCodeFixAgent({
        userQuestion,
        plotData,
        lastCode: tryCode,
        errorMsg: lastError,
        errorAnalysis: errorAnalysis
      }, model)
      return await runCodeFn(tryCode, plotData)
    } catch (e) {
      lastError = getErrorMsg(e)
    }
  }
  throw new Error(`[autoFixWithCodeRepairAgent] 执行状态: 失败（代码修复多次失败: ${lastError}）`)
}

/**
 * 智能绘图API（新版链路）
 * @param {Request} request - POST请求，包含question, data, columns
 * @returns {Promise<Response>} - plotly_figure及answer
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    // 修改获取模型的逻辑，优先使用前端传递的模型，其次是全局变量，最后是环境变量
    const frontendModel = body.model; // 前端传递的模型
    const globalModel = (globalThis as any).currentLLMModel; // 全局模型变量
    const defaultModel = process.env.MODEL_NAME || 'THUDM/GLM-4-9B-0414';
    
    // 优先级：前端传递 > 全局变量 > 环境变量默认值
    const model = frontendModel || globalModel || defaultModel;
    
    // 将选择的模型设置为全局变量，确保后续请求使用相同模型
    (globalThis as any).currentLLMModel = model;
    
    // 新增模型切换日志
    console.log(`[模型切换] 当前模型已切换为: ${model}，来源: ${frontendModel ? '前端传递' : (globalModel ? '全局变量' : '环境变量默认值')}`);
    
    const question = body.question
    const data = body.data || []
    if (!question || !Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: '缺少问题或数据' }, { status: 400 })
    }

    // 1. 字段提取agent：提取与绘图相关的字段和结构化数据
    const { plotFields, plotData } = await extractPlotFieldsAndData(question, data, model)
    console.log('[字段提取agent] 执行状态: 成功')
    console.log('[字段提取agent] 提取的字段：', JSON.stringify(plotFields))
    if (!plotFields.length) {
      return NextResponse.json({ error: '未能识别出可用字段' }, { status: 400 })
    }

    // 2. 数据处理逻辑agent：判断是否需要二次计算
    const dataStatus = await detectPlotDataStatus(question, plotFields, plotData, model)
    console.log('[数据处理逻辑agent] 执行状态:', dataStatus)
    let finalPlotData = plotData
    // 3. 绘图数据计算agent：如需，生成并执行pandas代码
    if (dataStatus === 'todo' || dataStatus === 'both') {
      let calcCode = ''
      let calcError = ''
      let calcResult = null
      // 先尝试一次
      try {
        calcResult = await calcPlotDataWithLLM(question, plotData, model)
        finalPlotData = calcResult
        console.log('[绘图数据计算agent] 执行状态: 成功')
      } catch (e) {
        calcError = getErrorMsg(e)
        // 自动进入多次修复agent
        try {
          finalPlotData = await autoFixWithCodeRepairAgent({
            userQuestion: question,
            plotData: plotData,
            lastCode: '', // 如能获取到上次代码可补充
            errorMsg: calcError,
            model,
            maxRetry: 3,
            runCodeFn: runCodeWithAutoFieldCheck
          })
          console.log('[代码修复agent] 执行状态: 成功')
        } catch (fixErr) {
          console.error('[代码修复agent] 执行状态: 失败')
          return NextResponse.json({ error: '[绘图数据计算agent] 数据二次计算及修复均失败', detail: String(fixErr) }, { status: 500 })
        }
      }
    }

    // 4. 智能绘图agent：用LLM生成plotly代码（只生成一次，不重试）
    const dataPreview = finalPlotData.slice(0, 5)
    const systemPrompt = buildUniversalPlotSystemPrompt(plotFields, dataPreview, question)
    console.log('[智能绘图agent] 执行状态: 已生成绘图需求')
    console.log('[智能绘图agent] systemPrompt内容：\n' + systemPrompt)
    
    // 智能代码生成agent：封装调用
    let llmCode = await callCodeGenAgent(systemPrompt, question, model)
    if (!llmCode || hasNoResultDefinition(llmCode)) {
      console.log('[智能代码生成agent] 执行状态: 失败（缺少result定义）')
      return NextResponse.json({ error: 'LLM未能生成有效的plotly代码（缺少result定义）' }, { status: 500 })
    }

    // 5. 执行plotly代码，失败则进入代码修复agent，最多修复3次
    let plotly_figure = null
    try {
      plotly_figure = await autoFixWithCodeRepairAgent({
        userQuestion: question,
        plotData: finalPlotData,
        lastCode: llmCode,
        errorMsg: '',
        model,
        maxRetry: 3,
        runCodeFn: runCodeWithAutoFieldCheck
      })
      console.log('[智能绘图主流程] 执行状态: 成功')
    } catch (e) {
      console.error('[智能绘图主流程] 执行状态: 失败（代码修复多次失败）')
      return NextResponse.json({ error: 'LLM代码生成及修复均失败', detail: getErrorMsg(e) }, { status: 500 })
    }

    // 6. 返回结构
    return NextResponse.json({
      answer: '已为你生成图表，支持下载PNG/SVG/HTML。',
      plotly_figure
    })
  } catch (error) {
    console.error('[智能绘图主流程] 执行状态: 失败', error)
    return NextResponse.json({ error: '处理绘图请求时发生错误' }, { status: 500 })
  }
} 
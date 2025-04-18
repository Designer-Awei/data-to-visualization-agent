import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

/**
 * 安全执行LLM生成的Python代码，返回result
 * @param {string} code - LLM生成的Python代码
 * @param {any[]} data - 数据
 * @returns {Promise<any>} - 计算结果
 */
async function runPythonCode(code: string, data: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const tmpData = path.join(process.cwd(), 'tmp_calc_data.json')
    const tmpCode = path.join(process.cwd(), 'tmp_calc_code.py')
    fs.writeFileSync(tmpData, JSON.stringify(data, null, 2))
    // 拼接完整python脚本
    let safeCode = code
    // 若没有print(json.dumps(result))，则在末尾补一行
    if (!/print\(json\.dumps\(result/.test(safeCode)) {
      safeCode += "\nprint(json.dumps(result, ensure_ascii=False))\n"
    }
    // 强制Python脚本全程utf-8输出，防止中文key乱码
    const pyCode = `import sys\nimport io\nsys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')\nsys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')\nimport json\nwith open(r'${tmpData}', 'r', encoding='utf-8') as f:\n    data = json.load(f)\n${safeCode}`
    fs.writeFileSync(tmpCode, pyCode)
    const py = spawn('python', [tmpCode])
    py.stdout.setEncoding('utf8')
    py.stderr.setEncoding('utf8')
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
        reject(new Error('Python计算脚本执行失败'))
      }
    })
  })
}

/**
 * 让LLM判断问题类型：是否需要数值计算、分析，还是两者都要
 * @param {string} question
 * @returns {Promise<'calc'|'analysis'|'both'>}
 */
async function judgeQuestionType(question: string): Promise<'calc'|'analysis'|'both'> {
  const prompt = `请判断下述用户问题属于哪一类，只能返回如下JSON：{ "type": "calc" }、{ "type": "analysis" } 或 { "type": "both" }。\n- "calc"表示需要数值计算（如均值、总分、差值等）\n- "analysis"表示只需分析总结数据亮点，无需计算\n- "both"表示既要计算又要分析\n用户问题：${question}`
  const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.SILICONFLOW_API_KEY}`
    },
    body: JSON.stringify({
      model: process.env.MODEL_NAME || 'Qwen/Qwen2.5-Coder-32B-Instruct',
      messages: [
        { role: 'system', content: '你是问题类型判断agent，只返回JSON结构。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 64
    })
  })
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  let typeJson = data.choices[0]?.message?.content || ''
  try {
    typeJson = typeJson.replace(/```json|```/g, '').trim()
    const { type } = JSON.parse(typeJson)
    if (type === 'calc' || type === 'analysis' || type === 'both') return type
    return 'analysis'
  } catch {
    return 'analysis'
  }
}

/**
 * 用LLM辅助从用户问题中提取字段名
 * @param {string} question
 * @param {string[]} allFields
 * @param {any[]} [dataRows] - 可选，数据样本，用于判断数值型字段
 * @returns {Promise<string[]>}
 */
async function extractFieldsFromQuestion(question: string, allFields: string[], dataRows?: any[]): Promise<string[]> {
  // 极简prompt
  const prompt = `你的任务是根据用户问题，从提供的"可用字段[]"中选取计算时需要的字段，放到"提取结果[]"下——\n用户问题: ${question}\n可用字段: ${JSON.stringify(allFields, null, 2)}\n提取结果: `
  const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.SILICONFLOW_API_KEY}`
    },
    body: JSON.stringify({
      model: process.env.MODEL_NAME || 'Qwen/Qwen2.5-Coder-32B-Instruct',
      messages: [
        { role: 'system', content: '你是字段提取agent，只返回JSON数组。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 128
    })
  })
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  let arrJson = data.choices[0]?.message?.content || '[]'
  try {
    arrJson = arrJson.replace(/```json|```/g, '').trim()
    const arr = JSON.parse(arrJson)
    // 关键增强：如果LLM返回["总分"]，则自动兜底为所有可用数值型字段
    if (Array.isArray(arr) && arr.length === 1 && arr[0] === '总分' && dataRows && dataRows.length > 0) {
      const sample = dataRows[0]
      const numericFields = Object.keys(sample).filter(k => typeof sample[k] === 'number')
      if (numericFields.length > 0) return numericFields
    }
    if (Array.isArray(arr) && arr.length > 0) return arr
    // 兜底：如果字段提取为空，自动返回所有可用数值型字段
    if (dataRows && dataRows.length > 0) {
      const sample = dataRows[0]
      const numericFields = Object.keys(sample).filter(k => typeof sample[k] === 'number')
      if (numericFields.length > 0) return numericFields
    }
    return allFields
  } catch {
    // 兜底：如果解析失败，返回所有可用字段
    return allFields
  }
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
      // 只对400/500等API错误重试，每次重试都再裁剪掉最早一条
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
 * 智能问答API，支持LLM问题类型判断，自动分流计算/分析/混合
 * @param {Request} request - POST请求，包含question, data, columns, messages
 * @returns {Promise<Response>} - LLM回答或计算结果
 */
export async function POST(request: Request) {
  try {
    const { question, data, columns, messages = [] } = await request.json()
    if (!question || typeof question !== 'string' || !question.trim()) {
      return NextResponse.json({ error: '请输入问题' }, { status: 400 })
    }
    // 字段提取agent：每轮都动态识别本轮涉及字段
    const allFields = columns || (data[0] ? Object.keys(data[0]) : [])
    const userFields = await extractFieldsFromQuestion(question, allFields, data)
    console.log('[字段提取agent] 用户问题:', question, '可用字段:', allFields, '提取结果:', userFields)
    // 检索本轮涉及字段的所有数据（前10条）
    const previewRows = (data || []).map((row: any) => {
      const filtered: any = {}
      userFields.forEach(f => filtered[f] = row[f])
      return filtered
    }).slice(0, 10)
    const dataPreview = JSON.stringify(previewRows, null, 2)
    // 自动裁剪messages长度，避免token超限和污染
    const safeMessages = (messages || []).slice(-5)
    // 动态拼接到system prompt，强制LLM只能输出Python代码块，且代码最后必须有result=...和print(json.dumps(result, ensure_ascii=False))
    let systemPrompt = `你是一个数据分析专家。无论用户如何提问，你只能输出Python代码块（用\`\`\`python ... \`\`\`包裹），且代码最后必须有如下格式：\nresult = {\n  \"字段1\": 值1,\n  \"字段2\": 值2,\n  ...\n}\nprint(json.dumps(result, ensure_ascii=False))\n不能输出其他print语句或分析文本，否则会被判为错误。\n你只能直接使用变量 data（类型为 list[dict]，每个 dict 的 key 为字段名），禁止使用 pd.read_excel、open、os、path 等任何本地文件读取操作，不能写 data = pd.read_excel(...)、data = open(...) 等语句。`
    systemPrompt += `\n涉及字段：${userFields.join('、')}`
    systemPrompt += `\n数据示例：${dataPreview}`
    // messages只保留对话内容，不再拼接数据
    const conversationMessages = [
      { role: 'system', content: systemPrompt },
      ...safeMessages,
      { role: 'user', content: question }
    ]
    /**
     * 参数检查：确保每条message的content非空且为字符串，整体长度不超过8000字符
     */
    for (const m of conversationMessages) {
      if (!m.content || typeof m.content !== 'string' || !m.content.trim()) {
        throw new Error(`LLM请求参数错误：存在空content字段，role=${m.role}`)
      }
    }
    const messagesStr = JSON.stringify(conversationMessages)
    if (messagesStr.length > 8000) {
      throw new Error(`LLM请求参数过大：messages总长度${messagesStr.length}，请减少字段或样本数量`)
    }
    // 打印实际传递给LLM的prompt内容，便于排查
    console.log('[LLM请求messages]', messagesStr)
    /**
     * 防御性过滤：只保留content为非空字符串的message，避免空content导致参数无效
     */
    const filteredMessages = conversationMessages.filter(m => m.content && typeof m.content === 'string' && m.content.trim())
    if (filteredMessages.length !== conversationMessages.length) {
      console.warn('[LLM参数修正] 已自动过滤掉空content的message')
    }
    let lastLLMAnswer = ''
    let lastCode = ''
    let lastError = ''
    let retry = 0
    let result = undefined // 每次循环前清空
    while (retry < 3) {
      result = undefined // 每次循环开始都清空，防止复用旧值
      /**
       * 循环内防御性过滤和参数检查：只保留content为非空字符串的message，避免空content导致参数无效
       */
      const filteredMessages = conversationMessages.filter(m => m.content && typeof m.content === 'string' && m.content.trim())
      if (filteredMessages.length !== conversationMessages.length) {
        console.warn('[LLM参数修正] 已自动过滤掉空content的message')
      }
      for (const m of filteredMessages) {
        if (!m.content || typeof m.content !== 'string' || !m.content.trim()) {
          throw new Error(`LLM请求参数错误：存在空content字段，role=${m.role}`)
        }
      }
      const messagesStr = JSON.stringify(filteredMessages)
      if (messagesStr.length > 8000) {
        throw new Error(`LLM请求参数过大：messages总长度${messagesStr.length}，请减少字段或样本数量`)
      }
      // 打印实际传递给LLM的prompt内容，便于排查
      console.log('[LLM请求messages]', messagesStr)
      const completion = await callLLMWithRetry({
        model: process.env.MODEL_NAME || 'Qwen/Qwen2.5-Coder-32B-Instruct',
        messages: filteredMessages,
        temperature: 0.3,
        max_tokens: 1024,
        top_p: 0.9,
        frequency_penalty: 0.5
      })
      let answer = completion.choices[0]?.message?.content || ''
      lastLLMAnswer = answer
      // 检查是否为Python代码
      const codeMatch = answer.match(/```python([\s\S]*?)```/)
      if (codeMatch) {
        const code = codeMatch[1].trim()
        lastCode = code
        // 校验代码是否包含result=和print(json.dumps(result
        if (!/result\s*=/.test(code) || !/print\s*\(\s*json\.dumps\s*\(\s*result/.test(code)) {
          retry++
          // 失败时追加assistant消息前，判断content非空
          const errorMsg = `上次生成的Python代码执行失败，错误信息：${lastError || '未知错误'}，请严格按要求输出：代码最后必须有result=...和print(json.dumps(result, ensure_ascii=False))，不能输出其他print或分析文本。`
          if (errorMsg && typeof errorMsg === 'string' && errorMsg.trim()) {
            conversationMessages.push({
              role: 'assistant',
              content: errorMsg
            })
          }
          continue
        }
        try {
          const result = await runPythonCode(code, data)
          console.log('[计算agent执行结果]', result)
          // 判断是否为单字段且为数值
          const isSingleField = userFields.length === 1 && (typeof result === 'number' || (typeof result === 'object' && Object.keys(result).length === 1))
          // 判断是否为单一数值但有中间结果（如差值）
          const isDiffWithIntermediate = typeof result === 'number' && Array.isArray(messages) && messages.length > 0 && /平均分|差值|中间结果/.test(question)
          // 结果溯源标记，确保传递给二次组织agent的结果100%来自Python
          const resultSource = 'python'
          // 二次组织agent prompt优化：只保留analysis字段，不再要求table结构
          let explainPrompt = ''
          explainPrompt = `你是一名数据分析专家。下方【计算结果】100%为后端Python真实执行所得，请严格以如下JSON格式输出：\n{\n  "analysis": "简明分析文本，需引用所有真实数值和关键信息"\n}\n请直接引用下方【计算结果】中的所有关键信息和数值，不能遗漏。\n【计算结果】：${JSON.stringify(result, null, 2)}\n请严格按照上述要求作答，只能输出JSON对象，不要输出多余内容。`;
          console.log('[二次组织agent输入prompt]', explainPrompt)
          const explainCompletion = await callLLMWithRetry({
            model: process.env.MODEL_NAME || 'Qwen/Qwen2.5-Coder-32B-Instruct',
            messages: [
              { role: 'system', content: '你是一个数据分析专家，只能输出严格结构化JSON对象。' },
              { role: 'user', content: explainPrompt }
            ],
            temperature: 0.3,
            max_tokens: 1024,
            top_p: 0.95,
            frequency_penalty: 0.3
          })
          const explainAnswer = explainCompletion.choices[0]?.message?.content || ''
          console.log('[二次组织agent LLM输出]', explainAnswer)
          // 解析结构化表格和分析文本
          let analysis = ''
          try {
            const jsonStr = explainAnswer.replace(/```json|```/g, '').trim()
            const parsed = JSON.parse(jsonStr)
            analysis = parsed.analysis || ''
            if (!analysis) {
              throw new Error('LLM输出内容为空或格式不符')
            }
          } catch (e) {
            analysis = `【LLM服务异常】输出内容解析失败：${e instanceof Error ? e.message : String(e)}，原始内容：${explainAnswer}`
          }
          let resultObj = result
          if (typeof result === 'number' && typeof (globalThis as any)._intermediateResults === 'object') {
            resultObj = { ...(globalThis as any)._intermediateResults, 差值: result }
          }
          // 返回结构中只保留analysis
          return NextResponse.json({ answer: { analysis }, code, result: resultObj, source: resultSource })
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e)
          retry++
          // 失败时追加assistant消息前，判断content非空
          const errorMsg = `上次生成的Python代码执行失败，错误信息：${lastError || '未知错误'}，请严格按要求输出：代码最后必须有result=...和print(json.dumps(result, ensure_ascii=False))，不能输出其他print或分析文本。`
          if (errorMsg && typeof errorMsg === 'string' && errorMsg.trim()) {
            conversationMessages.push({
              role: 'assistant',
              content: errorMsg
            })
          }
          continue
        }
      } else {
        // 没有代码，自动补assistant消息，强制LLM重试
        const retryMsg = '请只输出Python代码块（用```python ... ```包裹），且代码最后必须有result=...和print(json.dumps(result, ensure_ascii=False))，不能输出其他print或分析文本。'
        if (retryMsg && typeof retryMsg === 'string' && retryMsg.trim()) {
          conversationMessages.push({
            role: 'assistant',
            content: retryMsg
          })
        }
        continue
      }
    }
    // 连续三次都失败，直接返回错误提示，不再返回LLM口算结果
    return NextResponse.json({ error: '自动代码执行连续失败，请重试或联系管理员。', code: lastCode, detail: lastError }, { status: 500 })
  } catch (error) {
    console.error('智能问答API/计算agent错误:', error)
    // 兜底：无论如何都返回标准JSON，包含error、detail、code字段
    let errMsg = '处理问答请求时发生错误';
    let detail = '';
    let code = '';
    if (error instanceof Error) {
      errMsg = error.message || errMsg;
      detail = (error as any).stack || '';
      // 尝试解析API返回的JSON错误
      try {
        const parsed = JSON.parse(error.message)
        if (parsed && parsed.message) errMsg = parsed.message
        if (parsed && parsed.code) code = parsed.code
        if (parsed && parsed.data) detail = JSON.stringify(parsed.data)
      } catch {}
    } else if (typeof error === 'string') {
      errMsg = error;
    }
    if (!errMsg) errMsg = 'LLM API返回空响应';
    return NextResponse.json({ error: errMsg, detail, code }, { status: 500 });
  }
} 
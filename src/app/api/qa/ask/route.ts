import { NextResponse } from 'next/server'
import { OpenAI } from 'openai'
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
 * @param {OpenAI} client
 * @param {string} question
 * @returns {Promise<'calc'|'analysis'|'both'>}
 */
async function judgeQuestionType(client: any, question: string): Promise<'calc'|'analysis'|'both'> {
  const prompt = `请判断下述用户问题属于哪一类，只能返回如下JSON：{ "type": "calc" }、{ "type": "analysis" } 或 { "type": "both" }。\n- "calc"表示需要数值计算（如均值、总分、差值等）\n- "analysis"表示只需分析总结数据亮点，无需计算\n- "both"表示既要计算又要分析\n用户问题：${question}`
  const res = await client.chat.completions.create({
    model: process.env.MODEL_NAME || 'Qwen/Qwen2.5-Coder-32B-Instruct',
    messages: [
      { role: 'system', content: '你是问题类型判断agent，只返回JSON结构。' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2,
    max_tokens: 64
  })
  let typeJson = res.choices[0]?.message?.content || ''
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
 * @param {OpenAI} client
 * @param {string} question
 * @param {string[]} allFields
 * @returns {Promise<string[]>}
 */
async function extractFieldsFromQuestion(client: any, question: string, allFields: string[]): Promise<string[]> {
  const prompt = `请从下列问题中提取所有涉及的字段名，字段名必须严格来自于：${allFields.join('、')}，只返回JSON数组。\n用户问题：${question}`
  const res = await client.chat.completions.create({
    model: process.env.MODEL_NAME || 'Qwen/Qwen2.5-Coder-32B-Instruct',
    messages: [
      { role: 'system', content: '你是字段提取agent，只返回JSON数组。' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2,
    max_tokens: 128
  })
  let arrJson = res.choices[0]?.message?.content || '[]'
  try {
    arrJson = arrJson.replace(/```json|```/g, '').trim()
    const arr = JSON.parse(arrJson)
    if (Array.isArray(arr)) return arr
    return []
  } catch {
    return []
  }
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
    // 构造系统prompt
    let systemPrompt = '你是一个数据分析专家，请根据数据和用户问题，给出专业、简明的自然语言答案。如涉及数值计算，请生成一段Python代码（只输出代码，不要解释说明），数据变量名为data，类型为list[dict]，每个dict的key为字段名，代码最后必须有：result = ...（result为最终计算结果）。'
    if (data && Array.isArray(data) && data.length > 0) {
      const previewRows = data.slice(0, 10)
      const dataPreview = JSON.stringify(previewRows, null, 2)
      systemPrompt += `\n当前数据集包含 ${data.length} 条记录，字段有：${columns || Object.keys(data[0])}\n数据示例：${dataPreview}`
    }
    // 调用SiliconFlow LLM
    const client = new OpenAI({
      apiKey: process.env.SILICONFLOW_API_KEY,
      baseURL: 'https://api.siliconflow.cn/v1'
    })
    // 1. LLM辅助字段提取
    const allFields = columns || (data[0] ? Object.keys(data[0]) : [])
    const userFields = await extractFieldsFromQuestion(client, question, allFields)
    // 2. 先判断问题类型
    const qType = await judgeQuestionType(client, question)
    if (qType === 'analysis') {
      // 只需分析总结
      const analysisPrompt = `你是数据分析专家，请根据下方数据和用户问题，直接用中文分析和总结数据亮点，不要生成代码。\n用户问题：${question}\n涉及字段：${userFields.join('、')}\n数据示例：${JSON.stringify(data.slice(0, 10), null, 2)}`
      const analysisRes = await client.chat.completions.create({
        model: process.env.MODEL_NAME || 'Qwen/Qwen2.5-Coder-32B-Instruct',
        messages: [
          { role: 'system', content: '你是一个数据分析专家，善于用中文详细分析数据。' },
          { role: 'user', content: analysisPrompt }
        ],
        temperature: 0.4,
        max_tokens: 1024,
        top_p: 0.95,
        frequency_penalty: 0.3
      })
      const answer = analysisRes.choices[0]?.message?.content || '未能分析出有益信息。'
      return NextResponse.json({ answer })
    }
    // 3. 只需计算或需要计算+分析
    // 构造对话历史，强制LLM只用userFields
    const conversationMessages = [
      { role: 'system', content: systemPrompt + `\n请严格只对下列字段进行计算：${userFields.join('、')}，不要遗漏。` },
      ...messages.slice(-5),
      { role: 'user', content: question }
    ]
    let lastLLMAnswer = ''
    let lastCode = ''
    let lastError = ''
    let retry = 0
    // 自动裁剪messages长度，避免token超限和污染
    const safeMessages = (messages || []).slice(-5)
    // LLM API调用自动重试机制，所有调用都用safeMessages
    const callLLMWithRetry = async (params: any, maxRetry = 2) => {
      let lastError: any = null
      let tryMessages = params.messages || safeMessages
      for (let i = 0; i <= maxRetry; i++) {
        try {
          return await client.chat.completions.create({ ...params, messages: tryMessages })
        } catch (e: any) {
          lastError = e
          // 只对400/500等API错误重试，每次重试都再裁剪掉最早一条
          if (e && (e.status === 400 || e.status === 500) && tryMessages.length > 1) {
            tryMessages = tryMessages.slice(1)
          } else {
            break
          }
        }
      }
      throw lastError
    }
    while (retry < 3) {
      const completion = await callLLMWithRetry({
        model: process.env.MODEL_NAME || 'Qwen/Qwen2.5-Coder-32B-Instruct',
        messages: conversationMessages,
        temperature: 0.3,
        max_tokens: 1024,
        top_p: 0.9,
        frequency_penalty: 0.5
      })
      let answer = completion.choices[0]?.message?.content || '抱歉，未能给出答案。'
      lastLLMAnswer = answer
      // 检查是否为Python代码
      const codeMatch = answer.match(/```python([\s\S]*?)```/)
      if (codeMatch) {
        // 提取代码并执行
        const code = codeMatch[1].trim()
        lastCode = code
        // 计算agent执行前打印输入数据和代码
        console.log('[计算agent输入数据]', data)
        console.log('[计算agent生成代码]', code)
        try {
          const result = await runPythonCode(code, data)
          console.log('[计算agent执行结果]', result)
          // 判断是否为单字段且为数值
          const isSingleField = userFields.length === 1 && (typeof result === 'number' || (typeof result === 'object' && Object.keys(result).length === 1))
          // 判断是否为单一数值但有中间结果（如差值）
          const isDiffWithIntermediate = typeof result === 'number' && Array.isArray(messages) && messages.length > 0 && /平均分|差值|中间结果/.test(question)
          let explainPrompt = ''
          if (isSingleField && !isDiffWithIntermediate) {
            // 单字段，直接给出字段名和值，要求LLM照抄
            const fieldName = userFields[0] || (typeof result === 'object' ? Object.keys(result)[0] : '')
            const avg = typeof result === 'number' ? result : (typeof result === 'object' ? Object.values(result)[0] : '')
            explainPrompt = `你是一名数据分析专家。请严格以如下JSON格式输出：\n{\n  \"table\": [\n    {\"科目\": \"${fieldName}\", \"平均分\": ${Number(avg).toFixed(2)}}\n  ],\n  \"analysis\": \"简明分析文本\"\n}\n请直接引用上方科目和平均分，不能写其他字段名。`;
          } else if (typeof result === 'number') {
            // 差值/总分等单一数值，需带中间结果
            explainPrompt = `你是一名数据分析专家。请根据下方【计算结果】智能判断：\n- 如果【计算结果】是单一数值（如差值、总分等），请只输出如下JSON对象：\n  {\n    \"analysis\": \"简明分析文本，需引用所有中间结果和最终数值\"\n  }\n- 如果【计算结果】是对象（如多科目平均分），请输出如下JSON对象：\n  {\n    \"table\": [\n      {\"科目\": \"真实字段名\", \"平均分\": 数值},\n      ...\n    ],\n    \"analysis\": \"简明分析文本\"\n  }\n所有小数结果默认保留两位小数，analysis需引用所有中间结果和最终数值。请严格按照上述要求作答，只能输出JSON对象，不要输出多余内容。\n【计算结果】：${JSON.stringify(result, null, 2)}`;
          } else {
            // 多字段，按原有逻辑
            explainPrompt = `你是一名数据分析专家。请严格以如下JSON格式输出：\n{\n  \"table\": [\n    {\"科目\": \"这里填写真实字段名\", \"平均分\": 数值},\n    ...\n  ],\n  \"analysis\": \"简明分析文本\"\n}\n所有小数结果默认保留两位小数，顺序与下方【计算结果】JSON一致，科目字段必须与【计算结果】中的key完全一致，不得写'字段名'或其他占位符。analysis需引用真实数值。\n【计算结果】：${JSON.stringify(result, null, 2)}\n请严格按照上述要求作答，只能输出JSON对象，不要输出多余内容。`;
          }
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
          let table = []
          let analysis = ''
          try {
            const jsonStr = explainAnswer.replace(/```json|```/g, '').trim()
            const parsed = JSON.parse(jsonStr)
            table = parsed.table || []
            analysis = parsed.analysis || ''
            // 若无table和analysis，强制输出错误提示
            if (!table.length && !analysis) {
              throw new Error('LLM输出内容为空或格式不符')
            }
          } catch (e) {
            // fallback: 兼容旧格式或异常，始终返回标准JSON
            analysis = `【LLM服务异常】输出内容解析失败：${e instanceof Error ? e.message : String(e)}，原始内容：${explainAnswer}`
          }
          // 计算agent执行后，自动组装中间结果和最终结果
          let resultObj = result
          if (typeof result === 'number' && typeof (globalThis as any)._intermediateResults === 'object') {
            // 若有全局中间结果，合并
            resultObj = { ...(globalThis as any)._intermediateResults, 差值: result }
          }
          return NextResponse.json({ answer: { table, analysis }, code, result: resultObj })
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e)
          retry++
          // 增加一条assistant消息，提示代码执行失败，促使LLM重新生成代码。
          conversationMessages.push({ role: 'assistant', content: `上次生成的Python代码执行失败，错误信息：${lastError}，请重新生成更正确的代码。` })
          continue
        }
      } else {
        // 没有代码，直接返回LLM口算结果
        return NextResponse.json({ answer })
      }
    }
    // 连续三次都失败，返回LLM口算结果并备注
    return NextResponse.json({ answer: lastLLMAnswer + '\n【警告：自动代码执行连续失败，已返回LLM口算结果，可能不准确】', code: lastCode, error: lastError })
  } catch (error) {
    console.error('智能问答API/计算agent错误:', error)
    // 兜底：无论如何都返回标准JSON
    let errMsg = '处理问答请求时发生错误';
    if (error instanceof Error) {
      errMsg = error.message || errMsg;
    } else if (typeof error === 'string') {
      errMsg = error;
    }
    // 若异常内容为空，也要兜底
    if (!errMsg) errMsg = 'LLM API返回空响应';
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
} 
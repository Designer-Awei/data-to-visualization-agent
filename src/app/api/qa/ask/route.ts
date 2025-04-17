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
    const pyCode = `import json\nwith open(r'${tmpData}', 'r', encoding='utf-8') as f:\n    data = json.load(f)\n${code}\nprint(json.dumps(result, ensure_ascii=False))\n`
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
    while (retry < 3) {
      const completion = await client.chat.completions.create({
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
        try {
          const result = await runPythonCode(code, data)
          // 二次LLM解释环节
          if (qType === 'both') {
            // 先计算再分析，合并自然语言输出，强制LLM引用真实计算结果
            const explainPrompt = `你是一名数据分析专家。请根据以下信息，先用简明自然语言解释【指定的计算结果】，再进一步分析数据亮点：\n- 用户问题：${question}\n- 计算代码：\n${code}\n- 涉及字段：${userFields.join('、')}\n- 【计算结果】：${JSON.stringify(result)}\n请务必直接引用【计算结果】中的数值，不要自行推算或更改。先解释思路和结论，再补充数据分析建议。`
            const explainCompletion = await client.chat.completions.create({
              model: process.env.MODEL_NAME || 'Qwen/Qwen2.5-Coder-32B-Instruct',
              messages: [
                { role: 'system', content: '你是一个数据分析专家，善于用中文详细解释数据分析和计算过程。' },
                { role: 'user', content: explainPrompt }
              ],
              temperature: 0.4,
              max_tokens: 1024,
              top_p: 0.95,
              frequency_penalty: 0.3
            })
            const explainAnswer = explainCompletion.choices[0]?.message?.content || `计算结果：${JSON.stringify(result)}`
            return NextResponse.json({ answer: explainAnswer, code, result })
          } else {
            // 只需计算
            const explainPrompt = `你是一名数据分析专家。请根据以下信息，用简明自然语言回答用户问题，并展示详细的计算过程：\n- 用户问题：${question}\n- 计算代码：\n${code}\n- 涉及字段：${userFields.join('、')}\n- 计算结果：${JSON.stringify(result)}\n请先解释思路，再展示计算过程，最后给出结论。`
            const explainCompletion = await client.chat.completions.create({
              model: process.env.MODEL_NAME || 'Qwen/Qwen2.5-Coder-32B-Instruct',
              messages: [
                { role: 'system', content: '你是一个数据分析专家，善于用中文详细解释数据分析和计算过程。' },
                { role: 'user', content: explainPrompt }
              ],
              temperature: 0.4,
              max_tokens: 1024,
              top_p: 0.95,
              frequency_penalty: 0.3
            })
            const explainAnswer = explainCompletion.choices[0]?.message?.content || `计算结果：${JSON.stringify(result)}`
            return NextResponse.json({ answer: explainAnswer, code, result })
          }
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e)
          retry++
          // 增加一条assistant消息，提示代码执行失败，促使LLM重新生成代码
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
    return NextResponse.json({ error: '处理问答请求时发生错误' }, { status: 500 })
  }
} 
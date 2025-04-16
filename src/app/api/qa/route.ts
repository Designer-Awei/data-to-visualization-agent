/**
 * 问答API路由处理程序
 */
import { NextResponse } from 'next/server'
import { OpenAI } from 'openai'

// 初始化OpenAI客户端
const client = new OpenAI({
  apiKey: process.env.SILICONFLOW_API_KEY,
  baseURL: 'https://api.siliconflow.cn/v1'
})

export async function POST(request: Request) {
  try {
    const { question, model = 'THUDM/GLM-4-9B-0414', data } = await request.json()

    if (!question) {
      return NextResponse.json(
        { error: '问题不能为空' },
        { status: 400 }
      )
    }

    if (!data || !Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { error: '请先上传数据' },
        { status: 400 }
      )
    }

    // 构建数据摘要
    const dataSummary = {
      totalRows: data.length,
      columns: Object.keys(data[0]),
      sampleData: data.slice(0, 5), // 前5条数据作为样本
      dataStats: {}
    }

    // 计算每列的基本统计信息
    for (const column of dataSummary.columns) {
      const values = data.map(row => row[column])
      const numericValues = values.filter(v => !isNaN(Number(v)))
      
      dataSummary.dataStats[column] = {
        type: numericValues.length === values.length ? 'numeric' : 'categorical',
        uniqueValues: new Set(values).size,
        hasNulls: values.some(v => v === null || v === undefined || v === ''),
        ...(numericValues.length > 0 && {
          min: Math.min(...numericValues),
          max: Math.max(...numericValues),
          avg: numericValues.reduce((a, b) => a + Number(b), 0) / numericValues.length
        })
      }
    }

    // 构建系统提示词
    const systemPrompt = `你是一个专业的数据分析助手。我会给你一些数据和问题，请你帮我分析数据并回答问题。

数据概述：
- 总行数：${dataSummary.totalRows}
- 列名：${dataSummary.columns.join(', ')}

数据统计信息：
${Object.entries(dataSummary.dataStats)
  .map(([col, stats]) => `${col}: 
  - 类型: ${stats.type}
  - 唯一值数量: ${stats.uniqueValues}
  - 是否包含空值: ${stats.hasNulls}
  ${stats.type === 'numeric' ? `- 最小值: ${stats.min}\n  - 最大值: ${stats.max}\n  - 平均值: ${stats.avg.toFixed(2)}` : ''}`)
  .join('\n')}

样本数据：
${JSON.stringify(dataSummary.sampleData, null, 2)}

完整数据集：
${JSON.stringify(data)}

要求：
1. 基于提供的数据进行分析和回答
2. 如果需要可视化，请说明使用什么类型的图表更合适
3. 回答要客观专业，给出具体的数据支持
4. 如果数据不足以回答问题，请明确指出
5. 使用中文回答`

    try {
      const completion = await client.chat.completions.create({
        model: model,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: question
          }
        ],
        temperature: 0.7,
        top_p: 0.9,
        top_k: 50,
        frequency_penalty: 0.5,
        stream: false,
        max_tokens: 4096
      })

      const answer = completion.choices[0]?.message?.content || ''
      
      // 计算置信度（基于回答的完整性和数据支持）
      const confidence = Math.min(
        0.95,
        Math.max(0.6, answer.length / 1000)
      )

      return NextResponse.json({
        answer,
        confidence,
        relatedData: dataSummary.sampleData // 返回样本数据作为相关数据
      })

    } catch (error: any) {
      // 处理常见错误码
      const statusCode = error.response?.status || 500
      let errorMessage = '服务器内部错误'

      switch (statusCode) {
        case 400:
          errorMessage = '请求参数错误，请检查输入'
          break
        case 401:
          errorMessage = 'API密钥无效或已过期'
          break
        case 403:
          errorMessage = '没有权限使用该模型，可能需要实名认证'
          break
        case 429:
          errorMessage = '请求频率超限，请稍后再试'
          break
        case 503:
        case 504:
          errorMessage = '模型服务暂时不可用，请稍后再试'
          break
      }

      console.error('LLM API错误:', error)
      return NextResponse.json(
        { 
          error: errorMessage,
          details: error.response?.data || error.message
        },
        { status: statusCode }
      )
    }

  } catch (error) {
    console.error('请求处理错误:', error)
    return NextResponse.json(
      { error: '处理请求时发生错误' },
      { status: 500 }
    )
  }
}
/**
 * LLM 工具函数
 * @module utils/llm
 * @description 封装与LLM API交互的工具函数
 */

/**
 * 用fetch直连SiliconFlow LLM API，兼容OpenAI chat.completions.create参数
 * @param {object} params - 请求参数，需包含model、messages等
 * @param {number} [maxRetry=2] - 最大重试次数
 * @returns {Promise<any>} - LLM响应
 */
export async function callLLMWithRetry(params: any, maxRetry = 2) {
  let lastError: any = null
  let tryMessages = params.messages || []
  
  for (let i = 0; i <= maxRetry; i++) {
    try {
      // 记录当前使用的模型
      if (i === 0 && params.model) {
        console.log('[LLM调用] 当前模型:', params.model)
      }
      
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
/**
 * 数据问答组件
 * 提供基于数据的智能问答功能
 */
'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Input, Button, Card, Spin, Alert, Typography, Select, Upload, Avatar, Modal } from 'antd'
import { SendOutlined, InboxOutlined, UserOutlined, RobotOutlined, SettingOutlined } from '@ant-design/icons'
import { QAState, QAResponse, DataState, Message } from '@/types/qa'
import type { UploadProps } from 'antd'
import { message } from 'antd'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './qa-markdown.css'
import dynamic from 'next/dynamic'

const { TextArea } = Input
const { Title, Text, Paragraph } = Typography
const { Option } = Select
const { Dragger } = Upload

// @ts-ignore
// eslint-disable-next-line
declare module 'react-plotly.js';

// Plot 组件类型兼容 any
const Plot: any = dynamic(() => import('react-plotly.js'), { ssr: false })

/**
 * 分割Markdown内容为有序片段数组，保留正文和代码块原始顺序
 * @param content LLM返回的完整内容
 * @returns {Array<{type: 'text', content: string} | {type: 'code', lang: string, code: string}>}
 */
function splitMarkdownSegments(content: string): Array<{type: 'text', content: string} | {type: 'code', lang: string, code: string}> {
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let match;
  let lastIndex = 0;
  const segments: Array<{type: 'text', content: string} | {type: 'code', lang: string, code: string}> = [];
  while ((match = codeBlockRegex.exec(content)) !== null) {
    // 前面的正文片段
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    // 代码块片段
    segments.push({ type: 'code', lang: match[1], code: match[2] });
    lastIndex = match.index + match[0].length;
  }
  // 剩余正文
  if (lastIndex < content.length) {
    segments.push({ type: 'text', content: content.slice(lastIndex) });
  }
  // 修复：正文片段结尾为列表项且下一个片段为代码块时，自动补空行
  for (let i = 0; i < segments.length - 1; i++) {
    const curr = segments[i];
    const next = segments[i + 1];
    if (
      curr.type === 'text' &&
      next.type === 'code' &&
      /(^|\n)\s*(\d+\.|[-*+])\s+/.test(curr.content.trim().split('\n').slice(-1)[0]) &&
      !curr.content.endsWith('\n')
    ) {
      curr.content += '\n';
    }
  }
  return segments;
}

type QAStateFixed = QAState & { plotlyFigure?: any }

// 开场白初始化
const initialMessages = [
  {
    role: 'assistant',
    content: '你好，我是数据可视化智能助手，能够基于您提供的数据问答与绘图！'
  }
]

export const QA: React.FC = () => {
  const [state, setState] = useState<QAStateFixed>({
    question: '',
    isLoading: false,
    error: null,
    answer: null,
    model: 'THUDM/GLM-4-9B-0414',
    data: null,
    messages: initialMessages as Message[],
    plotlyFigure: null
  })

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chartPreviewRef = useRef<HTMLDivElement>(null)

  // 仅在成功生成图表时自动滚动到底部
  useEffect(() => {
    if (state.plotlyFigure) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
      setTimeout(() => {
        chartPreviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
      }, 300)
    }
  }, [state.plotlyFigure])

  const [inputDisabled, setInputDisabled] = useState(false) // 是否禁用输入
  const [abortController, setAbortController] = useState<AbortController | null>(null) // 控制fetch中断
  const [isAborting, setIsAborting] = useState(false) // 是否正在打断
  const [showKeyModal, setShowKeyModal] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeyStatus, setApiKeyStatus] = useState<'idle'|'validating'|'success'|'error'>('idle')
  const [apiKeyMsg, setApiKeyMsg] = useState('')

  // 检查本地env.local密钥（通过window.__ENV__或process.env注入，实际部署时可用）
  const hasEnvApiKey = !!process.env.SILICONFLOW_API_KEY || (typeof window !== 'undefined' && (window as any).__ENV__?.SILICONFLOW_API_KEY)

  // 保存API密钥到localStorage
  const saveApiKey = () => {
    if (!apiKeyInput.trim()) {
      setApiKeyStatus('error')
      setApiKeyMsg('请输入API密钥')
      return
    }
    localStorage.setItem('SILICONFLOW_API_KEY', apiKeyInput.trim())
    setApiKeyStatus('success')
    setApiKeyMsg('密钥已保存！')
  }

  // 验证API密钥有效性
  const validateApiKey = async () => {
    setApiKeyStatus('validating')
    setApiKeyMsg('正在验证...')
    try {
      // 用密钥请求一次SiliconFlow LLM接口
      const resp = await fetch('https://api.siliconflow.cn/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKeyInput.trim()}` }
      })
      if (resp.ok) {
        setApiKeyStatus('success')
        setApiKeyMsg('密钥有效！')
      } else {
        setApiKeyStatus('error')
        setApiKeyMsg('密钥无效或无权限')
      }
    } catch {
      setApiKeyStatus('error')
      setApiKeyMsg('网络异常，验证失败')
    }
  }

  // 读取localStorage密钥（仅在无env密钥时生效）
  useEffect(() => {
    if (!hasEnvApiKey) {
      const localKey = typeof window !== 'undefined' ? localStorage.getItem('SILICONFLOW_API_KEY') : ''
      if (localKey) setApiKeyInput(localKey)
    }
  }, [hasEnvApiKey])

  /**
   * 处理问题输入变化
   */
  const handleQuestionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setState(prev => ({
      ...prev,
      question: e.target.value,
      error: null
    }))
  }

  /**
   * 处理模型选择变化
   */
  const handleModelChange = (value: string) => {
    setState(prev => ({
      ...prev,
      model: value,
      error: null
    }))
  }

  // 文件上传配置
  const uploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    action: '/api/data/upload',
    accept: '.csv,.xlsx,.xls',
    onChange(info) {
      const { status } = info.file
      if (status === 'uploading') {
        setState(prev => ({ ...prev, isLoading: true }))
      }
      if (status === 'done') {
        const responseData = info.file.response.data as DataState
        setState(prev => ({
          ...prev,
          isLoading: false,
          data: responseData,
          error: null,
          messages: [] // 上传新文件后自动清空历史消息
        }))
        message.success(`${info.file.name} 文件解析成功`)
      } else if (status === 'error') {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: `${info.file.name} 文件上传失败`
        }))
        // 新增：输出后端返回的详细错误到浏览器控制台
        const errorMsg = info.file?.response?.error
        if (errorMsg) {
          // 控制台输出详细后端错误
          // eslint-disable-next-line no-console
          console.error(`[文件上传] 后端返回错误: ${errorMsg}`)
          message.error(`${info.file.name} 上传失败: ${errorMsg}`)
        } else {
          message.error(`${info.file.name} 文件上传失败`)
        }
      }
    }
  }

  /**
   * 提交问题到后端API
   * 发送后立即清空输入框并禁用输入，等待回复或打断后恢复
   * 页面展示完整历史，API只发最近一轮问答
   * @returns {Promise<void>}
   */
  const handleSubmit = async () => {
    if (!state.question.trim() || state.isLoading) return
    setInputDisabled(true)
    setIsAborting(false)
    // 页面展示：累加所有历史消息
    setState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
      question: '',
      messages: [...prev.messages, { role: 'user', content: prev.question }]
    }))
    const controller = new AbortController()
    setAbortController(controller)
    // 构造仅最近一轮有效问答的 messages 作为 API 参数
    let lastAssistantMsg: Message | null = null
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const m = state.messages[i]
      if (m.role === 'assistant' && m.content && typeof m.content === 'string' && m.content.trim()) {
        lastAssistantMsg = m
        break
      }
    }
    const apiMessages: Message[] = lastAssistantMsg
      ? [lastAssistantMsg, { role: 'user', content: state.question }]
      : [{ role: 'user', content: state.question }]
    // 防御性过滤
    const safeApiMessages: Message[] = apiMessages.filter(m => m.content && typeof m.content === 'string' && m.content.trim())
    try {
      const response = await fetch('/api/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: state.question,
          model: state.model,
          data: state.data?.rows,
          messages: safeApiMessages
        }),
        signal: controller.signal
      })
      if (!response.ok) {
        let errorMsg = `请求失败，状态码${response.status}`
        let errorDetail = ''
        try {
          const errorData = await response.json()
          errorMsg = errorData.error || errorMsg
          errorDetail = errorData.detail || ''
        } catch {}
        /**
         * 优化：将error和detail都塞入assistant消息，便于前端渲染详细错误
         */
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: errorMsg + (errorDetail ? `\n${errorDetail}` : ''),
          messages: [
            ...prev.messages,
            {
              role: 'assistant',
              content: errorMsg + (errorDetail ? `\n${errorDetail}` : ''),
              error: errorMsg,
              detail: errorDetail,
              confidence: undefined
            } as Message
          ]
        }))
        setInputDisabled(false)
        setAbortController(null)
        return
      }
      const data: QAResponse = await response.json()
      const aiMessage: Message = {
        role: 'assistant',
        content: data.answer,
        confidence: data.confidence
      }
      setState(prev => ({
        ...prev,
        answer: data,
        isLoading: false,
        messages: [...prev.messages, aiMessage]
      }))
      setInputDisabled(false)
      setAbortController(null)
      if ((data as any).plotly_figure) setState(prev => ({ ...prev, plotlyFigure: (data as any).plotly_figure }))
    } catch (error: any) {
      let errMsg = error?.message || '发生错误，请稍后重试'
      setState(prev => ({
        ...prev,
        error: errMsg,
        isLoading: false,
        messages: [
          ...state.messages,
          {
            role: 'assistant',
            content: `【LLM服务异常】${errMsg || '未知错误'}`,
            confidence: undefined
          } as Message
        ]
      }))
      setInputDisabled(false)
      setAbortController(null)
      setIsAborting(false)
    }
  }

  /**
   * 打断回复
   */
  const handleAbort = () => {
    if (abortController) {
      setIsAborting(true)
      abortController.abort()
    }
  }

  // 新增：处理按回车发送
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="space-y-6">
      {/* 右上角齿轮设置按钮 */}
      <div style={{ position: 'absolute', top: 24, right: 32, zIndex: 20 }}>
        <Button shape="circle" icon={<SettingOutlined />} onClick={() => setShowKeyModal(true)} />
      </div>
      {/* API密钥设置弹窗 */}
      <Modal
        title="SiliconFlow API密钥设置"
        open={showKeyModal}
        onCancel={() => setShowKeyModal(false)}
        footer={null}
      >
        <div style={{ marginBottom: 12 }}>
          <Input.Password
            placeholder="请输入SiliconFlow API密钥"
            value={apiKeyInput}
            onChange={e => setApiKeyInput(e.target.value)}
            disabled={hasEnvApiKey}
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button type="primary" onClick={saveApiKey} disabled={hasEnvApiKey}>保存到本地</Button>
          <Button onClick={validateApiKey} disabled={hasEnvApiKey || !apiKeyInput.trim()}>验证密钥</Button>
        </div>
        <div style={{ marginTop: 8, color: apiKeyStatus === 'error' ? 'red' : apiKeyStatus === 'success' ? 'green' : '#888' }}>{apiKeyMsg}</div>
        {hasEnvApiKey && <div style={{ marginTop: 12, color: '#888' }}>当前已通过服务器环境变量配置密钥，前端本地密钥仅在无env.local时生效。</div>}
      </Modal>
      {/* 文件上传区域 */}
      <div className="bg-white p-6 rounded-lg shadow-sm">
        <h3 className="text-lg font-medium mb-4">上传数据</h3>
        <Dragger {...uploadProps}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
          <p className="ant-upload-hint">支持 Excel 和 CSV 格式的数据文件</p>
        </Dragger>
        
        {/* 数据预览 */}
        {state.data && state.data.rows && state.data.columns && (
          <div className="mt-4">
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-sm font-medium">数据预览</h4>
              <span className="text-sm text-gray-500">
                共 {state.data.totalRows} 条数据
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {state.data!.columns.map((column: string) => (
                      <th
                        key={column}
                        className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {state.data.rows.slice(0, 5).map((row: Record<string, any>, index: number) => (
                    <tr key={index}>
                      {state.data!.columns.map((column: string) => (
                        <td key={column} className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                          {row[column]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 问答区域 */}
      <div className="bg-white p-6 rounded-lg shadow-sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              选择模型
            </label>
            <Select
              value={state.model}
              onChange={handleModelChange}
              className="w-full"
              options={[
                { 
                  value: 'THUDM/GLM-4-9B-0414', 
                  label: 'THUDM/GLM-4-9B-0414 (默认，32K文本，免费)' 
                },
                { 
                  value: 'Qwen/Qwen2.5-7B-Instruct', 
                  label: 'Qwen/Qwen2.5-7B-Instruct (备选，32K文本，免费)' 
                },
                { 
                  value: 'THUDM/GLM-Z1-32B-0414', 
                  label: 'THUDM/GLM-Z1-32B-0414 (备选，32K文本，付费)' 
                },
                { 
                  value: 'deepseek-ai/DeepSeek-V3', 
                  label: 'deepseek-ai/DeepSeek-V3 (备选，64k文本，付费)' 
                }
              ]}
            />
          </div>

          {/* 对话历史区域 */}
          <div className="bg-gray-50 rounded-lg p-4 h-96 overflow-y-auto">
            {state.messages.map((msg, index) => {
              if (msg.role === 'assistant') {
                /**
                 * 优化：优先渲染content，其次渲染error/detail，最后才兜底显示未知错误
                 */
                let safeContent = msg.content
                // 若content为空，尝试用error/detail补充
                if (
                  safeContent === undefined ||
                  safeContent === null ||
                  (typeof safeContent === 'string' && !safeContent.trim()) ||
                  (typeof safeContent === 'object' && (!safeContent || Object.keys(safeContent).length === 0))
                ) {
                  if ('error' in msg || 'detail' in msg) {
                    safeContent = `${('error' in msg ? msg.error : '')}${('detail' in msg ? '\n' + msg.detail : '')}`
                  } else {
                    safeContent = '【LLM服务异常】未知错误'
                  }
                }
                // 新增：只返回 analysis 时直接渲染 analysis
                if (typeof safeContent === 'object' && (safeContent as any).analysis) {
                  return (
                    <div key={index} className={`flex items-start space-x-3 mb-4`}>
                      <Avatar icon={<RobotOutlined />} className="bg-green-500" />
                      <div className="max-w-[70%] bg-white p-3 rounded-lg shadow">
                        <div className="markdown-body">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{(safeContent as any).analysis}</ReactMarkdown>
                        </div>
                        {msg.confidence && (
                          <div className="mt-1 text-xs text-gray-500">
                            置信度：{Math.round(msg.confidence * 100)}%
                          </div>
                        )}
                      </div>
                    </div>
                  )
                } else if (typeof safeContent === 'object' && (safeContent as any).table) {
                  // 渲染表格和分析
                  return (
                    <div key={index} className={`flex items-start space-x-3 mb-4`}>
                      <Avatar icon={<RobotOutlined />} className="bg-green-500" />
                      <div className="max-w-[70%] bg-white p-3 rounded-lg shadow">
                        <table className="markdown-body">
                          <thead>
                            <tr>
                              {Object.keys((safeContent as any).table[0] || {}).map((key) => (
                                <th key={key}>{String(key)}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(safeContent as any).table.map((row: any, idx: number) => (
                              <tr key={idx}>
                                {Object.values(row).map((val, i) => (
                                  <td key={i}>{String(val)}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div style={{ marginTop: 12, color: '#333' }}>{String((safeContent as any).analysis)}</div>
                        {msg.confidence && (
                          <div className="mt-1 text-xs text-gray-500">
                            置信度：{Math.round(msg.confidence * 100)}%
                          </div>
                        )}
                      </div>
                    </div>
                  )
                } else {
                  // Markdown渲染
                  const segments = splitMarkdownSegments(typeof safeContent === 'string' ? safeContent : '')
                  return (
                    <div key={index} className={`flex items-start space-x-3 mb-4`}>
                      <Avatar icon={<RobotOutlined />} className="bg-green-500" />
                      <div className="max-w-[70%] bg-white p-3 rounded-lg shadow">
                        {segments.map((seg, i) =>
                          seg.type === 'text' ? (
                            seg.content.trim() ? (
                              <div className="markdown-body mb-2" key={i}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{seg.content.replace(/\n{3,}/g, '\n\n')}</ReactMarkdown>
                              </div>
                            ) : null
                          ) :
                            <div className="qa-code-block-container mb-2" key={i} style={{position: 'relative', background: '#f6f8fa', borderRadius: 6, border: '1px solid #eaeaea', overflow: 'auto'}}>
                              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 8px', background: '#f3f3f3', borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottom: '1px solid #eaeaea'}}>
                                <span style={{fontSize: 12, color: '#888'}}>{seg.lang || 'code'}</span>
                                <button
                                  style={{fontSize: 12, color: '#007bff', background: 'none', border: 'none', cursor: 'pointer'}}
                                  onClick={() => {
                                    navigator.clipboard.writeText(seg.code)
                                    message.success('代码已复制')
                                  }}
                                >复制</button>
                              </div>
                              <pre style={{margin: 0, padding: 12, background: 'none', overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(1.6em * 8 + 24px)', fontSize: '95%', borderRadius: 4}}>
                                <code className={`language-${seg.lang}`}>{seg.code}</code>
                              </pre>
                            </div>
                        )}
                        {msg.confidence && (
                          <div className="mt-1 text-xs text-gray-500">
                            置信度：{Math.round(msg.confidence * 100)}%
                          </div>
                        )}
                      </div>
                    </div>
                  )
                }
              }
              // 恢复user和system消息渲染
              return (
                <div key={index} className={`flex items-start space-x-3 mb-4 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                  {msg.role !== 'user' && (
                    <Avatar icon={msg.role === 'system' ? <InboxOutlined /> : <RobotOutlined />} 
                           className={msg.role === 'system' ? 'bg-blue-500' : 'bg-green-500'} />
                  )}
                  <div className={`max-w-[70%] ${msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-white'} p-3 rounded-lg shadow`}>
                    <div className="markdown-body">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                  {msg.role === 'user' && (
                    <Avatar icon={<UserOutlined />} className="bg-blue-500" />
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* 输入框和发送按钮区域 */}
          <div className="flex space-x-2 mt-4">
            <TextArea
              value={state.question}
              onChange={handleQuestionChange}
              onKeyPress={handleKeyPress}
              placeholder="请输入您的问题..."
              autoSize={{ minRows: 1, maxRows: 3 }}
              className="flex-1"
              disabled={inputDisabled}
            />
            {state.isLoading ? (
              <Button
                type="primary"
                danger
                onClick={handleAbort}
                loading={isAborting}
                disabled={isAborting}
                icon={<SendOutlined />}
                className="flex-shrink-0"
              >
                打断
              </Button>
            ) : (
              <Button
                type="primary"
                onClick={handleSubmit}
                disabled={!state.question.trim() || inputDisabled}
                icon={<SendOutlined />}
                className="flex-shrink-0"
              >
                发送
              </Button>
            )}
          </div>
          {state.error && (
            <div className="text-red-500 text-sm mt-2">{state.error}</div>
          )}
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow mt-6" ref={chartPreviewRef}>
        <h3 className="text-lg font-medium mb-2">图表预览</h3>
        {(() => { console.log('plotlyFigure:', state.plotlyFigure); return null })()}
        {state.plotlyFigure ? (
          <>
            <Plot data={state.plotlyFigure.data} layout={state.plotlyFigure.layout} style={{width: '100%', height: '480px'}} config={{responsive: true}} />
            <div className="flex gap-2 mt-2">
              <button
                className="px-3 py-1 bg-blue-500 text-white rounded"
                onClick={() => (window as any).Plotly && (window as any).Plotly.downloadImage(document.querySelector('.js-plotly-plot'), {format: 'png', filename: 'chart'})}
              >下载PNG</button>
              <button
                className="px-3 py-1 bg-green-500 text-white rounded"
                onClick={() => (window as any).Plotly && (window as any).Plotly.downloadImage(document.querySelector('.js-plotly-plot'), {format: 'svg', filename: 'chart'})}
              >下载SVG</button>
              <button
                className="px-3 py-1 bg-gray-500 text-white rounded"
                onClick={() => (window as any).Plotly && (window as any).Plotly.downloadImage(document.querySelector('.js-plotly-plot'), {format: 'html', filename: 'chart'})}
              >下载HTML</button>
            </div>
          </>
        ) : (
          <div className="text-gray-400 text-center py-20">暂无图表，请在上方提问并生成图表后预览和下载。</div>
        )}
      </div>
    </div>
  )
}
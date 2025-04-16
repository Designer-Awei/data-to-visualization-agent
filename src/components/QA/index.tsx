/**
 * 数据问答组件
 * 提供基于数据的智能问答功能
 */
'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Input, Button, Card, Spin, Alert, Typography, Select, Upload, Avatar } from 'antd'
import { SendOutlined, InboxOutlined, UserOutlined, RobotOutlined } from '@ant-design/icons'
import { QAState, QAResponse, DataState, Message } from '@/types/qa'
import type { UploadProps } from 'antd'
import { message } from 'antd'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './qa-markdown.css'

const { TextArea } = Input
const { Title, Text, Paragraph } = Typography
const { Option } = Select
const { Dragger } = Upload

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

export const QA: React.FC = () => {
  const [state, setState] = useState<QAState>({
    question: '',
    isLoading: false,
    error: null,
    answer: null,
    model: 'THUDM/GLM-4-9B-0414',
    data: null,
    messages: [] // 新增：存储对话历史
  })

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 新增：自动滚动到最新消息
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
    // 只在assistant新回复到来时输出一次原始内容
    const lastMsg = state.messages[state.messages.length - 1]
    if (lastMsg && lastMsg.role === 'assistant') {
      // eslint-disable-next-line no-console
      console.log('LLM原始返回内容:', lastMsg.content)
    }
  }, [state.messages])

  const [inputDisabled, setInputDisabled] = useState(false) // 是否禁用输入
  const [abortController, setAbortController] = useState<AbortController | null>(null) // 控制fetch中断
  const [isAborting, setIsAborting] = useState(false) // 是否正在打断

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
          messages: [...prev.messages, {
            role: 'system',
            content: `已成功上传数据文件：${info.file.name}，共 ${responseData.totalRows} 条数据。`
          }]
        }))
        message.success(`${info.file.name} 文件解析成功`)
      } else if (status === 'error') {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: `${info.file.name} 文件上传失败`
        }))
        message.error(`${info.file.name} 文件上传失败`)
      }
    }
  }

  /**
   * 提交问题到后端API
   * 发送后立即清空输入框并禁用输入，等待回复或打断后恢复
   * @returns {Promise<void>}
   */
  const handleSubmit = async () => {
    if (!state.question.trim() || state.isLoading) return
    setInputDisabled(true)
    setIsAborting(false)
    setState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
      question: '',
      messages: [...prev.messages, { role: 'user', content: prev.question }]
    }))
    const controller = new AbortController()
    setAbortController(controller)
    try {
      const response = await fetch('/api/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: state.question,
          model: state.model,
          data: state.data?.rows,
          messages: state.messages
        }),
        signal: controller.signal
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || '请求失败')
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
    } catch (error: any) {
      if (error.name === 'AbortError') {
        setState(prev => ({ ...prev, isLoading: false, error: '回复已被打断' }))
      } else {
        setState(prev => ({ ...prev, error: error.message || '发生错误，请稍后重试', isLoading: false }))
      }
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
                const segments = splitMarkdownSegments(msg.content);
                return (
                  <div key={index} className={`flex items-start space-x-3 mb-4`}>
                    <Avatar icon={<RobotOutlined />} className="bg-green-500" />
                    <div className="max-w-[70%] bg-white p-3 rounded-lg shadow">
                      {/* 按顺序渲染正文和代码块 */}
                      {segments.map((seg, i) =>
                        seg.type === 'text' ? (
                          seg.content.trim() ? (
                            <div className="markdown-body mb-2" key={i}>
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{seg.content.replace(/\n{3,}/g, '\n\n')}</ReactMarkdown>
                            </div>
                          ) : null
                        ) : (
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
                        )
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
    </div>
  )
}
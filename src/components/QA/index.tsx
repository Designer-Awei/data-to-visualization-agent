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

const { TextArea } = Input
const { Title, Text, Paragraph } = Typography
const { Option } = Select
const { Dragger } = Upload

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
  }, [state.messages])

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
   */
  const handleSubmit = async () => {
    if (!state.question.trim()) {
      setState(prev => ({
        ...prev,
        error: '请输入问题'
      }))
      return
    }

    // 添加用户问题到消息列表
    const userMessage: Message = {
      role: 'user',
      content: state.question
    }

    setState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
      messages: [...prev.messages, userMessage]
    }))

    try {
      const response = await fetch('/api/qa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: state.question,
          model: state.model,
          data: state.data?.rows,
          messages: state.messages // 发送历史消息到后端
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || '请求失败')
      }

      const data: QAResponse = await response.json()
      
      // 添加AI回答到消息列表
      const aiMessage: Message = {
        role: 'assistant',
        content: data.answer,
        confidence: data.confidence
      }

      setState(prev => ({
        ...prev,
        answer: data,
        isLoading: false,
        question: '', // 清空输入框
        messages: [...prev.messages, aiMessage]
      }))
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        error: error.message || '发生错误，请稍后重试',
        isLoading: false
      }))
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
            {state.messages.map((msg, index) => (
              <div key={index} className={`flex items-start space-x-3 mb-4 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role !== 'user' && (
                  <Avatar icon={msg.role === 'system' ? <InboxOutlined /> : <RobotOutlined />} 
                         className={msg.role === 'system' ? 'bg-blue-500' : 'bg-green-500'} />
                )}
                <div className={`max-w-[70%] ${msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-white'} p-3 rounded-lg shadow`}>
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                  {msg.role === 'assistant' && msg.confidence && (
                    <div className="mt-1 text-xs text-gray-500">
                      置信度：{Math.round(msg.confidence * 100)}%
                    </div>
                  )}
                </div>
                {msg.role === 'user' && (
                  <Avatar icon={<UserOutlined />} className="bg-blue-500" />
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="flex space-x-2">
            <TextArea
              value={state.question}
              onChange={handleQuestionChange}
              onKeyPress={handleKeyPress}
              placeholder="请输入您的问题..."
              autoSize={{ minRows: 1, maxRows: 3 }}
              className="flex-1"
            />
            <Button
              type="primary"
              onClick={handleSubmit}
              loading={state.isLoading}
              disabled={!state.question.trim() || !state.data}
              icon={<SendOutlined />}
              className="flex-shrink-0"
            >
              发送
            </Button>
          </div>

          {state.error && (
            <div className="text-red-500 text-sm">{state.error}</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default QA 
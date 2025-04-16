/**
 * 数据问答组件
 * 提供基于数据的智能问答功能
 */
'use client'

import React, { useState } from 'react'
import { Input, Button, Card, Spin, Alert, Typography, Select, Upload } from 'antd'
import { SendOutlined, InboxOutlined } from '@ant-design/icons'
import { QAState, QAResponse, DataState } from '@/types/qa'
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
    model: 'THUDM/GLM-4-9B-0414', // 默认模型
    data: null
  })

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
          error: null
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

    setState(prev => ({
      ...prev,
      isLoading: true,
      error: null
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
          data: state.data?.rows // 将解析后的数据传递给问答API
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || '请求失败')
      }

      const data: QAResponse = await response.json()
      setState(prev => ({
        ...prev,
        answer: data,
        isLoading: false
      }))
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        error: error.message || '发生错误，请稍后重试',
        isLoading: false
      }))
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
                    {state.data.columns.map((column: string) => (
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              输入问题
            </label>
            <TextArea
              value={state.question}
              onChange={handleQuestionChange}
              placeholder="请输入您的问题..."
              autoSize={{ minRows: 3, maxRows: 6 }}
            />
          </div>

          <Button
            type="primary"
            onClick={handleSubmit}
            loading={state.isLoading}
            disabled={!state.question.trim() || !state.data}
            className="w-full"
          >
            提交问题
          </Button>

          {state.error && (
            <div className="text-red-500 text-sm">{state.error}</div>
          )}

          {state.answer && (
            <div className="mt-4 space-y-2">
              <Title level={4}>回答：</Title>
              <div className="p-4 bg-gray-50 rounded-lg">
                <Paragraph>
                  <ReactMarkdown>{state.answer.answer}</ReactMarkdown>
                </Paragraph>
                {state.answer.confidence && (
                  <div className="mt-2 text-sm text-gray-500">
                    置信度：{Math.round(state.answer.confidence * 100)}%
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default QA 
/**
 * 数据问答组件
 * 提供基于数据的智能问答功能
 */
'use client'

import React, { useState } from 'react'
import { Input, Button, Card, Spin, Alert, Typography, Select } from 'antd'
import { SendOutlined } from '@ant-design/icons'
import { QAState, QAResponse } from '@/types/qa'

const { TextArea } = Input
const { Title, Text } = Typography
const { Option } = Select

export const QA: React.FC = () => {
  const [state, setState] = useState<QAState>({
    question: '',
    isLoading: false,
    error: null,
    answer: null,
    model: 'THUDM/GLM-4-9B-0414' // 默认模型
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
          model: state.model
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
    <div className="p-4">
      <Title level={3}>智能问答</Title>
      <div className="mb-4">
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">选择模型</label>
          <Select
            value={state.model}
            onChange={handleModelChange}
            style={{ width: '100%' }}
            className="mb-4"
          >
            <Option value="THUDM/GLM-4-9B-0414">THUDM/GLM-4-9B-0414 (默认，32K文本，免费)</Option>
            <Option value="Qwen/Qwen2.5-7B-Instruct">Qwen/Qwen2.5-7B-Instruct (备选，32K文本，免费)</Option>
            <Option value="THUDM/GLM-Z1-32B-0414">THUDM/GLM-Z1-32B-0414 (备选，32K文本，付费)</Option>
            <Option value="deepseek-ai/DeepSeek-V3">deepseek-ai/DeepSeek-V3 (备选，64k文本，付费)</Option>
          </Select>
        </div>
        <TextArea
          value={state.question}
          onChange={handleQuestionChange}
          placeholder="请输入您的问题..."
          autoSize={{ minRows: 3, maxRows: 6 }}
          className="mb-2"
        />
        <Button 
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSubmit}
          loading={state.isLoading}
          className="mt-2"
        >
          提交问题
        </Button>
      </div>

      {state.error && (
        <Alert type="error" message={state.error} className="mb-4" />
      )}

      {state.isLoading && (
        <div className="text-center">
          <Spin size="large" />
        </div>
      )}

      {state.answer && !state.isLoading && (
        <Card title="答案" className="mb-4">
          <Text>{state.answer.answer}</Text>
          {state.answer.confidence && (
            <div className="mt-2">
              <Text type="secondary">置信度: {(state.answer.confidence * 100).toFixed(1)}%</Text>
            </div>
          )}
          {state.answer.relatedData && state.answer.relatedData.length > 0 && (
            <div className="mt-4">
              <Title level={5}>相关数据</Title>
              <ul>
                {state.answer.relatedData.map((item, index) => (
                  <li key={index}>
                    <Text>{JSON.stringify(item.row)}</Text>
                    <Text type="secondary"> (相关度: {(item.relevance * 100).toFixed(1)}%)</Text>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

export default QA 
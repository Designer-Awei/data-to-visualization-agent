/**
 * 数据可视化组件
 * 提供多种图表类型的数据可视化功能
 */
'use client'

import { useState } from 'react'

interface VisualizationProps {
  data?: any[]
  columns?: string[]
}

export function Visualization({ data = [], columns = [] }: VisualizationProps) {
  const [chartConfig, setChartConfig] = useState({
    type: 'bar', // bar, line, scatter, pie
    xAxis: '',
    yAxis: '',
    title: ''
  })
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleGenerateChart = async () => {
    setErrorMsg(null)
    try {
      const response = await fetch('/api/visualization/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data,
          columns,
          // 其他参数
        })
      })

      let errorContent = ''
      if (!response.ok) {
        try {
          const errorData = await response.json()
          errorContent = errorData.error || '图表生成失败'
          if (errorData.detail) errorContent += `：${errorData.detail}`
        } catch {
          errorContent = '【LLM服务异常】图表API请求失败'
        }
        setErrorMsg(errorContent)
        return
      }

      const chartData = await response.json()
      // TODO: 使用图表库渲染图表
    } catch (error) {
      setErrorMsg(`【LLM服务异常】${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return (
    <div className="space-y-6 bg-white p-6 rounded-lg shadow">
      <h2 className="text-xl font-semibold">数据可视化</h2>

      {/* 错误提示区域 */}
      {errorMsg && (
        <div className="text-red-500 mb-2">{errorMsg}</div>
      )}

      <div className="space-y-4">
        {/* 图表类型选择 */}
        <div>
          <label className="block text-sm font-medium text-gray-700">图表类型</label>
          <select
            value={chartConfig.type}
            onChange={(e) => setChartConfig({
              ...chartConfig,
              type: e.target.value
            })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="bar">柱状图</option>
            <option value="line">折线图</option>
            <option value="scatter">散点图</option>
            <option value="pie">饼图</option>
          </select>
        </div>

        {/* X轴选择 */}
        <div>
          <label className="block text-sm font-medium text-gray-700">X轴</label>
          <select
            value={chartConfig.xAxis}
            onChange={(e) => setChartConfig({
              ...chartConfig,
              xAxis: e.target.value
            })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">请选择</option>
            {columns.map(column => (
              <option key={column} value={column}>{column}</option>
            ))}
          </select>
        </div>

        {/* Y轴选择 */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Y轴</label>
          <select
            value={chartConfig.yAxis}
            onChange={(e) => setChartConfig({
              ...chartConfig,
              yAxis: e.target.value
            })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">请选择</option>
            {columns.map(column => (
              <option key={column} value={column}>{column}</option>
            ))}
          </select>
        </div>

        {/* 图表标题 */}
        <div>
          <label className="block text-sm font-medium text-gray-700">图表标题</label>
          <input
            type="text"
            value={chartConfig.title}
            onChange={(e) => setChartConfig({
              ...chartConfig,
              title: e.target.value
            })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder="请输入图表标题"
          />
        </div>
      </div>

      <button
        onClick={handleGenerateChart}
        disabled={!data.length || !chartConfig.xAxis || !chartConfig.yAxis}
        className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50"
      >
        生成图表
      </button>

      {/* 图表展示区域 */}
      <div className="aspect-video bg-gray-50 rounded-lg flex items-center justify-center">
        <p className="text-gray-500">图表展示区域</p>
      </div>
    </div>
  )
} 
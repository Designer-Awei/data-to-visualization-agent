/**
 * 数据清洗组件
 * 提供数据清洗功能,包括缺失值处理、异常值检测等
 * 清洗完成后会在前端弹窗提示"数据清洗已完成"
 */
'use client'

import { useState } from 'react'
import { message } from 'antd'

interface DataCleaningProps {
  data?: any[]
  onDataCleaned?: (cleanedData: any[]) => void
}

export function DataCleaning({ data = [], onDataCleaned }: DataCleaningProps) {
  const [cleaningOptions, setCleaningOptions] = useState({
    handleMissingValues: 'remove', // remove, mean, median
    detectOutliers: false,
    standardize: false
  })

  const handleCleanData = async () => {
    try {
      const response = await fetch('/api/data/clean', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data,
          options: cleaningOptions
        })
      })

      if (!response.ok) {
        throw new Error('数据清洗失败')
      }

      const cleanedData = await response.json()
      onDataCleaned?.(cleanedData)
      // 清洗完成提示
      if (typeof message !== 'undefined' && message.success) {
        message.success('数据清洗已完成！')
      } else {
        window.alert('数据清洗已完成！')
      }
    } catch (error) {
      console.error('数据清洗错误:', error)
    }
  }

  return (
    <div className="space-y-6 bg-white p-6 rounded-lg shadow">
      <h2 className="text-xl font-semibold">数据清洗</h2>
      
      <div className="space-y-4">
        {/* 缺失值处理 */}
        <div>
          <label className="block text-sm font-medium text-gray-700">缺失值处理</label>
          <select
            value={cleaningOptions.handleMissingValues}
            onChange={(e) => setCleaningOptions({
              ...cleaningOptions,
              handleMissingValues: e.target.value
            })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="remove">删除缺失值</option>
            <option value="mean">均值填充</option>
            <option value="median">中位数填充</option>
          </select>
        </div>

        {/* 异常值检测 */}
        <div className="flex items-center">
          <input
            type="checkbox"
            checked={cleaningOptions.detectOutliers}
            onChange={(e) => setCleaningOptions({
              ...cleaningOptions,
              detectOutliers: e.target.checked
            })}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label className="ml-2 block text-sm text-gray-700">
            检测并处理异常值
          </label>
        </div>

        {/* 数据标准化 */}
        <div className="flex items-center">
          <input
            type="checkbox"
            checked={cleaningOptions.standardize}
            onChange={(e) => setCleaningOptions({
              ...cleaningOptions,
              standardize: e.target.checked
            })}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label className="ml-2 block text-sm text-gray-700">
            数据标准化
          </label>
        </div>
      </div>

      <button
        onClick={handleCleanData}
        disabled={!data.length}
        className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50"
      >
        开始清洗
      </button>
    </div>
  )
} 
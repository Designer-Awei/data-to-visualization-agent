/**
 * 数据预览组件
 * 展示上传的数据内容，支持表格预览和数据统计信息
 */
'use client'

import { useState, useEffect } from 'react'

interface DataPreviewProps {
  data?: any[]
  columns?: string[]
}

export function DataPreview({ data = [], columns = [] }: DataPreviewProps) {
  const [statistics, setStatistics] = useState<any>({})

  useEffect(() => {
    // 计算简单的数据统计信息
    if (data.length > 0) {
      const stats = columns.reduce((acc, col) => {
        const values = data.map(row => row[col]).filter(val => val !== null && val !== undefined)
        const numericValues = values.filter(val => !isNaN(Number(val)))
        
        acc[col] = {
          count: values.length,
          ...(numericValues.length > 0 ? {
            min: Math.min(...numericValues),
            max: Math.max(...numericValues),
            avg: numericValues.reduce((sum, val) => sum + Number(val), 0) / numericValues.length
          } : {})
        }
        return acc
      }, {})
      
      setStatistics(stats)
    }
  }, [data, columns])

  if (!data.length || !columns.length) {
    return (
      <div className="text-center p-8 bg-gray-50 rounded-lg">
        <p className="text-gray-500">暂无数据</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 数据统计信息 */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">数据统计</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Object.entries(statistics).map(([col, stats]: [string, any]) => (
            <div key={col} className="p-3 bg-gray-50 rounded">
              <p className="font-medium">{col}</p>
              <div className="text-sm text-gray-600">
                <p>数量: {stats.count}</p>
                {stats.min !== undefined && (
                  <>
                    <p>最小值: {stats.min.toFixed(2)}</p>
                    <p>最大值: {stats.max.toFixed(2)}</p>
                    <p>平均值: {stats.avg.toFixed(2)}</p>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 数据表格 */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map(column => (
                <th
                  key={column}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.slice(0, 10).map((row, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map(column => (
                  <td key={column} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {row[column]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {data.length > 10 && (
          <p className="text-center text-sm text-gray-500 mt-4">
            显示前10条数据，共 {data.length} 条
          </p>
        )}
      </div>
    </div>
  )
} 
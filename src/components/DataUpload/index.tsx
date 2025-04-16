/**
 * 数据上传组件
 * 支持Excel、CSV等文件上传和文本数据输入
 */
'use client'

import { useState } from 'react'
import { Upload } from 'lucide-react'

export function DataUpload() {
  const [isDragging, setIsDragging] = useState(false)
  const [textData, setTextData] = useState('')

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      await handleFileUpload(files[0])
    }
  }

  const handleFileUpload = async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/data/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('上传失败')
      }

      const data = await response.json()
      console.log('上传成功:', data)
    } catch (error) {
      console.error('上传错误:', error)
    }
  }

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const response = await fetch('/api/data/text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: textData }),
      })

      if (!response.ok) {
        throw new Error('提交失败')
      }

      const data = await response.json()
      console.log('提交成功:', data)
      setTextData('')
    } catch (error) {
      console.error('提交错误:', error)
    }
  }

  return (
    <div className="space-y-6">
      {/* 文件上传区域 */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center ${
          isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Upload className="mx-auto h-12 w-12 text-gray-400" />
        <p className="mt-2 text-sm text-gray-600">
          拖放Excel或CSV文件到此处，或
          <label className="mx-1 text-blue-500 cursor-pointer">
            点击上传
            <input
              type="file"
              className="hidden"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
            />
          </label>
        </p>
      </div>

      {/* 文本数据输入区域 */}
      <form onSubmit={handleTextSubmit} className="space-y-4">
        <textarea
          value={textData}
          onChange={(e) => setTextData(e.target.value)}
          placeholder="或者在此处直接粘贴数据..."
          className="w-full h-32 p-3 border rounded-lg"
        />
        <button
          type="submit"
          disabled={!textData.trim()}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50"
        >
          提交数据
        </button>
      </form>
    </div>
  )
} 
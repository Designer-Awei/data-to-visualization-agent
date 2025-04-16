'use client'

import React from 'react'
import { Upload as AntUpload, message } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import type { UploadProps } from 'antd'

const { Dragger } = AntUpload

export const Upload: React.FC = () => {
  const props: UploadProps = {
    name: 'file',
    multiple: false,
    action: '/api/data/upload',
    accept: '.csv,.xlsx,.xls',
    onChange(info) {
      const { status } = info.file
      if (status !== 'uploading') {
        console.log(info.file, info.fileList)
      }
      if (status === 'done') {
        message.success(`${info.file.name} 文件上传成功`)
      } else if (status === 'error') {
        message.error(`${info.file.name} 文件上传失败`)
      }
    },
  }

  return (
    <div className="p-4">
      <h2 className="text-lg font-medium mb-4">上传数据文件</h2>
      <Dragger {...props}>
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
        <p className="ant-upload-hint">
          支持 Excel 和 CSV 格式的数据文件
        </p>
      </Dragger>
    </div>
  )
}

export default Upload 
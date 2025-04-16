'use client'

import React from 'react'
import { QA } from '@/components/QA'
import { Upload } from '@/components/Upload'
import { Tabs } from 'antd'
import type { TabsProps } from 'antd'

const items: TabsProps['items'] = [
  {
    key: 'qa',
    label: '智能问答',
    children: <QA />,
  },
  {
    key: 'upload',
    label: '数据上传',
    children: <Upload />,
  },
]

export default function Home() {
  return (
    <main className="min-h-screen p-4 md:p-8">
      <h1 className="text-2xl font-bold mb-8">数据可视化智能助手</h1>
      <Tabs defaultActiveKey="qa" items={items} className="min-h-[500px]" />
    </main>
  )
} 
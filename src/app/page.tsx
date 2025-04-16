'use client'

import React from 'react'
import { QA } from '@/components/QA'

export default function Home() {
  return (
    <main className="min-h-screen p-4 md:p-8">
      <h1 className="text-2xl font-bold mb-8">数据可视化智能助手</h1>
      <QA />
    </main>
  )
} 
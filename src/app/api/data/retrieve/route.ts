import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

/**
 * 调用Python脚本进行数据检索与采样
 * @param {any[]} rows - 数据行
 * @param {object} params - 检索与采样参数
 * @returns {Promise<any>} - 检索/采样结果
 */
async function retrieveData(rows: any[], params: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(process.cwd(), 'tmp_retrieve.json')
    fs.writeFileSync(tmpFile, JSON.stringify(rows, null, 2))
    const py = spawn('python', [
      'backend/app/services/data_processing/retrieve_entry.py',
      tmpFile,
      JSON.stringify(params)
    ])
    let output = ''
    py.stdout.on('data', (data) => {
      output += data.toString()
    })
    py.stderr.on('data', (data) => {
      console.error('Python错误:', data.toString())
    })
    py.on('close', (code) => {
      fs.unlinkSync(tmpFile)
      if (code === 0) {
        try {
          resolve(JSON.parse(output))
        } catch (e) {
          reject(e)
        }
      } else {
        reject(new Error('Python检索脚本执行失败'))
      }
    })
  })
}

/**
 * POST /api/data/retrieve
 * @description 数据检索与采样API，接收数据和检索参数，返回采样/检索结果
 * @param {Request} request - 请求对象，body需包含rows和params
 * @returns {Promise<Response>} - 检索/采样结果
 */
export async function POST(request: Request) {
  try {
    const { rows, params } = await request.json()
    if (!rows || !Array.isArray(rows)) {
      return NextResponse.json({ error: '缺少数据行' }, { status: 400 })
    }
    if (!params || typeof params !== 'object') {
      return NextResponse.json({ error: '缺少检索参数' }, { status: 400 })
    }
    const result = await retrieveData(rows, params)
    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('检索与采样API错误:', error)
    return NextResponse.json({ error: '处理检索请求时发生错误' }, { status: 500 })
  }
} 
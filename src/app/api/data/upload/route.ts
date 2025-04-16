/**
 * 文件上传API路由处理程序
 */
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

/**
 * 调用Python脚本生成数据摘要
 * @param {any[]} rows - 解析后的数据行
 * @returns {Promise<any>} - 摘要信息
 */
async function getDataSummary(rows: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(process.cwd(), 'tmp_upload.json')
    fs.writeFileSync(tmpFile, JSON.stringify(rows, null, 2))
    const py = spawn('python', [
      'backend/app/services/data_processing/summary_entry.py',
      tmpFile
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
        reject(new Error('Python摘要脚本执行失败'))
      }
    })
  })
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json(
        { error: '未找到上传文件' },
        { status: 400 }
      )
    }

    // 验证文件类型
    const fileType = file.name.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'xls', 'csv'].includes(fileType || '')) {
      return NextResponse.json(
        { error: '不支持的文件格式' },
        { status: 400 }
      )
    }

    // 读取文件内容
    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer)
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    const data = XLSX.utils.sheet_to_json(worksheet)

    // 调用Python脚本生成摘要
    const summary = await getDataSummary(data)

    // 返回解析后的数据
    return NextResponse.json({
      success: true,
      message: '文件上传成功',
      data: {
        rows: data,
        columns: Object.keys(data[0] || {}),
        totalRows: data.length,
        summary
      }
    })

  } catch (error) {
    console.error('文件上传错误:', error)
    return NextResponse.json(
      { error: '处理文件时发生错误' },
      { status: 500 }
    )
  }
} 
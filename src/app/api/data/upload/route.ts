/**
 * 文件上传API路由处理程序
 */
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

/**
 * 生成数据摘要（字段统计、极值、均值等）
 * @param {any[]} rows - 解析后的数据行
 * @returns {any} - 摘要信息
 */
function getDataSummary(rows: any[]): any {
  if (!rows || rows.length === 0) return {}
  const columns = Object.keys(rows[0])
  const summary: Record<string, any> = {}
  for (const col of columns) {
    const values = rows.map(r => r[col]).filter(v => v !== undefined && v !== null && v !== '')
    // 尝试将字符串数字转为数值
    const nums = values.map(v => typeof v === 'number' ? v : (typeof v === 'string' && !isNaN(Number(v)) ? Number(v) : null)).filter(v => typeof v === 'number')
    summary[col] = {
      count: values.length,
      unique: new Set(values).size,
      min: nums.length ? Math.min(...nums) : null,
      max: nums.length ? Math.max(...nums) : null,
      mean: nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length) : null,
      sample: values.slice(0, 5)
    }
  }
  return summary
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      console.error('[文件上传] 未找到上传文件')
      return NextResponse.json(
        { error: '未找到上传文件' },
        { status: 400 }
      )
    }

    // 验证文件类型
    const fileType = file.name.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'xls', 'csv'].includes(fileType || '')) {
      console.error(`[文件上传] 不支持的文件格式: ${file.name}`)
      return NextResponse.json(
        { error: '不支持的文件格式' },
        { status: 400 }
      )
    }

    // 读取文件内容
    let data = null
    try {
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer)
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      data = XLSX.utils.sheet_to_json(worksheet)
    } catch (e) {
      console.error('[文件上传] 解析Excel/CSV文件失败:', e)
      return NextResponse.json(
        { error: '解析Excel/CSV文件失败: ' + (e instanceof Error ? e.message : String(e)) },
        { status: 500 }
      )
    }

    // 用JS生成数据摘要
    let summary = null
    try {
      summary = getDataSummary(data)
    } catch (e) {
      console.error('[文件上传] 生成数据摘要失败:', e)
      return NextResponse.json(
        { error: '生成数据摘要失败: ' + (e instanceof Error ? e.message : String(e)) },
        { status: 500 }
      )
    }

    // 返回解析后的数据
    try {
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
    } catch (e) {
      console.error('[文件上传] 返回数据时出错:', e)
      return NextResponse.json(
        { error: '返回数据时出错: ' + (e instanceof Error ? e.message : String(e)) },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('[文件上传] 未知错误:', error)
    return NextResponse.json(
      { error: '处理文件时发生未知错误: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    )
  }
} 
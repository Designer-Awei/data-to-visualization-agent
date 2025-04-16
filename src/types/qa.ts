/**
 * QA模块相关类型定义
 */

export interface RelatedDataItem {
  row: Record<string, any>
  relevance: number
}

export interface QAResponse {
  answer: string
  confidence: number
  relatedData?: RelatedDataItem[]
  error?: string
}

export interface DataState {
  columns: string[]
  rows: Record<string, any>[]
  totalRows: number
}

export interface QAState {
  question: string
  isLoading: boolean
  error: string | null
  answer: QAResponse | null
  model: string
  data: DataState | null
}

export type LLMModel = 
  | 'THUDM/GLM-4-9B-0414'
  | 'Qwen/Qwen2.5-7B-Instruct'
  | 'THUDM/GLM-Z1-32B-0414'
  | 'deepseek-ai/DeepSeek-V3' 
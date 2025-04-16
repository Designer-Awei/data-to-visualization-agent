# 数据可视化智能助手 (Data Visualization Agent)

## 项目简介

这是一个基于Next.js和Python的数据可视化智能助手系统。用户可以上传Excel表格或直接输入数据，系统将自动进行数据清洗、可视化和智能问答。

### 超大数据量智能问答与可视化实现方案

#### 1. 问题背景

当用户上传的Excel/CSV数据量远超大模型（如SiliconFlow LLM）的输入限制（如32k tokens）时，无法直接将全部数据传递给大模型进行问答或绘图。为保证智能问答和可视化的准确性与效率，需要采用"摘要+检索+采样"的分层处理方案。

#### 2. 推荐架构与处理流程

##### 2.1 数据上传与预处理
- 后端解析Excel/CSV为结构化数据（如二维数组或DataFrame），并存储原始数据。
- 自动生成数据摘要（如字段统计、分布、极值、缺失值等）和代表性样本行（如前10行、后10行、随机10行）。
- 对于超大数据，按行或字段分块，便于后续检索。

##### 2.2 智能问答流程
- 用户输入自然语言问题。
- 后端先用规则/简单NLP/向量检索，判断问题涉及哪些字段、哪些数据片段。
- 仅将相关字段/片段和数据摘要拼接到prompt中，和问题一起发给LLM。
- LLM基于摘要和样本回答问题，前端用Markdown渲染答案。

##### 2.3 智能绘图流程
- 用户指定图表类型和字段。
- 后端对大数据先聚合/采样，仅返回绘图所需的关键信息。
- 前端用聚合后的数据渲染图表，避免全量数据前端处理。

#### 3. 关键点与注意事项
- 不要直接将全部数据塞进prompt，否则会被截断或报错。
- 摘要+检索+采样是大数据场景下的最佳实践。
- 后端需具备"数据检索"能力，如字段过滤、向量检索、分组统计等。
- 前端应有"数据量提示"，如"当前仅分析部分数据，若需全量分析请缩小范围"。

#### 4. 参考文档
- [SiliconFlow官方文档-输入限制](https://docs.siliconflow.cn/cn/userguide/capabilities/text-generation)
- [RAG（检索增强生成）原理](https://zhuanlan.zhihu.com/p/671857964)
- [数据摘要与采样方法](https://en.wikipedia.org/wiki/Sampling_(statistics))

### 主要功能

- 📊 数据上传与预览：支持Excel、CSV等多种格式
- 🧹 智能数据清洗：支持自动和手动清洗模式
- 📈 数据可视化：支持多种图表类型，支持自然语言描述生成图表
- 💾 图表导出：支持PNG、SVG、HTML等多种格式
- 🤖 智能问答：基于数据的自然语言分析和问答

## 技术架构

### 前端 (Frontend)
```
frontend/
├── components/   # 可复用组件
│   ├── DataUpload/     # 数据上传组件
│   ├── DataPreview/    # 数据预览组件
│   ├── DataCleaning/   # 数据清洗组件
│   ├── Visualization/  # 可视化组件
│   └── QA/             # 问答组件
├── pages/        # 页面
├── utils/        # 工具函数
├── services/     # API 封装
└── styles/       # 样式文件
```

### 后端 (Backend)
```
backend/
├── app/
│   ├── api/           # API路由
│   ├── services/      # 业务逻辑
│   │   ├── data_processing/  # 数据处理
│   │   ├── visualization/    # 可视化服务
│   │   └── qa/               # 问答服务
│   └── utils/         # 工具函数
├── requirements.txt   # Python依赖
└── README.md         # 后端说明文档
```

## 开发环境配置

### 前端环境要求
- Node.js 18+
- npm 或 yarn

### 后端环境要求
- Python 3.8+
- FastAPI
- pandas
- matplotlib/seaborn/plotly
- SiliconFlow API

## 快速开始

### 前端启动
```bash
cd frontend
npm install
npm run dev
```

### 后端启动
```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt
python main.py
```

## 环境变量配置

### 前端环境变量 (.env.local)
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 后端环境变量 (.env)
```
SILICONFLOW_API_KEY=your_api_key
MODEL_NAME=THUDM/GLM-Z1-32B-0414
```

## API文档

### 数据处理API
- POST /api/data/upload - 上传数据文件
- POST /api/data/clean - 数据清洗
- GET /api/data/preview - 数据预览

### 可视化API
- POST /api/visualization/create - 创建可视化
- GET /api/visualization/types - 获取支持的图表类型
- POST /api/visualization/export - 导出图表

### 问答API
- POST /api/qa/ask - 提交问题
- GET /api/qa/history - 获取问答历史

## 注意事项

1. 数据安全
   - 所有上传的数据仅在会话内使用
   - 定期清理临时文件
   - 敏感数据加密存储

2. API调用
   - 使用SiliconFlow API时注意错误处理
   - 实现请求重试机制
   - 注意API调用频率限制

3. 代码规范
   - 使用ESLint和Prettier
   - 遵循TypeScript类型检查
   - 编写完整的单元测试

## 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交改动 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交Pull Request

## 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件 
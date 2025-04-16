# 数据可视化智能助手 (Data Visualization Agent)

## 项目简介

这是一个基于Next.js和Python的数据可视化智能助手系统。用户可以上传Excel表格或直接输入数据，系统将自动进行数据清洗、可视化和智能问答。

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
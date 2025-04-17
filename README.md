# 数据可视化智能助手 (Data Visualization Agent)

## 项目简介

本项目基于 Next.js (Node.js) 全栈一体化架构，所有后端 API 路由均在 `src/app/api` 下实现，**不再依赖 Python FastAPI**。Python 仅作为 plotly 代码执行器，由 Node.js 调用。

---

## 实现路径与阶段目标

### 1. 数据上传与摘要
- 支持 Excel/CSV 文件上传，Node.js 解析为结构化数据。
- 用 JS 实现字段统计、分布、极值、缺失等摘要。
- 摘要和样本数据直接返回前端。

### 2. 智能问答
- Node.js API 路由 `/api/qa/ask` 调用 SiliconFlow LLM，基于数据和用户问题返回自然语言答案。
- 支持大数据场景下的字段/片段检索与摘要拼接。

### 3. 智能绘图
- Node.js API 路由 `/api/visualization/create`：
  - 先用 LLM 生成 plotly 代码。
  - Node.js 用 `child_process.spawn` 执行 Python，仅用于 plotly 代码执行，返回 figure json。
- 前端用 react-plotly.js 渲染后端返回的 figure json。

### 4. 意图识别与自动分流
- 所有前端问题统一 POST 到 `/api/qa`。
- 后端"意图识别agent"判断是问答还是绘图，自动分流到 `/api/qa/ask` 或 `/api/visualization/create`。
- 意图识别结果以日志形式输出，便于调试。

### 5. 计算agent（保障数值计算准确性）
- LLM 只负责理解用户意图、提取所需数据、生成对应的 Python 代码（如均值、分组、聚合等）。
- 后端安全执行 LLM 生成的代码，得到真实计算结果。
- 可选：将结果和代码一并返回给 LLM，让其组织最终自然语言答案。
- 返回真实计算结果给前端，确保所有数值分析100%准确。

### 6. 前端 fetch 路径规范
- 所有 fetch 路径均为 `/api/xxx`，无端口号，无跨端口。

---

## 主要功能模块
- 数据上传与预览
- 智能数据摘要
- 智能问答
- 智能绘图（自动识别需求、自动生成、自动渲染）
- 智能计算（自动代码生成+后端安全执行）
- 图表导出（PNG/SVG/HTML）

---

## 开发环境配置
- Node.js 18+
- npm 或 yarn
- Python（仅用于 plotly 代码执行，无需 FastAPI）

---

## 快速开始
```bash
npm install
npm run dev
```

---

## 环境变量配置
```
SILICONFLOW_API_KEY=your_api_key
MODEL_NAME=THUDM/GLM-Z1-32B-0414
```

---

## 注意事项
- 所有 API 路由均为 Node.js 实现，Python 仅用于 plotly/计算代码执行。
- 前端 fetch 路径统一为 `/api/xxx`。
- 项目无任何 FastAPI 依赖。

---

## 贡献指南
1. Fork 项目
2. 创建特性分支
3. 提交改动
4. 推送到分支
5. 提交 Pull Request

---

## License
MIT License

## 技术架构

### 前端 + 后端 (一体化 Next.js)
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
├── styles/       # 样式文件
└── app/
    └── api/      # 所有后端API路由 (Node.js)
        ├── data/
        ├── qa/
        └── visualization/
```

## 随机数据表格生成工具

本项目已内置一个用于测试的随机学生成绩表格生成脚本，位于 `create-random-xlsx` 文件夹下。

### 使用方法

1. 进入目录：
   ```bash
   cd create-random-xlsx
   ```
2. 安装依赖：
   ```bash
   pip install pandas openpyxl
   ```
3. 运行脚本：
   ```bash
   python gen_random_excel.py
   ```
4. 生成的 `高三1班学生期末考试成绩.xlsx` 可用于上传测试智能绘图与问答功能。 


## 智能问答模块协作流程

本项目的智能问答模块由多个智能 agent 协同完成，确保用户提问无论多复杂都能获得准确、自然的答案。核心流程如下：

### 1. 智能字段映射 agent
- 作用：根据表格所有字段名和用户问题，利用 LLM 智能模糊匹配，推断出用户实际关心的字段（支持简称、别名、拼音等模糊表达）。
- 步骤：
  1. 获取表头字段名（如“数学成绩”、“语文分数”）。
  2. 将表头字段名和用户问题一同输入 LLM，输出最相关的表头字段名数组。
  3. 后续所有分析/计算/代码生成都只用这组字段，保证字段不遗漏。

### 2. 检索模块
- 作用：根据智能字段映射结果，从结构化数据中检索出用户关心的字段和数据片段，为后续计算和分析提供数据基础。
- 步骤：
  1. 根据 userFields 筛选数据。
  2. 生成数据预览和字段列表，传递给下游 agent。

### 3. 计算 agent
- 作用：保障数值计算 100% 准确。LLM 只负责生成 Python 代码，计算 agent 安全执行代码并返回真实结果。
- 步骤：
  1. LLM 根据用户问题和数据，生成 Python 代码（如均值、分组、聚合等）。
  2. 计算 agent 在 Node.js 后端安全执行代码，返回真实计算结果。
  3. 若代码执行失败，自动重试或返回 LLM 口算结果并提示风险。

### 4. 二次组织语言（LLM 二次解释 agent）
- 作用：让 LLM 根据“用户问题+代码+真实计算结果+涉及字段”用自然语言详细解释思路、过程和结论，提升用户体验。
- 步骤：
  1. 将用户问题、代码、涉及字段、真实计算结果拼接为新 prompt。
  2. LLM 生成自然语言答案，要求必须直接引用真实计算结果，不得自行推算。
  3. 前端展示 LLM 最终自然语言回复。

### 5. 主问答模块协作流程
1. 用户提问
2. 智能字段映射 agent 识别用户关心的字段
3. 检索模块筛选数据
4. LLM 判断问题类型（分析/计算/混合）
5. 若需计算，LLM 生成代码，计算 agent 执行，返回真实结果
6. 二次组织语言 agent 生成自然语言答案
7. 前端展示最终回复

> 该流程确保了“字段识别-数据检索-代码生成-安全计算-自然语言解释”全链路智能协作，极大提升了问答准确性和用户体验。

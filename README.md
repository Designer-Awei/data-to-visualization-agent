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
- LLM 只负责理解用户意图、提取所需数据、生成对应的 Python 代码（如均值、分组、聚合、差值、总分等）。
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

### 运行环境要求（推荐）
- Node.js 18 及以上（建议LTS版本）
- Python 3.8 ~ 3.11（推荐3.10或3.11，兼容性最佳）
- pip 依赖包：pandas、plotly、numpy、openpyxl

#### Python依赖安装示例
```bash
pip install pandas plotly numpy openpyxl
```

> 说明：
> - 项目运行在任何电脑上都必须有 Node.js 和 Python 环境。
> - Python 仅用于后端本地执行LLM生成的分析/绘图代码。
> - 推荐使用Anaconda/Miniconda等虚拟环境管理工具。

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
├── components/           # 可复用前端组件
│   ├── DataUpload/       # 【数据上传组件】负责文件选择、上传、进度反馈
│   ├── DataPreview/      # 【数据预览组件】展示上传后的表格样本
│   ├── DataCleaning/     # 【数据清洗组件】支持缺失值处理、异常检测等
│   ├── Visualization/    # 【可视化组件】基于react-plotly.js渲染后端返回的figure json
│   └── QA/               # 【问答组件】智能问答、上下文管理、消息展示
├── pages/                # Next.js页面入口
├── utils/                # 【前端工具函数】如数据格式转换、请求封装等
├── services/             # 【API服务封装】统一管理前端与后端的接口调用
├── styles/               # 样式文件
└── app/
    └── api/              # 【后端API路由（Node.js）】所有后端逻辑均在此
        ├── data/         # 数据上传、解析、摘要等API
        ├── qa/           # 智能问答、计算相关API
        └── visualization/# 智能绘图相关API
```

> 说明：
> - `components/` 目录下每个子目录为一个独立的UI功能模块，便于复用和维护。
> - `utils/` 存放前端常用工具函数。
> - `services/` 统一封装所有API请求，前端通过此层与后端交互。
> - `app/api/` 下为所有后端API路由，Node.js实现，无FastAPI依赖。
> - `data/`、`qa/`、`visualization/` 分别对应数据处理、智能问答、智能绘图等后端子模块。

---

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


## 智能问答与智能绘图系统完整传递路径（新版，推荐）

1. **用户发送请求**
   - 用户在前端输入自然语言问题（如"请画出每个同学的总分柱状图"或"求各科平均分"），点击发送。

2. **意图识别agent**
   - 后端首先调用意图识别agent，判断用户问题属于哪一类：
     - `general`：普通闲聊/无关数据，直接由LLM自然回复。
     - `calc`（或`qa`）：需要基于数据的分析/计算。
     - `plot`：需要生成可视化图表。
   - 根据意图自动分流到 `/api/qa/ask` 或 `/api/visualization/create`。
   - 日志输出意图识别结果，便于调试。

3. **字段提取agent**
   - 针对`calc`/`qa`/`plot`，调用字段提取agent，识别本轮问题涉及的字段。
   - 先用pandas/JS读取所有原始字段名，LLM只能在这些字段中选择，输出后做一次交集过滤，只保留真实存在的字段，防止"总分"等不存在字段被选中。
   - 日志打印：用户问题、可用字段、提取结果。

4. **数据检索与拼接**
   - 根据字段提取结果，自动检索出对应字段的所有数据（如前10条样本），动态拼接到system prompt。
   - 保证LLM每轮都能获得最新、完整的数据上下文，避免遗忘。

5. **计算agent（仅问答链路）**
   - 输入：用户问题 + 结构化数据。
   - LLM生成并输出Python代码，后端安全执行，得到真实计算结果。
   - 日志打印：输入数据、生成代码、执行结果。

6. **二次组织语言agent（仅问答链路）**
   - 将真实计算结果、涉及字段等拼接为新prompt，交由LLM生成结构化JSON（如table+analysis），并输出简明分析文本。
   - 日志打印：输入prompt、LLM输出内容。

7. **前端渲染**
   - 前端只渲染后端返回的结构化结果（表格+分析/图表），不展示代码和警告内容。
   - 遇到异常时，前端问答区始终显示"【LLM服务异常】...兜底，绝不空白。

8. **绘图数据计算agent**
   - 对于`origin`：直接将用户问题和DataFrame传递给"智能绘图agent"。
   - 对于`todo`：将用户问题和DataFrame传递给"绘图数据计算agent"，LLM生成并执行pandas代码，得到result（如总分、均值、分组统计等），再将result和用户问题传递给"智能绘图agent"。
   - 对于`both`：先用"绘图数据计算agent"得到result，再将result合并进DataFrame，得到新的结构化数据，最后将用户问题和新数据传递给"智能绘图agent"。
   - **如遇代码执行失败，自动进入"错误推理agent"分析原因并给出建议，再由"代码修复agent"自动修正，最多修复3次。**

9. **智能绘图agent**
   - 输入：用户问题 + 结构化绘图数据（DataFrame/result/合并数据）。
   - LLM生成plotly代码，后端执行，得到figure json，返回前端渲染。
   - 只允许输出一行print(json.dumps(result, ensure_ascii=False))，禁止多余print。
   - **如遇代码执行失败，自动进入"错误推理agent"分析原因并给出建议，再由"代码修复agent"自动修正，最多修复3次。**

> 该链路最大化泛化能力，支持任意业务场景下的"原始数据绘图"与"二次计算后绘图"，每一步都可插入日志、异常兜底，便于调试和维护。

---

## 智能绘图系统自动修复与错误推理能力

- **错误推理agent**：当LLM生成的代码执行失败时，先由错误推理agent分析报错原因并给出详细修改建议。
- **代码修复agent**：根据错误推理agent的分析和建议，自动修正代码，最多修复3次。
- 这两大agent已集成于主流程和数据计算链路，极大提升了系统健壮性和自动化。
- 智能绘图agent、智能代码生成agent、错误推理agent、代码修复agent均已在后端加上终端日志输出，便于调试和追踪。

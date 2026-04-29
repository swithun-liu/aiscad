# AISCAD

AISCAD 是一个把自然语言建模请求转换成结构化 DSL JSON，并在浏览器中解析、预览、导出 3D 模型的实验项目。

## 项目目标

- 用结构化 `DSL JSON` 代替直接生成 JSCAD 代码，提升 AI 输出稳定性。
- 让同一份 `actions/*.json` 同时服务于：
  - 程序校验与执行
  - 大模型直接阅读和生成
- 提供一条完整链路：
  - 用户描述
  - AI 输出 DSL JSON
  - 浏览器端解析 DSL
  - Three.js 预览模型
  - 导出 STL

## 当前能力

- 支持通过 `DeepSeek API Key` 直接调用模型生成 DSL。
- 支持复制完整 Prompt，把提示词发给任意 chat AI，再把返回 JSON 粘贴回来渲染。
- 支持手动编辑 DSL JSON 并重新渲染。
- 支持导出当前 3D 模型为 `STL`。

## 技术栈

- `Vite`
- `Three.js`
- `@jscad/modeling`
- `Ajv`

## 快速开始

安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm run dev -- --host 0.0.0.0
```

生产构建：

```bash
npm run build
```

本地预览构建结果：

```bash
npm run preview
```

## 使用方式

### 方式一：直接调用 DeepSeek

1. 打开页面
2. 填写 `DeepSeek API Key`
3. 输入模型描述
4. 点击 `AI 生成并渲染`

### 方式二：复制 Prompt 给外部 Chat AI

1. 输入模型描述
2. 点击 `复制完整 Prompt`
3. 把 Prompt 发给外部 chat AI
4. 让它只返回 DSL JSON
5. 把 JSON 粘贴到右侧编辑器
6. 点击 `渲染当前 JSON`

### 导出 STL

- 当前预览里只要包含 `geom3` 对象，就可以点击 `导出 STL`
- 如果当前只有 2D 草图或路径，页面会提示无法导出

## DSL 设计

DSL 核心思想是把建模过程拆成一系列 `action`：

- `solid.*`：创建 3D 原语
- `sketch.*`：创建 2D 草图
- `curve.*`：创建路径与曲线
- `construct.*`：拉伸、旋转、投影等构造动作
- `transform.*`：平移、旋转、缩放、镜像
- `boolean.*`：布尔运算
- `pattern.*`：阵列复制
- `modify.*`：扩张、偏移、凸包、清理
- `display.*`：颜色与分组

典型 DSL 结构如下：

```json
{
  "dsl": "aiscad.dsl",
  "version": "1.0.0",
  "units": "mm",
  "precision": {
    "eps": 0.001,
    "segments": 48
  },
  "actions": [
    {
      "id": "plate",
      "action": "solid.box",
      "params": {
        "size": [120, 80, 10],
        "center": [0, 0, 0]
      }
    }
  ],
  "result": "plate"
}
```

## 双用途 JSON

`docs/dsl/actions/*.json` 不是单纯给程序看的 schema，也不是单纯给 AI 的说明文档，而是“双用途 JSON”：

- `paramsSchema`：给程序做严格参数校验
- `llm`：给大模型直接阅读

例如每条 action 都会包含：

- `role`
- `inputKinds`
- `outputKind`
- `paramsSchema`
- `llm.summary`
- `llm.requiredParams`
- `llm.paramGuide`
- `llm.constraints`
- `llm.example`

## 目录结构

```text
docs/dsl/
  actions/
    common.types.schema.json
    curves.actions.json
    sketches.actions.json
    solids.actions.json
    construct.actions.json
    transforms.actions.json
    booleans.actions.json
    modifiers.actions.json
    patterns.actions.json
    display.actions.json
  dsl.index.json
  dsl.bundle.json
  program.schema.json

src/
  app.js
  main.js
  style.css
  lib/
    deepseek.js
    dsl/
      compiler.js
      definitions.js
      prompt.js
    renderer/
      three-viewer.js
```

## 核心代码位置

- DSL 定义加载：`src/lib/dsl/definitions.js`
- DSL Prompt 构造：`src/lib/dsl/prompt.js`
- DSL 编译执行：`src/lib/dsl/compiler.js`
- DeepSeek 调用：`src/lib/deepseek.js`
- Three.js 预览与 STL 导出：`src/lib/renderer/three-viewer.js`
- 页面交互入口：`src/app.js`

## 当前限制

- 当前 Web 版并没有实现所有 DSL action。
- 目前明确标记为 `llm.webSupported = false` 的 action，不应该由 AI 在当前网页版本中使用。
- 部分高级能力仍是后续迭代项，例如更复杂切片构造、部分截面裁切等。

## 后续可扩展方向

- 完整覆盖所有 DSL action 的 Web 运行时支持
- 服务端代理 AI 请求，避免浏览器直接使用 API Key
- 导出更多格式，如 `OBJ`
- 增加历史记录、结果管理、模型版本对比
- 增加 DSL 图结构可视化和依赖调试能力

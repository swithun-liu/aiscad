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
- 支持内置可视化测试实验室，直接在页面中运行标准案例并查看断言结果。
- 支持工业级测试案例预览，例如安装支架、法兰盘、轴承座夹块、控制盒底座。
- 支持 `JSON 光标联动解释`：光标落到某个 `action` 时，右侧同一个 3D viewer 切换到该 action 的作用解释模式。

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

运行自动化测试：

```bash
npm run test:run
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

### 可视化测试实验室

- 页面右侧内置 `测试案例` 区域
- 支持一键运行全部案例并查看断言是否通过
- 支持直接加载案例 JSON 到编辑器继续修改
- 支持直接预览工业级零件模型，用于肉眼检查建模效果

### JSON 光标联动解释

- 左侧仍然是原始 `DSL JSON` 编辑区，不新增独立解释面板
- 当光标落到某个 `action` 块内时：
  - 左侧底部会显示当前 action 的简短说明
  - 右侧同一个 3D viewer 会切换到该 action 的解释模式
- 不同 action 的解释模式不同：
  - `solid.*`：高亮当前创建的实体
  - `transform.*`：显示 `before / after`
  - `pattern.*`：显示 `source + instances`
  - `boolean.subtract`：显示 `base + tools + result`

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
      action-focus.js
      compiler.js
      definitions.js
      prompt.js
    testing/
      cases.js
      runner.js
    renderer/
      three-viewer.js

tests/
  fixtures/
    example-program.js
  schema/
    action-definitions.test.js
  compiler/
    action-focus.test.js
    validate-and-compile.test.js
    visual-runner.test.js
  ui/
    app.test.js
```

## 核心代码位置

- DSL 定义加载：`src/lib/dsl/definitions.js`
- DSL Prompt 构造：`src/lib/dsl/prompt.js`
- 光标 action 识别与解释策略：`src/lib/dsl/action-focus.js`
- DSL 编译执行：`src/lib/dsl/compiler.js`
- DeepSeek 调用：`src/lib/deepseek.js`
- Three.js 预览与 STL 导出：`src/lib/renderer/three-viewer.js`
- 工业级测试案例：`src/lib/testing/cases.js`
- 可视化测试运行器：`src/lib/testing/runner.js`
- 页面交互入口：`src/app.js`
- 自动化测试：`tests/`

## 自动化测试

当前测试分成四层：

- `schema`：检查 DSL action 定义、自描述字段和 LLM 元数据是否一致
- `compiler`：检查 DSL 是否能正确编译，并验证包围盒、体积、颜色等几何约束
- `visual runner`：检查工业级可视化案例是否能通过断言
- `ui`：检查页面交互链路，例如复制 Prompt、渲染 JSON、光标联动解释

测试运行命令：

```bash
npm run test:run
```

当前可视化案例包含：

- 伺服安装支架
- 轴承法兰盘
- 轴承座夹块
- 控制盒底座

## 当前限制

- 当前 Web 版并没有实现所有 DSL action。
- 目前明确标记为 `llm.webSupported = false` 的 action，不应该由 AI 在当前网页版本中使用。
- 部分高级能力仍是后续迭代项，例如更复杂切片构造、部分截面裁切等。

## 后续可扩展方向

- 完整覆盖所有 DSL action 的 Web 运行时支持
- 服务端代理 AI 请求，避免浏览器直接使用 API Key
- 导出更多格式，如 `OBJ`
- 增加历史记录、结果管理、模型版本对比
- 把左侧 JSON 编辑区升级为更适合块级高亮的代码编辑器
- 增强 action 解释模式，例如更精细的布尔运算 delta 预览
- 增加 DSL 图结构可视化和依赖调试能力

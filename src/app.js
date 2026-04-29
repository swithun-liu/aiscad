import { generateDslWithDeepSeek } from './lib/deepseek.js'
import { actionDefinitions } from './lib/dsl/definitions.js'
import { validateAndCompileProgram } from './lib/dsl/compiler.js'
import { buildDslPrompt, SUPPORTED_ACTION_NAMES } from './lib/dsl/prompt.js'
import { ThreeCadViewer } from './lib/renderer/three-viewer.js'

const STORAGE_KEYS = {
  apiKey: 'aiscad.deepseekApiKey',
  model: 'aiscad.deepseekModel',
  description: 'aiscad.lastDescription',
}

const EXAMPLE_DESCRIPTION = '生成一个 120x80x10 mm 的底板，四角各有一个直径 6 mm 的穿孔，孔中心距离边缘 10 mm，整体显示蓝色。'

const EXAMPLE_PROGRAM = {
  dsl: 'aiscad.dsl',
  version: '1.0.0',
  units: 'mm',
  precision: {
    eps: 0.001,
    segments: 48,
  },
  actions: [
    {
      id: 'plate',
      action: 'solid.box',
      params: {
        size: [120, 80, 10],
        center: [0, 0, 0],
      },
    },
    {
      id: 'hole',
      action: 'solid.cylinder',
      params: {
        height: 16,
        radius: 3,
        center: [0, 0, 0],
      },
    },
    {
      id: 'holes',
      action: 'pattern.grid',
      params: {
        source: 'hole',
        count: [2, 2, 1],
        step: [100, 60, 0],
        origin: [-50, -30, 0],
      },
    },
    {
      id: 'body',
      action: 'boolean.subtract',
      params: {
        base: 'plate',
        tools: ['holes'],
      },
    },
    {
      id: 'preview',
      action: 'display.color',
      params: {
        source: 'body',
        rgba: [0.19, 0.47, 0.98, 1],
      },
    },
  ],
  result: 'preview',
}

function formatJson(value) {
  return JSON.stringify(value, null, 2)
}

function el(selector, root = document) {
  return root.querySelector(selector)
}

function setStatus(root, message, tone = 'normal') {
  const status = el('[data-role="status"]', root)
  status.textContent = message
  status.dataset.tone = tone
}

function setError(root, message = '') {
  const box = el('[data-role="error"]', root)
  box.textContent = message
  box.hidden = !message
}

function persistField(key, value) {
  localStorage.setItem(key, value)
}

function readField(key, fallback = '') {
  return localStorage.getItem(key) || fallback
}

function buildStlFileName(description) {
  const baseName = (description || 'aiscad-model')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'aiscad-model'
  return `${baseName}.stl`
}

function collectSupportedActions() {
  return SUPPORTED_ACTION_NAMES
    .map((name) => `<li><code>${name}</code> - ${actionDefinitions[name].role}</li>`)
    .join('')
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'absolute'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

function toggleBusy(root, busy) {
  root.querySelectorAll('button').forEach((button) => {
    button.disabled = busy
  })
}

async function renderProgram(root, viewer, source) {
  const result = validateAndCompileProgram(source)
  viewer.render(result.renderables)
  setStatus(root, `渲染成功，共执行 ${source.actions.length} 条 action。`, 'success')
  setError(root)
  return result
}

export function createApp(root) {
  root.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar card">
        <h1>AISCAD</h1>
        <p class="muted">DeepSeek 生成 DSL JSON，浏览器本地解析并绘制模型。</p>

        <label class="field">
          <span>DeepSeek API Key</span>
          <input data-role="api-key" type="password" placeholder="sk-..." autocomplete="off" />
        </label>

        <label class="field">
          <span>模型</span>
          <input data-role="model" type="text" value="deepseek-chat" />
        </label>

        <label class="field">
          <span>模型描述</span>
          <textarea data-role="description" rows="8" placeholder="例如：生成一个带四角安装孔的底板"></textarea>
        </label>

        <div class="button-row">
          <button data-action="generate" class="primary">AI 生成并渲染</button>
          <button data-action="render-json">渲染当前 JSON</button>
        </div>

        <div class="button-row compact">
          <button data-action="export-stl">导出 STL</button>
          <button data-action="copy-prompt">复制完整 Prompt</button>
          <button data-action="use-example">填入示例描述</button>
        </div>

        <div class="button-row compact">
          <button data-action="load-example-json">载入示例 JSON</button>
        </div>

        <p class="muted">
          也可以不填 API Key：先复制完整 Prompt，发给外部 chat AI 生成 DSL JSON，再粘贴到右侧后点“渲染当前 JSON”。
        </p>

        <div class="status" data-role="status">等待输入</div>
        <pre class="error" data-role="error" hidden></pre>

        <details class="card nested-card">
          <summary>当前支持的 action</summary>
          <ul class="action-list">${collectSupportedActions()}</ul>
        </details>
      </aside>

      <main class="main-grid">
        <section class="panel card">
          <div class="panel-header">
            <h2>DSL JSON</h2>
            <span class="muted">可直接手动修改后重新渲染</span>
          </div>
          <textarea data-role="json-editor" class="json-editor" spellcheck="false"></textarea>
        </section>

        <section class="panel card viewer-panel">
          <div class="panel-header">
            <h2>模型预览</h2>
            <span class="muted">Three.js 渲染 JSCAD 几何</span>
          </div>
          <div class="viewer" data-role="viewer"></div>
        </section>
      </main>
    </div>
  `

  const apiKeyInput = el('[data-role="api-key"]', root)
  const modelInput = el('[data-role="model"]', root)
  const descriptionInput = el('[data-role="description"]', root)
  const jsonEditor = el('[data-role="json-editor"]', root)
  const viewer = new ThreeCadViewer(el('[data-role="viewer"]', root))

  apiKeyInput.value = readField(STORAGE_KEYS.apiKey)
  modelInput.value = readField(STORAGE_KEYS.model, 'deepseek-chat')
  descriptionInput.value = readField(STORAGE_KEYS.description, EXAMPLE_DESCRIPTION)
  jsonEditor.value = formatJson(EXAMPLE_PROGRAM)

  apiKeyInput.addEventListener('change', () => persistField(STORAGE_KEYS.apiKey, apiKeyInput.value.trim()))
  modelInput.addEventListener('change', () => persistField(STORAGE_KEYS.model, modelInput.value.trim()))
  descriptionInput.addEventListener('change', () => persistField(STORAGE_KEYS.description, descriptionInput.value.trim()))

  el('[data-action="use-example"]', root).addEventListener('click', () => {
    descriptionInput.value = EXAMPLE_DESCRIPTION
    persistField(STORAGE_KEYS.description, descriptionInput.value)
  })

  el('[data-action="copy-prompt"]', root).addEventListener('click', async () => {
    try {
      const description = descriptionInput.value.trim()
      if (!description) {
        throw new Error('请先填写模型描述，再复制 Prompt')
      }
      await copyText(buildDslPrompt(description))
      setError(root)
      setStatus(root, '完整 Prompt 已复制，可直接发给任意 chat AI 生成 DSL JSON。', 'success')
    } catch (error) {
      setError(root, error instanceof Error ? error.message : String(error))
      setStatus(root, '复制 Prompt 失败', 'error')
    }
  })

  el('[data-action="load-example-json"]', root).addEventListener('click', async () => {
    jsonEditor.value = formatJson(EXAMPLE_PROGRAM)
    await renderProgram(root, viewer, EXAMPLE_PROGRAM)
  })

  el('[data-action="export-stl"]', root).addEventListener('click', () => {
    try {
      viewer.exportStl(buildStlFileName(descriptionInput.value))
      setError(root)
      setStatus(root, 'STL 已开始导出。', 'success')
    } catch (error) {
      setError(root, error instanceof Error ? error.message : String(error))
      setStatus(root, '导出 STL 失败', 'error')
    }
  })

  el('[data-action="render-json"]', root).addEventListener('click', async () => {
    try {
      const parsed = JSON.parse(jsonEditor.value)
      await renderProgram(root, viewer, parsed)
    } catch (error) {
      setError(root, error instanceof Error ? error.message : String(error))
      setStatus(root, '渲染失败', 'error')
    }
  })

  el('[data-action="generate"]', root).addEventListener('click', async () => {
    toggleBusy(root, true)
    setError(root)
    setStatus(root, '正在请求 DeepSeek 生成 DSL...', 'loading')

    try {
      const program = await generateDslWithDeepSeek({
        apiKey: apiKeyInput.value.trim(),
        model: modelInput.value.trim() || 'deepseek-chat',
        description: descriptionInput.value.trim(),
      })
      jsonEditor.value = formatJson(program)
      await renderProgram(root, viewer, program)
    } catch (error) {
      setError(root, error instanceof Error ? error.message : String(error))
      setStatus(root, '生成失败', 'error')
    } finally {
      toggleBusy(root, false)
    }
  })

  renderProgram(root, viewer, EXAMPLE_PROGRAM).catch((error) => {
    setError(root, error instanceof Error ? error.message : String(error))
    setStatus(root, '初始化失败', 'error')
  })
}

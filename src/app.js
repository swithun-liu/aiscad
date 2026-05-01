import { generateDslWithDeepSeek } from './lib/deepseek.js'
import { actionDefinitions } from './lib/dsl/definitions.js'
import { buildActionFocusView, getActionIdAtCursor } from './lib/dsl/action-focus.js'
import { validateAndCompileProgram } from './lib/dsl/compiler.js'
import { createJsonEditor } from './lib/editor/json-editor.js'
import { createSketchPad } from './lib/input/sketch-pad.js'
import { buildDslPrompt, SUPPORTED_ACTION_NAMES } from './lib/dsl/prompt.js'
import { ThreeCadViewer } from './lib/renderer/three-viewer.js'
import { VISUAL_TEST_CASES, getVisualTestCase } from './lib/testing/cases.js'
import { runVisualTestCase, runVisualTestCases } from './lib/testing/runner.js'

const STORAGE_KEYS = {
  apiKey: 'aiscad.deepseekApiKey',
  model: 'aiscad.deepseekModel',
  description: 'aiscad.lastDescription',
  sketch: 'aiscad.sketchInput',
}

export const EXAMPLE_DESCRIPTION = '生成一个 120x80x10 mm 的底板，四角各有一个直径 6 mm 的穿孔，孔中心距离边缘 10 mm，整体显示蓝色。'

export const EXAMPLE_PROGRAM = {
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

function setWarnings(root, warnings = []) {
  const box = el('[data-role="warnings"]', root)
  if (!warnings.length) {
    box.textContent = ''
    box.hidden = true
    return
  }

  box.textContent = warnings
    .map((warning, index) => `${index + 1}. ${warning.message}`)
    .join('\n')
  box.hidden = false
}

function persistField(key, value) {
  localStorage.setItem(key, value)
}

function readField(key, fallback = '') {
  return localStorage.getItem(key) || fallback
}

function readJsonField(key) {
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function persistJsonField(key, value) {
  if (!value) {
    localStorage.removeItem(key)
    return
  }
  localStorage.setItem(key, JSON.stringify(value))
}

export function buildStlFileName(description) {
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

function summarizeSketch(sketch) {
  if (!sketch?.strokes?.length) {
    return '未提供草图；可手绘局部截面、卡扣方向、拼接关系等空间提示。'
  }

  const pointCount = sketch.strokes.reduce((sum, stroke) => sum + stroke.length, 0)
  return `已提供草图：${sketch.strokes.length} 条笔画，${pointCount} 个关键点；复制 Prompt 或直连生成时会一起作为辅助输入。`
}

function formatMetricValue(value) {
  if (value == null) return '-'
  if (typeof value === 'number') return String(value)
  return JSON.stringify(value)
}

function setActionFocusUi(root, focusView) {
  const jsonFocus = el('[data-role="action-focus"]', root)
  const viewerName = el('[data-role="viewer-focus-name"]', root)
  const viewerMode = el('[data-role="viewer-focus-mode"]', root)

  if (!focusView) {
    jsonFocus.textContent = '当前 action: 未聚焦，右侧显示完整模型。'
    viewerName.textContent = '当前查看: 完整模型'
    viewerMode.textContent = '模式: final result'
    return
  }

  jsonFocus.textContent = `当前 action: ${focusView.actionId} / ${focusView.actionName}。${focusView.summary}`
  viewerName.textContent = `当前查看: ${focusView.actionId} / ${focusView.actionName}`
  viewerMode.textContent = `模式: ${focusView.modeLabel}`
}

function renderVisualLab(root, state) {
  const summary = el('[data-role="test-summary"]', root)
  const list = el('[data-role="test-cases"]', root)

  if (!state.results.length) {
    summary.textContent = '点击“运行全部案例”后，会在这里展示断言结果。'
  } else {
    const passedCount = state.results.filter((item) => item.passed).length
    summary.textContent = `共 ${state.results.length} 个案例，通过 ${passedCount} 个，失败 ${state.results.length - passedCount} 个。`
  }

  list.innerHTML = VISUAL_TEST_CASES.map((testCase) => {
    const result = state.results.find((item) => item.caseId === testCase.id)
    const passClass = !result ? 'pending' : result.passed ? 'pass' : 'fail'
    const metrics = result?.metrics
    const assertions = result?.assertions || []

    return `
      <article class="test-case ${state.activeCaseId === testCase.id ? 'active' : ''}" data-case-id="${testCase.id}">
        <div class="test-case-header">
          <div>
            <h3>${testCase.name}</h3>
            <p class="muted">${testCase.description}</p>
          </div>
          <span class="test-badge ${passClass}">
            ${!result ? '未运行' : result.passed ? '通过' : '失败'}
          </span>
        </div>
        <div class="test-case-actions">
          <button data-action="preview-case" data-case-id="${testCase.id}">预览案例</button>
          <button data-action="load-case" data-case-id="${testCase.id}">载入 JSON</button>
        </div>
        <div class="test-metrics">
          <span>类型：${formatMetricValue(metrics?.resultKinds)}</span>
          <span>尺寸：${formatMetricValue(metrics?.bboxSize)}</span>
          <span>体积：${formatMetricValue(metrics?.volume)}</span>
        </div>
        <ul class="assertion-list">
          ${assertions.length
            ? assertions.map((assertion) => `
                <li class="${assertion.pass ? 'pass' : 'fail'}">
                  <strong>${assertion.pass ? 'PASS' : 'FAIL'}</strong>
                  <span>${assertion.label}：${assertion.detail}</span>
                </li>
              `).join('')
            : '<li class="pending"><span>尚未运行断言</span></li>'}
        </ul>
      </article>
    `
  }).join('')
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

function syncEditorFocus(root, viewer, jsonEditor, appState) {
  if (!appState.compiled) {
    setActionFocusUi(root, null)
    return
  }

  const actionId = getActionIdAtCursor(jsonEditor.getValue(), jsonEditor.getCursorOffset())
  const focusView = buildActionFocusView(appState.compiled, actionId)
  appState.focusedActionId = focusView?.actionId || null
  setActionFocusUi(root, focusView)

  if (focusView) {
    viewer.render(focusView.layers, {
      fitCamera: false,
      exportRecords: appState.compiled.renderables,
    })
    return
  }

  viewer.render(appState.compiled.renderables, {
    exportRecords: appState.compiled.renderables,
  })
}

async function renderProgram(root, viewer, source, appState, options = {}) {
  const result = validateAndCompileProgram(source)
  appState.compiled = result
  viewer.render(result.renderables, {
    exportRecords: result.renderables,
  })
  const warningCount = result.strategyWarnings?.length || 0
  setStatus(root, warningCount
    ? `渲染成功，共执行 ${source.actions.length} 条 action；发现 ${warningCount} 条策略提醒。`
    : `渲染成功，共执行 ${source.actions.length} 条 action。`, warningCount ? 'loading' : 'success')
  setError(root)
  setWarnings(root, result.strategyWarnings)
  setActionFocusUi(root, null)
  if (options.syncFocus !== false) {
    syncEditorFocus(root, viewer, options.jsonEditor, appState)
  }
  return result
}

function loadProgramIntoEditor(descriptionInput, jsonEditor, testCase) {
  descriptionInput.value = testCase.description
  persistField(STORAGE_KEYS.description, descriptionInput.value)
  jsonEditor.setValue(formatJson(testCase.program))
}

export function createApp(root, dependencies = {}) {
  const generateDsl = dependencies.generateDslWithDeepSeek || generateDslWithDeepSeek
  const buildPrompt = dependencies.buildDslPrompt || buildDslPrompt
  const createViewer = dependencies.createViewer || ((container) => new ThreeCadViewer(container))
  const copy = dependencies.copyText || copyText

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

        <section class="field">
          <span>草图辅助输入</span>
          <div class="sketch-card">
            <div data-role="sketch-pad" class="sketch-pad"></div>
            <div class="button-row compact">
              <button data-action="clear-sketch" type="button">清空草图</button>
            </div>
            <p class="muted sketch-summary" data-role="sketch-summary">未提供草图；可手绘局部截面、卡扣方向、拼接关系等空间提示。</p>
          </div>
        </section>

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
        <pre class="warning-list" data-role="warnings" hidden></pre>

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
          <div data-role="json-editor-host" class="json-editor-shell"></div>
          <div class="action-focus-hint muted" data-role="action-focus">当前 action: 未聚焦，右侧显示完整模型。</div>
        </section>

        <section class="panel card viewer-panel">
          <div class="panel-header">
            <h2>模型预览</h2>
            <span class="muted">Three.js 渲染 JSCAD 几何</span>
          </div>
          <div class="viewer-stage">
            <div class="viewer-focus-badges">
              <span class="viewer-badge" data-role="viewer-focus-name">当前查看: 完整模型</span>
              <span class="viewer-badge muted" data-role="viewer-focus-mode">模式: final result</span>
            </div>
            <div class="viewer" data-role="viewer"></div>
          </div>
          <section class="test-lab card nested-card">
            <div class="panel-header compact-header">
              <h2>测试案例</h2>
              <div class="button-row compact">
                <button data-action="run-all-cases">运行全部案例</button>
              </div>
            </div>
            <p class="muted" data-role="test-summary">点击“运行全部案例”后，会在这里展示断言结果。</p>
            <div class="test-case-list" data-role="test-cases"></div>
          </section>
        </section>
      </main>
    </div>
  `

  const apiKeyInput = el('[data-role="api-key"]', root)
  const modelInput = el('[data-role="model"]', root)
  const descriptionInput = el('[data-role="description"]', root)
  const sketchSummary = el('[data-role="sketch-summary"]', root)
  const viewer = createViewer(el('[data-role="viewer"]', root))
  const visualLabState = {
    activeCaseId: VISUAL_TEST_CASES[0]?.id || null,
    results: [],
  }
  const appState = {
    compiled: null,
    focusedActionId: null,
  }
  let jsonEditor
  jsonEditor = createJsonEditor(el('[data-role="json-editor-host"]', root), {
    value: formatJson(EXAMPLE_PROGRAM),
    onChange: () => syncEditorFocus(root, viewer, jsonEditor, appState),
    onSelectionChange: () => syncEditorFocus(root, viewer, jsonEditor, appState),
  })
  const sketchPad = createSketchPad(el('[data-role="sketch-pad"]', root), {
    value: readJsonField(STORAGE_KEYS.sketch),
    onChange: (sketch) => {
      persistJsonField(STORAGE_KEYS.sketch, sketch)
      sketchSummary.textContent = summarizeSketch(sketch)
    },
  })

  apiKeyInput.value = readField(STORAGE_KEYS.apiKey)
  modelInput.value = readField(STORAGE_KEYS.model, 'deepseek-chat')
  descriptionInput.value = readField(STORAGE_KEYS.description, EXAMPLE_DESCRIPTION)
  sketchSummary.textContent = summarizeSketch(sketchPad.getSketchData())
  renderVisualLab(root, visualLabState)

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
      await copy(buildPrompt(description, { sketch: sketchPad.getSketchData() }))
      setError(root)
      setWarnings(root)
      setStatus(root, '完整 Prompt 已复制，可直接发给任意 chat AI 生成 DSL JSON。', 'success')
    } catch (error) {
      setError(root, error instanceof Error ? error.message : String(error))
      setWarnings(root)
      setStatus(root, '复制 Prompt 失败', 'error')
    }
  })

  el('[data-action="clear-sketch"]', root).addEventListener('click', () => {
    sketchPad.clear()
    setError(root)
    setWarnings(root, appState.compiled?.strategyWarnings || [])
    setStatus(root, '草图已清空。', 'success')
  })

  el('[data-action="load-example-json"]', root).addEventListener('click', async () => {
    jsonEditor.setValue(formatJson(EXAMPLE_PROGRAM))
    await renderProgram(root, viewer, EXAMPLE_PROGRAM, appState, { jsonEditor })
  })

  el('[data-action="run-all-cases"]', root).addEventListener('click', async () => {
    try {
      setError(root)
      setStatus(root, '正在运行可视化测试案例...', 'loading')
      visualLabState.results = runVisualTestCases(VISUAL_TEST_CASES)
      renderVisualLab(root, visualLabState)

      const activeCase = getVisualTestCase(visualLabState.activeCaseId) || VISUAL_TEST_CASES[0]
      const activeResult = visualLabState.results.find((item) => item.caseId === activeCase?.id)
      if (activeCase && activeResult?.compiled) {
        loadProgramIntoEditor(descriptionInput, jsonEditor, activeCase)
        appState.compiled = activeResult.compiled
        viewer.render(activeResult.compiled.renderables, {
          exportRecords: activeResult.compiled.renderables,
        })
        syncEditorFocus(root, viewer, jsonEditor, appState)
      }

      const failedCount = visualLabState.results.filter((item) => !item.passed).length
      setStatus(root, failedCount === 0 ? '测试案例全部通过，可直接点击单个案例肉眼检查效果。' : `测试案例运行完成，失败 ${failedCount} 个。`, failedCount === 0 ? 'success' : 'error')
    } catch (error) {
      setError(root, error instanceof Error ? error.message : String(error))
      setWarnings(root)
      setStatus(root, '运行测试案例失败', 'error')
    }
  })

  el('[data-role="test-cases"]', root).addEventListener('click', (event) => {
    const button = event.target.closest('button[data-case-id]')
    if (!button) return

    const testCase = getVisualTestCase(button.dataset.caseId)
    if (!testCase) return

    visualLabState.activeCaseId = testCase.id

    if (button.dataset.action === 'load-case') {
      loadProgramIntoEditor(descriptionInput, jsonEditor, testCase)
      renderVisualLab(root, visualLabState)
      setError(root)
      setStatus(root, `已载入测试案例“${testCase.name}”到 JSON 编辑器。`, 'success')
      return
    }

    try {
      const result = runVisualTestCase(testCase)
      visualLabState.results = [
        ...visualLabState.results.filter((item) => item.caseId !== testCase.id),
        result,
      ]
      loadProgramIntoEditor(descriptionInput, jsonEditor, testCase)
      appState.compiled = result.compiled
      viewer.render(result.compiled.renderables, {
        exportRecords: result.compiled.renderables,
      })
      syncEditorFocus(root, viewer, jsonEditor, appState)
      renderVisualLab(root, visualLabState)
      setError(root)
      setWarnings(root, result.compiled?.strategyWarnings || [])
      setStatus(root, `已预览测试案例“${testCase.name}”，你可以直接肉眼检查模型效果。`, result.passed ? 'success' : 'error')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      visualLabState.results = [
        ...visualLabState.results.filter((item) => item.caseId !== testCase.id),
        {
          caseId: testCase.id,
          name: testCase.name,
          description: testCase.description,
          compiled: null,
          metrics: null,
          assertions: [{ pass: false, label: '执行结果', detail: message }],
          passed: false,
        },
      ]
      renderVisualLab(root, visualLabState)
      setError(root, message)
      setWarnings(root)
      setStatus(root, `测试案例“${testCase.name}”运行失败`, 'error')
    }
  })

  el('[data-action="export-stl"]', root).addEventListener('click', () => {
    try {
      viewer.exportStl(buildStlFileName(descriptionInput.value))
      setError(root)
      setWarnings(root, appState.compiled?.strategyWarnings || [])
      setStatus(root, 'STL 已开始导出。', 'success')
    } catch (error) {
      setError(root, error instanceof Error ? error.message : String(error))
      setWarnings(root)
      setStatus(root, '导出 STL 失败', 'error')
    }
  })

  el('[data-action="render-json"]', root).addEventListener('click', async () => {
    try {
      const parsed = JSON.parse(jsonEditor.getValue())
      await renderProgram(root, viewer, parsed, appState, { jsonEditor })
    } catch (error) {
      setError(root, error instanceof Error ? error.message : String(error))
      setWarnings(root)
      setStatus(root, '渲染失败', 'error')
    }
  })

  el('[data-action="generate"]', root).addEventListener('click', async () => {
    toggleBusy(root, true)
    setError(root)
    setStatus(root, '正在请求 DeepSeek 生成 DSL...', 'loading')

    try {
      const program = await generateDsl({
        apiKey: apiKeyInput.value.trim(),
        model: modelInput.value.trim() || 'deepseek-chat',
        description: descriptionInput.value.trim(),
        sketch: sketchPad.getSketchData(),
      })
      jsonEditor.setValue(formatJson(program))
      await renderProgram(root, viewer, program, appState, { jsonEditor })
    } catch (error) {
      setError(root, error instanceof Error ? error.message : String(error))
      setWarnings(root)
      setStatus(root, '生成失败', 'error')
    } finally {
      toggleBusy(root, false)
    }
  })

  renderProgram(root, viewer, EXAMPLE_PROGRAM, appState, { jsonEditor }).catch((error) => {
    setError(root, error instanceof Error ? error.message : String(error))
    setWarnings(root)
    setStatus(root, '初始化失败', 'error')
  })

  try {
    visualLabState.results = runVisualTestCases(VISUAL_TEST_CASES)
    renderVisualLab(root, visualLabState)
  } catch (error) {
    setError(root, error instanceof Error ? error.message : String(error))
  }
}

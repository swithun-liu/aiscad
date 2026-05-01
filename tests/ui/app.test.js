/* @vitest-environment jsdom */

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createApp } from '../../src/app.js'
import { cloneExampleProgram } from '../fixtures/example-program.js'

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('createApp', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = '<div id="app"></div>'
    localStorage.clear()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fillStyle: '#000000',
      strokeStyle: '#000000',
      lineWidth: 1,
      lineCap: 'round',
      lineJoin: 'round',
    }))
    if (!Range.prototype.getClientRects) {
      Range.prototype.getClientRects = () => []
    }
    if (!Range.prototype.getBoundingClientRect) {
      Range.prototype.getBoundingClientRect = () => ({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      })
    }
  })

  test('renders the example program on startup and allows exporting STL', async () => {
    const render = vi.fn()
    const exportStl = vi.fn()

    createApp(document.querySelector('#app'), {
      createViewer: () => ({ render, exportStl }),
    })

    await flushPromises()

    expect(render).toHaveBeenCalled()

    document.querySelector('[data-action="export-stl"]').click()

    expect(exportStl).toHaveBeenCalledTimes(1)
    expect(exportStl.mock.calls[0][0]).toMatch(/\.stl$/)
    expect(document.querySelector('[data-role="status"]').textContent).toContain('STL 已开始导出')
  })

  test('copies the generated prompt through injected helpers', async () => {
    const buildDslPrompt = vi.fn((description) => `PROMPT:${description}`)
    const copyText = vi.fn(() => Promise.resolve())

    createApp(document.querySelector('#app'), {
      createViewer: () => ({ render: vi.fn(), exportStl: vi.fn() }),
      buildDslPrompt,
      copyText,
    })

    await flushPromises()
    document.querySelector('[data-action="copy-prompt"]').click()
    await flushPromises()

    expect(buildDslPrompt).toHaveBeenCalledTimes(1)
    expect(buildDslPrompt.mock.calls[0][1]).toEqual({ sketch: null })
    expect(copyText).toHaveBeenCalledWith(expect.stringContaining('PROMPT:'))
  })

  test('uses the injected generator and writes returned DSL into the editor', async () => {
    const generatedProgram = cloneExampleProgram()
    generatedProgram.actions[0].params.size = [200, 90, 12]
    const generateDslWithDeepSeek = vi.fn(async () => generatedProgram)
    const render = vi.fn()

    createApp(document.querySelector('#app'), {
      createViewer: () => ({ render, exportStl: vi.fn() }),
      generateDslWithDeepSeek,
    })

    await flushPromises()
    render.mockClear()

    document.querySelector('[data-role="api-key"]').value = 'sk-test'
    document.querySelector('[data-action="generate"]').click()
    await flushPromises()

    expect(generateDslWithDeepSeek).toHaveBeenCalledTimes(1)
    expect(generateDslWithDeepSeek.mock.calls[0][0]).toHaveProperty('sketch', null)
    expect(render).toHaveBeenCalled()

    const editorValue = document.querySelector('[data-role="json-editor"]').__jsonEditor.getValue()
    expect(editorValue).toContain('"size": [')
    expect(editorValue).toContain('200')
  })

  test('updates action focus hint when cursor moves inside an action block', async () => {
    const render = vi.fn()

    createApp(document.querySelector('#app'), {
      createViewer: () => ({ render, exportStl: vi.fn() }),
    })

    await flushPromises()

    const editor = document.querySelector('[data-role="json-editor"]')
    const editorApi = editor.__jsonEditor
    const subtractOffset = editorApi.getValue().indexOf('"action": "boolean.subtract"')
    editorApi.setCursorOffset(subtractOffset)

    expect(document.querySelector('[data-role="action-focus"]').textContent).toContain('body / boolean.subtract')
    expect(document.querySelector('[data-role="viewer-focus-mode"]').textContent).toContain('base + tools + result')
    expect(render).toHaveBeenCalled()
  })

  test('renders CodeMirror editor with syntax highlighting and gutters', async () => {
    createApp(document.querySelector('#app'), {
      createViewer: () => ({ render: vi.fn(), exportStl: vi.fn() }),
    })

    await flushPromises()

    expect(document.querySelector('[data-role="json-editor"]')).toBeTruthy()
    expect(document.querySelector('.cm-gutters')).toBeTruthy()
    expect(document.querySelector('.cm-content').textContent).toContain('"dsl": "aiscad.dsl"')
  })

  test('passes sketch data into prompt builder after drawing helper input', async () => {
    const buildDslPrompt = vi.fn((description) => `PROMPT:${description}`)
    const copyText = vi.fn(() => Promise.resolve())

    createApp(document.querySelector('#app'), {
      createViewer: () => ({ render: vi.fn(), exportStl: vi.fn() }),
      buildDslPrompt,
      copyText,
    })

    await flushPromises()

    document.querySelector('[data-role="sketch-pad"]').__sketchPad.setSketchData({
      strokes: [[
        { x: 0.1, y: 0.2 },
        { x: 0.3, y: 0.25 },
        { x: 0.6, y: 0.4 },
      ]],
    })

    document.querySelector('[data-action="copy-prompt"]').click()
    await flushPromises()

    expect(buildDslPrompt.mock.calls[0][1]).toEqual({
      sketch: expect.objectContaining({
        version: '1.0',
        strokes: expect.any(Array),
      }),
    })
  })
})

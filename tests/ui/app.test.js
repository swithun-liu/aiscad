/* @vitest-environment jsdom */

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createApp } from '../../src/app.js'
import { cloneExampleProgram } from '../fixtures/example-program.js'

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('createApp', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>'
    localStorage.clear()
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
    expect(render).toHaveBeenCalled()

    const editorValue = document.querySelector('[data-role="json-editor"]').value
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
    const subtractOffset = editor.value.indexOf('"action": "boolean.subtract"')
    editor.focus()
    editor.setSelectionRange(subtractOffset, subtractOffset)
    editor.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowDown' }))

    expect(document.querySelector('[data-role="action-focus"]').textContent).toContain('body / boolean.subtract')
    expect(document.querySelector('[data-role="viewer-focus-mode"]').textContent).toContain('base + tools + result')
    expect(render).toHaveBeenCalled()
  })
})

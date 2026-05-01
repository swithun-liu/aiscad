import { describe, expect, test } from 'vitest'
import { buildActionFocusView, getActionIdAtCursor } from '../../src/lib/dsl/action-focus.js'
import { validateAndCompileProgram } from '../../src/lib/dsl/compiler.js'
import { cloneExampleProgram } from '../fixtures/example-program.js'

describe('action focus helpers', () => {
  test('finds the current action id from editor cursor position', () => {
    const program = cloneExampleProgram()
    const text = JSON.stringify(program, null, 2)
    const cursorOffset = text.indexOf('"action": "boolean.subtract"')

    expect(getActionIdAtCursor(text, cursorOffset)).toBe('body')
  })

  test('builds an explanatory focus view for boolean.subtract', () => {
    const compiled = validateAndCompileProgram(cloneExampleProgram())
    const focusView = buildActionFocusView(compiled, 'body')

    expect(focusView.actionId).toBe('body')
    expect(focusView.actionName).toBe('boolean.subtract')
    expect(focusView.modeLabel).toBe('base + tools + result')
    expect(focusView.summary).toContain('减去')
    expect(focusView.layers.length).toBeGreaterThanOrEqual(3)
  })
})

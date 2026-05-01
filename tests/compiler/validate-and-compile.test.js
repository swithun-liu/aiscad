import { describe, expect, test } from 'vitest'
import modelingModule from '@jscad/modeling'
import { validateAndCompileProgram } from '../../src/lib/dsl/compiler.js'
import { cloneExampleProgram } from '../fixtures/example-program.js'

const modeling = modelingModule.default || modelingModule
const { measurements } = modeling

describe('validateAndCompileProgram', () => {
  test('compiles the example plate-with-holes program into a colored geom3', () => {
    const result = validateAndCompileProgram(cloneExampleProgram())
    const [record] = result.resultRecords
    const bbox = measurements.measureBoundingBox(record.value)
    const volume = measurements.measureVolume(record.value)

    expect(record.kind).toBe('geom3')
    expect(record.color).toEqual([0.19, 0.47, 0.98, 1])
    expect(result.renderables).toHaveLength(1)
    expect(bbox[0][0]).toBeCloseTo(-60, 5)
    expect(bbox[0][1]).toBeCloseTo(-40, 5)
    expect(bbox[0][2]).toBeCloseTo(-5, 5)
    expect(bbox[1][0]).toBeCloseTo(60, 5)
    expect(bbox[1][1]).toBeCloseTo(40, 5)
    expect(bbox[1][2]).toBeCloseTo(5, 5)
    expect(volume).toBeGreaterThan(94800)
    expect(volume).toBeLessThan(94950)
    expect(result.strategyWarnings).toEqual([])
  })

  test('rejects invalid params early with schema errors', () => {
    const invalidProgram = cloneExampleProgram()
    delete invalidProgram.actions[0].params.size

    expect(() => validateAndCompileProgram(invalidProgram))
      .toThrow(/参数校验失败/)
  })

  test('rejects actions that are not defined in the DSL', () => {
    const invalidProgram = cloneExampleProgram()
    invalidProgram.actions[0].action = 'solid.notExists'

    expect(() => validateAndCompileProgram(invalidProgram))
      .toThrow(/未定义/)
  })

  test('returns strategy warnings when final result is still 2d', () => {
    const program = {
      dsl: 'aiscad.dsl',
      version: '1.0.0',
      units: 'mm',
      actions: [
        {
          id: 'profile',
          action: 'sketch.rectangle',
          params: {
            size: [80, 40],
            center: [0, 0],
          },
        },
      ],
      result: 'profile',
    }

    const result = validateAndCompileProgram(program)

    expect(result.strategyWarnings.some((item) => item.code === 'final-result-not-3d')).toBe(true)
  })

  test('returns strategy warnings for high-complexity pattern subtraction', () => {
    const program = {
      dsl: 'aiscad.dsl',
      version: '1.0.0',
      units: 'mm',
      actions: [
        {
          id: 'plate',
          action: 'solid.box',
          params: {
            size: [200, 120, 8],
            center: [0, 0, 0],
          },
        },
        {
          id: 'tool',
          action: 'solid.cylinder',
          params: {
            height: 12,
            radius: 2,
            center: [0, 0, 0],
          },
        },
        {
          id: 'tool_grid',
          action: 'pattern.grid',
          params: {
            source: 'tool',
            count: [9, 8, 1],
            step: [18, 14, 0],
            origin: [-72, -49, 0],
          },
        },
        {
          id: 'body',
          action: 'boolean.subtract',
          params: {
            base: 'plate',
            tools: ['tool_grid'],
          },
        },
      ],
      result: 'body',
    }

    const result = validateAndCompileProgram(program)

    expect(result.strategyWarnings.some((item) => item.code === 'large-pattern-instance-count')).toBe(true)
    expect(result.strategyWarnings.some((item) => item.code === 'pattern-group-used-as-subtract-tools')).toBe(true)
  })
})

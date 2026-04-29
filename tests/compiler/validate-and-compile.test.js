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
})

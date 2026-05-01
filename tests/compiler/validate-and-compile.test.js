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

  test('solid.roundedBox compiles with default segments when omitted', () => {
    const program = {
      dsl: 'aiscad.dsl',
      version: '1.0.0',
      units: 'mm',
      actions: [
        {
          id: 'shell',
          action: 'solid.roundedBox',
          params: {
            size: [180, 120, 18],
            center: [0, 0, 9],
            radius: 4,
          },
        },
      ],
      result: 'shell',
    }

    const result = validateAndCompileProgram(program)
    const [record] = result.resultRecords
    const bbox = measurements.measureBoundingBox(record.value)

    expect(record.kind).toBe('geom3')
    expect(bbox[0][0]).toBeCloseTo(-90, 5)
    expect(bbox[1][2]).toBeCloseTo(18, 5)
  })

  test('solid.hollowBox builds an open shell with correct wall thickness defaults', () => {
    const program = {
      dsl: 'aiscad.dsl',
      version: '1.0.0',
      units: 'mm',
      actions: [
        {
          id: 'lid_shell',
          action: 'solid.hollowBox',
          params: {
            size: [180, 120, 18],
            center: [0, 0, 9],
            wallThickness: 3,
          },
        },
      ],
      result: 'lid_shell',
    }

    const result = validateAndCompileProgram(program)
    const [record] = result.resultRecords
    const bbox = measurements.measureBoundingBox(record.value)
    const volume = measurements.measureVolume(record.value)

    expect(result.program.actions[0].params.openAxis).toBe('z')
    expect(result.program.actions[0].params.openSide).toBe('negative')
    expect(record.kind).toBe('geom3')
    expect(bbox[0][0]).toBeCloseTo(-90, 5)
    expect(bbox[1][2]).toBeCloseTo(18, 5)
    expect(volume).toBeGreaterThan(91000)
    expect(volume).toBeLessThan(91500)
  })

  test('sketch.roundedRectangle compiles with default segments when omitted', () => {
    const program = {
      dsl: 'aiscad.dsl',
      version: '1.0.0',
      units: 'mm',
      actions: [
        {
          id: 'profile',
          action: 'sketch.roundedRectangle',
          params: {
            size: [180, 120],
            center: [0, 0],
            radius: 4,
          },
        },
        {
          id: 'body',
          action: 'construct.extrudeLinear',
          params: {
            source: 'profile',
            height: 18,
          },
        },
      ],
      result: 'body',
    }

    const result = validateAndCompileProgram(program)
    const [record] = result.resultRecords
    const bbox = measurements.measureBoundingBox(record.value)

    expect(record.kind).toBe('geom3')
    expect(bbox[0][0]).toBeCloseTo(-90, 5)
    expect(bbox[1][1]).toBeCloseTo(60, 5)
  })

  test('applies shared default segments for common curved actions when omitted', () => {
    const program = {
      dsl: 'aiscad.dsl',
      version: '1.0.0',
      units: 'mm',
      actions: [
        {
          id: 'arc',
          action: 'curve.arc',
          params: {
            center: [0, 0],
            radius: 20,
            startAngle: 0,
            endAngle: 180,
          },
        },
        {
          id: 'profile',
          action: 'sketch.circle',
          params: {
            radius: 10,
            center: [0, 0],
          },
        },
        {
          id: 'offset_profile',
          action: 'modify.offset2d',
          params: {
            source: 'profile',
            distance: 2,
          },
        },
        {
          id: 'revolved',
          action: 'construct.extrudeRotate',
          params: {
            source: 'offset_profile',
          },
        },
        {
          id: 'sphere',
          action: 'solid.sphere',
          params: {
            radius: 8,
            center: [40, 0, 0],
          },
        },
        {
          id: 'result',
          action: 'boolean.union',
          params: {
            sources: ['revolved', 'sphere'],
          },
        },
      ],
      result: 'result',
    }

    const result = validateAndCompileProgram(program)

    expect(result.program.actions[0].params.segments).toBe(32)
    expect(result.program.actions[1].params.segments).toBe(32)
    expect(result.program.actions[2].params.segments).toBe(32)
    expect(result.program.actions[3].params.segments).toBe(32)
    expect(result.program.actions[4].params.segments).toBe(32)
    expect(result.resultRecords[0].kind).toBe('geom3')
  })

  test('transform.rotate honors custom origin as pivot', () => {
    const program = {
      dsl: 'aiscad.dsl',
      version: '1.0.0',
      units: 'mm',
      actions: [
        {
          id: 'box',
          action: 'solid.box',
          params: {
            size: [10, 10, 10],
            center: [20, 0, 0],
          },
        },
        {
          id: 'rotated',
          action: 'transform.rotate',
          params: {
            source: 'box',
            angles: [0, 0, 180],
            origin: [10, 0, 0],
          },
        },
      ],
      result: 'rotated',
    }

    const result = validateAndCompileProgram(program)
    const bbox = measurements.measureBoundingBox(result.resultRecords[0].value)

    expect(bbox[0][0]).toBeCloseTo(-5, 5)
    expect(bbox[1][0]).toBeCloseTo(5, 5)
  })

  test('transform.scale honors custom origin as pivot', () => {
    const program = {
      dsl: 'aiscad.dsl',
      version: '1.0.0',
      units: 'mm',
      actions: [
        {
          id: 'box',
          action: 'solid.box',
          params: {
            size: [10, 10, 10],
            center: [20, 0, 0],
          },
        },
        {
          id: 'scaled',
          action: 'transform.scale',
          params: {
            source: 'box',
            factors: [2, 1, 1],
            origin: [10, 0, 0],
          },
        },
      ],
      result: 'scaled',
    }

    const result = validateAndCompileProgram(program)
    const bbox = measurements.measureBoundingBox(result.resultRecords[0].value)

    expect(bbox[0][0]).toBeCloseTo(20, 5)
    expect(bbox[1][0]).toBeCloseTo(40, 5)
  })
})

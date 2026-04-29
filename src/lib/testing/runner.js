import modelingModule from '@jscad/modeling'
import { validateAndCompileProgram } from '../dsl/compiler.js'

const modeling = modelingModule.default || modelingModule
const { measurements } = modeling

function roundNumber(value, digits = 3) {
  return Number(value.toFixed(digits))
}

function roundVector(values, digits = 3) {
  return values.map((value) => roundNumber(value, digits))
}

function measureResult(result) {
  const primary = result.resultRecords[0]
  const bbox = primary?.kind === 'geom3' || primary?.kind === 'geom2'
    ? measurements.measureBoundingBox(primary.value)
    : null
  const bboxSize = bbox
    ? roundVector([
      bbox[1][0] - bbox[0][0],
      bbox[1][1] - bbox[0][1],
      bbox[1][2] - bbox[0][2],
    ])
    : null
  const volume = primary?.kind === 'geom3'
    ? roundNumber(measurements.measureVolume(primary.value))
    : null

  return {
    resultKinds: result.resultRecords.map((record) => record.kind),
    renderableCount: result.renderables.length,
    color: primary?.color || null,
    bbox,
    bboxSize,
    volume,
  }
}

function compareNumber(actual, expected, tolerance) {
  return Math.abs(actual - expected) <= tolerance
}

function compareVector(actual, expected, tolerance) {
  return actual.length === expected.length
    && actual.every((value, index) => compareNumber(value, expected[index], tolerance))
}

function buildAssertion(pass, label, detail) {
  return {
    pass,
    label,
    detail,
  }
}

function evaluateExpectations(metrics, expectConfig) {
  const assertions = []

  if (expectConfig.resultKinds) {
    const pass = JSON.stringify(metrics.resultKinds) === JSON.stringify(expectConfig.resultKinds)
    assertions.push(buildAssertion(
      pass,
      '结果类型',
      `期望 ${expectConfig.resultKinds.join(', ')}，实际 ${metrics.resultKinds.join(', ')}`,
    ))
  }

  if (typeof expectConfig.renderableCount === 'number') {
    const pass = metrics.renderableCount === expectConfig.renderableCount
    assertions.push(buildAssertion(
      pass,
      '可渲染对象数量',
      `期望 ${expectConfig.renderableCount}，实际 ${metrics.renderableCount}`,
    ))
  }

  if (expectConfig.color) {
    const pass = JSON.stringify(metrics.color) === JSON.stringify(expectConfig.color)
    assertions.push(buildAssertion(
      pass,
      '预览颜色',
      `期望 ${JSON.stringify(expectConfig.color)}，实际 ${JSON.stringify(metrics.color)}`,
    ))
  }

  if (expectConfig.bboxSize) {
    const tolerance = expectConfig.bboxTolerance ?? 0.001
    const pass = Array.isArray(metrics.bboxSize) && compareVector(metrics.bboxSize, expectConfig.bboxSize, tolerance)
    assertions.push(buildAssertion(
      pass,
      '包围盒尺寸',
      `期望 ${JSON.stringify(expectConfig.bboxSize)}，实际 ${JSON.stringify(metrics.bboxSize)}`,
    ))
  }

  if (expectConfig.volumeRange) {
    const [min, max] = expectConfig.volumeRange
    const pass = typeof metrics.volume === 'number' && metrics.volume >= min && metrics.volume <= max
    assertions.push(buildAssertion(
      pass,
      '体积范围',
      `期望 ${min} ~ ${max}，实际 ${metrics.volume}`,
    ))
  }

  return assertions
}

export function runVisualTestCase(testCase) {
  const compiled = validateAndCompileProgram(structuredClone(testCase.program))
  const metrics = measureResult(compiled)
  const assertions = evaluateExpectations(metrics, testCase.expect || {})
  const passed = assertions.every((item) => item.pass)

  return {
    caseId: testCase.id,
    name: testCase.name,
    description: testCase.description,
    compiled,
    metrics,
    assertions,
    passed,
  }
}

export function runVisualTestCases(testCases) {
  return testCases.map((testCase) => {
    try {
      return runVisualTestCase(testCase)
    } catch (error) {
      return {
        caseId: testCase.id,
        name: testCase.name,
        description: testCase.description,
        compiled: null,
        metrics: null,
        assertions: [
          buildAssertion(false, '执行结果', error instanceof Error ? error.message : String(error)),
        ],
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })
}

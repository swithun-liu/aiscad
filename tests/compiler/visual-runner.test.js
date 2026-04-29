import { describe, expect, test } from 'vitest'
import { VISUAL_TEST_CASES } from '../../src/lib/testing/cases.js'
import { runVisualTestCase, runVisualTestCases } from '../../src/lib/testing/runner.js'

describe('visual test runner', () => {
  test('runs a single case and exposes metrics plus assertions', () => {
    const testCase = VISUAL_TEST_CASES[0]
    const result = runVisualTestCase(testCase)

    expect(result.passed).toBe(true)
    expect(result.metrics.bboxSize).toEqual(testCase.expect.bboxSize)
    expect(result.metrics.resultKinds).toEqual(testCase.expect.resultKinds)
    expect(result.assertions.every((item) => item.pass)).toBe(true)
  })

  test('runs all cases and preserves case ordering', () => {
    const results = runVisualTestCases(VISUAL_TEST_CASES)

    expect(results).toHaveLength(VISUAL_TEST_CASES.length)
    expect(results.map((item) => item.caseId)).toEqual(VISUAL_TEST_CASES.map((item) => item.id))
  })
})

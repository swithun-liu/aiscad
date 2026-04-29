import { describe, expect, test } from 'vitest'
import { actionDefinitions, actionSets, commonTypesSchema } from '../../src/lib/dsl/definitions.js'

describe('DSL action definitions', () => {
  test('common types expose LLM-readable type guides', () => {
    expect(commonTypesSchema.llm?.purpose).toBeTruthy()
    expect(commonTypesSchema.llm?.typeGuide?.vector3).toBeTruthy()
    expect(commonTypesSchema.llm?.typeGuide?.ref).toBeTruthy()
  })

  test('every executable action includes consistent schema and llm metadata', () => {
    for (const [actionName, definition] of Object.entries(actionDefinitions)) {
      expect(definition.role, `${actionName} 缺少 role`).toBeTruthy()
      expect(definition.outputKind, `${actionName} 缺少 outputKind`).toBeTruthy()
      expect(definition.paramsSchema?.type, `${actionName} paramsSchema 必须是 object`).toBe('object')
      expect(definition.llm, `${actionName} 缺少 llm`).toBeTruthy()
      expect(definition.llm.summary, `${actionName} 缺少 llm.summary`).toBeTruthy()
      expect(definition.llm.paramGuide, `${actionName} 缺少 llm.paramGuide`).toBeTruthy()
      expect(definition.llm.example?.action, `${actionName} 示例 action 不正确`).toBe(actionName)

      const required = definition.paramsSchema.required || []
      const llmRequired = definition.llm.requiredParams || []

      expect([...llmRequired].sort(), `${actionName} 的 requiredParams 应与 schema.required 一致`)
        .toEqual([...required].sort())

      for (const fieldName of required) {
        expect(definition.paramsSchema.properties?.[fieldName], `${actionName} 缺少必填字段 ${fieldName}`)
          .toBeTruthy()
        expect(definition.llm.paramGuide[fieldName], `${actionName} 缺少 ${fieldName} 的 llm.paramGuide`)
          .toBeTruthy()
      }
    }
  })

  test('action sets are grouped cleanly for maintenance', () => {
    expect(Object.keys(actionSets)).toEqual([
      'commonTypes',
      'curves',
      'sketches',
      'solids',
      'construct',
      'transforms',
      'booleans',
      'modifiers',
      'patterns',
      'display',
    ])
  })
})

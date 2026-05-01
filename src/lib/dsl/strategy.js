import { actionDefinitions } from './definitions.js'

export const GLOBAL_DSL_GENERATION_RULES = {
  modelingPrinciples: [
    '优先选择结构清晰、阶段分明的建模路径，而不是一次性拼复杂布尔链。',
    '优先先得到稳定主体，再添加孔、槽、阵列、倒角或显示层。',
    '当目标是物理实体或可打印对象时，最终 result 应优先包含 geom3。',
    '阵列、布尔、修改类 action 只负责局部特征，不应承担全部结构语义。',
  ],
  sequencingHints: [
    '常见顺序是：curve/sketch -> construct/solid -> transform/pattern -> boolean/modify -> display。',
    '显示类 action 放在链路末尾，避免与几何生成耦合。',
  ],
  stabilityHeuristics: [
    '避免直接用超大 pattern group 作为 boolean.subtract 的工具体。',
    '避免让最终结果停留在 curve2 或 geom2，除非用户明确只要二维轮廓。',
    '对大规模重复特征，先控制作用区域，再进入复杂布尔。',
    '优先用更少、更清晰的中间对象组织几何关系。',
  ],
  manufacturingHeuristics: [
    '出现打印、装配、尺寸限制等制造语义时，优先保留明确主体、连接区与最终实体厚度。',
    '不要默认显示组或颜色组已经完成实体合并。',
  ],
}

function pushWarning(warnings, code, message, actionIds = []) {
  warnings.push({ code, level: 'warning', message, actionIds })
}

function flattenRecordKinds(records) {
  return records.flatMap((record) => (record.kind === 'group' ? flattenRecordKinds(record.value) : [record.kind]))
}

function getActionNodeMap(program) {
  return new Map(program.actions.map((node) => [node.id, node]))
}

function getPatternInstanceCount(node) {
  if (node.action === 'pattern.linear') return node.params.count
  if (node.action === 'pattern.radial') return node.params.count
  if (node.action === 'pattern.grid') return node.params.count.reduce((product, value) => product * value, 1)
  return 0
}

function getReferencedPatternStats(nodeMap, toolIds) {
  return toolIds
    .map((toolId) => nodeMap.get(toolId))
    .filter((toolNode) => toolNode?.action?.startsWith('pattern.'))
    .map((toolNode) => ({
      id: toolNode.id,
      instanceCount: getPatternInstanceCount(toolNode),
    }))
}

export function analyzeProgramStrategy(program, resultRecords = []) {
  const warnings = []
  const nodeMap = getActionNodeMap(program)

  const renderableKinds = flattenRecordKinds(resultRecords)
  if (renderableKinds.length && !renderableKinds.includes('geom3')) {
    pushWarning(
      warnings,
      'final-result-not-3d',
      '当前 result 不包含 geom3，输出更像二维中间态而不是可打印实体；若用户目标是实体模型，通常需要继续进入 construct 或 solid 阶段。',
    )
  }

  for (const node of program.actions) {
    if (node.action.startsWith('pattern.')) {
      const instanceCount = getPatternInstanceCount(node)
      if (instanceCount > 64) {
        pushWarning(
          warnings,
          'large-pattern-instance-count',
          `${node.id}(${node.action}) 将生成 ${instanceCount} 个实例。大阵列本身合法，但后续若直接参与布尔，复杂度和失败风险会明显升高。`,
          [node.id],
        )
      }
    }

    if (node.action === 'boolean.subtract') {
      const patternTools = getReferencedPatternStats(nodeMap, node.params.tools)
      const highComplexityPatternTools = patternTools.filter((tool) => tool.instanceCount > 24)
      if (highComplexityPatternTools.length > 0) {
        pushWarning(
          warnings,
          'pattern-group-used-as-subtract-tools',
          `${node.id}(boolean.subtract) 直接使用大阵列 pattern 输出作为 tools。该做法可执行，但属于高复杂度减材路径，建议先控制阵列范围并确认它只是局部特征。`,
          [node.id, ...highComplexityPatternTools.map((tool) => tool.id)],
        )
      }

      if (node.params.tools.length >= 4) {
        pushWarning(
          warnings,
          'large-subtract-toolset',
          `${node.id}(boolean.subtract) 同时使用了 ${node.params.tools.length} 个 tool 引用。tool 过多时更难排查错位、共面和局部失控问题。`,
          [node.id],
        )
      }

      const baseNode = nodeMap.get(node.params.base)
      if (baseNode && actionDefinitions[baseNode.action]?.outputKind === 'geom2') {
        pushWarning(
          warnings,
          'subtract-on-2d-base',
          `${node.id}(boolean.subtract) 的 base 来自二维对象 ${node.params.base}。二维减法本身合法，但它仍只是草图阶段，不代表实体厚度已经存在。`,
          [node.id, node.params.base],
        )
      }
    }

    if (node.action === 'display.group' && node.params.sources.length === 1) {
      pushWarning(
        warnings,
        'single-source-display-group',
        `${node.id}(display.group) 只包含一个 source。若只是包装单个结果，通常可直接输出该对象，避免无意义分组。`,
        [node.id],
      )
    }
  }

  return warnings
}

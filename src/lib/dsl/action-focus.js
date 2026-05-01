import { actionDefinitions } from './definitions.js'

function flattenRenderableRecords(record) {
  if (!record) return []
  if (record.kind === 'group') {
    return record.value.flatMap(flattenRenderableRecords)
  }
  return ['geom3', 'geom2', 'curve2'].includes(record.kind) ? [record] : []
}

function getRecord(state, id) {
  return state.records.get(id) || null
}

function getRenderableRecords(state, id) {
  return flattenRenderableRecords(getRecord(state, id))
}

function withStyle(records, style) {
  return records.map((record) => ({ record, style }))
}

function formatValue(value) {
  return Array.isArray(value) ? `[${value.join(', ')}]` : String(value)
}

function getActionSummary(node) {
  const role = actionDefinitions[node.action]?.role || node.action
  const { params } = node

  switch (node.action) {
    case 'solid.box':
    case 'solid.roundedBox':
      return `${role}，尺寸 ${formatValue(params.size)}`
    case 'solid.cylinder':
      return `${role}，高度 ${params.height}，半径 ${params.radius ?? `${params.radiusTop}/${params.radiusBottom}`}`
    case 'transform.translate':
      return `将 ${params.source} 平移 ${formatValue(params.offset)}`
    case 'transform.rotate':
      return `将 ${params.source} 旋转 ${formatValue(params.angles)}`
    case 'transform.scale':
      return `将 ${params.source} 缩放 ${formatValue(params.factors)}`
    case 'pattern.linear':
      return `将 ${params.source} 线性复制 ${params.count} 次，步长 ${formatValue(params.step)}`
    case 'pattern.grid':
      return `将 ${params.source} 按网格 ${formatValue(params.count)} 复制，步长 ${formatValue(params.step)}`
    case 'pattern.radial':
      return `将 ${params.source} 围绕 ${params.axis || 'z'} 轴环形复制 ${params.count} 次，半径 ${params.radius}`
    case 'boolean.subtract':
      return `从 ${params.base} 中减去 ${params.tools.join('、')}`
    case 'boolean.union':
      return `将 ${params.sources.join('、')} 做并集组合`
    case 'boolean.intersect':
      return `求 ${params.sources.join('、')} 的交集`
    case 'display.color':
      return `给 ${params.source} 附加预览颜色 ${formatValue(params.rgba)}`
    default:
      return role
  }
}

function buildDefaultFocus(compiled, node) {
  const outputRecords = getRenderableRecords(compiled.state, node.id)
  const contextRecords = compiled.renderables.filter((record) => !outputRecords.includes(record))

  return {
    actionId: node.id,
    actionName: node.action,
    modeLabel: 'result',
    summary: getActionSummary(node),
    layers: [
      ...withStyle(contextRecords, { color: [0.55, 0.61, 0.72, 0.12], opacity: 0.12 }),
      ...withStyle(outputRecords, { opacity: 1 }),
    ],
  }
}

function buildTransformFocus(compiled, node) {
  const sourceRecords = getRenderableRecords(compiled.state, node.params.source)
  const outputRecords = getRenderableRecords(compiled.state, node.id)

  return {
    actionId: node.id,
    actionName: node.action,
    modeLabel: 'before + after',
    summary: getActionSummary(node),
    layers: [
      ...withStyle(sourceRecords, { color: [0.72, 0.75, 0.82, 0.18], opacity: 0.18 }),
      ...withStyle(outputRecords, { opacity: 1 }),
    ],
  }
}

function buildPatternFocus(compiled, node) {
  const sourceRecords = getRenderableRecords(compiled.state, node.params.source)
  const outputRecords = getRenderableRecords(compiled.state, node.id)

  return {
    actionId: node.id,
    actionName: node.action,
    modeLabel: 'source + instances',
    summary: getActionSummary(node),
    layers: [
      ...withStyle(sourceRecords, { color: [0.78, 0.82, 0.9, 0.18], opacity: 0.18 }),
      ...withStyle(outputRecords, { opacity: 1 }),
    ],
  }
}

function buildBooleanFocus(compiled, node) {
  if (node.action === 'boolean.subtract') {
    const baseRecords = getRenderableRecords(compiled.state, node.params.base)
    const toolRecords = node.params.tools.flatMap((id) => getRenderableRecords(compiled.state, id))
    const outputRecords = getRenderableRecords(compiled.state, node.id)

    return {
      actionId: node.id,
      actionName: node.action,
      modeLabel: 'base + tools + result',
      summary: getActionSummary(node),
      layers: [
        ...withStyle(baseRecords, { color: [0.25, 0.58, 0.98, 0.2], opacity: 0.2 }),
        ...withStyle(toolRecords, { color: [0.95, 0.35, 0.35, 0.3], opacity: 0.3 }),
        ...withStyle(outputRecords, { opacity: 1 }),
      ],
    }
  }

  const sourceIds = node.params.sources || []
  const sourceRecords = sourceIds.flatMap((id) => getRenderableRecords(compiled.state, id))
  const outputRecords = getRenderableRecords(compiled.state, node.id)

  return {
    actionId: node.id,
    actionName: node.action,
    modeLabel: 'sources + result',
    summary: getActionSummary(node),
    layers: [
      ...withStyle(sourceRecords, { color: [0.65, 0.7, 0.82, 0.18], opacity: 0.18 }),
      ...withStyle(outputRecords, { opacity: 1 }),
    ],
  }
}

function buildDisplayFocus(compiled, node) {
  const sourceRecords = getRenderableRecords(compiled.state, node.params.source)
  const outputRecords = getRenderableRecords(compiled.state, node.id)

  return {
    actionId: node.id,
    actionName: node.action,
    modeLabel: 'source + preview',
    summary: getActionSummary(node),
    layers: [
      ...withStyle(sourceRecords, { color: [0.72, 0.75, 0.82, 0.18], opacity: 0.18 }),
      ...withStyle(outputRecords, { opacity: 1 }),
    ],
  }
}

export function buildActionFocusView(compiled, actionId) {
  if (!compiled || !actionId) return null

  const node = compiled.program.actions.find((item) => item.id === actionId)
  if (!node) return null

  if (node.action.startsWith('transform.')) {
    return buildTransformFocus(compiled, node)
  }
  if (node.action.startsWith('pattern.')) {
    return buildPatternFocus(compiled, node)
  }
  if (node.action.startsWith('boolean.')) {
    return buildBooleanFocus(compiled, node)
  }
  if (node.action === 'display.color') {
    return buildDisplayFocus(compiled, node)
  }

  return buildDefaultFocus(compiled, node)
}

export function getActionIdAtCursor(text, cursorOffset) {
  if (typeof text !== 'string' || typeof cursorOffset !== 'number') return null
  const lines = text.slice(0, cursorOffset).split('\n')
  const allLines = text.split('\n')
  const currentLineIndex = Math.max(0, lines.length - 1)

  for (let index = currentLineIndex; index >= 0; index -= 1) {
    const line = allLines[index]
    const match = line.match(/"id"\s*:\s*"([^"]+)"/)
    if (match) {
      return match[1]
    }
  }

  return null
}

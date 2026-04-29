import Ajv2020 from 'ajv/dist/2020.js'
import modelingModule from '@jscad/modeling'
import { actionDefinitions, actionSets, commonTypesSchema } from './definitions.js'
import { SUPPORTED_ACTION_NAMES } from './prompt.js'

const modeling = modelingModule.default || modelingModule
const { booleans, colors, curves, expansions, extrusions, geometries, hulls, modifiers, primitives, transforms, utils } = modeling
const { geom2, geom3, path2 } = geometries
const { degToRad } = utils

const SUPPORTED_ACTION_SET = new Set(SUPPORTED_ACTION_NAMES)

const ajv = new Ajv2020({ allErrors: true, strict: false, useDefaults: true })
ajv.addSchema(commonTypesSchema, commonTypesSchema.$id)
const registeredSchemaIds = new Set([commonTypesSchema.$id])
for (const schema of Object.values(actionSets)) {
  if (schema.$id && !registeredSchemaIds.has(schema.$id)) {
    ajv.addSchema(schema, schema.$id)
    registeredSchemaIds.add(schema.$id)
  }
}
const paramsValidators = new Map()

function getParamsValidator(actionName) {
  if (!paramsValidators.has(actionName)) {
    const definition = actionDefinitions[actionName]
    if (!definition) throw new Error(`未定义的 action: ${actionName}`)
    paramsValidators.set(actionName, ajv.compile(definition.paramsSchema))
  }
  return paramsValidators.get(actionName)
}

function schemaErrors(validate) {
  return (validate.errors || []).map((item) => `${item.instancePath || '/'} ${item.message}`).join('; ')
}

function validateProgramShape(program) {
  if (!program || typeof program !== 'object' || Array.isArray(program)) {
    throw new Error('DSL 顶层必须是 JSON 对象')
  }
  if (program.dsl !== 'aiscad.dsl') {
    throw new Error('dsl 必须为 aiscad.dsl')
  }
  if (program.version !== '1.0.0') {
    throw new Error('version 必须为 1.0.0')
  }
  if (!['mm', 'cm', 'm', 'in'].includes(program.units)) {
    throw new Error('units 必须为 mm/cm/m/in 之一')
  }
  if (!Array.isArray(program.actions) || program.actions.length === 0) {
    throw new Error('actions 必须是非空数组')
  }
  if (!('result' in program)) {
    throw new Error('result 不能为空')
  }
}

function deepClone(value) {
  return structuredClone(value)
}

function resolveScalar(value, variables) {
  if (value && typeof value === 'object' && !Array.isArray(value) && '$var' in value) {
    const variableName = value.$var
    if (!(variableName in variables)) {
      throw new Error(`变量未定义: ${variableName}`)
    }
    return variables[variableName]
  }
  return value
}

function resolveArray(values, variables) {
  return values.map((item) => (Array.isArray(item) ? resolveArray(item, variables) : resolveScalar(item, variables)))
}

function resolveParamValue(value, variables) {
  if (Array.isArray(value)) return resolveArray(value, variables)
  if (value && typeof value === 'object' && !('$var' in value)) {
    const output = {}
    for (const [key, nested] of Object.entries(value)) {
      output[key] = resolveParamValue(nested, variables)
    }
    return output
  }
  return resolveScalar(value, variables)
}

function resolveParams(params, variables) {
  return resolveParamValue(params, variables)
}

function axisToVector(axis) {
  if (axis === 'x') return [1, 0, 0]
  if (axis === 'y') return [0, 1, 0]
  return [0, 0, 1]
}

function toRadians(values) {
  return values.map((value) => degToRad(value))
}

function wrapRecord(kind, value, color = null) {
  return { kind, value, color }
}

function isGroup(record) {
  return record.kind === 'group'
}

function cloneRecord(record) {
  if (isGroup(record)) {
    return wrapRecord('group', record.value.map(cloneRecord), record.color)
  }
  return wrapRecord(record.kind, record.value, record.color)
}

function mapRecord(record, mapper) {
  if (isGroup(record)) {
    return wrapRecord('group', record.value.map((child) => mapRecord(child, mapper)), record.color)
  }
  return mapper(record)
}

function setRecordColor(record, rgba) {
  if (isGroup(record)) {
    return wrapRecord('group', record.value.map((child) => setRecordColor(child, rgba)), rgba)
  }
  return wrapRecord(record.kind, record.value, rgba)
}

function flattenRecords(record) {
  if (isGroup(record)) {
    return record.value.flatMap(flattenRecords)
  }
  return [record]
}

function collectLeafRecords(refs, state) {
  return refs.flatMap((ref) => flattenRecords(requireRecord(ref, state)))
}

function requireRecord(id, state) {
  if (!state.records.has(id)) throw new Error(`引用不存在: ${id}`)
  return state.records.get(id)
}

function requireSingleRecord(id, state) {
  const record = requireRecord(id, state)
  if (isGroup(record)) {
    throw new Error(`当前 action 需要单个对象，但 ${id} 是 group`) 
  }
  return record
}

function ensureKinds(record, allowedKinds, actionName) {
  const records = flattenRecords(record)
  for (const item of records) {
    if (!allowedKinds.includes(item.kind)) {
      throw new Error(`${actionName} 不支持输入类型 ${item.kind}`)
    }
  }
  return records
}

function applyTransformToRecord(record, transformFn) {
  return mapRecord(record, (leaf) => wrapRecord(leaf.kind, transformFn(leaf.value), leaf.color))
}

function mergeColors(records) {
  return records.find((record) => record.color)?.color || null
}

function applyBoolean(operation, refs, state, actionName) {
  const leaves = collectLeafRecords(refs, state)
  if (leaves.length === 0) {
    throw new Error(`${actionName} 至少需要一个输入对象`)
  }
  const [first, ...rest] = leaves
  if (rest.some((item) => item.kind !== first.kind)) {
    throw new Error(`${actionName} 的输入对象维度必须一致`)
  }
  if (!['geom2', 'geom3'].includes(first.kind)) {
    throw new Error(`${actionName} 只支持 geom2 或 geom3`) 
  }
  if (rest.length === 0) {
    return wrapRecord(first.kind, first.value, first.color)
  }
  return wrapRecord(first.kind, operation(first.value, ...rest.map((item) => item.value)), mergeColors(leaves))
}

function applyHull(operation, refs, state, actionName) {
  const leaves = collectLeafRecords(refs, state)
  if (leaves.length === 0) {
    throw new Error(`${actionName} 至少需要一个输入对象`)
  }
  const [first, ...rest] = leaves
  if (rest.some((item) => item.kind !== first.kind)) {
    throw new Error(`${actionName} 的输入对象维度必须一致`)
  }
  if (!['geom2', 'geom3'].includes(first.kind)) {
    throw new Error(`${actionName} 只支持 geom2 或 geom3`) 
  }
  return wrapRecord(first.kind, operation(first.value, ...rest.map((item) => item.value)), mergeColors(leaves))
}

function createPatternGroup(items) {
  return wrapRecord('group', items.map(cloneRecord))
}

function recordToRenderable(record) {
  return flattenRecords(record).filter((item) => ['geom3', 'geom2', 'curve2'].includes(item.kind))
}

function compileCurveLine(params) {
  return wrapRecord('curve2', path2.fromPoints({ closed: Boolean(params.closed) }, params.points))
}

function compileCurveArc(params) {
  return wrapRecord('curve2', primitives.arc(params))
}

function compileCurveBezier(params) {
  const base = path2.create([[0, 0]])
  const curve = path2.appendBezier({ controlPoints: params.controlPoints, segments: params.segments || 32 }, base)
  return wrapRecord('curve2', curve)
}

function compileCurveConcat(params, state) {
  const sources = params.sources.map((id) => requireSingleRecord(id, state))
  sources.forEach((record) => {
    if (record.kind !== 'curve2') throw new Error('curve.concat 只支持 curve2')
  })
  let combined = path2.concat(...sources.map((record) => record.value))
  if (params.closed) combined = path2.close(combined)
  return wrapRecord('curve2', combined)
}

function compileCurveClose(params, state) {
  const source = requireSingleRecord(params.source, state)
  if (source.kind !== 'curve2') throw new Error('curve.close 只支持 curve2')
  return wrapRecord('curve2', path2.close(source.value), source.color)
}

function compileSketchFromCurve(params, state) {
  const source = requireSingleRecord(params.source, state)
  if (source.kind !== 'curve2') throw new Error('sketch.fromCurve 只支持 curve2')
  const points = path2.toPoints(source.value)
  return wrapRecord('geom2', geom2.fromPoints(points), source.color)
}

function compileAction(node, state) {
  const params = node.params
  switch (node.action) {
    case 'curve.line':
      return compileCurveLine(params)
    case 'curve.arc':
      return compileCurveArc(params)
    case 'curve.bezier':
      return compileCurveBezier(params)
    case 'curve.concat':
      return compileCurveConcat(params, state)
    case 'curve.close':
      return compileCurveClose(params, state)
    case 'sketch.circle':
      return wrapRecord('geom2', primitives.circle(params))
    case 'sketch.ellipse':
      return wrapRecord('geom2', primitives.ellipse(params))
    case 'sketch.rectangle':
      return wrapRecord('geom2', primitives.rectangle(params))
    case 'sketch.roundedRectangle':
      return wrapRecord('geom2', primitives.roundedRectangle({
        size: params.size,
        center: params.center,
        roundRadius: params.radius,
        segments: params.segments,
      }))
    case 'sketch.polygon':
      return wrapRecord('geom2', primitives.polygon({ points: params.points }))
    case 'sketch.fromCurve':
      return compileSketchFromCurve(params, state)
    case 'sketch.text':
      throw new Error('sketch.text 首版 Web 应用暂不支持')
    case 'solid.box':
      return wrapRecord('geom3', primitives.cuboid(params))
    case 'solid.roundedBox':
      return wrapRecord('geom3', primitives.roundedCuboid({
        size: params.size,
        center: params.center,
        roundRadius: params.radius,
        segments: params.segments,
      }))
    case 'solid.sphere':
      return wrapRecord('geom3', primitives.sphere(params))
    case 'solid.geodesicSphere':
      return wrapRecord('geom3', primitives.geodesicSphere({
        radius: params.radius,
        center: params.center,
        frequency: params.frequency,
      }))
    case 'solid.cylinder': {
      if (typeof params.radius === 'number') {
        return wrapRecord('geom3', primitives.cylinder(params))
      }
      return wrapRecord('geom3', primitives.cylinderElliptic({
        center: params.center,
        height: params.height,
        startRadius: [params.radiusBottom, params.radiusBottom],
        endRadius: [params.radiusTop, params.radiusTop],
        segments: params.segments,
      }))
    }
    case 'solid.ellipticalCylinder':
      return wrapRecord('geom3', primitives.cylinderElliptic({
        center: params.center,
        height: params.height,
        startRadius: params.radiusBottom,
        endRadius: params.radiusTop,
        segments: params.segments,
      }))
    case 'solid.roundedCylinder':
      return wrapRecord('geom3', primitives.roundedCylinder({
        center: params.center,
        height: params.height,
        radius: params.radius,
        roundRadius: params.roundRadius,
        segments: params.segments,
      }))
    case 'solid.torus':
      return wrapRecord('geom3', primitives.torus({
        innerRadius: params.innerRadius,
        outerRadius: params.outerRadius,
        innerSegments: params.innerSegments,
        outerSegments: params.outerSegments,
        innerRotation: degToRad(params.innerRotation || 0),
        center: params.center,
      }))
    case 'solid.polyhedron':
      return wrapRecord('geom3', primitives.polyhedron(params))
    case 'construct.extrudeLinear': {
      const source = requireSingleRecord(params.source, state)
      if (source.kind !== 'geom2') throw new Error('construct.extrudeLinear 只支持 geom2')
      return wrapRecord('geom3', extrusions.extrudeLinear({
        height: params.height,
        twistAngle: degToRad(params.twistAngle || 0),
        twistSteps: params.twistSteps,
      }, source.value), source.color)
    }
    case 'construct.extrudeRotate': {
      const source = requireSingleRecord(params.source, state)
      if (source.kind !== 'geom2') throw new Error('construct.extrudeRotate 只支持 geom2')
      return wrapRecord('geom3', extrusions.extrudeRotate({
        angle: degToRad(params.angle || 360),
        segments: params.segments,
      }, source.value), source.color)
    }
    case 'construct.extrudeRectangular': {
      const source = requireSingleRecord(params.source, state)
      if (source.kind !== 'curve2') throw new Error('construct.extrudeRectangular 只支持 curve2')
      return wrapRecord('geom3', extrusions.extrudeRectangular({
        size: params.size[0],
        height: params.size[1],
      }, source.value), source.color)
    }
    case 'construct.extrudeFromSlices':
      throw new Error('construct.extrudeFromSlices 首版 Web 应用暂不支持')
    case 'construct.project': {
      const source = requireSingleRecord(params.source, state)
      if (source.kind !== 'geom3') throw new Error('construct.project 只支持 geom3')
      return wrapRecord('geom2', extrusions.project({ axis: axisToVector(params.axis || 'z') }, source.value), source.color)
    }
    case 'construct.sectionByPlane':
      throw new Error('construct.sectionByPlane 首版 Web 应用暂不支持')
    case 'construct.cutByPlane':
      throw new Error('construct.cutByPlane 首版 Web 应用暂不支持')
    case 'transform.translate': {
      const source = requireRecord(params.source, state)
      return applyTransformToRecord(source, (geometry) => transforms.translate(params.offset, geometry))
    }
    case 'transform.rotate': {
      const source = requireRecord(params.source, state)
      const angles = toRadians(params.angles)
      return applyTransformToRecord(source, (geometry) => transforms.rotate(angles, geometry))
    }
    case 'transform.scale': {
      const source = requireRecord(params.source, state)
      return applyTransformToRecord(source, (geometry) => transforms.scale(params.factors, geometry))
    }
    case 'transform.mirror': {
      const source = requireRecord(params.source, state)
      return applyTransformToRecord(source, (geometry) => transforms.mirror(params.plane, geometry))
    }
    case 'transform.matrix': {
      const source = requireRecord(params.source, state)
      const matrix = params.matrix.flat()
      return applyTransformToRecord(source, (geometry) => transforms.transform(matrix, geometry))
    }
    case 'boolean.union':
      return applyBoolean(booleans.union, params.sources, state, node.action)
    case 'boolean.subtract': {
      const base = requireSingleRecord(params.base, state)
      const tools = collectLeafRecords(params.tools, state)
      if (!['geom2', 'geom3'].includes(base.kind)) throw new Error('boolean.subtract 只支持 geom2 或 geom3')
      if (tools.some((item) => item.kind !== base.kind)) throw new Error('boolean.subtract 的工具体必须和 base 同维')
      return wrapRecord(base.kind, booleans.subtract(base.value, ...tools.map((item) => item.value)), base.color)
    }
    case 'boolean.intersect':
      return applyBoolean(booleans.intersect, params.sources, state, node.action)
    case 'modify.offset2d': {
      const source = requireSingleRecord(params.source, state)
      if (source.kind !== 'geom2') throw new Error('modify.offset2d 只支持 geom2')
      return wrapRecord('geom2', expansions.offset({
        delta: params.distance,
        corners: params.corners,
        segments: params.segments,
      }, source.value), source.color)
    }
    case 'modify.expand2d': {
      const source = requireSingleRecord(params.source, state)
      if (source.kind !== 'geom2') throw new Error('modify.expand2d 只支持 geom2')
      return wrapRecord('geom2', expansions.expand({
        delta: params.delta,
        corners: params.corners,
        segments: params.segments,
      }, source.value), source.color)
    }
    case 'modify.expand3d': {
      const source = requireSingleRecord(params.source, state)
      if (source.kind !== 'geom3') throw new Error('modify.expand3d 只支持 geom3')
      return wrapRecord('geom3', expansions.expand({
        delta: params.delta,
        corners: params.corners,
        segments: params.segments,
      }, source.value), source.color)
    }
    case 'modify.hull':
      return applyHull(hulls.hull, params.sources, state, node.action)
    case 'modify.hullChain':
      return applyHull(hulls.hullChain, params.sources, state, node.action)
    case 'modify.generalize': {
      const source = requireSingleRecord(params.source, state)
      return wrapRecord(source.kind, modifiers.generalize({
        snap: Boolean(params.snap),
        simplify: Boolean(params.simplify),
        triangulate: Boolean(params.triangulate),
      }, source.value), source.color)
    }
    case 'pattern.linear': {
      const source = requireRecord(params.source, state)
      const items = []
      for (let index = 0; index < params.count; index += 1) {
        const offset = params.step.map((value, axisIndex) => params.origin[axisIndex] + (value * index))
        items.push(applyTransformToRecord(source, (geometry) => transforms.translate(offset, geometry)))
      }
      return createPatternGroup(items)
    }
    case 'pattern.grid': {
      const source = requireRecord(params.source, state)
      const items = []
      for (let ix = 0; ix < params.count[0]; ix += 1) {
        for (let iy = 0; iy < params.count[1]; iy += 1) {
          for (let iz = 0; iz < params.count[2]; iz += 1) {
            const offset = [
              params.origin[0] + (params.step[0] * ix),
              params.origin[1] + (params.step[1] * iy),
              params.origin[2] + (params.step[2] * iz),
            ]
            items.push(applyTransformToRecord(source, (geometry) => transforms.translate(offset, geometry)))
          }
        }
      }
      return createPatternGroup(items)
    }
    case 'pattern.radial': {
      const source = requireRecord(params.source, state)
      const items = []
      const count = params.count
      const start = degToRad(params.startAngle || 0)
      const sweep = degToRad(params.sweepAngle || 360)
      const axis = params.axis || 'z'
      const center = params.center || [0, 0, 0]
      const step = count <= 1 ? 0 : sweep / count
      for (let index = 0; index < count; index += 1) {
        const angle = start + (step * index)
        const localOffset = axis === 'x'
          ? [0, Math.cos(angle) * params.radius, Math.sin(angle) * params.radius]
          : axis === 'y'
            ? [Math.cos(angle) * params.radius, 0, Math.sin(angle) * params.radius]
            : [Math.cos(angle) * params.radius, Math.sin(angle) * params.radius, 0]
        let item = applyTransformToRecord(source, (geometry) => transforms.translate(localOffset, geometry))
        if (params.rotateItems) {
          const rotationAngles = axis === 'x'
            ? [angle, 0, 0]
            : axis === 'y'
              ? [0, angle, 0]
              : [0, 0, angle]
          item = applyTransformToRecord(item, (geometry) => transforms.rotate(rotationAngles, geometry))
        }
        item = applyTransformToRecord(item, (geometry) => transforms.translate(center, geometry))
        items.push(item)
      }
      return createPatternGroup(items)
    }
    case 'display.color': {
      const source = requireRecord(params.source, state)
      return setRecordColor(source, params.rgba)
    }
    case 'display.group':
      return wrapRecord('group', params.sources.map((id) => cloneRecord(requireRecord(id, state))))
    default:
      throw new Error(`暂未实现的 action: ${node.action}`)
  }
}

export function validateAndCompileProgram(program) {
  const workingProgram = deepClone(program)
  validateProgramShape(workingProgram)

  const state = {
    variables: deepClone(workingProgram.variables || {}),
    records: new Map(),
  }

  workingProgram.actions.forEach((node, index) => {
    if (!actionDefinitions[node.action]) {
      throw new Error(`第 ${index + 1} 条 action 未定义: ${node.action}`)
    }
    if (!SUPPORTED_ACTION_SET.has(node.action)) {
      throw new Error(`第 ${index + 1} 条 action 当前 Web 应用暂不支持: ${node.action}`)
    }
    const validateParams = getParamsValidator(node.action)
    if (!validateParams(node.params)) {
      throw new Error(`action ${node.id}(${node.action}) 参数校验失败: ${schemaErrors(validateParams)}`)
    }
    const resolvedNode = {
      ...node,
      params: resolveParams(node.params, state.variables),
    }
    const compiledRecord = compileAction(resolvedNode, state)
    state.records.set(node.id, compiledRecord)
  })

  const resultIds = Array.isArray(workingProgram.result) ? workingProgram.result : [workingProgram.result]
  const resultRecords = resultIds.map((id) => requireRecord(id, state))
  return {
    program: workingProgram,
    state,
    resultRecords,
    renderables: resultRecords.flatMap(recordToRenderable),
    supportedActions: [...SUPPORTED_ACTION_SET],
  }
}

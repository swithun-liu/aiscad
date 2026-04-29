import programSchema from '../../../docs/dsl/program.schema.json'
import commonTypesSchema from '../../../docs/dsl/actions/common.types.schema.json'
import curvesActions from '../../../docs/dsl/actions/curves.actions.json'
import sketchesActions from '../../../docs/dsl/actions/sketches.actions.json'
import solidsActions from '../../../docs/dsl/actions/solids.actions.json'
import constructActions from '../../../docs/dsl/actions/construct.actions.json'
import transformsActions from '../../../docs/dsl/actions/transforms.actions.json'
import booleansActions from '../../../docs/dsl/actions/booleans.actions.json'
import modifiersActions from '../../../docs/dsl/actions/modifiers.actions.json'
import patternsActions from '../../../docs/dsl/actions/patterns.actions.json'
import displayActions from '../../../docs/dsl/actions/display.actions.json'

export const actionSets = {
  commonTypes: commonTypesSchema,
  curves: curvesActions,
  sketches: sketchesActions,
  solids: solidsActions,
  construct: constructActions,
  transforms: transformsActions,
  booleans: booleansActions,
  modifiers: modifiersActions,
  patterns: patternsActions,
  display: displayActions,
}

export const executableActionSets = Object.values(actionSets).filter((schema) => schema.actions)

export const actionDefinitions = executableActionSets.reduce((acc, schema) => {
  Object.assign(acc, schema.actions)
  return acc
}, {})

export { programSchema, commonTypesSchema }

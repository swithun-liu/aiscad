import { actionDefinitions, actionSets, commonTypesSchema, programSchema } from './definitions.js'

export const SUPPORTED_ACTION_NAMES = Object.entries(actionDefinitions)
  .filter(([, definition]) => definition.llm?.webSupported !== false)
  .map(([name]) => name)

export const AI_READABLE_DSL_REFERENCE = {
  programSchema,
  commonTypes: commonTypesSchema,
  actionSets: Object.fromEntries(
    Object.entries(actionSets).map(([name, schema]) => [name, schema]),
  ),
}

export function buildDslPrompt(description) {
  return `你是 AISCAD DSL 生成器。

目标：根据用户描述输出一份可执行的 AISCAD DSL JSON。

硬性要求：
1. 只能输出一个 JSON 对象，不要输出 Markdown，不要输出解释。
2. JSON 必须包含 dsl/version/units/actions/result。
3. dsl 固定为 aiscad.dsl。
4. version 固定为 1.0.0。
5. units 固定为 mm。
6. 结果优先生成 geom3 或由 geom3 组成的 group。
7. 只能使用下面 JSON 定义中存在且 llm.webSupported = true 的 action。
8. 参数尽量使用显式数值，不要使用 variables，除非明显有复用价值。
9. 尽量采用稳定的建模策略：先 2D 草图，再拉伸；或直接 primitive + transform + boolean。
10. 看到 paramsSchema 时必须严格按 required / properties / oneOf / default 填写参数。
11. 看到 llm 时优先参考 llm.summary、llm.paramGuide、llm.constraints、llm.example。
12. 如果某个 action 的 llm.webSupported = false，则禁止使用。

下面是可以直接阅读并遵守的 DSL 定义 JSON：
${JSON.stringify(AI_READABLE_DSL_REFERENCE, null, 2)}

用户需求：
${description}`
}

import { buildDslPrompt } from './dsl/prompt.js'

const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions'

function extractJsonObject(text) {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fencedMatch) {
    return JSON.parse(fencedMatch[1])
  }

  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('模型返回中没有找到 JSON 对象')
  }
  return JSON.parse(text.slice(start, end + 1))
}

export async function generateDslWithDeepSeek({ apiKey, model, description, sketch }) {
  if (!apiKey) throw new Error('请先填写 DeepSeek API Key')
  if (!description.trim()) throw new Error('请先填写模型描述')

  const response = await fetch(DEEPSEEK_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: buildDslPrompt(description, { sketch }),
        },
        {
          role: 'user',
          content: description,
        },
      ],
    }),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = payload?.error?.message || `DeepSeek 请求失败: HTTP ${response.status}`
    throw new Error(message)
  }

  const content = payload?.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('DeepSeek 没有返回可用内容')
  }

  return extractJsonObject(content)
}

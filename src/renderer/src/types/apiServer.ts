import { MAX_KNOWLEDGE_TOP_K } from '@shared/config/knowledge'
import * as z from 'zod'

import type { KnowledgeBaseSummary, KnowledgeSearchResult } from './knowledge'

export type ApiServerConfig = {
  enabled: boolean
  host: string
  port: number
  apiKey: string
  knowledgeBaseIds: string[]
}

export type GetApiServerStatusResult = {
  running: boolean
  config: ApiServerConfig | null
}

export type StartApiServerStatusResult =
  | {
      success: true
    }
  | {
      success: false
      error: string
    }

export type RestartApiServerStatusResult =
  | {
      success: true
    }
  | {
      success: false
      error: string
    }

export type StopApiServerStatusResult =
  | {
      success: true
    }
  | {
      success: false
      error: string
    }

export const ApiKnowledgeSearchSchema = z.object({
  query: z
    .string({
      required_error: 'query is required'
    })
    .min(1)
    .max(2_000, { message: 'query is too long' }),
  knowledge_base_ids: z
    .array(z.string().min(1), {
      required_error: 'knowledge_base_ids is required'
    })
    .min(1),
  rewrite: z.string().min(1).max(2_000).optional(),
  threshold: z.number().min(0).max(1).optional(),
  top_k: z.number().int().positive().max(MAX_KNOWLEDGE_TOP_K).optional()
})

export type ApiKnowledgeSearchRequest = z.infer<typeof ApiKnowledgeSearchSchema>

export type ApiKnowledgeBaseListResponse = {
  object: 'list'
  data: KnowledgeBaseSummary[]
  total: number
  syncedAt?: string
}

export type ApiKnowledgeSearchResponseItem = {
  knowledge_base_id: string
  knowledge_base_name: string
  results: KnowledgeSearchResult[]
}

export type ApiKnowledgeSearchResponse = {
  object: 'list'
  data: ApiKnowledgeSearchResponseItem[]
}

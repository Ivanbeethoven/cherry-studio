import { loggerService } from '@logger'
import KnowledgeService from '@main/services/KnowledgeService'
import { knowledgeStoreService } from '@main/services/KnowledgeStoreService'
import { DEFAULT_KNOWLEDGE_DOCUMENT_COUNT, DEFAULT_KNOWLEDGE_THRESHOLD, MAX_KNOWLEDGE_TOP_K } from '@shared/config/knowledge'
import type {
  ApiKnowledgeBaseListResponse,
  ApiKnowledgeSearchRequest,
  ApiKnowledgeSearchResponse,
  ApiKnowledgeSearchResponseItem
} from '@types'

const logger = loggerService.withContext('ApiServerKnowledgeService')

class ApiKnowledgeService {
  listBases(): ApiKnowledgeBaseListResponse {
    if (!knowledgeStoreService.isSyncActive() || !knowledgeStoreService.hasBases()) {
      throw new Error('Knowledge store is not ready. Ensure the API server is running and knowledge is synced.')
    }

    const data = knowledgeStoreService.getBases()
    return {
      object: 'list',
      data,
      total: data.length,
      syncedAt: knowledgeStoreService.getLastSyncedAt()
        ? new Date(knowledgeStoreService.getLastSyncedAt()!).toISOString()
        : undefined
    }
  }

  async search(payload: ApiKnowledgeSearchRequest): Promise<ApiKnowledgeSearchResponse> {
    if (!knowledgeStoreService.isSyncActive() || !knowledgeStoreService.hasBases()) {
      throw new Error('Knowledge store is not ready. Please wait for synchronization to complete.')
    }

    const requests = payload.knowledge_base_ids
      .map((id) => knowledgeStoreService.getBase(id))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

    if (requests.length === 0) {
      throw new Error('No matching knowledge bases found for provided ids.')
    }

    const searchQuery = payload.rewrite?.trim() ? payload.rewrite : payload.query
    const limitOverride = payload.top_k ? Math.min(payload.top_k, MAX_KNOWLEDGE_TOP_K) : undefined

    const results: ApiKnowledgeSearchResponseItem[] = []

    for (const request of requests) {
      const allowedResults = limitOverride ?? request.metadata.documentCount ?? DEFAULT_KNOWLEDGE_DOCUMENT_COUNT
      const threshold = payload.threshold ?? request.metadata.threshold ?? DEFAULT_KNOWLEDGE_THRESHOLD

      const ragResults = await KnowledgeService.search(null as any, {
        search: searchQuery,
        base: request.params
      })

      const filtered = ragResults.filter((item) => item.score >= threshold)

      let ranked = filtered
      if (filtered.length > 0 && request.params.rerankApiClient?.model) {
        ranked = await KnowledgeService.rerank(null as any, {
          search: searchQuery,
          base: request.params,
          results: filtered
        })
      }

      results.push({
        knowledge_base_id: request.metadata.id,
        knowledge_base_name: request.metadata.name,
        results: ranked.slice(0, allowedResults)
      })
    }

    logger.info('Knowledge search completed', {
      baseCount: results.length,
      query: payload.query
    })

    return {
      object: 'list',
      data: results
    }
  }
}

export const apiKnowledgeService = new ApiKnowledgeService()


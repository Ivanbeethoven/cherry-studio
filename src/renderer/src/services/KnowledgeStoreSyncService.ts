import { loggerService } from '@logger'
import type { KnowledgeBase, KnowledgeBaseSummary, KnowledgeBaseSyncPayload, Model } from '@types'

import store from '../store'
import { getKnowledgeBaseParams } from './KnowledgeService'

const logger = loggerService.withContext('KnowledgeStoreSyncService')
type RootState = ReturnType<typeof store.getState>

type SyncReason = 'initial' | 'refresh' | 'update'

export class KnowledgeStoreSyncService {
  private isSyncing = false
  private hasInitialized = false
  private unsubscribe?: () => void
  private lastSignature?: string

  public init(): void {
    if (this.hasInitialized) {
      return
    }
    this.hasInitialized = true

    if (!window.api?.knowledgeStore) {
      logger.warn('knowledgeStore bridge is not available, skipping sync setup')
      return
    }

    window.api.knowledgeStore.onRequestSync(() => {
      logger.info('Received knowledge sync request from main process')
      this.startSync('initial')
    })

    window.api.knowledgeStore.onStopSync(() => {
      logger.info('Received knowledge sync stop signal from main process')
      this.stopSync()
    })
  }

  private startSync(reason: SyncReason): void {
    if (this.isSyncing) {
      void this.pushCurrentBases('refresh')
      return
    }
    this.isSyncing = true
    this.lastSignature = this.computeSignature()
    this.unsubscribe = store.subscribe(() => {
      if (!this.isSyncing) {
        return
      }
      const signature = this.computeSignature()
      if (signature === this.lastSignature) {
        return
      }
      this.lastSignature = signature
      void this.pushCurrentBases('update')
    })
    void this.pushCurrentBases(reason)
  }

  private stopSync(): void {
    this.isSyncing = false
    this.lastSignature = undefined
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = undefined
    }
  }

  private computeSignature(): string {
    const state = store.getState()
    const bases = state.knowledge.bases || []
    const selectedIds = this.getSelectedKnowledgeBaseIds(state)
    const filteredBases = this.filterBases(bases, selectedIds)
    const selectionSignature = selectedIds.length > 0 ? selectedIds.slice().sort().join(',') : 'ALL'

    if (filteredBases.length === 0) {
      return `${selectionSignature}#EMPTY`
    }

    return (
      `${selectionSignature}#` +
      filteredBases
        .map((base) => {
          const itemCount = base.items?.length ?? 0
          return `${base.id}:${base.updated_at}:${base.version}:${itemCount}`
        })
        .join('|')
    )
  }

  private async pushCurrentBases(reason: SyncReason): Promise<void> {
    if (!this.isSyncing || !window.api?.knowledgeStore) {
      return
    }
    try {
      const payload = this.buildPayload()
      logger.debug(`Sending ${payload.length} knowledge bases to main process`, { reason })
      await window.api.knowledgeStore.syncBases(payload)
    } catch (error) {
      logger.error('Failed to sync knowledge bases to main process', error as Error)
    }
  }

  private buildPayload(): KnowledgeBaseSyncPayload[] {
    const state = store.getState()
    const bases = state.knowledge.bases || []
    const selectedIds = this.getSelectedKnowledgeBaseIds(state)
    const filteredBases = this.filterBases(bases, selectedIds)

    if (selectedIds.length > 0) {
      const missing = selectedIds.filter((id) => !bases.some((base) => base.id === id))
      if (missing.length > 0) {
        logger.warn('Selected knowledge bases not found locally, ignoring', { missing })
      }
    }

    return filteredBases.map((base) => ({
      metadata: this.toSummary(base),
      params: getKnowledgeBaseParams(base)
    }))
  }

  private toSummary(base: KnowledgeBase): KnowledgeBaseSummary {
    return {
      id: base.id,
      name: base.name,
      description: base.description,
      dimensions: base.dimensions,
      documentCount: base.documentCount,
      chunkSize: base.chunkSize,
      chunkOverlap: base.chunkOverlap,
      threshold: base.threshold,
      created_at: base.created_at,
      updated_at: base.updated_at,
      version: base.version,
      preprocessProvider: base.preprocessProvider,
      model: this.pickModel(base.model),
      rerankModel: base.rerankModel ? this.pickModel(base.rerankModel) : undefined
    }
  }

  private pickModel(model: Model): KnowledgeBaseSummary['model'] {
    return {
      id: model.id,
      name: model.name,
      provider: model.provider,
      group: model.group,
      description: model.description
    }
  }

  private getSelectedKnowledgeBaseIds(state: RootState): string[] {
    const ids = state.settings.apiServer?.knowledgeBaseIds ?? []
    return ids.filter((id): id is string => Boolean(id))
  }

  private filterBases(bases: KnowledgeBase[], selectedIds: string[]): KnowledgeBase[] {
    if (!selectedIds.length) {
      return bases
    }
    const idSet = new Set(selectedIds)
    return bases.filter((base) => idSet.has(base.id))
  }
}

export const knowledgeStoreSyncService = new KnowledgeStoreSyncService()


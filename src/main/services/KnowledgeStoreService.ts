import { loggerService } from '@logger'
import { IpcChannel } from '@shared/IpcChannel'
import type { KnowledgeBaseParams, KnowledgeBaseSummary, KnowledgeBaseSyncPayload } from '@types'
import { ipcMain } from 'electron'

import { windowService } from './WindowService'

const logger = loggerService.withContext('KnowledgeStoreService')

export class KnowledgeStoreService {
  private static instance: KnowledgeStoreService

  private bases: Map<string, KnowledgeBaseSyncPayload> = new Map()
  private isActive = false
  private lastSyncedAt: number | null = null

  private constructor() {
    this.registerIpcHandlers()
  }

  public static getInstance(): KnowledgeStoreService {
    if (!KnowledgeStoreService.instance) {
      KnowledgeStoreService.instance = new KnowledgeStoreService()
    }
    return KnowledgeStoreService.instance
  }

  private registerIpcHandlers(): void {
    ipcMain.handle(IpcChannel.KnowledgeStore_SyncBases, (_event, payload: KnowledgeBaseSyncPayload[]) => {
      return this.handleSyncPayload(payload)
    })
  }

  public startSync(): void {
    if (this.isActive) {
      logger.debug('Knowledge store already active, requesting refresh')
      this.requestSyncFromRenderer()
      return
    }
    logger.info('Starting knowledge store synchronization')
    this.isActive = true
    this.requestSyncFromRenderer()
  }

  public stopSync(): void {
    if (!this.isActive) {
      return
    }
    logger.info('Stopping knowledge store synchronization')
    this.isActive = false
    this.bases.clear()
    this.lastSyncedAt = null
    this.sendStopSignal()
  }

  private handleSyncPayload(payload: KnowledgeBaseSyncPayload[]) {
    if (!this.isActive) {
      logger.debug('Received knowledge sync payload while inactive, ignoring')
      return { accepted: false }
    }
    this.bases.clear()
    for (const entry of payload) {
      this.bases.set(entry.metadata.id, entry)
    }
    this.lastSyncedAt = Date.now()
    logger.info('Knowledge store updated', { baseCount: this.bases.size })
    return { accepted: true, syncedAt: this.lastSyncedAt }
  }

  private requestSyncFromRenderer(): void {
    const mainWindow = windowService.getMainWindow()
    if (!mainWindow) {
      logger.warn('Cannot request knowledge sync without main window')
      return
    }
    mainWindow.webContents.send(IpcChannel.KnowledgeStore_RequestSync)
  }

  private sendStopSignal(): void {
    const mainWindow = windowService.getMainWindow()
    if (!mainWindow) {
      return
    }
    mainWindow.webContents.send(IpcChannel.KnowledgeStore_StopSync)
  }

  public getBases(): KnowledgeBaseSummary[] {
    return Array.from(this.bases.values()).map((entry) => entry.metadata)
  }

  public getBase(id: string): KnowledgeBaseSyncPayload | undefined {
    return this.bases.get(id)
  }

  public getBaseParams(id: string): KnowledgeBaseParams | undefined {
    return this.bases.get(id)?.params
  }

  public hasBases(): boolean {
    return this.bases.size > 0
  }

  public isSyncActive(): boolean {
    return this.isActive
  }

  public getLastSyncedAt(): number | null {
    return this.lastSyncedAt
  }
}

export const knowledgeStoreService = KnowledgeStoreService.getInstance()


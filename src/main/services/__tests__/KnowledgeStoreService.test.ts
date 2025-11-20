import { beforeEach, describe, expect, it, vi } from 'vitest'

import { IpcChannel } from '@shared/IpcChannel'

const { sendMock, getMainWindow } = vi.hoisted(() => {
  return {
    sendMock: vi.fn(),
    getMainWindow: vi.fn()
  }
})

vi.mock('@logger', () => ({
  loggerService: {
    withContext: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    })
  }
}))

vi.mock('../WindowService', () => ({
  windowService: {
    getMainWindow
  }
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn()
  }
}))

import { knowledgeStoreService } from '../KnowledgeStoreService'

describe('KnowledgeStoreService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMainWindow.mockReturnValue({
      webContents: {
        send: sendMock
      }
    })
    knowledgeStoreService.stopSync()
  })

  it('requests sync from renderer when starting', () => {
    knowledgeStoreService.startSync()
    expect(sendMock).toHaveBeenCalledWith(IpcChannel.KnowledgeStore_RequestSync)
  })

  it('ignores sync payloads when inactive', () => {
    const response = (knowledgeStoreService as any).handleSyncPayload([])
    expect(response).toEqual({ accepted: false })
    expect(knowledgeStoreService.hasBases()).toBe(false)
  })

  it('stores bases after receiving payload while active', () => {
    knowledgeStoreService.startSync()
    const payload = [
      {
        metadata: {
          id: 'kb-1',
          name: 'Docs',
          description: '',
          dimensions: 1536,
          documentCount: 10,
          chunkSize: 512,
          chunkOverlap: 128,
          threshold: 0.1,
          created_at: Date.now(),
          updated_at: Date.now(),
          version: 1,
          preprocessProvider: undefined,
          model: {
            id: 'model-1',
            name: 'Test',
            provider: 'openai',
            group: 'default',
            description: ''
          },
          rerankModel: undefined
        },
        params: {
          id: 'kb-1',
          embedApiClient: {
            provider: 'openai',
            model: 'text-embedding-3-small',
            apiKey: 'secret',
            baseURL: 'https://api.openai.com'
          }
        }
      }
    ]

    const response = (knowledgeStoreService as any).handleSyncPayload(payload)
    expect(response).toEqual({ accepted: true, syncedAt: expect.any(Number) })
    expect(knowledgeStoreService.hasBases()).toBe(true)
    expect(knowledgeStoreService.getBases()).toHaveLength(1)
    expect(knowledgeStoreService.getBaseParams('kb-1')).toEqual(payload[0].params)
  })

  it('sends stop signal when stopping sync', () => {
    knowledgeStoreService.startSync()
    sendMock.mockClear()
    knowledgeStoreService.stopSync()
    expect(sendMock).toHaveBeenCalledWith(IpcChannel.KnowledgeStore_StopSync)
    expect(knowledgeStoreService.hasBases()).toBe(false)
  })
})


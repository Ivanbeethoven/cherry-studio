import type { Request, Response } from 'express'
import express from 'express'

import { loggerService } from '../../services/LoggerService'
import { apiKnowledgeService } from '../services/knowledge'
import { ApiKnowledgeSearchSchema } from '@types'

const logger = loggerService.withContext('ApiServerKnowledgeRoutes')

const router = express
  .Router()

  /**
   * @swagger
   * /v1/knowledge/bases:
   *   get:
   *     summary: List available knowledge bases
   *     description: Returns all knowledge bases currently synced from the Cherry Studio desktop client.
   *     tags: [Knowledge]
   *     responses:
   *       200:
   *         description: Synced knowledge bases
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/KnowledgeBaseListResponse'
   *       503:
   *         description: Knowledge store not ready
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  .get('/bases', (_req: Request, res: Response) => {
    try {
      const response = apiKnowledgeService.listBases()
      return res.json(response)
    } catch (error: any) {
      logger.warn('Knowledge bases unavailable', { error })
      return res.status(503).json({
        error: {
          message: error instanceof Error ? error.message : 'Knowledge store is not ready',
          type: 'service_unavailable',
          code: 'knowledge_store_unavailable'
        }
      })
    }
  })

  /**
   * @swagger
   * /v1/knowledge/search:
   *   post:
   *     summary: Search knowledge bases
   *     description: Performs a semantic search across one or more knowledge bases synced from Cherry Studio.
   *     tags: [Knowledge]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/KnowledgeSearchRequest'
   *     responses:
   *       200:
   *         description: Search results grouped by knowledge base
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/KnowledgeSearchResponse'
   *       400:
   *         description: Invalid request
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: Requested knowledge bases not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       503:
   *         description: Knowledge store not ready
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  .post('/search', async (req: Request, res: Response) => {
    const validation = ApiKnowledgeSearchSchema.safeParse(req.body)
    if (!validation.success) {
      logger.warn('Invalid knowledge search request', { issues: validation.error.issues })
      return res.status(400).json({
        error: {
          message: 'Invalid knowledge search request',
          type: 'invalid_request_error',
          code: 'invalid_parameters',
          details: validation.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message
          }))
        }
      })
    }

    try {
      const response = await apiKnowledgeService.search(validation.data)
      return res.json(response)
    } catch (error: any) {
      if (error instanceof Error && error.message.includes('No matching knowledge bases')) {
        return res.status(404).json({
          error: {
            message: error.message,
            type: 'invalid_request_error',
            code: 'knowledge_base_not_found'
          }
        })
      }

      const status = error instanceof Error && error.message.includes('not ready') ? 503 : 500
      logger.error('Knowledge search failed', { error })
      return res.status(status).json({
        error: {
          message:
            error instanceof Error
              ? error.message
              : 'Knowledge search failed due to an unexpected error',
          type: status === 503 ? 'service_unavailable' : 'internal_error',
          code: status === 503 ? 'knowledge_store_unavailable' : 'knowledge_search_failed'
        }
      })
    }
  })

export { router as knowledgeRoutes }


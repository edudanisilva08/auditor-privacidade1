import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import cron from 'node-cron'
import { randomUUID } from 'node:crypto'
import { CreateTargetSchema } from '@auditor/shared'
import {
  runPrivacyAudit,
  getReportsHistory,
  addMonitoredTarget,
  getAllMonitoredTargets,
  deleteMonitoredTarget
} from '@auditor/worker'
import { notifyIfRegressionDetected } from './alerts.js'

const app = new Hono()

// Permitir pedidos do frontend Vue (que vai correr na porta 5173)
app.use('/*', cors())

// 1. Listar todos os sites vigiados
app.get('/api/targets', (c) => {
  const targets = getAllMonitoredTargets()
  return c.json(targets)
})

// 2. Adicionar um novo site para vigilância
app.post('/api/targets', async (c) => {
  const body = await c.req.json()
  const parsed = CreateTargetSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400)
  }

  const target = addMonitoredTarget(randomUUID(), parsed.data.name, parsed.data.url)
  return c.json(target, 201)
})

// 3. Remover um site vigiado
app.delete('/api/targets/:id', (c) => {
  const id = c.req.param('id')
  deleteMonitoredTarget(id)
  return c.json({ deleted: true })
})

// 4. Obter histórico de relatórios (opcionalmente filtrado por URL)
app.get('/api/reports', (c) => {
  const url = c.req.query('url')
  const reports = getReportsHistory(url)
  return c.json(reports)
})

// 5. Disparar uma auditoria manual imediata
app.post('/api/audit', async (c) => {
  const { url } = await c.req.json<{ url?: string }>()
  if (!url) {
    return c.json({ error: 'O campo url é obrigatório' }, 400)
  }

  try {
    const report = await runPrivacyAudit(url)
    await notifyIfRegressionDetected(report)
    return c.json(report)
  } catch (error) {
    return c.json(
      { error: 'Falha ao auditar o URL', details: error instanceof Error ? error.message : String(error) },
      500
    )
  }
})

// 6. Automação Semanal (Todos os domingos às 03:00 da manhã)
cron.schedule('0 3 * * 0', async () => {
  console.log('[CRON] A iniciar auditoria semanal automática...')
  const targets = getAllMonitoredTargets()

  for (const target of targets) {
    try {
      console.log(`[CRON] A auditar: ${target.name} (${target.url})`)
      const report = await runPrivacyAudit(target.url)
      await notifyIfRegressionDetected(report)
    } catch (err) {
      console.error(`[CRON] Erro ao auditar ${target.url}:`, err)
    }
  }
})

const port = 3001
console.log(`🚀 Servidor API a correr em http://localhost:${port}`)

serve({
  fetch: app.fetch,
  port
})

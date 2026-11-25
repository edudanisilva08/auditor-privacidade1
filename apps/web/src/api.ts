import type { AuditReport, CreateTargetInput } from '@auditor/shared'

export interface MonitoredTarget {
  id: string
  name: string
  url: string
  createdAt: string
}

export async function fetchTargets(): Promise<MonitoredTarget[]> {
  const res = await fetch('/api/targets')
  if (!res.ok) throw new Error('Erro ao carregar sites vigiados')
  return res.json()
}

export async function createTarget(input: CreateTargetInput): Promise<MonitoredTarget> {
  const res = await fetch('/api/targets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  })
  if (!res.ok) throw new Error('Erro ao adicionar site')
  return res.json()
}

export async function removeTarget(id: string): Promise<void> {
  const res = await fetch(`/api/targets/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Erro ao remover site')
}

export async function fetchReports(url?: string): Promise<AuditReport[]> {
  const endpoint = url ? `/api/reports?url=${encodeURIComponent(url)}` : '/api/reports'
  const res = await fetch(endpoint)
  if (!res.ok) throw new Error('Erro ao carregar relatórios')
  return res.json()
}

export async function triggerAudit(url: string): Promise<AuditReport> {
  const res = await fetch('/api/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  })
  if (!res.ok) throw new Error('Falha ao executar auditoria')
  return res.json()
}

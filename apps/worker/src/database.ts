import { DatabaseSync } from 'node:sqlite'
import { resolve } from 'node:path'
import { AuditReportSchema, type AuditReport } from '@auditor/shared'

// Guarda o ficheiro SQLite na raiz do projeto
const dbPath = resolve(process.cwd(), '../../auditor.db')
const db = new DatabaseSync(dbPath)

// Criar tabelas se ainda não existirem
db.exec(`
  CREATE TABLE IF NOT EXISTS targets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_reports (
    id TEXT PRIMARY KEY,
    target_url TEXT NOT NULL,
    executed_at TEXT NOT NULL,
    privacy_score INTEGER NOT NULL,
    report_json TEXT NOT NULL
  );
`)

export function getLastReportForUrl(targetUrl: string): AuditReport | null {
  const stmt = db.prepare(`
    SELECT report_json FROM audit_reports
    WHERE target_url = ?
    ORDER BY executed_at DESC
    LIMIT 1
  `)

  const row = stmt.get(targetUrl) as { report_json: string } | undefined
  if (!row) return null

  const parsed = AuditReportSchema.safeParse(JSON.parse(row.report_json))
  return parsed.success ? parsed.data : null
}

export function saveAuditReport(report: AuditReport): void {
  const stmt = db.prepare(`
    INSERT INTO audit_reports (id, target_url, executed_at, privacy_score, report_json)
    VALUES (?, ?, ?, ?, ?)
  `)

  stmt.run(
    report.id,
    report.targetUrl,
    report.executedAt,
    report.privacyScore,
    JSON.stringify(report)
  )
}

export function getReportsHistory(targetUrl?: string): AuditReport[] {
  const query = targetUrl
    ? db.prepare('SELECT report_json FROM audit_reports WHERE target_url = ? ORDER BY executed_at DESC LIMIT 50')
    : db.prepare('SELECT report_json FROM audit_reports ORDER BY executed_at DESC LIMIT 50')

  const rows = (targetUrl ? query.all(targetUrl) : query.all()) as Array<{ report_json: string }>
  return rows
    .map((r) => AuditReportSchema.safeParse(JSON.parse(r.report_json)))
    .filter((res) => res.success)
    .map((res) => res.data)
}

export interface MonitoredTarget {
  id: string
  name: string
  url: string
  createdAt: string
}

export function addMonitoredTarget(id: string, name: string, url: string): MonitoredTarget {
  const createdAt = new Date().toISOString()
  const stmt = db.prepare(`
    INSERT INTO targets (id, name, url, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(url) DO UPDATE SET name = excluded.name
  `)
  stmt.run(id, name, url, createdAt)
  return { id, name, url, createdAt }
}

export function getAllMonitoredTargets(): MonitoredTarget[] {
  const stmt = db.prepare('SELECT id, name, url, created_at as createdAt FROM targets ORDER BY created_at DESC')
  return stmt.all() as unknown as MonitoredTarget[]
}

export function deleteMonitoredTarget(id: string): void {
  const stmt = db.prepare('DELETE FROM targets WHERE id = ?')
  stmt.run(id)
}

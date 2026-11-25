import { z } from 'zod'

// Representa um domínio externo ou rastreador detetado na página
export const TrackerSchema = z.object({
  domain: z.string(),
  ipAddress: z.string().nullable(),
  resourceType: z.enum(['script', 'xhr', 'fetch', 'image', 'stylesheet', 'font', 'other']),
  abuseConfidenceScore: z.number().min(0).max(100).default(0),
  isNew: z.boolean().default(false)
})

// Estado dos cabeçalhos HTTP essenciais de segurança
export const SecurityHeadersSchema = z.object({
  csp: z.boolean(),             // Content-Security-Policy
  hsts: z.boolean(),            // Strict-Transport-Security
  xFrameOptions: z.boolean(),   // X-Frame-Options
  referrerPolicy: z.boolean()   // Referrer-Policy
})

// Relatório completo gerado após uma execução do Playwright
export const AuditReportSchema = z.object({
  id: z.string().uuid(),
  targetUrl: z.string().url(),
  executedAt: z.string().datetime(),
  privacyScore: z.number().min(0).max(100),
  isSafeBrowsingFlagged: z.boolean(),
  headers: SecurityHeadersSchema,
  thirdPartyCookiesCount: z.number().int().nonnegative(),
  trackers: z.array(TrackerSchema)
})

// Esquema para validar o pedido de criação de um novo URL vigiado
export const CreateTargetSchema = z.object({
  url: z.string().url({ message: 'Por favor, insira um URL válido (ex: https://exemplo.com)' }),
  name: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres')
})

// Tipos TypeScript inferidos automaticamente a partir do Zod
export type Tracker = z.infer<typeof TrackerSchema>
export type SecurityHeaders = z.infer<typeof SecurityHeadersSchema>
export type AuditReport = z.infer<typeof AuditReportSchema>
export type CreateTargetInput = z.infer<typeof CreateTargetSchema>

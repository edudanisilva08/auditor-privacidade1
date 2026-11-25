import { chromium } from 'playwright'
import { lookup } from 'node:dns/promises'
import { randomUUID } from 'node:crypto'
import {
  AuditReportSchema,
  type AuditReport,
  type Tracker
} from '@auditor/shared'
import { checkIpReputation, checkSafeBrowsing } from './threat-intel.js'
import { getLastReportForUrl, saveAuditReport } from './database.js'

function getRootDomain(hostname: string): string {
  const parts = hostname.split('.')
  return parts.length > 2 ? parts.slice(-2).join('.') : hostname
}

async function resolveDomainIp(domain: string): Promise<string | null> {
  try {
    const result = await lookup(domain)
    return result.address
  } catch {
    return null
  }
}

export async function runPrivacyAudit(targetUrl: string): Promise<AuditReport> {
  const parsedTarget = new URL(targetUrl)
  const targetRootDomain = getRootDomain(parsedTarget.hostname)

  // Obter o relatório anterior para detetar novos rastreadores (Diff)
  const previousReport = getLastReportForUrl(targetUrl)
  const previousDomains = new Set(
    previousReport ? previousReport.trackers.map((t) => t.domain) : []
  )

  const externalRequests = new Map<string, Tracker['resourceType']>()

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
  })

  const page = await context.newPage()

  page.on('request', (request) => {
    try {
      const reqUrl = new URL(request.url())
      const reqRootDomain = getRootDomain(reqUrl.hostname)

      if (!reqUrl.protocol.startsWith('http') || reqRootDomain === targetRootDomain) {
        return
      }

      const rawType = request.resourceType()
      const mappedType: Tracker['resourceType'] = [
        'script',
        'xhr',
        'fetch',
        'image',
        'stylesheet',
        'font'
      ].includes(rawType)
        ? (rawType as Tracker['resourceType'])
        : 'other'

      if (!externalRequests.has(reqUrl.hostname)) {
        externalRequests.set(reqUrl.hostname, mappedType)
      }
    } catch {
      // Ignorar URLs malformados
    }
  })

  const [response, isSafeBrowsingFlagged] = await Promise.all([
    page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 }),
    checkSafeBrowsing(targetUrl)
  ])

  const rawHeaders = response ? await response.allHeaders() : {}
  const headers = {
    csp: Boolean(rawHeaders['content-security-policy']),
    hsts: Boolean(rawHeaders['strict-transport-security']),
    xFrameOptions: Boolean(rawHeaders['x-frame-options']),
    referrerPolicy: Boolean(rawHeaders['referrer-policy'])
  }

  const cookies = await context.cookies()
  const thirdPartyCookiesCount = cookies.filter((cookie) => {
    const cleanDomain = cookie.domain.replace(/^\./, '')
    return getRootDomain(cleanDomain) !== targetRootDomain
  }).length

  await browser.close()

  // Resolver IPs e consultar reputação na AbuseIPDB
  const trackers: Tracker[] = await Promise.all(
    Array.from(externalRequests.entries()).map(async ([domain, resourceType]) => {
      const ipAddress = await resolveDomainIp(domain)
      const abuseConfidenceScore = await checkIpReputation(ipAddress)

      return {
        domain,
        ipAddress,
        resourceType,
        abuseConfidenceScore,
        isNew: previousReport !== null && !previousDomains.has(domain)
      }
    })
  )

  // Calcular pontuação de privacidade penalizando também IPs suspeitos e Safe Browsing
  let score = 100
  if (isSafeBrowsingFlagged) score -= 50
  if (!headers.csp) score -= 10
  if (!headers.hsts) score -= 10
  if (!headers.xFrameOptions) score -= 5
  if (!headers.referrerPolicy) score -= 5
  score -= Math.min(40, trackers.length * 3)
  score -= Math.min(30, thirdPartyCookiesCount * 2)

  const highRiskTrackers = trackers.filter((t) => t.abuseConfidenceScore > 50).length
  score -= highRiskTrackers * 10

  const report = AuditReportSchema.parse({
    id: randomUUID(),
    targetUrl,
    executedAt: new Date().toISOString(),
    privacyScore: Math.max(0, score),
    isSafeBrowsingFlagged,
    headers,
    thirdPartyCookiesCount,
    trackers
  })

  // Guardar na base de dados SQLite
  saveAuditReport(report)

  return report
}

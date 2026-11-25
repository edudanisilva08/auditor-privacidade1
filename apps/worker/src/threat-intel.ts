import { z } from 'zod'

// Esquema Zod para validar a resposta da AbuseIPDB
const AbuseIpdbResponseSchema = z.object({
  data: z.object({
    abuseConfidenceScore: z.number().min(0).max(100)
  })
})

// Esquema Zod para validar a resposta da Google Safe Browsing
const SafeBrowsingResponseSchema = z.object({
  matches: z.array(z.unknown()).optional()
})

export async function checkIpReputation(ipAddress: string | null): Promise<number> {
  if (!ipAddress) return 0

  const apiKey = process.env.ABUSEIPDB_API_KEY
  if (!apiKey) {
    // Modo de simulação caso ainda não tenha chave configurada
    return 0
  }

  try {
    const url = new URL('https://abuseipdb.com')
    url.searchParams.set('ipAddress', ipAddress)
    url.searchParams.set('maxAgeInDays', '90')

    const response = await fetch(url, {
      headers: {
        Key: apiKey,
        Accept: 'application/json'
      }
    })

    if (!response.ok) return 0

    const json = await response.json()
    const parsed = AbuseIpdbResponseSchema.safeParse(json)
    return parsed.success ? parsed.data.data.abuseConfidenceScore : 0
  } catch {
    return 0
  }
}

export async function checkSafeBrowsing(targetUrl: string): Promise<boolean> {
  const apiKey = process.env.GOOGLE_SAFE_BROWSING_KEY
  if (!apiKey) {
    // Modo de simulação caso ainda não tenha chave configurada
    return false
  }

  try {
    const endpoint = `https://googleapis.com{apiKey}`
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: { clientId: 'auditor-privacidade', clientVersion: '1.0.0' },
        threatInfo: {
          threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE'],
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: [{ url: targetUrl }]
        }
      })
    })

    if (!response.ok) return false

    const json = await response.json()
    const parsed = SafeBrowsingResponseSchema.safeParse(json)
    return parsed.success ? Boolean(parsed.data.matches && parsed.data.matches.length > 0) : false
  } catch {
    return false
  }
}

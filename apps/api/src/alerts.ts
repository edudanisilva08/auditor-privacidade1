import type { AuditReport } from '@auditor/shared'

export async function notifyIfRegressionDetected(report: AuditReport): Promise<void> {
  const newTrackers = report.trackers.filter((t) => t.isNew)
  const hasHighRisk = report.isSafeBrowsingFlagged || report.privacyScore < 60

  // Só envia alerta se surgirem novos rastreadores ou se o risco for elevado
  if (newTrackers.length === 0 && !hasHighRisk) {
    return
  }

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL
  const summary = [
    `🚨 **Alerta de Privacidade Detetado**`,
    `**Site:** ${report.targetUrl}`,
    `**Pontuação Atual:** ${report.privacyScore}/100`,
    newTrackers.length > 0
      ? `**Novos Rastreadores (${newTrackers.length}):** ${newTrackers.map((t) => t.domain).join(', ')}`
      : null,
    report.isSafeBrowsingFlagged ? `⚠️ **Aviso Google Safe Browsing:** Site sinalizado!` : null
  ]
    .filter(Boolean)
    .join('\n')

  // Regista sempre no terminal para acompanhamento local
  console.log('\n' + summary + '\n')

  if (!webhookUrl) return

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: summary })
    })
  } catch (err) {
    console.error('Falha ao enviar alerta para o Webhook:', err)
  }
}

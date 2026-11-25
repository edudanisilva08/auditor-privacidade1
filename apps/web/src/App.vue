<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import type { AuditReport } from '@auditor/shared'
import {
  fetchTargets,
  createTarget,
  removeTarget,
  fetchReports,
  triggerAudit,
  type MonitoredTarget
} from './api'

const targets = ref<MonitoredTarget[]>([])
const reports = ref<AuditReport[]>([])
const selectedReport = ref<AuditReport | null>(null)

const newName = ref('')
const newUrl = ref('')
const isScanning = ref(false)
const scanningUrl = ref<string | null>(null)
const errorMessage = ref<string | null>(null)

function getHostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

async function loadData() {
  errorMessage.value = null
  try {
    const [loadedTargets, loadedReports] = await Promise.all([
      fetchTargets(),
      fetchReports()
    ])
    targets.value = loadedTargets
    reports.value = loadedReports
    if (!selectedReport.value && loadedReports.length > 0) {
      selectedReport.value = loadedReports.at(0) ?? null
    }
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Erro ao carregar dados'
  }
}

async function handleAddTarget() {
  const name = newName.value.trim()
  const url = newUrl.value.trim()
  if (!name || !url) return

  errorMessage.value = null
  try {
    const created = await createTarget({ name, url })
    targets.value.unshift(created)
    newName.value = ''
    newUrl.value = ''
    await handleRunAudit(created.url)
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Verifique se o URL começa por https://'
  }
}

async function handleDeleteTarget(id: string) {
  errorMessage.value = null
  try {
    await removeTarget(id)
    targets.value = targets.value.filter((t) => t.id !== id)
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Erro ao remover o site vigiado'
  }
}

async function handleRunAudit(url: string) {
  isScanning.value = true
  scanningUrl.value = url
  errorMessage.value = null
  try {
    const report = await triggerAudit(url)
    reports.value.unshift(report)
    selectedReport.value = report
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Erro durante a análise do site'
  } finally {
    isScanning.value = false
    scanningUrl.value = null
  }
}

const scoreColor = computed(() => {
  const score = selectedReport.value?.privacyScore ?? 0
  if (score >= 80) return '#10b981'
  if (score >= 50) return '#f59e0b'
  return '#ef4444'
})

const securityHeaders = computed(() => {
  if (!selectedReport.value) return []
  const h = selectedReport.value.headers
  return [
    { label: 'Content-Security-Policy', valid: h.csp },
    { label: 'Strict-Transport-Security', valid: h.hsts },
    { label: 'X-Frame-Options', valid: h.xFrameOptions },
    { label: 'Referrer-Policy', valid: h.referrerPolicy }
  ]
})

onMounted(loadData)
</script>

<template>
  <div class="layout">
    <header class="topbar">
      <div>
        <h1>🛡️ Auditor Contínuo de Privacidade</h1>
        <p class="subtitle">Monitorização automatizada de rastreadores, cookies e cabeçalhos HTTP</p>
      </div>
      <span class="badge-auto">Cron Ativo: Domingos 03:00</span>
    </header>

    <div v-if="errorMessage" class="alert-error">{{ errorMessage }}</div>

    <main class="grid">
      <section class="card">
        <h2>Sites Vigiados</h2>
        <form @submit.prevent="handleAddTarget" class="add-form">
          <input v-model="newName" type="text" placeholder="Nome (ex: Meu Portfólio)" required />
          <input v-model="newUrl" type="url" placeholder="https://exemplo.com" required />
          <button type="submit" :disabled="isScanning">
            {{ isScanning ? 'A analisar...' : 'Adicionar e Auditar' }}
          </button>
        </form>

        <ul class="target-list">
          <li v-for="target in targets" :key="target.id" class="target-item">
            <div class="target-info">
              <strong>{{ target.name }}</strong>
              <div class="url-text">{{ target.url }}</div>
            </div>
            <div class="actions">
              <button @click="handleRunAudit(target.url)" :disabled="isScanning" class="btn-scan">
                {{ scanningUrl === target.url ? 'A correr...' : 'Auditar' }}
              </button>
              <button
                @click="handleDeleteTarget(target.id)"
                :disabled="isScanning"
                class="btn-del"
                title="Remover"
              >
                ✕
              </button>
            </div>
          </li>
        </ul>

        <h3 class="history-title">Últimas Execuções</h3>
        <ul class="history-list">
          <li
            v-for="rep in reports.slice(0, 8)"
            :key="rep.id"
            @click="selectedReport = rep"
            :class="['history-item', { active: selectedReport?.id === rep.id }]"
          >
            <span class="history-host">{{ getHostname(rep.targetUrl) }}</span>
            <span class="score-pill">{{ rep.privacyScore }}/100</span>
          </li>
        </ul>
      </section>

      <section class="card" v-if="selectedReport">
        <div class="report-header">
          <div>
            <h2>{{ selectedReport.targetUrl }}</h2>
            <span class="timestamp">
              Analisado em {{ new Date(selectedReport.executedAt).toLocaleString('pt-PT') }}
            </span>
          </div>
          <div class="score-box" :style="{ borderColor: scoreColor, color: scoreColor }">
            <span class="score-num">{{ selectedReport.privacyScore }}</span>
            <span class="score-label">PONTUAÇÃO</span>
          </div>
        </div>

        <div class="metrics-row">
          <div class="metric">
            <span class="metric-val">{{ selectedReport.trackers.length }}</span>
            <span class="metric-lbl">Domínios Externos</span>
          </div>
          <div class="metric">
            <span class="metric-val">{{ selectedReport.thirdPartyCookiesCount }}</span>
            <span class="metric-lbl">Cookies de Terceiros</span>
          </div>
          <div class="metric">
            <span class="metric-val">
              {{ selectedReport.isSafeBrowsingFlagged ? '⚠️ Risco' : '✅ Limpo' }}
            </span>
            <span class="metric-lbl">Safe Browsing</span>
          </div>
        </div>

        <h3>Cabeçalhos HTTP de Segurança</h3>
        <div class="headers-grid">
          <div
            v-for="header in securityHeaders"
            :key="header.label"
            :class="['header-badge', header.valid ? 'ok' : 'fail']"
          >
            {{ header.valid ? '✓' : '✕' }} {{ header.label }}
          </div>
        </div>

        <h3>Rastreadores e Pedidos Externos ({{ selectedReport.trackers.length }})</h3>
        <div class="table-wrapper" v-if="selectedReport.trackers.length > 0">
          <table>
            <thead>
              <tr>
                <th>Domínio</th>
                <th>Tipo</th>
                <th>Endereço IP</th>
                <th>Risco AbuseIPDB</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tracker in selectedReport.trackers" :key="tracker.domain">
                <td class="mono">{{ tracker.domain }}</td>
                <td><span class="tag">{{ tracker.resourceType }}</span></td>
                <td class="mono">{{ tracker.ipAddress || 'N/D' }}</td>
                <td>{{ tracker.abuseConfidenceScore }}%</td>
                <td>
                  <span v-if="tracker.isNew" class="badge-new">NOVO</span>
                  <span v-else class="badge-known">Conhecido</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="empty-msg">Nenhum pedido externo de terceiros detetado nesta página.</p>
      </section>

      <section class="card empty-state" v-else>
        <p>Adicione um URL à esquerda para executar a primeira auditoria de privacidade.</p>
      </section>
    </main>
  </div>
</template>

<style>
  :root {
    --bg: #0f172a;
    --card: #1e293b;
    --border: #334155;
    --text: #f8fafc;
    --muted: #94a3b8;
    --accent: #3b82f6;
    --accent-hover: #2563eb;
    --success: #10b981;
    --danger: #ef4444;
  }

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  body {
    font-family: system-ui, -apple-system, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.5;
  }

  .layout {
    max-width: 1280px;
    margin: 0 auto;
    padding: 2rem 1.5rem;
  }

  .topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
    margin-bottom: 2rem;
    padding-bottom: 1.25rem;
    border-bottom: 1px solid var(--border);
  }

  .topbar h1 {
    font-size: 1.5rem;
    font-weight: 700;
  }

  .subtitle {
    color: var(--muted);
    font-size: 0.9rem;
  }

  .badge-auto {
    background: rgba(16, 185, 129, 0.15);
    color: var(--success);
    border: 1px solid rgba(16, 185, 129, 0.3);
    padding: 0.35rem 0.75rem;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .alert-error {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.4);
    color: #fca5a5;
    padding: 0.85rem 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
    font-size: 0.9rem;
  }

  .grid {
    display: grid;
    grid-template-columns: 360px 1fr;
    gap: 1.5rem;
    align-items: start;
  }

  @media (max-width: 900px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }

  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.5rem;
  }

  .card h2 {
    font-size: 1.15rem;
    margin-bottom: 1rem;
  }

  .card h3 {
    font-size: 0.95rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin: 1.5rem 0 0.75rem;
  }

  .add-form {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    margin-bottom: 1.25rem;
  }

  .add-form input {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 0.6rem 0.8rem;
    border-radius: 6px;
    font-size: 0.9rem;
  }
  .add-form input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .add-form button {
    background: var(--accent);
    color: #fff;
    border: none;
    padding: 0.65rem;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }
  .add-form button:hover:not(:disabled) {
  background: var(--accent-hover);
  }
  .add-form button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  }
  .target-list,
  .history-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  }
  .target-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  background: var(--bg);
  padding: 0.7rem 0.85rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  }
  .target-info {
  overflow: hidden;
  }
  .url-text {
  font-size: 0.8rem;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  }
  .actions {
  display: flex;
  gap: 0.4rem;
  flex-shrink: 0;
  }
  .btn-scan {
  background: rgba(59, 130, 246, 0.15);
  color: #93c5fd;
  border: 1px solid rgba(59, 130, 246, 0.3);
  padding: 0.3rem 0.6rem;
  border-radius: 5px;
  font-size: 0.8rem;
  cursor: pointer;
  }
  .btn-scan:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.25);
  }
  .btn-del {
  background: transparent;
  color: var(--muted);
  border: 1px solid var(--border);
  padding: 0.3rem 0.5rem;
  border-radius: 5px;
  font-size: 0.8rem;
  cursor: pointer;
  }
  .btn-del:hover:not(:disabled) {
  color: var(--danger);
  border-color: var(--danger);
  }
  .history-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.55rem 0.8rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.88rem;
  border: 1px solid transparent;
  transition: background 0.15s;
  }
  .history-item:hover {
  background: rgba(255, 255, 255, 0.04);
  }
  .history-item.active {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.4);
  }
  .history-host {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  }
  .score-pill {
  font-weight: 600;
  font-size: 0.8rem;
  color: var(--muted);
  }
  .report-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid var(--border);
  }
  .report-header h2 {
  margin-bottom: 0.2rem;
  word-break: break-all;
  }
  .timestamp {
  font-size: 0.85rem;
  color: var(--muted);
  }
  .score-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 2px solid;
  border-radius: 10px;
  padding: 0.5rem 1rem;
  min-width: 90px;
  }
  .score-num {
  font-size: 1.6rem;
  font-weight: 800;
  line-height: 1.1;
  }
  .score-label {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  }
  .metrics-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-top: 1.25rem;
  }
  .metric {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.9rem;
  display: flex;
  flex-direction: column;
  }
  .metric-val {
  font-size: 1.25rem;
  font-weight: 700;
  }
  .metric-lbl {
  font-size: 0.8rem;
  color: var(--muted);
  }
  .headers-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.65rem;
  }
  .header-badge {
  padding: 0.6rem 0.85rem;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 500;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .header-badge.ok {
  background: rgba(16, 185, 129, 0.12);
  color: #6ee7b7;
  border: 1px solid rgba(16, 185, 129, 0.3);
  }
  .header-badge.fail {
  background: rgba(239, 68, 68, 0.12);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.3);
  }
  .table-wrapper {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  }
  table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
  text-align: left;
  }
  th,
  td {
  padding: 0.7rem 0.9rem;
  border-bottom: 1px solid var(--border);
  }
  th {
  background: var(--bg);
  color: var(--muted);
  font-weight: 600;
  font-size: 0.8rem;
  text-transform: uppercase;
  }
  tr:last-child td {
  border-bottom: none;
  }
  .mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.83rem;
  }
  .tag {
  background: rgba(148, 163, 184, 0.15);
  color: var(--text);
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  font-size: 0.78rem;
  }
  .badge-new {
  background: rgba(245, 158, 11, 0.2);
  color: #fcd34d;
  padding: 0.2rem 0.45rem;
  border-radius: 4px;
  font-size: 0.72rem;
  font-weight: 700;
  }
  .badge-known {
  color: var(--muted);
  font-size: 0.8rem;
  }
  .empty-msg,
  .empty-state {
  color: var(--muted);
  text-align: center;
  padding: 2rem 1rem;
  }
</style>
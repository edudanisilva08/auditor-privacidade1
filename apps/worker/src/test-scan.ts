import { runPrivacyAudit } from './scanner.js'

const urlParaTestar = process.argv.at(2) || 'https://wikipedia.org'

console.log(`A iniciar auditoria de privacidade em: ${urlParaTestar}...\n`)

runPrivacyAudit(urlParaTestar)
  .then((relatorio) => {
    console.log('Relatório validado com sucesso:\n')
    console.dir(relatorio, { depth: null, colors: true })
  })
  .catch((erro) => {
    console.error('Erro durante a auditoria:', erro)
  })

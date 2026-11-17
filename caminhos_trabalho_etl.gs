/**
 * CAMINHOS DO TRABALHO — ETL v6
 * Origem somente leitura; destino restrito aos desenvolvedores autorizados.
 * Os dados derivados são PSEUDONIMIZADOS, não necessariamente anônimos.
 *
 * Alterações v6:
 * - F (trabalhadores): servidor/servidora público(a), mesmo quando
 *   seguido do órgão ou função, é exportado como "servidor publico".
 *
 * Regras mantidas da v5:
 * - F, H, I, J, K (Triagem): data primeiro; sem data, status conhecido;
 *   senão, "Dado não reconhecido" sem expor texto original.
 * - O (Triagem): apenas opções oficiais do menu; outros valores viram
 *   "Dado não recuperado".
 * - E (Triagem): permanece inalterada.
 */
const CONFIG = {
  origemId: '1Q0G76ODBGR7x2_SnjZ0_2qvQ30f_xU5tYU7WnerR9g8',
  destinoId: '10cqNRHEbyaCRn5pM_rJ0guqmrTnrGldt2kPltGTf1DM',
  abas: [
    {
      origem: 'Dados do trabalhador',
      destino: 'trabalhadores',
      campos: [
        'Nome do Trabalhador (a)', 'Sexo', 'Idade', 'CNAE',
        'CBO', 'Tipo de vínculo', 'Acidente de Trabalho Identificado',
        'Localidade'
      ]
    },
    {
      origem: 'Triagem',
      destino: 'triagem',
      campos: [
        'Nome do trabalhador (a)', 'Data do Atendimento (Triagem)',
        'Origem do encaminhamento', 'Termo de Consentimento', 'Demanda',
        'Atendimento sócio-jurídico', 'Riscos clinícos e subclínicos',
        'Atendimento psicológico', 'Avaliação do adoecimento/ Médico',
        'CAT elaborada', 'Elaboração de Rel. médico',
        'Elaboração de dossiê', 'Resultado', 'Espécie',
        'Acompanhamento Psicológico - Status'
      ]
    }
  ],
  colunasDataOuStatus: [
    'Atendimento sócio-jurídico',
    'Atendimento psicológico',
    'Avaliação do adoecimento/ Médico',
    'CAT elaborada',
    'Elaboração de Rel. médico'
  ],
  colunaStatusPsicologico: 'Acompanhamento Psicológico - Status',
  // Opções verificadas na validação da coluna O da planilha original.
  statusPsicologicoPermitidos: [
    'Em atendimento psicológico semanal',
    'Encerrado',
    'Não necessitou de atendimento psicológico.',
    'Acolhimento inicial',
    'Acolhimento psicológico'
  ]
};

/** Mantém a normalização da versão anterior para preservar os hashes. */
function normalizar(texto) {
  return String(texto == null ? '' : texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function obterChave() {
  const propriedades = PropertiesService.getScriptProperties();
  let chave = propriedades.getProperty('CHAVE_HMAC');
  if (!chave) {
    chave = Utilities.getUuid() + Utilities.getUuid();
    propriedades.setProperty('CHAVE_HMAC', chave);
  }
  return chave;
}

function mascararNome(nome, chave) {
  if (nome == null || String(nome).trim() === '') return '';
  const assinatura = Utilities.computeHmacSha256Signature(
    normalizar(nome), chave
  );
  const hexadecimal = assinatura.slice(0, 12).map(byte =>
    (byte & 255).toString(16).padStart(2, '0')
  ).join('');
  return 'TRAB-' + hexadecimal;
}

function formatarData(dia, mes, ano) {
  const data = new Date(ano, mes - 1, dia);
  if (data.getFullYear() !== ano ||
      data.getMonth() !== mes - 1 || data.getDate() !== dia) {
    return null;
  }
  return String(dia).padStart(2, '0') + '/' +
    String(mes).padStart(2, '0') + '/' + ano;
}

/**
 * Para F/H/I/J/K: extrai a primeira data completa, ou um status.
 * Nunca copia textos não reconhecidos, que podem conter nomes.
 */
function extrairDataAtendimento(valor, contexto, fuso) {
  if (valor == null || valor === '') return '';
  if (valor instanceof Date) {
    if (!isNaN(valor.getTime())) {
      return Utilities.formatDate(valor, fuso, 'dd/MM/yyyy');
    }
    console.warn('Data inválida em ' + contexto);
    return 'Dado não reconhecido';
  }

  const texto = String(valor).trim();
  if (!texto) return '';

  const regex = /(?:^|[^\d])(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?!\d)/g;
  const datas = [];
  let match;
  while ((match = regex.exec(texto)) !== null) {
    const dia = Number(match[1]);
    const mes = Number(match[2]);
    const ano = Number(match[3]) + (match[3].length === 2 ? 2000 : 0);
    const data = formatarData(dia, mes, ano);
    if (data) datas.push(data);
    else console.warn('Data inválida ignorada em ' + contexto);
  }
  if (datas.length) {
    if (datas.length > 1 || /\+\s*\d{1,2}\/\d{1,2}(?!\/)/.test(texto)) {
      console.warn('Múltiplas datas em ' + contexto +
        '; somente a primeira será exportada.');
    }
    return datas[0];
  }

  // Reconhecimento deliberadamente restrito ao status isolado.
  // Textos extras desconhecidos não são compartilhados.
  const estados = {
    SIM: 'Sim', NAO: 'Não', PENDENTE: 'Pendente',
    AGENDAR: 'Agendar', AGENDADO: 'Agendado', AGENDADA: 'Agendado',
    ENCAMINHADO: 'Encaminhado', ENCAMINHADA: 'Encaminhado'
  };
  const estado = estados[normalizar(texto)];
  if (estado) return estado;

  console.warn('Dado não reconhecido em ' + contexto);
  return 'Dado não reconhecido';
}

/**
 * Para O: só publica valores integrantes do menu suspenso oficial.
 * Espaços, caixa e acentos são normalizados apenas para comparar.
 */
function filtrarStatusPsicologico(valor, contexto) {
  if (valor == null || String(valor).trim() === '') return '';
  const encontrado = CONFIG.statusPsicologicoPermitidos.find(
    opcao => normalizar(opcao) === normalizar(valor)
  );
  if (encontrado) return encontrado;
  console.warn('Dado não recuperado em ' + contexto);
  return 'Dado não recuperado';
}

/** Protege strings potencialmente interpretadas como fórmula pelo Sheets. */
function valorSeguro(valor) {
  if (typeof valor === 'string' && /^\s*[=+\-@]/.test(valor)) {
    return "'" + valor;
  }
  return valor;
}

/**
 * Para F (trabalhadores): remove órgão, cargo e outras informações
 * acrescentadas depois de "Servidor público" / "Servidora pública".
 * Não altera CLT, regime estatutário, concurso público e outros vínculos.
 * Exemplos:
 * "Servidor Público - MPRJ"           -> "servidor publico"
 * "Servidora pública- UFBA"           -> "servidor publico"
 * "Servidor público - Cargo em comissão - MPRJ" -> "servidor publico"
 */
function normalizarTipoVinculo(valor) {
  if (valor == null || String(valor).trim() === '') return '';
  const texto = normalizar(valor);
  if (/^SERVIDOR(?:A)? PUBLIC[OA](?:\s|$)/.test(texto)) {
    return 'servidor publico';
  }
  return valorSeguro(valor);
}

function localizarColuna(cabecalhos, nome, aba) {
  const posicoes = cabecalhos.map((v, i) =>
    normalizar(v) === normalizar(nome) ? i : -1
  ).filter(i => i !== -1);
  if (posicoes.length !== 1) {
    throw new Error('Coluna "' + nome + '" em "' + aba +
      '": esperada 1 correspondência; encontradas ' + posicoes.length);
  }
  return posicoes[0];
}

function ehColunaNome(campo) {
  return normalizar(campo).startsWith('NOME DO TRABALHADOR');
}

function ehColunaDataOuStatus(campo) {
  return CONFIG.colunasDataOuStatus.some(
    c => normalizar(c) === normalizar(campo)
  );
}

function ehColunaStatusPsicologico(campo) {
  return normalizar(campo) === normalizar(CONFIG.colunaStatusPsicologico);
}

function prepararAba(origem, configuracao, chave) {
  const aba = origem.getSheetByName(configuracao.origem);
  if (!aba) throw new Error('Aba não encontrada: ' + configuracao.origem);
  const dados = aba.getDataRange().getValues();
  if (!dados.length) throw new Error('Aba sem cabeçalhos: ' + configuracao.origem);

  const indices = configuracao.campos.map(campo =>
    localizarColuna(dados[0], campo, configuracao.origem)
  );
  const resultado = [indices.map(i => dados[0][i])];
  const fuso = origem.getSpreadsheetTimeZone();
  let vazias = 0;

  for (let i = 1; i < dados.length; i++) {
    const linha = dados[i];
    const vazia = indices.every(j => linha[j] === '' || linha[j] == null);
    if (vazia) { vazias++; continue; }

    const transformada = indices.map((indice, posicao) => {
      const campo = configuracao.campos[posicao];
      const valor = linha[indice];
      const contexto = 'aba "' + configuracao.origem + '", linha ' +
        (i + 1) + ', coluna "' + campo + '"';

      if (ehColunaNome(campo)) {
        if (valor instanceof Date) throw new Error('Nome inválido em ' + contexto);
        return mascararNome(valor, chave);
      }
      if (configuracao.origem === 'Dados do trabalhador' &&
          normalizar(campo) === normalizar('Tipo de vínculo')) {
        return normalizarTipoVinculo(valor);
      }
      if (configuracao.origem === 'Triagem') {
        if (ehColunaDataOuStatus(campo)) {
          return extrairDataAtendimento(valor, contexto, fuso);
        }
        if (ehColunaStatusPsicologico(campo)) {
          return filtrarStatusPsicologico(valor, contexto);
        }
      }
      // Demanda (E) e demais campos: preservados.
      return valorSeguro(valor);
    });
    resultado.push(transformada);
  }
  return { nome: configuracao.destino, dados: resultado,
    quantidade: resultado.length - 1, vazias };
}

function escreverAba(destino, pacote) {
  let aba = destino.getSheetByName(pacote.nome);
  if (!aba) aba = destino.insertSheet(pacote.nome);
  const linhas = pacote.dados.length;
  const colunas = pacote.dados[0].length;
  if (aba.getMaxRows() < linhas) {
    aba.insertRowsAfter(aba.getMaxRows(), linhas - aba.getMaxRows());
  }
  if (aba.getMaxColumns() < colunas) {
    aba.insertColumnsAfter(aba.getMaxColumns(), colunas - aba.getMaxColumns());
  }
  aba.clearContents();
  const area = aba.getRange(1, 1, linhas, colunas);
  area.clearFormat();
  const cabecalhos = pacote.dados[0];
  cabecalhos.forEach((campo, j) => {
    if (ehColunaNome(campo) || ehColunaDataOuStatus(campo) ||
        ehColunaStatusPsicologico(campo)) {
      aba.getRange(1, j + 1, linhas, 1).setNumberFormat('@');
    }
  });
  area.setValues(pacote.dados);
  aba.getRange(1, 1, 1, colunas)
    .setFontWeight('bold').setBackground('#dcebe5');
  aba.setFrozenRows(1);
  const iData = cabecalhos.findIndex(c =>
    normalizar(c) === normalizar('Data do Atendimento (Triagem)')
  );
  if (iData >= 0 && linhas > 1) {
    aba.getRange(2, iData + 1, linhas - 1, 1).setNumberFormat('dd/MM/yyyy');
  }
  console.log(pacote.nome + ': ' + pacote.quantidade + ' registros; ' +
    pacote.vazias + ' linhas vazias ignoradas.');
}

function exportarParaPainel() {
  const bloqueio = LockService.getScriptLock();
  if (!bloqueio.tryLock(30000)) {
    throw new Error('Outra exportação já está em andamento.');
  }
  try {
    if (!CONFIG.origemId || !CONFIG.destinoId ||
        CONFIG.origemId === CONFIG.destinoId) {
      throw new Error('IDs de origem/destino inválidos.');
    }
    const origem = SpreadsheetApp.openById(CONFIG.origemId);
    const destino = SpreadsheetApp.openById(CONFIG.destinoId);
    const chave = obterChave();
    // Validar as duas abas antes de sobrescrever qualquer destino.
    const pacotes = CONFIG.abas.map(c => prepararAba(origem, c, chave));
    pacotes.forEach(p => escreverAba(destino, p));
    SpreadsheetApp.flush();
    console.log('Exportação concluída: ' + new Date().toISOString());
  } finally {
    bloqueio.releaseLock();
  }
}

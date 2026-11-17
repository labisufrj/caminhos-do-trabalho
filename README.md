# Caminhos do Trabalho — ETL para o painel de dados

Script em **Google Apps Script** que extrai e transforma dados da planilha operacional do projeto **Caminhos do Trabalho** para uma segunda planilha utilizada no desenvolvimento de um painel de visualização. O objetivo é disponibilizar dados úteis à análise, reduzindo a exposição de identificadores pessoais e padronizando registros preenchidos manualmente.

> **Importante:** a base gerada é **pseudonimizada, não anonimizada**. Informações sobre saúde, demandas e atendimentos ainda podem ser sensíveis e, combinadas com ocupação, idade e localidade, permitir reidentificação. O acesso à planilha de destino deve ser restrito à equipe autorizada. O painel público deve apresentar somente dados agregados, com avaliação do risco de divulgação de grupos pequenos.

## Ambiente de execução

- **Plataforma:** Google Apps Script, em projeto independente das planilhas.
- **Conta responsável pela execução:** `handrade@cos.ufrj.br` (conta institucional da UFRJ).
- **Função principal:** `exportarParaPainel`.
- **Agendamento configurado:** acionador baseado no tempo, **a cada 1 hora**, inicialmente para acompanhamento e depuração. A frequência pode ser reduzida após a estabilização.
- **Origem:** planilha operacional, lida sem modificações.
- **Destino:** [Planilha de dados para o painel](https://docs.google.com/spreadsheets/d/10cqNRHEbyaCRn5pM_rJ0guqmrTnrGldt2kPltGTf1DM/edit).

O repositório contém **o código-fonte**, mas não o agendamento, as permissões ou as propriedades privadas do projeto Apps Script. Essas configurações são mantidas no ambiente da conta institucional.

## Abas e campos exportados

São exportadas somente as colunas explicitamente previstas no script (*lista de permissão*), preservando os cabeçalhos e a ordem do arquivo de origem:

| Aba na origem | Aba no destino | Quantidade de colunas |
| --- | --- | ---: |
| `Dados do trabalhador` | `trabalhadores` | 8 |
| `Triagem` | `triagem` | 15 |

Colunas não previstas na configuração não são exportadas. Linhas sem valores em nenhum campo selecionado são ignoradas. A estrutura da planilha original não é alterada.

## Decisões de transformação e proteção

### 1. Pseudonimização dos nomes dos trabalhadores

O campo de nome é substituído por um identificador no formato `TRAB-<hash>`, calculado com **HMAC-SHA256**, usando uma chave persistente e os primeiros 12 bytes da assinatura.

- Antes do cálculo, o nome é normalizado (caixa, acentos, pontuação e espaços).
- O mesmo texto de nome normalizado gera o mesmo identificador nas duas abas, enquanto a chave permanecer a mesma.
- **Isso não constitui identificação confiável de uma pessoa:** homônimos e nomes incompletos podem produzir correspondências falsas ou ausentes.
- Não se presume que as duas abas contenham conjuntos de pessoas distintos ou que o nome seja uma chave única.
- A chave `CHAVE_HMAC` fica nas **Propriedades do script** do Apps Script e **nunca deve ser incluída no repositório**. Na primeira execução do projeto, o script gera uma chave caso ela não exista.

**Atenção à migração:** executar o código em outro projeto Apps Script sem preservar a chave faz com que novos hashes sejam gerados, quebrando a correspondência com exportações anteriores. A chave deve ser transferida por canal seguro, nunca via commit.

### 2. Campos de data ou situação de atendimento — aba `triagem`

As colunas **F, H, I, J e K** recebem a mesma limpeza:

- `Atendimento sócio-jurídico`;
- `Atendimento psicológico`;
- `Avaliação do adoecimento/ Médico`;
- `CAT elaborada`;
- `Elaboração de Rel. médico`.

A ordem das regras é:

1. Se houver uma **data válida** no texto, exportar a primeira no formato `DD/MM/AAAA` (aceita ano com dois ou quatro dígitos; anos com dois dígitos são interpretados como `20xx`).
2. Se não houver data, reconhecer um status isolado: `Sim`, `Não`, `Pendente`, `Agendar`, `Agendado` ou `Encaminhado`, aceitando variações simples de grafia, acentuação e gênero quando previstas.
3. Se a célula estiver vazia, manter vazia.
4. Para outros textos, exportar **`Dado não reconhecido`** e registrar aviso no log **sem registrar o conteúdo original**.

Exemplos:

| Origem | Destino |
| --- | --- |
| `Sim (05/07/25)` | `05/07/2025` |
| `02/10/2026 - [nome de profissional]` | `02/10/2026` |
| `Encaminhado.` | `Encaminhado` |
| `Agendado` | `Agendado` |
| Texto livre não previsto | `Dado não reconhecido` |

Quando existem múltiplas datas, apenas a primeira completa é exportada e o script gera um aviso. Essa decisão evita divulgar nomes de profissionais incluídos no mesmo campo, mas pode omitir eventos adicionais; os avisos devem ser revisados periodicamente.

### 3. Acompanhamento psicológico — coluna O da aba `triagem`

Somente os cinco valores do menu suspenso da planilha original são permitidos:

- `Em atendimento psicológico semanal`;
- `Encerrado`;
- `Não necessitou de atendimento psicológico.`;
- `Acolhimento inicial`;
- `Acolhimento psicológico`.

A comparação tolera diferenças de caixa, acentuação e espaços. Qualquer outro texto não vazio é substituído por **`Dado não recuperado`**, com aviso no log, sem copiar textos livres ou nomes de profissionais.

A lista é atualmente **fixa no código**. Se as opções do menu da origem forem alteradas, o script deverá ser revisado.

### 4. Tipo de vínculo — coluna F da aba `trabalhadores`

Registros que começam com `Servidor público` ou `Servidora pública`, mesmo quando acompanhados do nome do órgão ou de informações adicionais, são padronizados como **`servidor publico`**.

Exemplos: `Servidor Público - MPRJ`, `Servidora pública - UFBA` e `Servidor público - Cargo em comissão - MPRJ` tornam-se `servidor publico`. Outros tipos de vínculo, como `CLT`, `Regime estatutário` e `Concurso público`, permanecem como estavam.

### 5. Campos deliberadamente preservados

A coluna **E — `Demanda`**, na aba `triagem`, **não é categorizada nem redigida** nesta versão, para não perder informações de interesse analítico. Outros campos não sujeitos a regras específicas também são preservados.

**Consequência:** essas colunas podem conter informações sensíveis ou identificadores indiretos. Esta decisão não autoriza compartilhar a base publicamente. Uma eventual versão pública deve ser preparada a partir de agregações e regras adicionais de proteção.

## Execução e atualização

1. No projeto Apps Script da conta `handrade@cos.ufrj.br`, manter o conteúdo de `Código.gs` sincronizado com o código versionado no repositório.
2. Executar manualmente `exportarParaPainel` para validar permissões e resultados.
3. Manter um acionador **Baseado no tempo** para a função `exportarParaPainel` (atualmente, **a cada hora**).
4. Consultar **Execuções** no Apps Script para conferir sucessos, falhas e avisos de valores não reconhecidos.

A cada execução, o script:

1. abre a origem e o destino pelas IDs configuradas;
2. lê e transforma **ambas as abas em memória**, verificando os cabeçalhos esperados;
3. limpa o conteúdo anterior das abas `trabalhadores` e `triagem` no destino e grava a nova exportação;
4. registra o resultado no log.

O script utiliza `LockService` para evitar execuções simultâneas. Erros na preparação interrompem a operação **antes de sobrescrever as abas**; porém a gravação das duas abas **não é transacional**: se ocorrer uma falha durante a escrita, as duas abas poderão ficar temporariamente em versões diferentes.

**Não editar manualmente a planilha de destino:** essas alterações serão perdidas na execução seguinte. A origem é o registro operacional mantido pela equipe do projeto.

## Segurança, acesso e limites

- Restringir acesso à planilha de destino a pessoas autorizadas, preferencialmente em modo de leitura.
- Não publicar a planilha, seus CSVs, exemplos com registros reais, logs contendo dados pessoais ou a chave HMAC neste repositório.
- Não interpretar os identificadores `TRAB-...` como IDs únicos e confiáveis de indivíduos.
- Não utilizar a base pseudonimizada como origem direta para consultas públicas por registro.
- Tratar datas, profissão, idade, localidade, demanda, dados clínicos e situação previdenciária como possíveis vetores de reidentificação.
- Rever periodicamente formatos inesperados, valores sinalizados e alterações na estrutura/validação da planilha de origem.
- Garantir que a equipe tenha base legal, finalidade e controles de acesso apropriados para tratar esses dados.

## Manutenção

As principais regras são definidas em `CONFIG` e nas funções:

| Função | Responsabilidade |
| --- | --- |
| `exportarParaPainel` | Orquestrar a extração e gravação |
| `prepararAba` | Selecionar colunas e transformar registros |
| `mascararNome` | Gerar pseudônimo HMAC determinístico |
| `extrairDataAtendimento` | Padronizar datas e estados, sem copiar texto livre desconhecido |
| `filtrarStatusPsicologico` | Validar opções do menu suspenso |
| `normalizarTipoVinculo` | Remover órgão de lotação dos registros de servidores públicos |
| `escreverAba` | Substituir o conteúdo das abas de destino |

**Antes de alterar regras ou incluir novas colunas**, avaliar novamente a exposição de dados pessoais e verificar o resultado na planilha de destino. As alterações no GitHub não são implantadas automaticamente no Apps Script: é necessário atualizar o código do projeto em execução.

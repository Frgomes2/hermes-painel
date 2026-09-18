import { Prisma, PrismaClient } from '@prisma/client';

/**
 * A conexao do painel com o banco do Hermes.
 *
 * ---------------------------------------------------------------------------
 * O PAINEL USA O PAPEL DA APLICACAO, NUNCA O DONO
 * ---------------------------------------------------------------------------
 * O Hermes cria o papel `hermes_app` — sem superusuario e sem bypassrls — e e
 * com ele que a aplicacao fala. O painel faz igual, pela mesma razao: o Row
 * Level Security e IGNORADO por superusuario. Conectar como dono das tabelas
 * deixaria o painel enxergando todas as empresas, e o isolamento que o Hermes
 * prova no boot valeria zero deste lado.
 *
 * A URL do papel e derivada da DATABASE_URL trocando usuario e senha, igual ao
 * `com-empresa.ts` do Hermes — por isso nao existe uma segunda string de
 * conexao para manter em dia.
 *
 * SEM `APP_DB_PASSWORD`, o painel NAO sobe. No Hermes isso e so um aviso,
 * porque derrubar o servico deixaria clientes sem atendimento. Aqui nao ha essa
 * desculpa: um painel multiempresa sem RLS mostra os dados de uma barbearia
 * para outra na primeira consulta.
 */

/**
 * Confere TODAS as variaveis de uma vez.
 *
 * Reclamar de uma por vez transforma a configuracao numa escada: falta a
 * primeira, corrige, implanta, espera, falta a segunda. Com quatro variaveis e
 * um deploy de minutos, isso e meia hora jogada fora. A lista inteira sai de
 * uma vez, com o que cada uma e.
 */
function conferirAmbiente(): void {
  const exigidas: { nome: string; porque: string }[] = [
    { nome: 'DATABASE_URL', porque: 'o mesmo banco do Hermes' },
    { nome: 'APP_DB_PASSWORD', porque: 'senha do papel hermes_app, a mesma do Hermes' },
    { nome: 'HERMES_API_URL', porque: 'endereco do Hermes, ex.: http://hermes.railway.internal:8080' },
    { nome: 'INTERNAL_API_SECRET', porque: 'o MESMO valor do servico do Hermes' },
  ];

  const faltando = exigidas.filter((v) => !process.env[v.nome]);
  if (faltando.length === 0) return;

  throw new Error(
    `Faltam ${faltando.length} variavel(is) no servico do painel:\n` +
      faltando.map((v) => `  - ${v.nome}: ${v.porque}`).join('\n') +
      '\n\nNa Railway: aba Variables do servico do painel. Lembre de IMPLANTAR ' +
      'depois de alterar — variavel mexida fica em rascunho ate o deploy.'
  );
}

function urlDaAplicacao(): string {
  conferirAmbiente();

  // Sem `APP_DB_PASSWORD` o painel se recusa a funcionar: na Railway a conexao
  // de administracao e superusuario, e superusuario IGNORA row level security —
  // o painel mostraria os dados de uma barbearia para outra na primeira
  // consulta. No Hermes isso e so um aviso, porque derrubar o servico deixaria
  // clientes sem atendimento; aqui nao ha essa desculpa.
  const u = new URL(process.env.DATABASE_URL!);
  u.username = 'hermes_app';
  u.password = process.env.APP_DB_PASSWORD!;
  return u.toString();
}

/**
 * Em desenvolvimento o Next recarrega os modulos a cada alteracao. Sem guardar
 * o cliente no escopo global, cada recarga abre um pool novo e o Postgres
 * chega no limite de conexoes depois de alguns salvamentos.
 */
const global_ = globalThis as unknown as { prismaDoPainel?: PrismaClient };

/** Tipado de proposito: um array de string cru nao e aceito pelo construtor. */
const NIVEIS: Prisma.LogLevel[] =
  process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'];

/**
 * O cliente nasce na PRIMEIRA CONSULTA, nunca na importacao do modulo.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO NAO E FRESCURA
 * ---------------------------------------------------------------------------
 * `next build` importa cada rota para ler a configuracao dela — o `dynamic`, o
 * `revalidate`. Importar, so isso, sem atender requisicao nenhuma. Se o cliente
 * do banco for criado no nivel do modulo, essa leitura EXIGE as variaveis de
 * ambiente, e o build quebra com "DATABASE_URL ausente" numa maquina que nunca
 * precisou falar com o banco.
 *
 * Pior: o erro aponta para a pagina (`Failed to collect page data for
 * /simulador`), quando a pagina nao tem nada a ver com isso.
 *
 * Adiar tambem separa duas perguntas que estavam grudadas: "o codigo compila?"
 * e "a configuracao esta certa?". A primeira e do build; a segunda e de quem
 * sobe o servico — e o erro aparece na hora certa, com o texto certo.
 */
let memoizado: PrismaClient | null = null;

function cliente(): PrismaClient {
  if (memoizado) return memoizado;

  memoizado =
    global_.prismaDoPainel ??
    new PrismaClient({ datasourceUrl: urlDaAplicacao(), log: NIVEIS });

  if (process.env.NODE_ENV !== 'production') global_.prismaDoPainel = memoizado;
  return memoizado;
}

/**
 * Mesma cara de sempre (`prisma.usuario.findMany(...)`), so que a conexao so
 * existe quando alguem realmente usa. O Proxy evita ter que trocar toda chamada
 * por `cliente().usuario...` — a indirecao fica em um lugar so.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_alvo, propriedade) {
    const c = cliente();
    const valor = c[propriedade as keyof PrismaClient];
    // Metodos precisam do `this` certo; `$transaction` sem bind perde o cliente.
    return typeof valor === 'function' ? (valor as Function).bind(c) : valor;
  },
});

/**
 * Executa dentro de uma transacao com `app.empresa_id` definido.
 *
 * É a MESMA mecanica do `comEmpresa` do Hermes, e precisa ser: as politicas de
 * RLS comparam `empresaId` com `current_setting('app.empresa_id')`. Fora de uma
 * transacao com esse ajuste, as consultas simplesmente nao devolvem nada — o
 * que confunde muito mais do que um erro, porque parece banco vazio.
 *
 * `set_config(..., true)` e local a transacao: a proxima requisicao a pegar
 * essa conexao do pool comeca limpa. Sem o `true`, o ajuste vazaria de uma
 * empresa para outra pelo pool — exatamente o vazamento que o RLS existe para
 * impedir.
 */
export async function comEmpresa<T>(
  empresaId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  // Barra injecao e, principalmente, barra `undefined` virando a string
  // "undefined" — que o set_config aceitaria de boa vontade, fazendo toda
  // consulta voltar vazia sem erro nenhum.
  if (!/^[0-9a-f-]{36}$/i.test(empresaId)) {
    throw new Error(`empresaId invalido: ${empresaId}`);
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.empresa_id', ${empresaId}, true)`;
    return fn(tx);
  });
}

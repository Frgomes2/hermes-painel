import 'server-only';

/**
 * Cliente da API interna do Hermes.
 *
 * O painel le o banco por conta propria. O que passa por aqui e so o que vive
 * do lado do Hermes: o agente, com o pool de modelos, as chaves e o registro em
 * `acoes_do_agente`. Ver o comentario de `src/http/interno.ts` no Hermes.
 */

export type RespostaDoSimulador = {
  conversaId: string;
  texto: string;
  voltas: number;
  ferramentasUsadas: string[];
  latenciaMs: number;
};

export type FalhaDoSimulador = { erro: string; conversaId?: string };

function base(): string {
  const url = process.env.HERMES_API_URL;
  if (!url) {
    throw new Error(
      'HERMES_API_URL ausente. Dentro da Railway use o endereco interno do ' +
        'servico do Hermes, algo como http://hermes.railway.internal:8080'
    );
  }
  return url.replace(/\/+$/, '');
}

export async function simular(
  empresaId: string,
  texto: string,
  conversaId?: string
): Promise<RespostaDoSimulador | FalhaDoSimulador> {
  const segredo = process.env.INTERNAL_API_SECRET;
  if (!segredo) {
    return {
      erro:
        'INTERNAL_API_SECRET ausente no painel. Precisa ser o MESMO valor ' +
        'definido no servico do Hermes.',
    };
  }

  let r: Response;
  try {
    r = await fetch(`${base()}/interno/simular`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': segredo },
      body: JSON.stringify({ empresaId, texto, conversaId }),
      // O agente pode dar ate quatro voltas com o modelo. O padrao do fetch
      // desistiria no meio e o sintoma seria "o agente nao respondeu", quando na
      // verdade ele respondeu depois.
      signal: AbortSignal.timeout(90_000),
    });
  } catch (e) {
    const causa = (e as { cause?: { code?: string } }).cause;
    return {
      erro:
        `Nao consegui falar com o Hermes (${base()}): ` +
        `${causa?.code ?? (e as Error).message}. ` +
        'Conferir se o servico esta no ar e se HERMES_API_URL aponta para ele.',
    };
  }

  const bruto = await r.text().catch(() => '');
  let corpo: Record<string, unknown> = {};
  try {
    corpo = JSON.parse(bruto);
  } catch {
    return { erro: `O Hermes respondeu algo que nao e JSON (HTTP ${r.status}): ${bruto.slice(0, 200)}` };
  }

  if (!r.ok) {
    // 401 aqui quer dizer uma coisa so, e vale dizer por extenso: os dois
    // servicos estao com segredos diferentes. Procurar isso sem a dica custa
    // caro, porque o erro parece de permissao de usuario.
    if (r.status === 401) {
      return {
        erro:
          'O Hermes recusou a chamada interna. O INTERNAL_API_SECRET do painel ' +
          'e o do Hermes precisam ser identicos.',
      };
    }
    return {
      erro: String(corpo.erro ?? `HTTP ${r.status}`),
      conversaId: typeof corpo.conversaId === 'string' ? corpo.conversaId : undefined,
    };
  }

  return corpo as unknown as RespostaDoSimulador;
}

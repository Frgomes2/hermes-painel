'use client';

import { useEffect, useRef, useState } from 'react';

export type Fala = {
  de: 'cliente' | 'agente' | 'erro';
  texto: string;
  ferramentas?: string[];
  voltas?: number;
  latenciaMs?: number;
};

export type Enviar = (
  texto: string,
  conversaId: string | null
) => Promise<{ conversaId?: string; texto?: string; erro?: string; ferramentas?: string[]; voltas?: number; latenciaMs?: number }>;

/**
 * A conversa de teste.
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTA TELA MOSTRA ALEM DA RESPOSTA
 * ---------------------------------------------------------------------------
 * Um simulador que so mostra o texto do agente serve para pouco: a resposta
 * pode estar certa por engano. O que interessa e COMO ela foi produzida —
 * quais ferramentas o agente chamou, quantas voltas deu e quanto demorou.
 *
 * Um preco que aparece sem `consultar_preco` na lista e o pior defeito
 * possivel neste produto: o modelo inventou, e soa perfeitamente plausivel.
 * Com as ferramentas a vista, isso fica obvio na hora.
 */
export function Conversa({ enviar }: { enviar: Enviar }) {
  const [falas, setFalas] = useState<Fala[]>([]);
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [conversaId, setConversaId] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: 'smooth' });
  }, [falas, ocupado]);

  async function mandar(e: React.FormEvent) {
    e.preventDefault();
    const limpo = texto.trim();
    if (!limpo || ocupado) return;

    setFalas((f) => [...f, { de: 'cliente', texto: limpo }]);
    setTexto('');
    setOcupado(true);

    try {
      const r = await enviar(limpo, conversaId);

      // A conversa e guardada mesmo quando a resposta falha: o texto do cliente
      // ja foi gravado do outro lado, e comecar outra conversa perderia o
      // historico que o agente vai ler na proxima tentativa.
      if (r.conversaId) setConversaId(r.conversaId);

      setFalas((f) => [
        ...f,
        r.erro
          ? { de: 'erro', texto: r.erro }
          : {
              de: 'agente',
              texto: r.texto ?? '(resposta vazia)',
              ferramentas: r.ferramentas,
              voltas: r.voltas,
              latenciaMs: r.latenciaMs,
            },
      ]);
    } catch (erro) {
      setFalas((f) => [
        ...f,
        { de: 'erro', texto: erro instanceof Error ? erro.message : String(erro) },
      ]);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-11rem)] flex-col rounded-lg bg-white shadow-sm ring-1 ring-[var(--borda)]">
      <div className="flex items-center justify-between border-b border-[var(--borda)] px-4 py-2.5">
        <span className="text-sm font-medium">Conversa de teste</span>

        <button
          type="button"
          onClick={() => {
            setFalas([]);
            setConversaId(null);
          }}
          className="rounded-md px-2 py-1 text-xs text-[var(--suave)] hover:bg-slate-100"
        >
          Começar outra
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {falas.length === 0 && (
          <div className="mx-auto max-w-md pt-10 text-center text-sm text-[var(--suave)]">
            <p>Escreva como se fosse um cliente.</p>
            <p className="mt-2">
              &ldquo;quanto custa o corte?&rdquo; · &ldquo;tem horário amanhã de
              tarde?&rdquo; · &ldquo;quero marcar com o João&rdquo;
            </p>
          </div>
        )}

        {falas.map((f, i) => (
          <div key={i} className={f.de === 'cliente' ? 'flex justify-end' : 'flex justify-start'}>
            <div className="max-w-[80%]">
              <div
                className={
                  'whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ' +
                  (f.de === 'cliente'
                    ? 'bg-[var(--azul)] text-white'
                    : f.de === 'erro'
                      ? 'bg-red-50 text-red-800 ring-1 ring-red-100'
                      : 'bg-slate-100 text-[var(--texto)]')
                }
              >
                {f.texto}
              </div>

              {f.de === 'agente' && (
                <p className="mt-1 px-1 text-[11px] text-[var(--suave)]">
                  {f.ferramentas && f.ferramentas.length > 0 ? (
                    <span className="font-medium text-emerald-700">
                      {f.ferramentas.join(', ')}
                    </span>
                  ) : (
                    // Sem ferramenta o agente falou so do prompt. Para "oi" isso
                    // e certo; para "quanto custa" e invencao.
                    <span className="text-amber-700">sem ferramenta</span>
                  )}
                  {typeof f.voltas === 'number' && ` · ${f.voltas} volta(s)`}
                  {typeof f.latenciaMs === 'number' && ` · ${(f.latenciaMs / 1000).toFixed(1)}s`}
                </p>
              )}
            </div>
          </div>
        ))}

        {ocupado && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-slate-100 px-4 py-2 text-sm text-[var(--suave)]">
              pensando…
            </div>
          </div>
        )}

        <div ref={fim} />
      </div>

      <form onSubmit={mandar} className="flex gap-2 border-t border-[var(--borda)] p-3">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escreva como um cliente escreveria…"
          disabled={ocupado}
          className="min-w-0 flex-1 rounded-md border border-[var(--borda)] px-3 py-2 text-sm outline-none focus:border-[var(--azul)] focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
        />
        <button
          type="submit"
          disabled={ocupado || !texto.trim()}
          className="rounded-md bg-[var(--azul)] px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}

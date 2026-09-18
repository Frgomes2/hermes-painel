import { exigirAcesso } from '@/lib/permissoes';
import { simular } from '@/lib/hermes';
import { Conversa } from './conversa';

export const dynamic = 'force-dynamic';

/**
 * Simulador: conversar com o agente sem WhatsApp.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ELE EXISTE, E POR QUE CHAMA O AGENTE DE VERDADE
 * ---------------------------------------------------------------------------
 * O caminho do WhatsApp tem muita coisa que nao e o agente: entrega do Meta,
 * assinatura, fila, debounce, envio. Quando algo da errado la, e dificil saber
 * de quem e a culpa — e foi exatamente onde passamos dias.
 *
 * Aqui o agente responde com a MESMA funcao que o worker usa, a mesma empresa,
 * as mesmas ferramentas, a mesma agenda e o mesmo banco. O que ele agenda aqui
 * ocupa horario de verdade; o que ele consulta e o cadastro de verdade.
 *
 * Duas consequencias que valem dizer em voz alta:
 *
 * 1. E teste, mas nao e faz de conta. Agendamento criado aqui aparece na agenda
 *    e bloqueia o horario para um cliente real.
 * 2. Se funciona aqui e nao funciona no WhatsApp, o problema NAO e o agente.
 *    Isso e metade do diagnostico, de graca.
 */
export default async function Simulador() {
  const { usuario } = await exigirAcesso('/simulador');

  // A Server Action fecha sobre o `empresaId` da SESSAO, nunca sobre um valor
  // vindo do navegador. Se a empresa viesse do cliente, qualquer pessoa logada
  // conversaria com o agente de outra barbearia — e o RLS nao pegaria, porque a
  // chamada seria legitimamente feita em nome daquela empresa.
  const empresaId = usuario.empresaId;

  async function enviar(texto: string, conversaId: string | null) {
    'use server';

    const r = await simular(empresaId, texto, conversaId ?? undefined);

    if ('erro' in r) {
      return { erro: r.erro, conversaId: r.conversaId };
    }

    return {
      conversaId: r.conversaId,
      texto: r.texto,
      ferramentas: r.ferramentasUsadas,
      voltas: r.voltas,
      latenciaMs: r.latenciaMs,
    };
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Simulador</h1>
        <p className="mt-1 text-sm text-[var(--suave)]">
          O mesmo agente que atende no WhatsApp, sem passar pelo WhatsApp
        </p>
      </div>

      <div className="rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 ring-1 ring-amber-100">
        <strong>Isto não é faz de conta.</strong> O agente consulta o cadastro
        real e, se você pedir, cria agendamento de verdade — que ocupa o horário
        na agenda. Cancele o que criar por teste.
      </div>

      <Conversa enviar={enviar} />
    </div>
  );
}

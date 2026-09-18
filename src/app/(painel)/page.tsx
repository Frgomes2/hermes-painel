import Link from 'next/link';
import { comEmpresa } from '@/lib/prisma';
import { exigirAcesso } from '@/lib/permissoes';

export const dynamic = 'force-dynamic';

/**
 * Início: o estado da empresa em números.
 *
 * Tudo aqui passa por `comEmpresa`, que é o que faz o RLS valer. Uma consulta
 * solta fora dele voltaria vazia — o que parece banco sem dados, e não falta de
 * contexto. É por isso que não existe atalho: no painel, toda leitura de dado
 * de empresa entra por essa porta.
 */
export default async function Inicio() {
  const { usuario } = await exigirAcesso('/');

  const dados = await comEmpresa(usuario.empresaId, async (tx) => {
    const inicioDoDia = new Date();
    inicioDoDia.setHours(0, 0, 0, 0);
    const fimDoDia = new Date(inicioDoDia);
    fimDoDia.setDate(fimDoDia.getDate() + 1);

    const [servicos, profissionais, canais, agentes, hoje, conversasAbertas] = await Promise.all([
      tx.servico.count({ where: { ativo: true } }),
      tx.profissional.count({ where: { ativo: true } }),
      tx.canal.count({ where: { ativo: true } }),
      tx.agente.count({ where: { ativo: true } }),
      tx.agendamento.count({
        where: { inicio: { gte: inicioDoDia, lt: fimDoDia }, status: { not: 'CANCELADO' } },
      }),
      tx.conversa.count({ where: { status: 'ATIVA' } }),
    ]);

    return { servicos, profissionais, canais, agentes, hoje, conversasAbertas };
  });

  const cartoes = [
    { rotulo: 'Agendamentos hoje', valor: dados.hoje },
    { rotulo: 'Conversas ativas', valor: dados.conversasAbertas },
    { rotulo: 'Serviços', valor: dados.servicos },
    { rotulo: 'Profissionais', valor: dados.profissionais },
    { rotulo: 'Agentes ativos', valor: dados.agentes },
    { rotulo: 'Canais ativos', valor: dados.canais },
  ];

  const semCadastro = dados.servicos === 0 || dados.profissionais === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Início</h1>
        <p className="mt-1 text-sm text-[var(--suave)]">Como está a operação agora</p>
      </div>

      {semCadastro && (
        // Um painel zerado não informa nada. Dizer o que falta é mais útil do
        // que seis cartões com zero.
        <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-100">
          O cadastro ainda está incompleto. Sem serviço e profissional, a agenda
          não tem o que oferecer e o agente não tem o que responder.{' '}
          <Link href="/servicos" className="font-medium underline">
            Cadastrar serviços
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cartoes.map((c) => (
          <div
            key={c.rotulo}
            className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-[var(--borda)]"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--suave)]">
              {c.rotulo}
            </p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{c.valor}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

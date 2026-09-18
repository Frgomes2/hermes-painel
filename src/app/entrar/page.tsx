import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { entrar, usuarioAtual } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

/**
 * Tela de entrada.
 *
 * Server Action em vez de rota de API: a senha nunca passa por JavaScript do
 * navegador, e o formulario funciona mesmo antes de o JS carregar.
 */
export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  if (await usuarioAtual()) redirect('/');

  const { erro } = await searchParams;

  async function autenticar(dados: FormData) {
    'use server';

    const cabecalhos = await headers();
    const r = await entrar(String(dados.get('email') ?? ''), String(dados.get('senha') ?? ''), {
      agente: cabecalhos.get('user-agent') ?? undefined,
      // Atras de proxy (a Railway e um), o IP real vem no cabecalho; o da
      // conexao seria sempre o do proxy.
      ip: cabecalhos.get('x-forwarded-for')?.split(',')[0]?.trim(),
    });

    if (!r.ok) redirect(`/entrar?erro=${encodeURIComponent(r.erro)}`);
    redirect('/');
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-sm ring-1 ring-[var(--borda)]">
        <h1 className="text-2xl font-semibold tracking-tight">Hermes</h1>
        <p className="mt-1 text-sm text-[var(--suave)]">Painel de atendimento</p>

        {erro && (
          <p className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
            {erro}
          </p>
        )}

        <form action={autenticar} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              autoFocus
              className="mt-1 w-full rounded-md border border-[var(--borda)] px-3 py-2 text-sm outline-none focus:border-[var(--azul)] focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label htmlFor="senha" className="block text-sm font-medium">
              Senha
            </label>
            <input
              id="senha"
              name="senha"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-md border border-[var(--borda)] px-3 py-2 text-sm outline-none focus:border-[var(--azul)] focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-[var(--azul)] px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}

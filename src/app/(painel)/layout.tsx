import { redirect } from 'next/navigation';
import { BarraLateral } from '@/componentes/barra-lateral';
import { menuVisivel } from '@/lib/permissoes';
import { sair, usuarioAtual } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

/** Iniciais para o circulo do topo. "Flavio Raphael" -> "FR". */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? '';
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : '';
  return (primeira + ultima).toUpperCase() || '?';
}

export default async function LayoutDoPainel({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioAtual();
  if (!usuario) redirect('/entrar');

  const { rotas, modulos } = await menuVisivel(usuario);

  async function encerrar() {
    'use server';
    await sair();
    redirect('/entrar');
  }

  return (
    <div className="flex min-h-screen">
      <BarraLateral rotas={[...rotas]} modulos={[...modulos]} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--borda)] bg-white px-6 py-3">
          <span className="text-sm font-medium">{usuario.empresaNome}</span>

          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className="text-sm font-medium">{usuario.nome}</p>
              <p className="text-xs text-[var(--suave)]">
                {usuario.ehAdmin ? 'Administrador' : 'Membro'}
              </p>
            </div>

            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--azul)] text-xs font-semibold text-white">
              {iniciais(usuario.nome)}
            </span>

            <form action={encerrar}>
              <button
                type="submit"
                className="rounded-md px-2 py-1 text-xs text-[var(--suave)] hover:bg-slate-100 hover:text-[var(--texto)]"
              >
                Sair
              </button>
            </form>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

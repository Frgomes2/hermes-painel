'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MENU, Secao } from '@/lib/menu';
import { Icone } from './icone';

/**
 * Barra lateral.
 *
 * Recebe as rotas e os modulos JA RESOLVIDOS pelo servidor. Ela nao decide
 * permissao nenhuma: esconder item aqui e cosmetica, e a protecao de verdade
 * acontece na pagina e na acao de servidor. Ver `lib/permissoes.ts`.
 */
export function BarraLateral({
  rotas,
  modulos,
}: {
  rotas: string[];
  modulos: string[];
}) {
  const caminho = usePathname();
  const permitidas = new Set(rotas);
  const contratados = new Set(modulos);

  const visiveis: Secao[] = MENU.map((secao) => ({
    titulo: secao.titulo,
    itens: secao.itens.filter(
      (i) => permitidas.has(i.rota) && (!i.modulo || contratados.has(i.modulo))
    ),
  })).filter((s) => s.itens.length > 0);

  return (
    <nav className="flex h-full w-64 shrink-0 flex-col bg-[var(--barra)] text-slate-300">
      <div className="px-5 py-5">
        <span className="text-lg font-semibold tracking-tight text-white">Hermes</span>
      </div>

      <div className="flex-1 overflow-y-auto pb-6">
        {visiveis.map((secao) => (
          <div key={secao.titulo} className="mt-4">
            <p className="px-5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {secao.titulo}
            </p>

            {secao.itens.map((item) => {
              // `/` so e ativo quando e exatamente a raiz; senao ele ficaria
              // aceso em todas as telas.
              const ativo =
                item.rota === '/'
                  ? caminho === '/'
                  : caminho === item.rota || caminho.startsWith(item.rota + '/');

              return (
                <Link
                  key={item.rota}
                  href={item.rota}
                  className={
                    'flex items-center gap-3 border-l-[3px] px-5 py-2 text-sm transition ' +
                    (ativo
                      ? 'border-[var(--azul)] bg-[var(--barra-ativo)] text-white'
                      : 'border-transparent hover:bg-[var(--barra-ativo)] hover:text-white')
                  }
                >
                  <Icone nome={item.icone} />
                  {item.nome}
                </Link>
              );
            })}
          </div>
        ))}

        {visiveis.length === 0 && (
          // Falha fechada tem um custo: a pessoa entra e nao ve nada. Sem esta
          // frase, ela conclui que o painel esta quebrado.
          <p className="px-5 py-4 text-xs leading-relaxed text-slate-500">
            Você não tem permissão para nenhuma tela. Peça a um administrador
            para colocar você em um grupo.
          </p>
        )}
      </div>
    </nav>
  );
}

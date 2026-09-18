import 'server-only';
import { redirect } from 'next/navigation';
import { comEmpresa } from './prisma';
import { ROTAS } from './menu';
import { UsuarioDaSessao, usuarioAtual } from './sessao';

/**
 * Quem pode o que, por rota.
 *
 * ---------------------------------------------------------------------------
 * A REGRA QUE SUSTENTA TUDO
 * ---------------------------------------------------------------------------
 * A permissao e resolvida pelo PREFIXO MAIS ESPECIFICO que casa com o caminho.
 * Cadastrou `/servicos`, manda em `/servicos`, `/servicos/novo` e
 * `/servicos/123/editar` sem escrever uma linha a mais. Se um dia existir
 * `/servicos/precos` com permissao propria, o prefixo mais longo vence — sem
 * ambiguidade e sem ordem de cadastro importando.
 *
 * ---------------------------------------------------------------------------
 * ESCONDER O MENU NAO E PROTEGER
 * ---------------------------------------------------------------------------
 * Quem souber o endereco digita direto. Por isso a checagem acontece na PAGINA
 * e em cada acao de servidor — a barra lateral so reflete o que ja foi
 * decidido aqui. Um painel que so esconde o link tem controle de acesso
 * decorativo.
 */

export type Acao = 'VER' | 'CRIAR' | 'EDITAR' | 'EXCLUIR';

/** Todas as acoes: e o que o ADMIN tem em qualquer rota. */
const TUDO: Acao[] = ['VER', 'CRIAR', 'EDITAR', 'EXCLUIR'];

/** A rota cadastrada que governa este caminho, ou `null`. */
export function rotaQueGoverna(caminho: string): string | null {
  // ROTAS ja vem da mais longa para a mais curta.
  for (const rota of ROTAS) {
    if (rota === '/') continue; // a raiz e o ultimo recurso, tratada abaixo
    if (caminho === rota || caminho.startsWith(rota + '/')) return rota;
  }
  return caminho === '/' ? '/' : null;
}

/**
 * O que este usuario pode fazer neste caminho.
 *
 * ADMIN passa por cima de tudo. Isso e saida de emergencia, nao preguica: a
 * propria tela de grupos e protegida por permissao, entao salvar a grade errada
 * no grupo do administrador trancaria todo mundo para fora — sem tela para
 * desfazer.
 *
 * Usuario sem grupo nao pode nada. Falha fechada, de proposito.
 */
export async function acoesEm(u: UsuarioDaSessao, caminho: string): Promise<Acao[]> {
  if (u.ehAdmin) return TUDO;
  if (!u.grupoId) return [];

  const rota = rotaQueGoverna(caminho);
  if (!rota) return [];

  const p = await comEmpresa(u.empresaId, (tx) =>
    tx.permissao.findUnique({
      where: { grupoId_rota: { grupoId: u.grupoId!, rota } },
      select: { acoes: true },
    })
  );

  return (p?.acoes ?? []) as Acao[];
}

export type Acesso = { usuario: UsuarioDaSessao; acoes: Acao[] };

/**
 * Usar no topo de toda pagina do painel.
 *
 * Sem sessao, manda para o login. Sem a acao exigida, manda para a raiz — e nao
 * para uma tela de "acesso negado", que so serviria para confirmar a alguem
 * que aquela tela existe.
 */
export async function exigirAcesso(caminho: string, acao: Acao = 'VER'): Promise<Acesso> {
  const usuario = await usuarioAtual();
  if (!usuario) redirect('/entrar');

  const acoes = await acoesEm(usuario, caminho);
  if (!acoes.includes(acao)) redirect('/');

  return { usuario, acoes };
}

/**
 * Os itens de menu que este usuario enxerga.
 *
 * Duas condicoes: ter VER na rota, e a empresa ter o modulo contratado quando o
 * item depende de um. Mostrar item de modulo nao contratado seria vender pela
 * barra lateral e frustrar no clique.
 */
export type MenuVisivel = {
  /** Rotas em que o usuario tem VER. */
  rotas: Set<string>;
  /** Chaves de modulo contratadas pela empresa. */
  modulos: Set<string>;
};

export async function menuVisivel(u: UsuarioDaSessao): Promise<MenuVisivel> {
  const contratados = await comEmpresa(u.empresaId, (tx) =>
    tx.moduloContratado.findMany({
      where: { empresaId: u.empresaId, ativo: true },
      select: { modulo: { select: { chave: true } } },
    })
  );
  const modulos = new Set<string>(contratados.map((c) => c.modulo.chave));

  if (u.ehAdmin) return { rotas: new Set<string>(ROTAS), modulos };
  if (!u.grupoId) return { rotas: new Set<string>(), modulos };

  const permissoes = await comEmpresa(u.empresaId, (tx) =>
    tx.permissao.findMany({
      where: { grupoId: u.grupoId!, acoes: { has: 'VER' } },
      select: { rota: true },
    })
  );

  return { rotas: new Set<string>(permissoes.map((p) => p.rota)), modulos };
}

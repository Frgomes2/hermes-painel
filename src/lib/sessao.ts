import 'server-only';
import { createHash, randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { prisma, comEmpresa } from './prisma';

/**
 * Login, sessao e bloqueio por tentativas.
 *
 * ---------------------------------------------------------------------------
 * POR QUE O LOGIN PASSA POR FUNCAO DO BANCO
 * ---------------------------------------------------------------------------
 * `usuarios` e `sessoes` estao sob RLS, e a politica compara `empresaId` com
 * `current_setting('app.empresa_id')`. No login existe apenas um e-mail: qual e
 * a empresa E o que se quer descobrir.
 *
 * Uma consulta comum aqui nao daria erro — voltaria VAZIA. E o sintoma seria o
 * pior possivel: "E-mail ou senha incorretos" para a senha certa, sempre, sem
 * nada no log. Foi exatamente o que aconteceu na primeira versao deste arquivo.
 *
 * Por isso a leitura passa por `autenticar_usuario` e `sessao_por_token`,
 * funcoes SECURITY DEFINER em `prisma/sql/04-acesso.sql`. Mesma solucao do
 * roteamento de canal, pelo mesmo motivo. Depois do login, com a empresa em
 * maos, tudo volta a passar por `comEmpresa`.
 *
 * ---------------------------------------------------------------------------
 * AS OUTRAS DECISOES
 * ---------------------------------------------------------------------------
 * **A mesma mensagem para senha errada e usuario inexistente.** Distinguir as
 * duas entrega de graca quais e-mails existem na plataforma.
 *
 * **O token vai para o cookie; o banco guarda o HASH dele.** Mesma logica da
 * senha: se o banco vazar, ninguem sai com sessoes ativas na mao.
 *
 * **Bloqueio depois de 5 erros**, temporario — bloquear para sempre
 * transformaria um ataque em negacao de servico contra o proprio cliente.
 */

const COOKIE = 'hermes_sessao';
const HORAS_DE_SESSAO = 8;
const TENTATIVAS_ATE_BLOQUEIO = 5;
const MINUTOS_DE_BLOQUEIO = 15;
const CUSTO_BCRYPT = 12;

/** Hash do token. SHA-256 basta: o token ja e aleatorio de 256 bits, entao nao
 *  ha o que adivinhar — diferente de senha, que e curta e humana. */
function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function hashDaSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, CUSTO_BCRYPT);
}

export type UsuarioDaSessao = {
  id: string;
  nome: string;
  email: string;
  empresaId: string;
  empresaNome: string;
  ehAdmin: boolean;
  grupoId: string | null;
};

export type ResultadoDoLogin = { ok: true } | { ok: false; erro: string };

type LinhaDeAutenticacao = {
  usuario_id: string;
  empresa_id: string;
  nome: string;
  email: string;
  senha_hash: string;
  papel: string;
  grupo_id: string | null;
  ativo: boolean;
  tentativas: number;
  bloqueado_ate: Date | null;
  empresa_nome: string;
  empresa_ativa: boolean;
};

type LinhaDeSessao = {
  sessao_id: string;
  empresa_id: string;
  usuario_id: string;
  expira_em: Date;
  revogada_em: Date | null;
  nome: string;
  email: string;
  papel: string;
  grupo_id: string | null;
  usuario_ativo: boolean;
  empresa_nome: string;
  empresa_ativa: boolean;
};

export async function entrar(
  email: string,
  senha: string,
  contexto?: { agente?: string; ip?: string }
): Promise<ResultadoDoLogin> {
  const generico = 'E-mail ou senha incorretos.';
  const limpo = email.trim().toLowerCase();

  if (!limpo || !senha) return { ok: false, erro: generico };

  const linhas = await prisma.$queryRaw<LinhaDeAutenticacao[]>`
    SELECT * FROM autenticar_usuario(${limpo})
  `;
  const u = linhas[0];

  // `bcrypt.compare` contra um hash descartavel mesmo sem usuario: sem isso, a
  // resposta para e-mail inexistente volta muito mais rapido do que para senha
  // errada, e o tempo entrega a diferenca que a mensagem esconde.
  if (!u || !u.ativo) {
    await bcrypt.compare(senha, '$2a$12$invalidoinvalidoinvalidoinvalidoinvalidoinvalidoinva');
    return { ok: false, erro: generico };
  }

  if (u.bloqueado_ate && u.bloqueado_ate > new Date()) {
    const faltam = Math.ceil((u.bloqueado_ate.getTime() - Date.now()) / 60000);
    return {
      ok: false,
      erro: `Acesso bloqueado por tentativas. Tente de novo em ${faltam} minuto(s).`,
    };
  }

  if (!u.empresa_ativa) {
    return { ok: false, erro: 'Esta empresa esta inativa. Fale com o suporte.' };
  }

  const confere = await bcrypt.compare(senha, u.senha_hash);

  // Daqui para baixo a empresa e conhecida, entao tudo volta a passar pelo RLS.
  if (!confere) {
    const tentativas = u.tentativas + 1;
    await comEmpresa(u.empresa_id, (tx) =>
      tx.usuario.update({
        where: { id: u.usuario_id },
        data: {
          tentativas,
          bloqueadoAte:
            tentativas >= TENTATIVAS_ATE_BLOQUEIO
              ? new Date(Date.now() + MINUTOS_DE_BLOQUEIO * 60_000)
              : null,
        },
      })
    );
    return { ok: false, erro: generico };
  }

  const token = randomBytes(32).toString('hex');
  const expiraEm = new Date(Date.now() + HORAS_DE_SESSAO * 3600_000);

  await comEmpresa(u.empresa_id, async (tx) => {
    await tx.usuario.update({
      where: { id: u.usuario_id },
      data: { tentativas: 0, bloqueadoAte: null, ultimoAcesso: new Date() },
    });
    await tx.sessao.create({
      data: {
        empresaId: u.empresa_id,
        usuarioId: u.usuario_id,
        tokenHash: hashDoToken(token),
        expiraEm,
        agente: contexto?.agente?.slice(0, 200) ?? null,
        ip: contexto?.ip?.slice(0, 60) ?? null,
      },
    });
  });

  const c = await cookies();
  c.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiraEm,
  });

  return { ok: true };
}

/** Quem esta logado, ou `null`. */
export async function usuarioAtual(): Promise<UsuarioDaSessao | null> {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (!token) return null;

  const linhas = await prisma.$queryRaw<LinhaDeSessao[]>`
    SELECT * FROM sessao_por_token(${hashDoToken(token)})
  `;
  const s = linhas[0];

  if (!s) return null;
  if (s.revogada_em) return null;
  if (s.expira_em <= new Date()) return null;
  if (!s.usuario_ativo || !s.empresa_ativa) return null;

  return {
    id: s.usuario_id,
    nome: s.nome,
    email: s.email,
    empresaId: s.empresa_id,
    empresaNome: s.empresa_nome,
    ehAdmin: s.papel === 'ADMIN',
    grupoId: s.grupo_id,
  };
}

/** Sai: revoga a linha e apaga o cookie. */
export async function sair(): Promise<void> {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;

  if (token) {
    // Pela funcao, e nao por `updateMany` sob RLS: sair tem que funcionar
    // sempre, inclusive quando a sessao ja nao e legivel pelo contexto atual.
    await prisma
      .$queryRaw`SELECT revogar_sessao(${hashDoToken(token)})`
      .catch(() => {
        /* sair nunca pode falhar por causa do banco; o cookie ja resolve */
      });
  }

  c.delete(COOKIE);
}

/**
 * Derruba TODAS as sessoes de um usuario.
 *
 * Chamar sempre que a senha dele mudar: se alguem entrou com a senha antiga, a
 * troca precisa expulsar essa pessoa. Trocar a senha e deixar a sessao viva e
 * uma falsa sensacao de conserto.
 */
export async function revogarSessoesDe(empresaId: string, usuarioId: string): Promise<void> {
  await comEmpresa(empresaId, (tx) =>
    tx.sessao.updateMany({
      where: { usuarioId, revogadaEm: null },
      data: { revogadaEm: new Date() },
    })
  );
}

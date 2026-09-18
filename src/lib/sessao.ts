import 'server-only';
import { createHash, randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { prisma, comEmpresa } from './prisma';

/**
 * Login, sessao e bloqueio por tentativas.
 *
 * ---------------------------------------------------------------------------
 * AS DECISOES QUE IMPORTAM
 * ---------------------------------------------------------------------------
 * **A mesma mensagem para senha errada e usuario inexistente.** Distinguir as
 * duas entrega de graca quais e-mails existem na plataforma — e numa plataforma
 * multiempresa isso e informacao sobre os clientes, nao so sobre o acesso.
 *
 * **O token vai para o cookie; o banco guarda o HASH dele.** Mesma logica da
 * senha: se o banco vazar, ninguem sai por ai com sessoes ativas na mao.
 *
 * **Bloqueio depois de 5 erros.** Sem ele, uma lista de senhas comuns testa a
 * plataforma inteira em minutos. O bloqueio e por usuario e temporario, porque
 * bloquear para sempre transforma um ataque em negacao de servico contra o
 * proprio cliente.
 *
 * **Sessao em tabela, nao em token assinado** — para poder revogar. Ver o
 * comentario do model `Sessao` no schema.
 */

const COOKIE = 'hermes_sessao';
const HORAS_DE_SESSAO = 8;
const TENTATIVAS_ATE_BLOQUEIO = 5;
const MINUTOS_DE_BLOQUEIO = 15;
const CUSTO_BCRYPT = 12;

/** Hash do token de sessao. SHA-256 basta: o token ja e aleatorio de 256 bits,
 *  entao nao ha o que "adivinhar" — diferente de senha, que e curta e humana. */
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

export type ResultadoDoLogin =
  | { ok: true }
  | { ok: false; erro: string };

/**
 * Entra. Devolve sempre a mesma mensagem nos casos de credencial invalida.
 */
export async function entrar(
  email: string,
  senha: string,
  contexto?: { agente?: string; ip?: string }
): Promise<ResultadoDoLogin> {
  const generico = 'E-mail ou senha incorretos.';
  const limpo = email.trim().toLowerCase();

  if (!limpo || !senha) return { ok: false, erro: generico };

  // Busca FORA do RLS: ainda nao se sabe de qual empresa a pessoa e — e essa
  // e justamente a informacao que o login precisa descobrir. Por isso a
  // consulta e estreita de proposito: so o necessario para autenticar.
  const usuario = await prisma.usuario.findFirst({
    where: { email: limpo, ativo: true },
    select: {
      id: true,
      nome: true,
      email: true,
      senhaHash: true,
      papel: true,
      grupoId: true,
      empresaId: true,
      tentativas: true,
      bloqueadoAte: true,
      empresa: { select: { nome: true, ativa: true } },
    },
  });

  // `bcrypt.compare` contra um hash descartavel mesmo sem usuario: sem isso, a
  // resposta para e-mail inexistente volta muito mais rapido do que para senha
  // errada, e o tempo entrega a diferenca que a mensagem esconde.
  if (!usuario) {
    await bcrypt.compare(senha, '$2a$12$invalidoinvalidoinvalidoinvalidoinvalidoinvalidoinva');
    return { ok: false, erro: generico };
  }

  if (usuario.bloqueadoAte && usuario.bloqueadoAte > new Date()) {
    const faltam = Math.ceil((usuario.bloqueadoAte.getTime() - Date.now()) / 60000);
    return {
      ok: false,
      erro: `Acesso bloqueado por tentativas. Tente de novo em ${faltam} minuto(s).`,
    };
  }

  if (!usuario.empresa.ativa) {
    return { ok: false, erro: 'Esta empresa esta inativa. Fale com o suporte.' };
  }

  const confere = await bcrypt.compare(senha, usuario.senhaHash);

  if (!confere) {
    const tentativas = usuario.tentativas + 1;
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        tentativas,
        bloqueadoAte:
          tentativas >= TENTATIVAS_ATE_BLOQUEIO
            ? new Date(Date.now() + MINUTOS_DE_BLOQUEIO * 60_000)
            : null,
      },
    });
    return { ok: false, erro: generico };
  }

  // --- deu certo ----------------------------------------------------------
  const token = randomBytes(32).toString('hex');
  const expiraEm = new Date(Date.now() + HORAS_DE_SESSAO * 3600_000);

  await prisma.$transaction([
    prisma.usuario.update({
      where: { id: usuario.id },
      data: { tentativas: 0, bloqueadoAte: null, ultimoAcesso: new Date() },
    }),
    prisma.sessao.create({
      data: {
        empresaId: usuario.empresaId,
        usuarioId: usuario.id,
        tokenHash: hashDoToken(token),
        expiraEm,
        agente: contexto?.agente?.slice(0, 200) ?? null,
        ip: contexto?.ip?.slice(0, 60) ?? null,
      },
    }),
  ]);

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

  const sessao = await prisma.sessao.findUnique({
    where: { tokenHash: hashDoToken(token) },
    select: {
      expiraEm: true,
      revogadaEm: true,
      usuario: {
        select: {
          id: true,
          nome: true,
          email: true,
          papel: true,
          grupoId: true,
          ativo: true,
          empresaId: true,
          empresa: { select: { nome: true, ativa: true } },
        },
      },
    },
  });

  if (!sessao) return null;
  if (sessao.revogadaEm) return null;
  if (sessao.expiraEm <= new Date()) return null;
  if (!sessao.usuario.ativo || !sessao.usuario.empresa.ativa) return null;

  return {
    id: sessao.usuario.id,
    nome: sessao.usuario.nome,
    email: sessao.usuario.email,
    empresaId: sessao.usuario.empresaId,
    empresaNome: sessao.usuario.empresa.nome,
    ehAdmin: sessao.usuario.papel === 'ADMIN',
    grupoId: sessao.usuario.grupoId,
  };
}

/** Sai: revoga a linha e apaga o cookie. */
export async function sair(): Promise<void> {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;

  if (token) {
    // `updateMany` e nao `update`: token invalido nao pode virar excecao numa
    // acao cujo unico objetivo e sair.
    await prisma.sessao.updateMany({
      where: { tokenHash: hashDoToken(token), revogadaEm: null },
      data: { revogadaEm: new Date() },
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

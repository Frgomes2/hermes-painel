import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { carregarEnv } from '../lib/env';

/**
 * Cria o primeiro acesso ao painel de uma empresa.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO NAO E UMA TELA
 * ---------------------------------------------------------------------------
 * Uma tela publica de "criar primeiro administrador" e uma porta que fica
 * aberta: basta alguem chegar nela antes de voce. Enquanto o cadastro de
 * empresas pela plataforma nao existe, o primeiro acesso nasce aqui, na linha
 * de comando de quem ja tem a senha do banco.
 *
 * Ele tambem CONTRATA os modulos da empresa. Sem isso o painel entra e a barra
 * lateral aparece quase vazia — `menuVisivel` esconde item de modulo nao
 * contratado, e a pessoa conclui que o painel esta quebrado.
 *
 * Roda com a conexao de ADMINISTRACAO de proposito: precisa escrever em
 * `modulos`, que fica fora do RLS, e criar usuario antes de existir sessao.
 *
 * Uso:
 *   npm run admin:primeiro -- --slug frx-code --email voce@exemplo.com --senha "algo longo"
 */

carregarEnv();

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

/** Catalogo minimo. Preco zero: cobranca e o passo 17, nao agora. */
const MODULOS = [
  { chave: 'agenda', nome: 'Agenda', descricao: 'Serviços, profissionais, horários e agendamentos' },
  { chave: 'bot', nome: 'Atendimento automático', descricao: 'Agente de WhatsApp e simulador' },
];

async function principal() {
  const slug = argumento('slug');
  const email = argumento('email')?.trim().toLowerCase();
  const senha = argumento('senha');
  const nome = argumento('nome') ?? 'Administrador';

  if (!slug || !email || !senha) {
    console.error(
      'Uso: npm run admin:primeiro -- --slug frx-code --email voce@exemplo.com --senha "algo longo"'
    );
    process.exit(1);
  }

  if (senha.length < 10) {
    // Nao e burocracia: este usuario e ADMIN e passa por cima de toda
    // permissao. Senha curta aqui vale mais para quem ataca do que para voce.
    console.error('A senha precisa ter pelo menos 10 caracteres — este acesso é administrador.');
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    const empresa = await prisma.empresa.findUnique({
      where: { slug },
      select: { id: true, nome: true },
    });

    if (!empresa) {
      console.error(
        `Não achei empresa com slug "${slug}".\n` +
          'Crie primeiro pelo Hermes: npm run canal:cloud -- --empresa "Nome" --numero-id ...\n' +
          'ou npm run empresa:exemplo.'
      );
      process.exit(1);
    }

    // --- modulos -----------------------------------------------------------
    for (const m of MODULOS) {
      const modulo = await prisma.modulo.upsert({
        where: { chave: m.chave },
        update: { nome: m.nome, descricao: m.descricao },
        create: { ...m, precoMes: 0 },
        select: { id: true },
      });

      await prisma.moduloContratado.upsert({
        where: { empresaId_moduloId: { empresaId: empresa.id, moduloId: modulo.id } },
        update: { ativo: true },
        create: { empresaId: empresa.id, moduloId: modulo.id, ativo: true },
      });
    }
    console.log(`[1/2] módulos contratados: ${MODULOS.map((m) => m.chave).join(', ')}`);

    // --- usuario -----------------------------------------------------------
    const senhaHash = await bcrypt.hash(senha, 12);

    const usuario = await prisma.usuario.upsert({
      where: { empresaId_email: { empresaId: empresa.id, email } },
      update: { senhaHash, papel: 'ADMIN', ativo: true, tentativas: 0, bloqueadoAte: null },
      create: { empresaId: empresa.id, email, nome, senhaHash, papel: 'ADMIN', ativo: true },
      select: { id: true },
    });

    // Trocar a senha derruba o que estava aberto. Se este comando foi rodado
    // porque alguem perdeu o acesso — ou porque alguem indevido entrou —,
    // manter sessoes vivas anularia o conserto.
    const derrubadas = await prisma.sessao.updateMany({
      where: { usuarioId: usuario.id, revogadaEm: null },
      data: { revogadaEm: new Date() },
    });

    console.log(`[2/2] administrador ${email} na empresa ${empresa.nome}`);
    if (derrubadas.count > 0) {
      console.log(`      ${derrubadas.count} sessão(ões) anterior(es) revogada(s)`);
    }

    console.log('\nPronto. Entre no painel com esse e-mail e senha.\n');
  } finally {
    await prisma.$disconnect();
  }
}

principal().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

import type { NextConfig } from 'next';

/**
 * NAO usar `output: 'standalone'`.
 *
 * A saida standalone monta um `node_modules` reduzido, sem o `.bin` nem os
 * engines do Prisma. Foi a armadilha do Atlas-Painel: a imagem fica menor e o
 * deploy quebra num lugar que nao parece ter relacao com o que se mudou.
 */
const config: NextConfig = {
  // O cliente do Prisma e nativo: precisa ficar de fora do bundle do servidor.
  // O bcryptjs e JS puro, mas o Next tenta otimiza-lo e o hash sai diferente.
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
};

export default config;

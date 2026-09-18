import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Carrega o `.env` para `process.env`, se existir.
 *
 * O Next faz isso sozinho nas paginas — mas SCRIPT solto nao passa pelo Next.
 * E o `@prisma/client` deixou de ler `.env` em tempo de execucao: quem le e a
 * CLI, no `generate`. Resultado: `npm run admin:primeiro` enxergaria
 * `DATABASE_URL` indefinida com o arquivo ali do lado, preenchido.
 *
 * Valor ja definido no ambiente NUNCA e sobrescrito pelo arquivo: na Railway
 * nao ha `.env`, e o ambiente e quem manda.
 */
export function carregarEnv(caminho = join(process.cwd(), '.env')): void {
  if (!existsSync(caminho)) return;

  for (const linha of readFileSync(caminho, 'utf8').split('\n')) {
    const texto = linha.trim();
    if (texto === '' || texto.startsWith('#')) continue;

    const corte = texto.indexOf('=');
    if (corte <= 0) continue;

    const chave = texto.slice(0, corte).trim();
    let valor = texto.slice(corte + 1).trim();

    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }

    if (process.env[chave] === undefined) process.env[chave] = valor;
  }
}

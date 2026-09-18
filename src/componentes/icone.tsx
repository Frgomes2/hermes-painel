/**
 * Icones do menu, em lista FECHADA.
 *
 * O Atlas-Painel aprendeu isso do jeito caro: com campo livre, um nome de icone
 * inexistente quebrava a barra lateral inteira no render — e a tela ficava em
 * branco, sem erro que apontasse para o icone. Com mapa, nome desconhecido cai
 * num padrao e a tela continua de pe.
 *
 * SVG inline de proposito: sao doze icones. Uma biblioteca inteira para isso
 * custaria mais do que resolve.
 */

const CAMINHOS: Record<string, string> = {
  casa: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5',
  conversa: 'M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z',
  mensagens: 'M4 5h16v11H8l-4 4V5Z',
  celular: 'M7 3h10v18H7zM10 18.5h4',
  calendario: 'M3 8h18M7 3v3m10-3v3M4 5h16v16H4z',
  tesoura: 'M6 5.5 18 18M18 5.5 6 18M7 8.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Zm0 12a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z',
  pessoas: 'M16 20v-1.5A3.5 3.5 0 0 0 12.5 15h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm10 9v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 4.2a3.5 3.5 0 0 1 0 6.6',
  relogio: 'M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  cadeado: 'M6 10h12v10H6zM9 10V7a3 3 0 0 1 6 0v3',
  predio: 'M4 21V4h10v17M14 10h6v11M7 8h2m-2 4h2m-2 4h2m8-4h2m-2 4h2',
  ponto: 'M12 12h.01',
};

export function Icone({ nome, className = 'h-4 w-4' }: { nome: string; className?: string }) {
  const d = CAMINHOS[nome] ?? CAMINHOS.ponto!;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

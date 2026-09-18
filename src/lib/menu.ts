/**
 * O menu do painel, declarado em codigo.
 *
 * ---------------------------------------------------------------------------
 * POR QUE NAO EM TABELA, COMO NO ATLAS-PAINEL
 * ---------------------------------------------------------------------------
 * No Atlas os menus viviam no banco, e isso fazia sentido: era um painel so,
 * de um dono so, e cadastrar tela sem mexer em codigo era conveniencia real.
 *
 * Aqui e diferente. As telas do Hermes sao as mesmas para toda barbearia, e
 * cada uma so existe se alguem escreveu a pagina. Um menu em tabela permitiria
 * cadastrar um item apontando para rota que nao existe — e o efeito seria um
 * link quebrado no painel do cliente, que ninguem consegue explicar.
 *
 * O que CONTINUA no banco e a permissao, que e o que varia por empresa e por
 * grupo. A rota e a chave que liga as duas coisas.
 */

export type ItemDeMenu = {
  /** Prefixo de rota. E a chave da permissao. */
  rota: string;
  nome: string;
  /** Chave do icone; a lista fechada vive em componentes/icone.tsx. */
  icone: string;
  /** Quando definido, o item so aparece se a empresa tiver o modulo contratado. */
  modulo?: string;
};

export type Secao = {
  /** Titulo cinza em maiusculas na barra lateral. */
  titulo: string;
  itens: ItemDeMenu[];
};

export const MENU: Secao[] = [
  {
    titulo: 'Atendimento',
    itens: [
      { rota: '/', nome: 'Início', icone: 'casa' },
      { rota: '/simulador', nome: 'Simulador', icone: 'conversa', modulo: 'bot' },
      { rota: '/conversas', nome: 'Conversas', icone: 'mensagens', modulo: 'bot' },
      { rota: '/canais', nome: 'Canais', icone: 'celular', modulo: 'bot' },
    ],
  },
  {
    titulo: 'Agenda',
    itens: [
      { rota: '/agenda', nome: 'Agenda', icone: 'calendario', modulo: 'agenda' },
      { rota: '/servicos', nome: 'Serviços', icone: 'tesoura', modulo: 'agenda' },
      { rota: '/profissionais', nome: 'Profissionais', icone: 'pessoas', modulo: 'agenda' },
      { rota: '/expedientes', nome: 'Horários', icone: 'relogio', modulo: 'agenda' },
    ],
  },
  {
    titulo: 'Administração',
    itens: [
      { rota: '/usuarios', nome: 'Usuários', icone: 'pessoas' },
      { rota: '/grupos', nome: 'Grupos e permissões', icone: 'cadeado' },
      { rota: '/empresa', nome: 'Dados da empresa', icone: 'predio' },
    ],
  },
];

/** Todas as rotas do menu, da mais especifica para a mais generica. */
export const ROTAS = MENU.flatMap((s) => s.itens.map((i) => i.rota)).sort(
  (a, b) => b.length - a.length
);

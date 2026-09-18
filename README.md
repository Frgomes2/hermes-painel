# Hermes — painel

Painel da plataforma. Serviço próprio na Railway, ao lado do `hermes-`.

## Como ele fala com o resto

```
navegador ──▶ hermes-painel ──▶ Postgres        (cadastro, agenda, permissões)
                    └────────▶ hermes /interno  (o agente, no simulador)
```

Duas portas, por motivos diferentes.

**O banco, direto.** Cadastro, agenda e relatório são leitura e escrita de
tabela; envolver uma API no meio seria duplicar cada consulta sem ganhar nada.
O isolamento entre empresas continua garantido porque o painel conecta com o
papel `hermes_app` — sem superusuário, sem `bypassrls` — e toda leitura passa
por `comEmpresa`, que define `app.empresa_id` dentro da transação.

**O agente, pela API interna.** O motor, o pool de modelos, as chaves e o
registro em `acoes_do_agente` vivem no Hermes. Copiar isso para cá daria duas
implementações do mesmo laço, duas cópias das chaves — e um simulador que testa
um agente diferente do que atende o cliente. Um simulador assim passa enquanto
a produção falha.

## Variáveis

| Variável | O quê |
|---|---|
| `DATABASE_URL` | mesmo banco do Hermes (a **pública** na sua máquina) |
| `APP_DB_PASSWORD` | senha do papel `hermes_app`, a mesma do Hermes |
| `HERMES_API_URL` | `http://hermes.railway.internal:8080` dentro da Railway |
| `INTERNAL_API_SECRET` | **idêntico** ao do serviço do Hermes |

Sem `APP_DB_PASSWORD` o painel **não sobe**. No Hermes isso é só um aviso —
derrubar o serviço deixaria clientes sem atendimento. Aqui não há essa
desculpa: um painel multiempresa sem RLS mostra os dados de uma barbearia para
outra na primeira consulta.

## Primeiro acesso

Não existe tela de "criar primeiro administrador": seria uma porta aberta para
quem chegar nela antes de você. O primeiro acesso nasce na linha de comando.

```bash
npm install
npm run admin:primeiro -- --slug frx-code --email voce@exemplo.com --senha "algo bem longo"
npm run dev
```

O comando também **contrata os módulos** (`agenda` e `bot`) para a empresa. Sem
isso a barra lateral aparece quase vazia, porque item de módulo não contratado
fica escondido — e a conclusão natural seria que o painel está quebrado.

## Telas

| Rota | O que faz |
|---|---|
| `/entrar` | login |
| `/` | números da operação: agendamentos hoje, conversas, cadastro |
| `/simulador` | conversa com o agente sem passar pelo WhatsApp |

As demais rotas do menu (`/agenda`, `/servicos`, `/canais`, …) já estão
declaradas em `src/lib/menu.ts` e entram no controle de acesso assim que a
página existir.

## Acesso

- bcrypt custo 12; a senha em texto nunca é gravada nem vai para log
- cookie `hermes_sessao` httpOnly, 8h, **sessão em tabela** para poder revogar
- 5 tentativas erradas bloqueiam por 15 minutos
- a mesma mensagem para senha errada e usuário inexistente — distinguir as duas
  entregaria de graça quais e-mails existem na plataforma
- trocar a senha de alguém derruba todas as sessões dela
- **ADMIN passa por cima de tudo**: é saída de emergência, porque a própria tela
  de grupos é protegida por permissão e salvar a grade errada trancaria todo
  mundo para fora
- usuário sem grupo não vê nada — falha fechada
- a permissão é resolvida pelo **prefixo de rota mais específico**: cadastrou
  `/servicos`, manda em `/servicos/novo` e `/servicos/123/editar` também
- **esconder o item do menu não protege nada.** A checagem acontece na página e
  na ação de servidor; a barra lateral só reflete o que já foi decidido

## Deploy

Serviço novo na Railway, mesmo projeto do Hermes. `railpack.json` já define
build e start.

> **Não usar `output: 'standalone'` no Next.** A saída standalone monta um
> `node_modules` reduzido, sem o `.bin` nem os engines do Prisma. Foi a
> armadilha do Atlas-Painel: a imagem fica menor e o deploy quebra num lugar
> que não parece ter relação com o que se mudou.

O painel **não aplica schema**. O dono das tabelas é o Hermes; aqui o
`prisma/schema.prisma` existe só para gerar o cliente, e precisa ser mantido
igual ao dele.

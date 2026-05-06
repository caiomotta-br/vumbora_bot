# Bot dos Bares e Restaurantes — Guia para Iniciantes

Esse documento te leva do zero até o bot rodando no Telegram, passo a passo, sem assumir que você já mexeu com programação ou com nenhum desses sites antes. Tempo total: aproximadamente **30 minutos**, todos os passos clicáveis.

---

## O que é cada coisa que vamos usar

Antes de começar, entenda o que cada peça faz. Não precisa virar especialista — só saber pra que serve cada uma:

- **Telegram** — você já usa. Vamos criar um "bot" dentro dele, que é tipo um contato automatizado.
- **GitHub** — armazena o código do bot online (uma "pasta na nuvem"). Existe pra que o Vercel possa pegar o código pra rodar.
- **Vercel** — é onde o bot **fica rodando** 24h por dia, esperando suas mensagens. Tipo um "servidor" gratuito.
- **Upstash** — banco de dados que guarda os 47 lugares e tudo que vocês adicionarem depois. Também grátis.
- **Google AI Studio** — onde você pega a chave que dá ao bot acesso à inteligência artificial do Gemini (também grátis).

A imagem mental: o **Vercel** é o "cérebro" que recebe sua mensagem do **Telegram**, lê os dados do **Upstash**, pergunta pro **Gemini** o que responder, e devolve a resposta. O **GitHub** é só onde o código mora.

---

## O que você vai precisar antes de começar

- Uma conta Google (você já tem se usa Gmail ou YouTube)
- Um e-mail (o mesmo do Google serve)
- Os arquivos do bot que estão dentro do `bot-bares-restaurantes.zip` que recebeu
- Uns 30 minutos sem pressa

Vai por essa ordem exata. Cada passo prepara o próximo.

---

## Passo 1 — Criar o bot no Telegram (3 minutos)

O Telegram tem um "bot oficial" chamado @BotFather que cria outros bots pra você. Vamos falar com ele.

1. Abre o Telegram (no celular ou desktop).
2. Na lupa de busca, digita `BotFather` e seleciona o que tem o **selo azul de verificação** (importante — tem outros falsos).
3. Aperta `Iniciar` (ou `/start`).
4. Manda a mensagem: `/newbot`
5. Ele vai pedir um **nome** pro bot — pode ser qualquer coisa, ex: `Bares Caio e Ana`. Manda.
6. Ele vai pedir um **username** — tem que terminar em `bot` e ser único no Telegram. Tenta `BaresCaioAnaBot`, se já existir, ele avisa e você inventa outro.
7. Quando funcionar, ele te manda uma mensagem com um **token** (uma string longa tipo `7891234567:AAGxyz123abc-DEF...`).

**ATENÇÃO:** copie esse token e cole num bloco de notas. Você vai usar ele logo. Não compartilha com ninguém — é a senha do bot.

✅ **Você fez certo se:** o BotFather te respondeu com algo tipo "Done! Congratulations..." e te deu o token.

---

## Passo 2 — Pegar a chave do Gemini (3 minutos)

A chave é o que dá ao bot acesso à IA. É grátis e não pede cartão.

1. Abra https://aistudio.google.com/ no navegador.
2. Faça login com sua conta Google.
3. Pode aparecer uma tela de termos — aceite.
4. No canto **superior esquerdo**, clica em **Get API Key** (ou ícone de chave 🔑).
5. Na próxima tela, clica no botão **Create API Key**.
6. Ele pode perguntar "Create API key in new project" — aceita, é o caminho.
7. Aparece uma chave começando com `AIzaSy...` — **copia essa chave** e cola no seu bloco de notas, junto do token do Telegram.

✅ **Você fez certo se:** tem agora uma chave que começa com `AIzaSy` no seu bloco de notas.

---

## Passo 3 — Subir o código no GitHub (5 minutos)

O GitHub é onde o código vai ficar pro Vercel pegar.

### 3.1 — Criar conta (se ainda não tiver)

1. Abra https://github.com/signup
2. Crie a conta com seu e-mail. Escolhe o plano **Free**.
3. Confirma o e-mail (eles mandam um código).

### 3.2 — Criar o repositório

1. Logado no GitHub, clica no botão **+** no canto superior direito → **New repository**.
2. Em **Repository name**, escreve: `bot-bares-restaurantes`
3. Em **Description**: pode deixar em branco ou colocar "Bot pessoal de bares e restaurantes"
4. Marca **Private** (importante — o código vai ter chaves)
5. **NÃO** marque "Add a README file" nem nenhuma das opções abaixo. Deixa todas desmarcadas.
6. Clica em **Create repository** lá embaixo.

### 3.3 — Subir os arquivos do zip

Você vai cair numa página com fundo escuro mostrando "Quick setup". Vamos usar a opção sem terminal:

1. Procura na página o link em azul que diz **uploading an existing file** (geralmente está no parágrafo "Get started by..."). Clica nele.
2. Vai abrir uma área de arrastar e soltar.
3. **Importante:** abre o `bot-bares-restaurantes.zip` no seu computador (Windows: clica direito → Extrair tudo) — extrai pra qualquer pasta.
4. Abre a pasta extraída. Você verá: pastas `api/`, `data/`, `lib/`, e arquivos `package.json`, `vercel.json`, `README.md`, `.env.example`, `.gitignore`.
5. **Seleciona TODOS esses arquivos e pastas** (pode ser Ctrl+A) e arrasta pra área do GitHub.
6. Lá embaixo da página, em **Commit changes**, deixa "Add files via upload" ou escreve o que quiser.
7. Marca **Commit directly to the `main` branch**.
8. Clica em **Commit changes**.

✅ **Você fez certo se:** ao recarregar a página do repositório, você vê as pastas `api`, `data`, `lib` e os arquivos `package.json`, `README.md`, etc. listados.

---

## Passo 4 — Criar o banco de dados Upstash (3 minutos)

Onde os 47 lugares vão ficar guardados.

1. Abre https://upstash.com
2. Clica em **Sign Up** ou **Login** → escolhe **Continue with GitHub** (mais fácil) → autoriza.
3. Você cai no painel. Vai aparecer "Create Database" no centro. Clica.
4. Em **Name**: `bares-bot` (ou qualquer nome).
5. Em **Type**: deixa **Regional** (já vem marcado).
6. Em **Region**: escolhe **South America (sa-east-1) — São Paulo** se aparecer; senão, **N. Virginia (us-east-1)**.
7. Em **Free Tier**: deve estar marcado por padrão (limite 500MB grátis). Confirma.
8. Clica em **Create**.
9. Você cai na página do banco. **Vai pra aba `REST API`** no menu do meio.
10. Você vê dois valores. **Anota os dois** no seu bloco de notas:
    - `UPSTASH_REDIS_REST_URL` — começa com `https://...`
    - `UPSTASH_REDIS_REST_TOKEN` — uma string longa

Pode ver o token clicando no olho 👁 ou no botão de copiar.

✅ **Você fez certo se:** tem dois valores anotados no bloco de notas — uma URL `https://...` e um token grande.

---

## Passo 5 — Deploy no Vercel (7 minutos)

Aqui o bot vai pra "ligar".

### 5.1 — Criar conta

1. Abre https://vercel.com
2. **Sign Up** → **Continue with GitHub** → autoriza.
3. Escolhe o plano **Hobby (Free)**.
4. Pode pedir nome, etc. Preenche.

### 5.2 — Importar o repositório

1. No painel do Vercel, clica em **Add New...** (canto superior direito) → **Project**.
2. Você vai ver uma lista dos seus repositórios do GitHub. Procura `bot-bares-restaurantes`.
3. Clica em **Import** ao lado dele.

### 5.3 — Configurar antes de fazer deploy

Vai abrir uma página de configuração. Vai ter alguns campos.

1. **Project Name**: pode deixar como está.
2. **Framework Preset**: deve detectar como "Other" — deixa.
3. **Root Directory**: deixa `.`
4. Procura uma seção **Environment Variables**. Provavelmente tá colapsada — clica pra expan
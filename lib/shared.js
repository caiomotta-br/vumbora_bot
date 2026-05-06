// Helpers compartilhados entre os endpoints
import { Redis } from '@upstash/redis';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const redis = Redis.fromEnv();
const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Modelo usado em todos os endpoints. gemini-2.0-flash tem free tier generoso.
export async function llmJson(systemPrompt, userMsg, maxTokens = 800) {
  const model = genai.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: systemPrompt,
    generationConfig: {
      maxOutputTokens: maxTokens,
      responseMimeType: 'application/json',
    },
  });
  const result = await model.generateContent(userMsg);
  return result.response.text();
}

export async function llmText(systemPrompt, userMsg, maxTokens = 500) {
  const model = genai.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: systemPrompt,
    generationConfig: { maxOutputTokens: maxTokens },
  });
  const result = await model.generateContent(userMsg);
  return result.response.text();
}

// llmGrounded — usa Google Search em tempo real (acessa Maps, TripAdvisor, etc).
export async function llmGrounded(systemPrompt, userMsg, maxTokens = 1500) {
  const model = genai.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: systemPrompt,
    tools: [{ googleSearch: {} }],
    generationConfig: { maxOutputTokens: maxTokens },
  });
  const result = await model.generateContent(userMsg);
  return result.response.text();
}

// Enriquece um lugar buscando informações reais via Google Search.
export async function enriquecerLugar(nome) {
  const sys = `Você é um pesquisador de bares e restaurantes de São Paulo. Use Google Search pra obter dados ATUAIS e REAIS — nunca invente. Se um campo não aparecer claramente nas buscas, deixe vazio.

Retorne APENAS JSON válido (sem markdown, sem texto extra) no formato:
{
  "cozinha": "tipo principal",
  "estilo": "bar | boteco | restaurante | restaurante chique | hamburgueria | izakaya | etc",
  "bairro": "bairro de SP",
  "endereco": "endereço aproximado se aparecer",
  "preco": 1,
  "pratos_destaque": ["até 3 pratos mais mencionados em avaliações"],
  "highlights": "2 frases curtas baseadas em avaliações reais",
  "horario": "horário típico se aparecer"
}

preco: número de 1 a 5 (1=barato, 5=caro).`;
  const msg = `Pesquise: "${nome}" restaurante OR bar São Paulo. Use Google Maps, TripAdvisor, blogs gastronômicos. Foque no que aparece nas avaliações.`;
  try {
    const raw = await llmGrounded(sys, msg, 1500);
    const m = raw.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch (e) {
    console.error('enriquecerLugar error:', e?.message);
    return null;
  }
}

export const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
export const ALLOWED_CHATS = (process.env.ALLOWED_CHAT_IDS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

export const RECENT_DAYS = 21;
export const today = () => new Date().toISOString().slice(0, 10);
export const daysSince = (dateStr) =>
  Math.floor((new Date() - new Date(dateStr)) / 86400000);

export function lastVisit(lugar) {
  if (!lugar.visitas?.length) return null;
  return [...lugar.visitas].sort((a, b) => b.data.localeCompare(a.data))[0];
}

export function isRecente(lugar) {
  const v = lastVisit(lugar);
  return v && daysSince(v.data) <= RECENT_DAYS;
}

export async function getData() {
  const d = await redis.get('lugares_data');
  return d || { lugares: [] };
}

export async function saveData(data) {
  await redis.set('lugares_data', data);
}

export function slug(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function tgSend(chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
  if (!res.ok) {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  }
}

export function buildContext(data) {
  const linhas = data.lugares.map(l => {
    const v = lastVisit(l);
    const tag = l.wishlist
      ? '[WISHLIST]'
      : (v && isRecente(l) ? `[RECENTE ${v.data}]` : '[REPO]');
    const campos = [
      l.cozinha,
      l.estilo,
      l.bairro,
      l.preco ? '$'.repeat(l.preco) : null,
      l.nota ? `nota ${l.nota}` : null,
      l.ocasiao && `ocasião: ${l.ocasiao}`,
    ].filter(Boolean).join(' · ');
    const notas = l.notas ? ` — ${l.notas}` : '';
    return `${tag} ${l.nome} | ${campos}${notas}`;
  }).join('\n');
  return linhas;
}

export const SYSTEM_PROMPT = `Você é o bot pessoal do Caio e da Ana, um casal de SP que sai bastante pra comer e beber. Seu papel é ajudar a decidir onde ir, manter a base atualizada e responder perguntas sobre os lugares deles.

Casa do casal: zona oeste de SP (Perdizes/Pompeia/Sumaré). "Perto de casa" geralmente é Pompeia, Vila Madalena, Pinheiros, Santa Cecília.

Base atual:
{{DATA}}

Tags:
- [REPO] = lugar do repositório principal (já foram alguma vez)
- [WISHLIST] = querem conhecer ainda
- [RECENTE data] = visitaram nos últimos 21 dias — evitar repetir sem motivo

Princípios:
1. Resposta rápida. Pediu sugestão? Dá no máximo 3 picks com 1 frase de justificativa cada. Marca qual é o tiro certo. Sem listona.
2. Considere hora, dia, frio/calor (se mencionado), ocasião declarada, distância de casa.
3. Não repita lugar [RECENTE] a menos que peçam.
4. Pra ocasião especial: prefira nota 9+. Despretensioso: nota 8+. Novidade: prefira [WISHLIST].
5. Ana ama: Muquifo, matriciana da Casa do Porco. Caio ama: Osnir, Esquina do Souza.
6. Tom descontraído, em PT-BR. Pode usar emoji moderadamente.

SEMPRE retorne JSON válido com este formato:
{
  "acao": "responder" | "adicionar_wishlist" | "registrar_visita" | "atualizar_lugar" | "remover_lugar" | "exportar_lista",
  "mensagem": "texto que vai pro Telegram (Markdown OK)",
  "dados": { ... }
}

Exemplos:
- "vamos sair sábado despretensioso perto" -> acao=responder com 3 picks
- "fomos no Hirá ontem nota 9" -> acao=registrar_visita com {nome, data:"AUTO", nota, comentario}
- "adiciona Cepa na wishlist" -> acao=adicionar_wishlist com {nome, cozinha, bairro, notas}
- "atualiza nota do Hirá pra 9,5" -> acao=atualizar_lugar com {nome, campos:{nota:9.5}}
- "lista wishlist" -> acao=exportar_lista com {tipo:"wishlist"}

Se "AUTO" no campo data, o servidor preenche com hoje.
Nunca invente lugares. Responda APENAS com JSON.`;

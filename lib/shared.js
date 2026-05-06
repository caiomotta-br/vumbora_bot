import { Redis } from '@upstash/redis';
import Groq from 'groq-sdk';

export const redis = Redis.fromEnv();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'llama-3.3-70b-versatile';

export async function llmJson(systemPrompt, userMsg, maxTokens = 800) {
  const r = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMsg },
    ],
    response_format: { type: 'json_object' },
    max_tokens: maxTokens,
  });
  return r.choices[0]?.message?.content || '{}';
}

export async function llmText(systemPrompt, userMsg, maxTokens = 500) {
  const r = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMsg },
    ],
    max_tokens: maxTokens,
  });
  return r.choices[0]?.message?.content || '';
}

// Sem Google Search grounding nesse provedor. Stubs mantêm a API estável.
export async function llmGrounded() { return ''; }
export async function enriquecerLugar() { return null; }

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
Nunca invente lugares. Responda APENAS com JSON válido.`;

// Webhook do Telegram — recebe toda mensagem que chega no bot
import {
  llmJson, ALLOWED_CHATS, getData, saveData, tgSend,
  buildContext, slug, today, lastVisit, isRecente,
  enriquecerLugar, SYSTEM_PROMPT,
} from '../lib/shared.js';

function aplicarEnriquecimento(lugar, info) {
  if (!info) return false;
  let mudou = false;
  const set = (campo, valor) => {
    if (valor && (lugar[campo] === '' || lugar[campo] == null)) {
      lugar[campo] = valor;
      mudou = true;
    }
  };
  set('cozinha', info.cozinha);
  set('estilo', info.estilo);
  set('bairro', info.bairro);
  if (typeof info.preco === 'number' && !lugar.preco) {
    lugar.preco = info.preco;
    mudou = true;
  }
  const partes = [];
  if (info.highlights) partes.push(info.highlights);
  if (Array.isArray(info.pratos_destaque) && info.pratos_destaque.length) {
    partes.push(`Pratos: ${info.pratos_destaque.slice(0, 3).join(', ')}.`);
  }
  if (info.endereco) partes.push(`📍 ${info.endereco}`);
  if (info.horario) partes.push(`🕐 ${info.horario}`);
  const novoTexto = partes.join(' ');
  if (novoTexto && !lugar.notas?.includes(info.highlights || '___')) {
    lugar.notas = lugar.notas ? `${lugar.notas} ${novoTexto}` : novoTexto;
    mudou = true;
  }
  return mudou;
}

function formatarEnriquecimento(info) {
  const linhas = ['🔎 *Achei mais info:*'];
  const meta = [info.cozinha, info.estilo, info.bairro].filter(Boolean).join(' · ');
  if (meta) linhas.push(`• ${meta}`);
  if (info.preco) linhas.push(`• Preço: ${'$'.repeat(info.preco)}`);
  if (info.pratos_destaque?.length) linhas.push(`• Pratos: ${info.pratos_destaque.slice(0, 3).join(', ')}`);
  if (info.highlights) linhas.push(`• ${info.highlights}`);
  if (info.endereco) linhas.push(`• 📍 ${info.endereco}`);
  if (info.horario) linhas.push(`• 🕐 ${info.horario}`);
  return linhas.join('\n');
}

function findLugar(data, nome) {
  if (!nome) return null;
  const n = nome.toLowerCase().trim();
  return data.lugares.find(l =>
    l.nome.toLowerCase() === n ||
    l.id === slug(nome) ||
    l.nome.toLowerCase().includes(n)
  );
}

function exportarLista(data, tipo) {
  let items;
  if (tipo === 'wishlist') {
    items = data.lugares.filter(l => l.wishlist);
  } else if (tipo === 'recentes') {
    items = data.lugares.filter(l => isRecente(l));
  } else if (tipo === 'top' || tipo === 'lugares') {
    items = data.lugares.filter(l => !l.wishlist).sort((a, b) => (b.nota || 0) - (a.nota || 0)).slice(0, 15);
  } else {
    items = data.lugares;
  }
  if (!items.length) return `_Nada em ${tipo}._`;
  return items.map(l => {
    const stars = l.nota ? `⭐ ${String(l.nota).replace('.', ',')}` : '';
    const price = l.preco ? '💰'.repeat(Math.min(l.preco, 5)) : '';
    const v = lastVisit(l);
    const visitTag = v && isRecente(l) ? ` _(visita ${v.data})_` : '';
    return `• *${l.nome}* — ${l.cozinha || l.estilo || ''}${visitTag} ${stars} ${price}`.trim();
  }).join('\n');
}

async function processarComLLM(text, data) {
  const sys = SYSTEM_PROMPT.replace('{{DATA}}', buildContext(data));
  const raw = await llmJson(sys, text, 800);
  let parsed;
  try {
    const m = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m ? (m[1] || m[0]) : raw);
  } catch {
    return { reply: raw, dataChanged: false };
  }

  let dataChanged = false;
  let extraReply = '';

  switch (parsed.acao) {
    case 'adicionar_wishlist': {
      const d = parsed.dados || {};
      if (!d.nome) break;
      const novo = {
        id: slug(d.nome),
        nome: d.nome,
        cozinha: d.cozinha || '',
        estilo: d.estilo || '',
        ocasiao: d.ocasiao || '',
        bairro: d.bairro || '',
        loc: '',
        preco: d.preco || null,
        nota: null,
        notas: d.notas || '',
        wishlist: true,
        visitas: [],
      };
      if (!data.lugares.find(l => l.id === novo.id)) {
        data.lugares.push(novo);
        dataChanged = true;
        const camposPreenchidos = [d.cozinha, d.estilo, d.bairro, d.notas].filter(Boolean).length;
        if (camposPreenchidos < 2) {
          const info = await enriquecerLugar(novo.nome);
          if (info) {
            aplicarEnriquecimento(novo, info);
            extraReply = '\n\n' + formatarEnriquecimento(info);
          }
        }
      } else {
        extraReply = '\n\n_(já estava na base, ignorado)_';
      }
      break;
    }
    case 'registrar_visita': {
      const d = parsed.dados || {};
      if (!d.nome) break;
      let lugar = findLugar(data, d.nome);
      if (!lugar) {
        lugar = {
          id: slug(d.nome),
          nome: d.nome,
          cozinha: d.cozinha || '',
          estilo: d.estilo || '',
          ocasiao: d.ocasiao || '',
          bairro: d.bairro || '',
          loc: '',
          preco: d.preco || null,
          nota: null,
          notas: d.notas || '',
          wishlist: false,
          visitas: [],
        };
        data.lugares.push(lugar);
      }
      lugar.wishlist = false;
      lugar.visitas = lugar.visitas || [];
      const visitaData = (!d.data || d.data === 'AUTO') ? today() : d.data;
      lugar.visitas.push({
        data: visitaData,
        nota: typeof d.nota === 'number' ? d.nota : null,
        comentario: d.comentario || '',
      });
      if (typeof d.nota === 'number') lugar.nota = d.nota;
      dataChanged = true;
      break;
    }
    case 'atualizar_lugar': {
      const d = parsed.dados || {};
      const lugar = findLugar(data, d.nome) || data.lugares.find(l => l.id === d.id);
      if (lugar && d.campos) {
        Object.assign(lugar, d.campos);
        dataChanged = true;
      }
      break;
    }
    case 'remover_lugar': {
      const d = parsed.dados || {};
      const idx = data.lugares.findIndex(l =>
        l.nome.toLowerCase() === (d.nome || '').toLowerCase() || l.id === d.id
      );
      if (idx >= 0) {
        data.lugares.splice(idx, 1);
        dataChanged = true;
      }
      break;
    }
    case 'exportar_lista': {
      const tipo = parsed.dados?.tipo || 'top';
      extraReply = '\n\n' + exportarLista(data, tipo);
      break;
    }
  }
  return { reply: (parsed.mensagem || 'OK') + extraReply, dataChanged };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });
  try {
    const update = req.body || {};
    const message = update.message || update.edited_message;
    if (!message) return res.status(200).json({ ok: true });

    const chatId = message.chat.id;
    const text = (message.text || message.caption || '').trim();

    if (ALLOWED_CHATS.length && !ALLOWED_CHATS.includes(String(chatId))) {
      await tgSend(chatId, `Bot privado.\n\nSeu chat ID: \`${chatId}\``);
      return res.status(200).json({ ok: true });
    }
    if (!text) return res.status(200).json({ ok: true });

    if (text === '/start' || text === '/help') {
      await tgSend(chatId,
        `*Bot dos bares e restaurantes do Caio e Ana* 🍻\n\n` +
        `É só falar comigo natural:\n` +
        `• "vamos sair hoje, perto, despretensioso"\n` +
        `• "fomos no Hirá ontem, nota 9"\n` +
        `• "adiciona Cepa na wishlist, Pinheiros"\n` +
        `• "lembra daquele bar de pintxos?"\n\n` +
        `_Comandos:_ /surpresa /recentes /wishlist /top /enriquecer /chatid\n\n` +
        `🔎 Quando você adiciona algo novo, eu busco no Google e enriqueço com cozinha, bairro, pratos famosos e avaliações reais.`
      );
      return res.status(200).json({ ok: true });
    }
    if (text === '/chatid') {
      await tgSend(chatId, `Chat ID: \`${chatId}\``);
      return res.status(200).json({ ok: true });
    }

    const data = await getData();

    if (text === '/recentes' || text === '/wishlist' || text === '/top') {
      const tipo = text.slice(1);
      await tgSend(chatId, `*${tipo[0].toUpperCase() + tipo.slice(1)}*\n\n${exportarLista(data, tipo)}`);
      return res.status(200).json({ ok: true });
    }
    if (text === '/surpresa') {
      const candidatos = data.lugares.filter(l => !l.wishlist && !isRecente(l) && (l.nota || 0) >= 8);
      const pick = candidatos[Math.floor(Math.random() * candidatos.length)];
      await tgSend(chatId, pick
        ? `🎲 *${pick.nome}*\n${pick.cozinha || ''} · ${pick.bairro || ''} · nota ${pick.nota}`
        : 'Sem candidatos por agora.');
      return res.status(200).json({ ok: true });
    }
    if (text.toLowerCase().startsWith('/enriquecer')) {
      const nome = text.replace(/^\/enriquecer\s*/i, '').trim();
      if (!nome) {
        await tgSend(chatId, 'Use: `/enriquecer Nome do lugar`');
        return res.status(200).json({ ok: true });
      }
      const lugar = data.lugares.find(l =>
        l.nome.toLowerCase() === nome.toLowerCase() ||
        l.nome.toLowerCase().includes(nome.toLowerCase())
      );
      if (!lugar) {
        await tgSend(chatId, `Não achei "${nome}" na base.`);
        return res.status(200).json({ ok: true });
      }
      await tgSend(chatId, `🔍 Buscando info de *${lugar.nome}*...`);
      const info = await enriquecerLugar(lugar.nome);
      if (!info) {
        await tgSend(chatId, '❌ Não consegui achar info dessa vez. Tenta de novo.');
        return res.status(200).json({ ok: true });
      }
      const mudou = aplicarEnriquecimento(lugar, info);
      if (mudou) await saveData(data);
      await tgSend(chatId, formatarEnriquecimento(info) + (mudou ? '\n\n_Atualizei a base ✅_' : '\n\n_Nada novo._'));
      return res.status(200).json({ ok: true });
    }

    const { reply, dataChanged } = await processarComLLM(text, data);
    if (dataChanged) await saveData(data);
    await tgSend(chatId, reply);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('telegram handler error:', e);
    try {
      const chatId = req.body?.message?.chat?.id;
      if (chatId) await tgSend(chatId, '⚠️ Tive um problema. Tenta de novo?');
    } catch {}
    res.status(200).json({ ok: true });
  }
}

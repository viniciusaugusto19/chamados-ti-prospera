"use strict";
/* ---------------- v45: áudio do WhatsApp vira texto ----------------
   Pedido pela fala acontece muito no WhatsApp. Agora a Captura aceita:

   - a conversa exportada COM mídia (.zip): o .zip é aberto aqui no navegador,
     cada áudio vai para transcrição e o texto entra no lugar de "áudio
     anexado"; a conversa segue o caminho de sempre (regras e IA);
   - áudio solto (.opus, .ogg, .m4a, .mp3…), escolhido no mesmo campo ou
     recebido pelo "compartilhar" do celular: vira uma conversa de uma
     mensagem e passa pelo mesmo caminho;
   - o "compartilhar" do Android também passa a aceitar .zip e áudio.

   A transcrição é o Whisper da Cloudflare, na mesma conta e na mesma cota
   grátis da IA (cerca de 47 da cota por minuto de áudio). O áudio vai do
   navegador para o servidor e dele para a Cloudflare; nada é guardado lá. O
   texto de cada áudio fica guardado neste navegador (ctip.audioTxt) para a
   mesma conversa lida de novo não gastar a cota outra vez.
   Carregado pelo boot.js depois do solicitante.js. */
var AUD_EXT = /\.(opus|ogg|oga|m4a|mp3|aac|wav|amr|webm|3gp|mp4a)$/i;
var AUD_TXT_K = "ctip.audioTxt", AUD_NEURONS_MIN = 46.63;
var AUD_PERGUNTAR = 700;            /* acima disto (da cota) pergunta antes */
var AUD_MAX_BYTES = 15 * 1024 * 1024;
var AUD_CHAVE_COMP = "./__compartilhado-bin.json";
if(typeof CAP_MSG_MAX !== "undefined") CAP_MSG_MAX = 1500;   /* áudio transcrito costuma ser longo */

function audEhAudio(nome, tipo){ return AUD_EXT.test(nome || "") || /^audio\//i.test(tipo || ""); }
function audEhZip(nome, tipo){ return /\.zip$/i.test(nome || "") || /zip/i.test(tipo || ""); }

/* ---------- abrir .zip sem biblioteca (formato zip + DecompressionStream) ---------- */
function audInflar(bytes){
  if(typeof DecompressionStream === "undefined") return Promise.reject(new Error("este navegador não abre .zip"));
  var ds = new DecompressionStream("deflate-raw");
  var w = ds.writable.getWriter(); w.write(bytes); w.close();
  return new Response(ds.readable).arrayBuffer().then(function(b){ return new Uint8Array(b); });
}
function audZip(buf){
  var u = new Uint8Array(buf), v = new DataView(buf), td = new TextDecoder("utf-8");
  var fim = -1;
  for(var i = u.length - 22; i >= Math.max(0, u.length - 65557); i--){ if(v.getUint32(i, true) === 0x06054b50){ fim = i; break; } }
  if(fim < 0) return Promise.reject(new Error("não é um .zip válido"));
  var n = v.getUint16(fim + 10, true), p = v.getUint32(fim + 16, true), itens = [];
  for(var k = 0; k < n && p + 46 <= u.length; k++){
    if(v.getUint32(p, true) !== 0x02014b50) break;
    var metodo = v.getUint16(p + 10, true), tam = v.getUint32(p + 20, true);
    var ln = v.getUint16(p + 28, true), le = v.getUint16(p + 30, true), lc = v.getUint16(p + 32, true);
    var off = v.getUint32(p + 42, true);
    var nome = td.decode(u.subarray(p + 46, p + 46 + ln));
    p += 46 + ln + le + lc;
    if(/\/$/.test(nome) || v.getUint32(off, true) !== 0x04034b50) continue;
    var ini = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true);
    itens.push({nome: nome.split("/").pop(), metodo: metodo, dados: u.subarray(ini, ini + tam)});
  }
  return Promise.all(itens.map(function(it){
    var pr = it.metodo === 0 ? Promise.resolve(it.dados) : it.metodo === 8 ? audInflar(it.dados) : Promise.resolve(null);
    return pr.then(function(d){ return d ? {nome: it.nome, dados: d} : null; }, function(){ return null; });
  })).then(function(l){ return l.filter(Boolean); });
}

/* ---------- duração (para estimar a cota) ---------- */
function audDuracao(blob){
  return new Promise(function(ok){
    var est = Math.max(1, Math.round(blob.size / (/opus|ogg/i.test(blob.type || "") ? 2000 : 8000)));
    var a, url, feito = false;
    var fim = function(s){ if(feito) return; feito = true; try{ URL.revokeObjectURL(url); }catch(e){} ok(isFinite(s) && s > 0 ? Math.round(s) : est); };
    try{
      a = new Audio(); url = URL.createObjectURL(blob);
      a.preload = "metadata";
      a.onloadedmetadata = function(){ fim(a.duration); };
      a.onerror = function(){ fim(0); };
      a.src = url;
      setTimeout(function(){ fim(0); }, 3000);
    }catch(e){ fim(0); }
  });
}

/* ---------- transcrever um áudio ---------- */
function audCache(){ return load(AUD_TXT_K, {}) || {}; }
function audGuardar(chave, texto, seg){
  var c = audCache();
  c[chave] = {t: texto, s: seg, em: Date.now()};
  var ks = Object.keys(c);
  if(ks.length > 300) ks.sort(function(a, b){ return c[a].em - c[b].em; }).slice(0, ks.length - 300).forEach(function(k){ delete c[k]; });
  save(AUD_TXT_K, c);
}
function audBase64(blob){
  return new Promise(function(ok, falha){
    var r = new FileReader();
    r.onload = function(){ ok(String(r.result || "").replace(/^data:[^,]*,/, "")); };
    r.onerror = function(){ falha(new Error("não consegui ler o áudio")); };
    r.readAsDataURL(blob);
  });
}
/* plano B: se a Cloudflare não aceitar o formato, o próprio navegador
   decodifica e manda como WAV mono 16 kHz (o formato do Whisper) */
function audWav(blob){
  return blob.arrayBuffer().then(function(buf){
    var C = window.AudioContext || window.webkitAudioContext;
    if(!C || typeof OfflineAudioContext === "undefined") throw new Error("o navegador não decodifica este áudio");
    var ctx = new C();
    return ctx.decodeAudioData(buf).then(function(ab){
      try{ ctx.close(); }catch(e){}
      var off = new OfflineAudioContext(1, Math.max(1, Math.ceil(ab.duration * 16000)), 16000);
      var src = off.createBufferSource(); src.buffer = ab; src.connect(off.destination); src.start();
      return off.startRendering();
    });
  }).then(function(r){
    var d = r.getChannelData(0), n = d.length, out = new DataView(new ArrayBuffer(44 + n * 2));
    var txt = function(o, s){ for(var i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    txt(0, "RIFF"); out.setUint32(4, 36 + n * 2, true); txt(8, "WAVE"); txt(12, "fmt ");
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
    out.setUint32(24, 16000, true); out.setUint32(28, 32000, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true);
    txt(36, "data"); out.setUint32(40, n * 2, true);
    for(var i = 0; i < n; i++){ var x = Math.max(-1, Math.min(1, d[i])); out.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
    return new Blob([out.buffer], {type: "audio/wav"});
  });
}
function audTranscrever(blob, nome, conversa, seg){
  var chave = nome + "|" + blob.size, c = audCache()[chave];
  if(c) return Promise.resolve({texto: c.t, segundos: c.s, cache: true});
  if(blob.size > AUD_MAX_BYTES) return Promise.reject(new Error("áudio grande demais"));
  var enviar = function(b){
    return audBase64(b).then(function(b64){
      return acPedir({acao: "ia.transcrever", audio: b64, nome: nome, conversa: conversa, segundos: seg});
    });
  };
  return enviar(blob).catch(function(e){
    if(!e || e.status !== 502 || !/recusou o áudio/.test(e.message || "")) throw e;
    return audWav(blob).then(enviar);
  }).then(function(j){
    if(j.uso && typeof capUsoPintar === "function") capUsoPintar(j.uso);
    audGuardar(chave, j.texto || "", j.segundos || seg);
    return {texto: j.texto || "", segundos: j.segundos || seg, gasto: j.gasto ? j.gasto.neurons : 0};
  });
}

/* ---------- aviso e pergunta ---------- */
function audStatus(t, ruim){
  var el = $("audStatus");
  if(!el){
    el = document.createElement("div"); el.id = "audStatus"; el.className = "hint";
    var ref = $("impLidos"); if(ref && ref.parentNode) ref.parentNode.insertBefore(el, ref.nextSibling); else return;
  }
  el.hidden = !t; el.innerHTML = t || ""; el.style.color = ruim ? "var(--crit)" : "";
  return el;
}
function audPerguntar(n, seg, neurons){
  return new Promise(function(ok){
    var el = audStatus('Achei <b>' + n + (n === 1 ? " áudio" : " áudios") + "</b> (uns " + Math.max(1, Math.round(seg / 60)) +
      " min). Transcrever gasta perto de <b>" + Math.round(neurons) + "</b> da cota grátis do dia (10.000). " +
      '<button class="ghost" type="button" id="audSim">Transcrever</button> ' +
      '<button class="ghost" type="button" id="audNao">Ler sem os áudios</button>');
    if(!el){ ok(true); return; }
    $("audSim").onclick = function(){ ok(true); };
    $("audNao").onclick = function(){ ok(false); };
  });
}
function audPronto(){
  return new Promise(function(ok){
    var n = 0;
    (function olha(){
      if(typeof acPedir === "function" && typeof acEu !== "undefined" && acEu) return ok(true);
      if(++n > 120) return ok(false);
      setTimeout(olha, 1000);
    })();
  });
}

/* ---------- o caminho de uma conversa com áudios ---------- */
function audEscapar(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
/* lotes: [{conversa, texto, audios: {nome: Blob}}] e soltos: [{nome, blob, quando}] */
function audProcessar(lotes, soltos){
  soltos = soltos || [];
  var tarefas = [];
  lotes.forEach(function(l){
    Object.keys(l.audios).forEach(function(nome){
      if(l.texto.indexOf(nome) !== -1) tarefas.push({lote: l, nome: nome, blob: l.audios[nome]});
    });
  });
  soltos.forEach(function(s){ tarefas.push({solto: s, nome: s.nome, blob: s.blob}); });
  var conversas = lotes.map(function(l){ return l.conversa; });
  var terminar = function(){
    var lidas = [], achou = 0;
    lotes.forEach(function(l){ achou += audLer(l.texto, l.conversa); lidas.push(l.conversa); });
    soltos.forEach(function(s){
      var quem = ($("capQuem") && $("capQuem").value.trim()) || "Áudio";
      var d = s.quando || new Date(), p2 = function(x){ return ("0" + x).slice(-2); };
      var conv = "Áudio " + s.nome.replace(AUD_EXT, "");
      var linha = p2(d.getDate()) + "/" + p2(d.getMonth() + 1) + "/" + d.getFullYear() + " " + p2(d.getHours()) + ":" + p2(d.getMinutes()) +
        " - " + quem + ": " + (s.texto ? "(áudio) " + s.texto : "(áudio não transcrito" + (s.erro ? ": " + s.erro : "") + ")");
      achou += audLer(linha, conv); lidas.push(conv);
    });
    /* a IA lê mesmo quando as palavras-chave não acharam nada: pedido falado
       raramente usa as palavras que as regras procuram */
    var ia = typeof capIa !== "undefined" && typeof capIaInterpretar === "function" && !!SERVIDOR.url;
    if(typeof pintarLidos === "function") pintarLidos([]);
    if(typeof impCandidatos !== "undefined" && impCandidatos.length) pintarImport();
    else if(!ia && typeof naoReconheci === "function") naoReconheci();
    /* recém-aberta (veio do celular), a página ainda pode estar perguntando ao
       servidor se a IA está ligada: espera a resposta um pouco */
    if(ia && lidas.length) (function espera(k){
      if(capIa.ligada) return capIaInterpretar(lidas);
      if(k < 60) setTimeout(function(){ espera(k + 1); }, 500);
      else if(!(impCandidatos || []).length && typeof naoReconheci === "function") naoReconheci();
    })(0);
    var ci = $("cardImportar"); if(ci && ci.scrollIntoView) ci.scrollIntoView({block: "start"});
    return lidas;
  };
  if(!tarefas.length) return Promise.resolve(terminar());
  if(!SERVIDOR.url){
    audStatus("Os áudios precisam do servidor (login) para virar texto. A conversa foi lida sem eles.", true);
    return Promise.resolve(audSubstituir(tarefas, false)).then(terminar);
  }
  var cache = audCache();
  return Promise.all(tarefas.map(function(t){
    if(cache[t.nome + "|" + t.blob.size]){ t.seg = 0; return 0; }
    return audDuracao(t.blob).then(function(s){ t.seg = s; return s; });
  })).then(function(segs){
    var seg = segs.reduce(function(a, b){ return a + b; }, 0), neurons = seg / 60 * AUD_NEURONS_MIN;
    var novos = tarefas.filter(function(t){ return t.seg; }).length;
    return (novos && neurons > AUD_PERGUNTAR ? audPerguntar(novos, seg, neurons) : Promise.resolve(true));
  }).then(function(sim){
    if(!sim){ audSubstituir(tarefas, false); audStatus(""); return terminar(); }
    return audPronto().then(function(ok){
      if(!ok){ audStatus("Entre na página para transcrever os áudios. A conversa foi lida sem eles.", true); audSubstituir(tarefas, false); return terminar(); }
      var gasto = 0, feitos = 0, parar = "";
      var seq = tarefas.reduce(function(p, t, i){
        return p.then(function(){
          if(parar){ t.erro = parar; return; }
          audStatus("Transcrevendo áudio " + (i + 1) + " de " + tarefas.length + "…");
          return audTranscrever(t.blob, t.nome, t.lote ? t.lote.conversa : "Áudio", t.seg).then(function(r){
            t.texto = r.texto || "(sem fala reconhecida)"; gasto += r.gasto || 0; feitos++;
          }, function(e){
            t.erro = (e && e.message) || "falhou";
            if(e && (e.status === 429 || e.status === 409)) parar = t.erro;
          });
        });
      }, Promise.resolve());
      return seq.then(function(){
        audSubstituir(tarefas, true);
        var falhas = tarefas.filter(function(t){ return t.erro; });
        audStatus(feitos + (feitos === 1 ? " áudio transcrito" : " áudios transcritos") +
          (gasto ? " (gastou " + gasto + " da cota)" : feitos ? " (já estavam transcritos: não gastou cota)" : "") +
          (falhas.length ? ". " + falhas.length + " não " + (falhas.length === 1 ? "foi" : "foram") + ": " + esc(falhas[0].erro) : "."), !!falhas.length && !feitos);
        return terminar();
      });
    });
  });
}
function audSubstituir(tarefas, tentou){
  tarefas.forEach(function(t){
    var troca = t.texto ? "(áudio) " + t.texto : "(áudio não transcrito" + (t.erro ? ": " + t.erro : "") + ")";
    if(t.solto){ t.solto.texto = t.texto || ""; t.solto.erro = t.erro || (tentou ? "" : "não transcrito"); return; }
    var re = new RegExp("(?:<\\s*anexado:\\s*)?" + audEscapar(t.nome) + "(?:\\s*>)?(?:\\s*\\((?:arquivo anexado|file attached)\\))?", "g");
    t.lote.texto = t.lote.texto.replace(re, function(){ return troca; });
  });
}
/* uma conversa (já com os áudios em texto) pelo caminho de sempre */
function audLer(texto, conversa){
  var novos = candidatosDe(texto, conversa);
  if(!novos.length) return 0;
  adicionarCandidatos(novos, conversa);
  return novos.length;
}

/* ---------- arquivos escolhidos no campo da Captura ---------- */
function audLerArquivos(arquivos, nomeZip){
  var lotes = [], soltos = [], txts = [];
  return Promise.all(arquivos.map(function(f){
    if(audEhZip(f.name, f.type)){
      return f.arrayBuffer().then(audZip).then(function(itens){
        var audios = {}, conv = null, txt = null;
        itens.forEach(function(it){
          if(/\.txt$/i.test(it.nome) && !txt){ txt = new TextDecoder("utf-8").decode(it.dados); conv = it.nome; }
          else if(audEhAudio(it.nome)) audios[it.nome] = new Blob([it.dados], {type: /\.(opus|ogg|oga)$/i.test(it.nome) ? "audio/ogg" : ""});
        });
        if(txt) lotes.push({conversa: nomeDaConversa(/^_chat\.txt$/i.test(conv) ? f.name.replace(/\.zip$/i, ".txt") : conv), texto: txt, audios: audios});
        else Object.keys(audios).forEach(function(n){ soltos.push({nome: n, blob: audios[n], quando: new Date(f.lastModified || Date.now())}); });
      }, function(e){ audStatus("Não consegui abrir " + esc(f.name) + ": " + esc(e.message || "erro") + ".", true); });
    }
    if(audEhAudio(f.name, f.type)){ soltos.push({nome: f.name, blob: f, quando: new Date(f.lastModified || Date.now())}); return null; }
    return (f.text ? f.text() : new Response(f).text()).then(function(t){ txts.push({nome: f.name, texto: t}); });
  })).then(function(){
    /* conversa .txt solta junto de áudios soltos (o Android às vezes manda assim) */
    txts.forEach(function(t){
      var audios = {};
      soltos = soltos.filter(function(s){ if(t.texto.indexOf(s.nome) !== -1){ audios[s.nome] = s.blob; return false; } return true; });
      lotes.push({conversa: nomeDaConversa(t.nome), texto: t.texto, audios: audios});
    });
    return audProcessar(lotes, soltos).then(function(r){
      /* um arquivo só: o texto (já com os áudios) vai para a caixa, como no .txt */
      if(lotes.length === 1 && $("impTexto")) $("impTexto").value = lotes[0].texto;
      return r;
    });
  });
}
(function(){
  var inp = $("impArquivo"); if(!inp) return;
  inp.setAttribute("accept", ".txt,text/plain,.zip,application/zip,audio/*,.opus,.ogg,.m4a,.mp3,.aac,.wav");
  inp.title = "Conversa (.txt), conversa com mídia (.zip) ou áudio";
  /* chega antes do leitor do importar.js: só desvia quando há .zip ou áudio */
  document.addEventListener("change", function(e){
    if(e.target !== inp) return;
    var arquivos = Array.prototype.slice.call(inp.files || []);
    if(!arquivos.some(function(f){ return audEhZip(f.name, f.type) || audEhAudio(f.name, f.type); })) return;
    e.stopImmediatePropagation(); e.stopPropagation();
    inp.value = "";
    if($("impLidos")) $("impLidos").textContent = "Lendo " + arquivos.length + (arquivos.length === 1 ? " arquivo…" : " arquivos…");
    audLerArquivos(arquivos);
  }, true);
  var ta = $("impTexto");
  if(ta) ta.placeholder = "…ou cole aqui o texto de uma conversa. No campo acima vale também a conversa exportada com mídia (.zip): os áudios viram texto.";
})();

/* ---------- "compartilhar" do celular com .zip ou áudio ---------- */
function audLerCompartilhado(){
  if(!/[?&]compartilhadoAudio=1/.test(location.search) || !("caches" in window)) return;
  try{ history.replaceState(null, "", location.pathname + "#captura"); }catch(e){}
  var aba = document.querySelector('nav.tabs button[data-tab="captura"]'); if(aba) aba.click();
  caches.open("chamados-ti-1").then(function(c){
    return c.match(AUD_CHAVE_COMP).then(function(r){
      if(!r) return;
      return r.json().then(function(j){
        c.delete(AUD_CHAVE_COMP);
        var arquivos = [];
        return Promise.all((j.arquivos || []).map(function(a){
          if(a.grande){ audStatus(esc(a.nome) + " é grande demais para abrir aqui.", true); return null; }
          if(a.chave) return c.match(a.chave).then(function(rb){
            c.delete(a.chave);
            return rb ? rb.blob().then(function(b){ arquivos.push(new File([b], a.nome, {type: a.tipo || b.type || ""})); }) : null;
          });
          arquivos.push(new File([a.texto || ""], a.nome || "conversa.txt", {type: "text/plain"}));
          return null;
        })).then(function(){
          if(arquivos.length){ audStatus("Abrindo o que chegou do celular…"); return audLerArquivos(arquivos); }
        });
      });
    });
  }).catch(function(){});
}
audLerCompartilhado();

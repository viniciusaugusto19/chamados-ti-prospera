"use strict";
/* ---------------- v35: Captura com menos trabalho manual ----------------
   Pedido do Vinícius: "o menor trabalho manual possível". Quatro coisas:

   1. Classificação sugerida. Cada anotação nova da fila ganha categoria,
      subcategoria e prioridade tiradas dos chamados já feitos (os carregados do
      Bitrix) com palavras parecidas, ou do nome de uma subcategoria que aparece
      no texto. Só preenche campo vazio, marca em destaque o que foi sugerido e
      nada é criado sem o clique em "Criar chamados".
   2. Canal WhatsApp já escolhido quando a fila tem anotação vinda de conversa.
   3. Colar a conversa já lê sozinho; mandar para a fila leva até a fila.
   4. Anotar vários de uma vez: uma linha por pedido.
   5. Receber do WhatsApp sem salvar arquivo: com a página instalada no Android,
      "Exportar conversa" > "Chamados TI" entrega a conversa aqui (o sw.js
      recebe e guarda; esta parte lê ao abrir).

   Carregado pelo boot.js. Usa o que o app.js, o importar.js e o painel.js
   deixam globais (fila, renderFila, candidatosDe, semAcento...). */

/* ---------- 1. classificação sugerida ---------- */
var CAP_VAZIAS = {};
("para com nao que uma uns umas por mais esta este essa esse isso aqui ali ela ele eles elas voce voces " +
 "bom boa dia tarde noite pessoal favor obrigado obrigada preciso precisa precisamos consegue consegui " +
 "alguem pode poderia ajuda ajudar problema problemas erro erros nada tudo meu minha seu sua tem ter " +
 "esta estou estamos tava fica ficou agora hoje ontem sempre ainda tambem quando como onde porque pois " +
 "ver vou vai vamos fazer feito feita olhar olha the and").split(" ").forEach(function(w){ CAP_VAZIAS[w] = 1; });
function capPalavras(t){
  var visto = {}, r = [];
  semAcento(t).split(/[^a-z0-9]+/).forEach(function(w){
    if(w.length < 3 || CAP_VAZIAS[w] || /^\d+$/.test(w) || visto[w]) return;
    visto[w] = 1; r.push(w);
  });
  return r;
}
/* rótulo -> id da opção, conferindo sem acento e sem caixa */
function capIdDe(campo, rotulo){
  if(!rotulo) return "";
  var m = enumRotulos[B.campo[campo]] || {}, alvo = semAcento(rotulo).trim();
  var achou = "";
  Object.keys(m).forEach(function(id){ if(!achou && semAcento(m[id]).trim() === alvo) achou = id; });
  return achou;
}
var CAP_IDX = {n: -1, itens: []};
function capIndice(){
  var base = Array.isArray(chamados) ? chamados : [];
  if(CAP_IDX.n === base.length && CAP_IDX.base === base) return CAP_IDX.itens;
  CAP_IDX.base = base; CAP_IDX.n = base.length;
  CAP_IDX.itens = base.filter(function(c){ return c.categoria || c.subcategoria || c.prioridade; }).map(function(c){
    var w = {}; capPalavras((c.titulo || "") + " " + (c.equipamento || "")).forEach(function(x){ w[x] = 1; });
    return {w: w, categoria: c.categoria, subcategoria: c.subcategoria, prioridade: c.prioridade};
  });
  return CAP_IDX.itens;
}
function capSugerir(texto){
  var ws = capPalavras(texto), r = {}, por = {};
  if(!ws.length) return r;
  var votos = {categoria: {}, subcategoria: {}, prioridade: {}}, total = {categoria: 0, subcategoria: 0, prioridade: 0};
  capIndice().forEach(function(c){
    var k = 0; ws.forEach(function(w){ if(c.w[w]) k++; });
    if(!k) return;
    var peso = k * k;
    CLS_LINHA.forEach(function(f){
      if(!c[f]) return;
      votos[f][c[f]] = (votos[f][c[f]] || 0) + peso; total[f] += peso;
    });
  });
  CLS_LINHA.forEach(function(f){
    var melhor = "", v = 0;
    Object.keys(votos[f]).forEach(function(l){ if(votos[f][l] > v){ v = votos[f][l]; melhor = l; } });
    /* só sugere quando a maioria dos parecidos concorda */
    if(melhor && v / total[f] >= 0.5){ var id = capIdDe(f, melhor); if(id){ r[f] = id; por[f] = "historico"; } }
  });
  /* sem histórico para a subcategoria: o nome dela escrito no pedido */
  if(!r.subcategoria){
    var m = enumRotulos[B.campo.subcategoria] || {}, set = {};
    ws.forEach(function(w){ set[w] = 1; });
    Object.keys(m).some(function(id){
      var nomes = capPalavras(m[id]).filter(function(w){ return w.length >= 4; });
      if(nomes.length && nomes.every(function(w){ return set[w]; })){ r.subcategoria = id; por.subcategoria = "nome"; return true; }
      return false;
    });
  }
  /* categoria que mais acompanha essa subcategoria nos chamados feitos */
  if(r.subcategoria && !r.categoria){
    var rot = (enumRotulos[B.campo.subcategoria] || {})[r.subcategoria], cont = {}, top = "", tv = 0;
    capIndice().forEach(function(c){ if(c.subcategoria === rot && c.categoria) cont[c.categoria] = (cont[c.categoria] || 0) + 1; });
    Object.keys(cont).forEach(function(l){ if(cont[l] > tv){ tv = cont[l]; top = l; } });
    var idc = capIdDe("categoria", top); if(idc){ r.categoria = idc; por.categoria = "historico"; }
  }
  r._por = por;
  return r;
}
/* roda uma vez por anotação: o que a pessoa limpou depois não volta sozinho */
function capClassificarFila(){
  if(!Object.keys(enumRotulos[B.campo.categoria] || {}).length) return 0;
  var n = 0;
  fila.forEach(function(it){
    if(it.chamado || it.sugFeito) return;
    /* sem chamados carregados ainda, tenta de novo quando chegarem */
    if(capIndice().length) it.sugFeito = true;
    var s = capSugerir(it.oque);
    var pos = [];
    CLS_LINHA.forEach(function(f){ if(s[f] && !it[f]){ it[f] = s[f]; pos.push(f); } });
    if(pos.length){ it.sug = pos; n++; }
  });
  if(n) save(K.fila, fila);
  return n;
}
function capCanalWhats(){
  var sel = $("loteCanal");
  if(!sel || sel.value) return;
  if(!fila.some(function(it){ return !it.chamado && it.origem === "whatsapp"; })) return;
  var op = Array.prototype.filter.call(sel.options, function(o){ return o.value && /whats/i.test(o.textContent); })[0];
  if(!op) return;
  sel.value = op.value;
  save(K.lote, {canal: sel.value, empresa: $("loteEmpresa").value});
}
function capMarcarSugeridos(){
  var total = 0;
  fila.forEach(function(it, i){
    if(it.chamado || !it.sug || !it.sug.length) return;
    total++;
    it.sug.forEach(function(f){
      var s = document.querySelector('#fila select[data-cls="' + f + '"][data-i="' + i + '"]');
      if(s){ s.classList.add("cap-sug"); s.title = it.ia ? "Escolhido pela IA lendo a conversa. Confira." : "Sugerido pelos chamados parecidos. Confira."; }
    });
  });
  var av = $("capSugAviso");
  if(av){
    av.hidden = !total;
    av.textContent = total ? total + (total === 1 ? " anotação veio" : " anotações vieram") +
      " com classificação sugerida (em destaque), pela IA ou pelos chamados parecidos já feitos. Confira antes de criar." : "";
  }
}
(function(){
  var s = document.createElement("style");
  s.textContent =
    "#fila select.cap-sug{border-color:var(--warn);box-shadow:0 0 0 1px var(--warn) inset}" +
    "#capSugAviso{margin:8px 0 0;color:var(--warn)}" +
    "#capVarios textarea{width:100%;min-height:110px;margin-top:8px}" +
    "#capVarios summary{cursor:pointer;font-weight:600;font-size:.88rem}";
  document.head.appendChild(s);
  var al = $("loteAviso");
  if(al){
    var av = document.createElement("div");
    av.className = "hint"; av.id = "capSugAviso"; av.hidden = true;
    al.parentNode.insertBefore(av, al.nextSibling);
  }
})();
var capRenderOrig = renderFila;
renderFila = function(){
  capClassificarFila();
  capCanalWhats();
  capRenderOrig.apply(this, arguments);
  capMarcarSugeridos();
};
/* mexeu no seletor: deixa de ser sugestão */
$("fila").addEventListener("change", function(e){
  var f = e.target.getAttribute && e.target.getAttribute("data-cls");
  if(!f) return;
  var it = fila[parseInt(e.target.getAttribute("data-i"), 10)];
  if(it){ it.sugFeito = true; if(it.sug) it.sug = it.sug.filter(function(x){ return x !== f; }); save(K.fila, fila); }
  e.target.classList.remove("cap-sug"); e.target.title = "";
});

/* ---------- 3. colar lê sozinho; mandar leva até a fila ---------- */
if($("impTexto")) $("impTexto").addEventListener("paste", function(){
  var ta = this;
  setTimeout(function(){ if(RE_CARIMBO.test(limparInvisiveis(ta.value).split(/\r?\n/)[0] || "") || /\d{1,2}\/\d{1,2}\/\d{2,4}[, ]+\d{1,2}:\d{2}/.test(ta.value)) $("impLer").click(); }, 60);
});
if($("impMandar")) $("impMandar").addEventListener("click", function(){
  setTimeout(function(){ var f = $("fila"); if(f && f.scrollIntoView) f.scrollIntoView({block: "start", behavior: "smooth"}); }, 80);
});

/* ---------- 4. anotar vários de uma vez ---------- */
/* "Max: impressora parou", "Max - impressora", "Max — impressora", "Max;impressora"
   ou só o texto. O nome é a parte antes do separador, se for curta. */
function capLinha(l){
  l = l.replace(/^\s*[-*•\d.)]+\s+/, "").trim();
  if(!l) return null;
  var m = /^([^:;\t—–]{1,40}?)\s*(?::|;|\t| - | — | – )\s*(.+)$/.exec(l);
  if(m && m[1].split(/\s+/).length <= 5) return {quem: m[1].trim(), oque: m[2].trim()};
  return {quem: "", oque: l};
}
function capAnotarVarios(txt){
  var agora = new Date(), n = 0;
  var linhas = String(txt || "").split(/\r?\n/).map(capLinha).filter(Boolean);
  linhas.reverse().forEach(function(x, k){
    var d = new Date(agora.getTime() - k * 1000);
    fila.unshift({quem: x.quem, oque: x.oque.slice(0, 500),
      hora: d.toLocaleString("pt-BR", {day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"}),
      iso: d.toISOString()});
    n++;
  });
  if(n){ save(K.fila, fila); renderFila(); }
  return n;
}
(function(){
  var box = $("capQuem") && $("capQuem").closest(".card");
  if(!box) return;
  var d = document.createElement("details");
  d.id = "capVarios"; d.style.marginTop = "10px";
  d.innerHTML = "<summary>Anotar vários de uma vez</summary>" +
    '<textarea id="capVariosTxt" placeholder="Uma linha por pedido:&#10;Max: impressora do financeiro parou&#10;Raphael - sem acesso à VPN&#10;Aida — trocar mouse"></textarea>' +
    '<div class="lote-topo" style="margin-top:8px"><button class="primary" type="button" id="capVariosBtn">Anotar todas</button>' +
    '<span class="hint" style="margin:0">Nome antes de ":" ou " - " (opcional). Vai tudo para a fila, já com classificação sugerida.</span></div>';
  box.appendChild(d);
  $("capVariosBtn").addEventListener("click", function(){
    var n = capAnotarVarios($("capVariosTxt").value);
    if(!n){ toast("Escreva pelo menos uma linha."); $("capVariosTxt").focus(); return; }
    $("capVariosTxt").value = "";
    toast(n + (n === 1 ? " anotação na fila." : " anotações na fila."));
  });
})();

/* ---------- 5. conversa recebida pelo "compartilhar" do celular ---------- */
var CAP_CACHE = "chamados-ti-1", CAP_CHAVE = "./__compartilhado.json";
function capLerCompartilhado(){
  if(!/[?&]compartilhado=1/.test(location.search) || !("caches" in window)) return Promise.resolve(0);
  try{ history.replaceState(null, "", location.pathname + "#captura"); }catch(e){}
  var aba = document.querySelector('nav.tabs button[data-tab="captura"]'); if(aba) aba.click();
  return caches.open(CAP_CACHE).then(function(c){
    return c.match(CAP_CHAVE).then(function(r){
      if(!r) return 0;
      return r.json().then(function(j){
        c.delete(CAP_CHAVE);
        var n = 0, vazios = [];
        (j.arquivos || []).forEach(function(a){
          if(!a.texto){ vazios.push(a.nome + (a.zip ? " (veio com mídia: exporte \"sem mídia\")" : "")); return; }
          var conversa = nomeDaConversa(a.nome || "conversa"), novos = candidatosDe(a.texto, conversa);
          if(novos.length){ adicionarCandidatos(novos, conversa); n += novos.length; } else vazios.push(a.nome);
        });
        if(j.texto){
          var nt = candidatosDe(j.texto, "compartilhado");
          if(nt.length){ adicionarCandidatos(nt, "compartilhado"); n += nt.length; }
          /* mensagem solta compartilhada (sem arquivo) vira anotação; junto de
             um arquivo, o texto é só o título que o WhatsApp põe */
          else if(!(j.arquivos || []).length && String(j.texto).trim()){ n += capAnotarVarios(j.texto); toast("Mensagem recebida e anotada na fila."); }
        }
        if(typeof pintarLidos === "function") pintarLidos(vazios);
        if(n) pintarImport(); else if(vazios.length) naoReconheci();
        if(n) toast("Conversa recebida: " + n + (n === 1 ? " pedido encontrado." : " pedidos encontrados.") + " Confira e mande para a fila.");
        var ci = $("cardImportar"); if(n && ci && ci.scrollIntoView) ci.scrollIntoView({block: "start"});
        return n;
      });
    });
  }).catch(function(){ return 0; });
}
capLerCompartilhado();
renderFila();

/* ---------- 6. botão no WhatsApp Web (v37) ----------
   O WhatsApp só exporta conversa pelo celular, uma por vez. No computador, um
   favorito do Chrome faz o papel: com a conversa aberta no web.whatsapp.com, um
   clique lê as mensagens que estão carregadas na tela (as suas ficam de fora),
   e entrega aqui pela janela do Chamados TI; se a entrega direta não der certo,
   copia, e colar na Captura lê sozinho. Não envia mensagem, não abre conversa
   nem rola a tela por você: é um clique seu, numa conversa que você abriu.
   O texto vai do seu navegador para o seu navegador; nada passa por servidor. */
var CAP_WA = "https://web.whatsapp.com", CAP_WA_CAB = "[Chamados TI] conversa: ";
var capWaVistos = {};
function capWaReceber(conversa, texto, versao){
  if(versao === 1 && !capWaReceber.avisou){
    capWaReceber.avisou = true;
    setTimeout(function(){ toast("Seu botão do WhatsApp Web é da versão antiga. Arraste o botão laranja para os favoritos de novo (e apague o antigo)."); }, 2800);
  }
  var novos = candidatosDe(texto, conversa || "WhatsApp Web");
  var antes = impCandidatos.length;
  if(novos.length){ adicionarCandidatos(novos, conversa || "WhatsApp Web"); pintarLidos(); pintarImport(); }
  var entraram = impCandidatos.length - antes;
  var pedidos = novos.filter(function(c){ return !c.motivo; }).length;
  var aba = document.querySelector('nav.tabs button[data-tab="captura"]'); if(aba) aba.click();
  var ci = $("cardImportar"); if(ci && ci.scrollIntoView) ci.scrollIntoView({block: "start"});
  if(novos.length) CAP_AUTO[conversa || "WhatsApp Web"] = 1;
  if(novos.length && capIa.ligada) capIaInterpretar([conversa || "WhatsApp Web"]);
  else if(novos.length && !capIa.conferido && SERVIDOR.url) toast("Conversa recebida. A IA lê assim que a conexão com o servidor terminar…");
  else toast(novos.length ? conversa + ": " + pedidos + (pedidos === 1 ? " pedido" : " pedidos") +
    (entraram < novos.length ? " (" + (novos.length - entraram) + " já estavam na lista)" : "") + ". Confira e mande para a fila."
    : "Nada reconhecido na conversa " + conversa + ".");
  return pedidos;
}
window.addEventListener("message", function(e){
  if(e.origin !== CAP_WA) return;
  var d = e.data;
  if(!d || d.tipo !== "ctip-wa" || typeof d.texto !== "string" || !d.id) return;
  if(!capWaVistos[d.id]) capWaVistos[d.id] = {n: capWaReceber(String(d.conversa || "").slice(0, 80), d.texto.slice(0, 2000000), d.v || 1)};
  try{ e.source.postMessage({tipo: "ctip-wa-ok", id: d.id, n: capWaVistos[d.id].n}, CAP_WA); }catch(x){}
});
/* colado do botão (quando a entrega direta não deu): a 1ª linha traz o nome */
if($("impTexto")) $("impTexto").addEventListener("paste", function(e){
  var t = e.clipboardData ? e.clipboardData.getData("text") : "";
  if(t.indexOf(CAP_WA_CAB) !== 0) return;
  e.preventDefault(); e.stopImmediatePropagation();
  var quebra = t.indexOf("\n");
  capWaReceber(t.slice(CAP_WA_CAB.length, quebra < 0 ? t.length : quebra).trim(), quebra < 0 ? "" : t.slice(quebra + 1), /\[eu\] /.test(t) ? 2 : 1);
}, true);

/* o que roda dentro do WhatsApp Web quando o favorito é clicado */
function capWaBotao(){
  var A = "__ORIGEM__", CAB = "__CAB__";
  var aviso = function(s){
    var d = document.createElement("div"); d.textContent = s;
    d.style.cssText = "position:fixed;z-index:2147483647;top:18px;left:50%;transform:translateX(-50%);max-width:520px;" +
      "background:#16191C;color:#fff;padding:12px 18px;border-radius:10px;border-left:4px solid #F25B20;font:14px/1.4 sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.35)";
    document.body.appendChild(d); setTimeout(function(){ d.remove(); }, 6000);
  };
  if(location.origin !== "https://web.whatsapp.com"){ aviso("Este botão funciona no web.whatsapp.com, com uma conversa aberta."); return; }
  var main = document.getElementById("main");
  if(!main){ aviso("Abra uma conversa (ou um grupo) no WhatsApp Web e clique de novo."); return; }
  var tit = main.querySelector("header span[title]") || main.querySelector("header span[dir=auto]");
  var conv = ((tit && (tit.getAttribute("title") || tit.textContent)) || "WhatsApp Web").trim().slice(0, 80);
  var linhas = [], n = 0;
  Array.prototype.forEach.call(main.querySelectorAll("[data-pre-plain-text]"), function(el){
    var linhaMsg = el.closest("[data-id]");
    var minha = !!el.closest(".message-out") || !!(linhaMsg && /^true_/.test(linhaMsg.getAttribute("data-id") || ""));
    var m = /^\s*\[(\d{1,2}):(\d{2})(?::\d{2})?,\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\]\s*(.+?):\s*$/.exec(el.getAttribute("data-pre-plain-text") || "");
    if(!m) return;
    var corpo = el.querySelector(".selectable-text") || el;
    var t = String(corpo.innerText || "").trim();
    if(!t) return;
    linhas.push(m[3] + "/" + m[4] + "/" + m[5] + " " + m[1] + ":" + m[2] + " - " + (minha ? "[eu] " : "") + m[6] + ": " + t);
    if(!minha) n++;
  });
  if(!n){ aviso("Não achei mensagens de outras pessoas carregadas nesta conversa. Role para cima até onde quer capturar e clique de novo."); return; }
  var texto = linhas.join("\n"), id = String(Date.now()), ok = false, k = 0;
  var copiar = function(){
    var s = CAB + conv + "\n" + texto;
    try{ navigator.clipboard.writeText(s); }catch(x){
      try{ var ta = document.createElement("textarea"); ta.value = s; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); }catch(y){}
    }
  };
  copiar();
  var w = null;
  try{
    w = window.open("", "chamadosTI");
    var nova = false;
    try{ nova = !w.location.href || w.location.href === "about:blank"; }catch(x){ nova = false; }
    if(nova) w.location.href = A + "/#captura";
  }catch(x){ w = null; }
  window.addEventListener("message", function(e){
    if(e.origin === A && e.data && e.data.tipo === "ctip-wa-ok" && e.data.id === id && !ok){
      ok = true; aviso(conv + ": " + e.data.n + " pedido(s) na Captura do Chamados TI.");
    }
  });
  aviso(n + " mensagens lidas de " + conv + ". Entregando ao Chamados TI…");
  var iv = setInterval(function(){
    if(ok){ clearInterval(iv); return; }
    if(++k > 40 || !w || w.closed){
      clearInterval(iv);
      aviso("Copiei as mensagens de " + conv + ". Na Captura do Chamados TI, clique na caixa de texto e cole (Ctrl+V).");
      return;
    }
    try{ w.postMessage({tipo: "ctip-wa", v: 2, id: id, conversa: conv, texto: texto}, A); }catch(x){}
  }, 500);
}
function capWaLink(){
  var src = String(capWaBotao).replace("__ORIGEM__", location.origin).replace("__CAB__", CAP_WA_CAB);
  return "javascript:(" + encodeURIComponent(src) + ")();";
}
(function(){
  var ci = $("cardImportar"); if(!ci || !/^https?:$/.test(location.protocol)) return;
  var d = document.createElement("div");
  d.id = "capWa"; d.className = "cap-wa";
  d.innerHTML = '<div class="cap-wa-topo"><b>No computador: botão no WhatsApp Web</b>' +
    '<a class="cap-wa-btn" id="capWaLink" href="#" title="Arraste para a barra de favoritos do Chrome">Mandar para o Chamados TI</a></div>' +
    '<ol class="hint" style="margin:6px 0 0;padding-left:18px">' +
      "<li><b>Arraste</b> o botão laranja para a barra de favoritos do Chrome (Ctrl+Shift+B mostra a barra). Uma vez só.</li>" +
      "<li>No <b>web.whatsapp.com</b>, abra o grupo ou a conversa e role até onde quer capturar.</li>" +
      "<li>Clique no favorito. Os pedidos aparecem aqui, separados e classificados. Repita em cada grupo: a lista vai somando.</li></ol>" +
    '<div class="hint" style="margin-top:4px">Suas próprias mensagens ficam de fora. O texto vai do WhatsApp Web direto para esta aba, sem passar por servidor.</div>';
  ci.insertBefore(d, ci.querySelector("h3").nextSibling);
  var a = $("capWaLink");
  a.setAttribute("href", capWaLink());
  a.addEventListener("click", function(e){ e.preventDefault(); toast("Arraste este botão para a barra de favoritos; o clique vale lá, no WhatsApp Web."); });
  var s = document.createElement("style");
  s.textContent = ".cap-wa{border:1px dashed var(--line);border-radius:10px;padding:10px 12px;margin:0 0 12px;background:var(--surface-2)}" +
    ".cap-wa-topo{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:space-between}" +
    ".cap-wa-btn{display:inline-block;background:var(--laranja);color:#fff!important;text-decoration:none;font-weight:600;font-size:.82rem;padding:7px 14px;border-radius:8px;cursor:grab}";
  document.head.appendChild(s);
  /* a aba do Chamados TI tem nome fixo: o botão reaproveita a mesma aba */
  try{ if(!window.name) window.name = "chamadosTI"; }catch(x){}
})();

/* ---------- 7. IA lendo a conversa (v38) ----------
   Com a chave da Anthropic ligada no servidor (segredo ANTHROPIC_API_KEY da
   função chamados), a conversa inteira vai para o Claude, que devolve os
   pedidos já entendidos: um item por assunto (juntando mensagens e pessoas),
   título limpo, quem pediu, categoria, subcategoria e prioridade escolhidas
   entre as opções do portal, e se a TI já resolveu na própria conversa. As
   respostas da TI servem de contexto e não viram pedido. Sem a chave, fica o
   que já existia (regras). Nada é criado sem conferir e clicar. */
var capIa = {ligada: false, conferido: false, rodando: 0};
var CAP_TXT = {};          /* conversa -> texto bruto, para mandar à IA */
var CAP_IA_FEITO = {};     /* conversa -> tamanho do texto já interpretado */
var CAP_AUTO = {};         /* conversas vindas do WhatsApp Web: a IA lê sozinha */

/* suas mensagens (marcadas pelo botão do WhatsApp Web) não são pedido; e o
   nome no WhatsApp ("Vinicius Augusto") conta como o do filtro ("Vinicius
   Augusto Macedo Silva") */
var capCandOrig = candidatosDe;
candidatosDe = function(txt, conversa){
  if(conversa) CAP_TXT[conversa] = String(txt || "");
  var r = capCandOrig.apply(this, arguments);
  r.forEach(function(c){
    if(/^\[eu\] /.test(c.quem || "")){ c.quem = c.quem.slice(5); c.marcada = false; c.motivo = "mensagem sua (TI)"; }
  });
  return r;
};
var capIgnOrig = ehIgnorado;
ehIgnorado = function(quem){
  if(capIgnOrig.apply(this, arguments)) return true;
  var q = semAcento(quem).split(/[^a-z]+/).filter(function(x){ return x.length > 1; });
  if(q.length < 2) return false;
  return nomesIgnorados().some(function(n){
    var t = semAcento(n).split(/[^a-z]+/);
    return q.every(function(x){ return t.indexOf(x) !== -1; });
  });
};

function capIaRotulos(campo){
  var m = enumRotulos[B.campo[campo]] || {};
  return Object.keys(m).map(function(k){ return m[k]; }).filter(Boolean);
}
function capIaTecnicos(){
  var l = [];
  var eu = load(K.eu, null); if(eu && eu.nome) l.push(eu.nome);
  if(typeof acEu !== "undefined" && acEu && acEu.nome) l.push(acEu.nome);
  nomesIgnorados().forEach(function(n){ l.push(n); });
  return l.filter(function(x, i){ return x && l.indexOf(x) === i; });
}
function capIaData(s, reserva){
  var m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}) (\d{1,2}):(\d{2})$/.exec(String(s || ""));
  if(!m) return reserva || new Date();
  var a = +m[3]; if(a < 100) a += 2000;
  var d = new Date(a, +m[2] - 1, +m[1], +m[4], +m[5]);
  return isNaN(d.getTime()) ? (reserva || new Date()) : d;
}
function capIaStatusTexto(t, ruim){
  var el = $("capIaStatus"); if(!el) return;
  el.hidden = !t; el.textContent = t || "";
  el.style.color = ruim ? "var(--crit)" : "";
}
function capIaPintarBotao(){
  var b = $("capIaBtn"); if(!b) return;
  /* sem a chave (a IA é paga), o botão nem aparece */
  b.hidden = !SERVIDOR.url || !capIa.ligada;
  b.disabled = capIa.rodando > 0;
  b.textContent = capIa.rodando ? "IA lendo…" : "Interpretar com IA";
  b.title = capIa.ligada ? "O Claude lê a conversa inteira e devolve os pedidos já entendidos"
                         : "A IA ainda não está ligada no servidor (falta a chave da Anthropic)";
}
function capIaConferir(){
  if(capIa.conferido || !SERVIDOR.url || typeof acPedir !== "function" || typeof acEu === "undefined" || !acEu) return;
  capIa.conferido = true;
  acPedir({acao: "ia.status"}).then(function(j){
    capIa.ligada = !!j.ligada; capIaPintarBotao();
    /* o que chegou do WhatsApp Web antes de saber se a IA estava ligada */
    var pend = Object.keys(CAP_AUTO).filter(function(c){ return !CAP_IA_FEITO[c]; });
    if(capIa.ligada && pend.length) capIaInterpretar(pend);
  }, function(e){
    /* servidor antigo (sem a IA) responde 400: fica desligada. Falha de rede
       tenta de novo mais tarde, poucas vezes. */
    capIa.ligada = false; capIaPintarBotao();
    if(!e || !e.status){ capIa.tentativas = (capIa.tentativas || 0) + 1; if(capIa.tentativas < 4) setTimeout(function(){ capIa.conferido = false; capIaConferir(); }, 15000); }
  });
}
(function vigia(n){ capIaConferir(); if(!capIa.conferido && n < 120) setTimeout(function(){ vigia(n + 1); }, 1000); })(0);

function capIaInterpretar(conversas){
  if(!capIa.ligada){
    toast("A IA ainda não está ligada: falta cadastrar a chave da Anthropic no servidor (ANTHROPIC_API_KEY).");
    return;
  }
  var lista = (conversas || Object.keys(CAP_TXT)).filter(function(c){ return CAP_TXT[c] && String(CAP_TXT[c]).trim(); });
  if(!lista.length){ toast("Não há conversa lida para interpretar."); return; }
  var opcoes = {categoria: capIaRotulos("categoria"), subcategoria: capIaRotulos("subcategoria"), prioridade: capIaRotulos("prioridade")};
  lista.forEach(function(conv){
    var texto = String(CAP_TXT[conv]).replace(/ - \[eu\] /g, " - (TI) ");
    if(texto.length > 120000) texto = texto.slice(texto.length - 120000);
    capIa.rodando++; capIaPintarBotao();
    capIaStatusTexto("A IA está lendo " + (lista.length > 1 ? lista.length + " conversas" : "“" + conv + "”") + "…");
    acPedir({acao: "ia.interpretar", conversa: conv, texto: texto, tecnicos: capIaTecnicos(), opcoes: opcoes}).then(function(j){
      var regras = impCandidatos.filter(function(c){ return c.conversa === conv; });
      var primeiro = regras.reduce(function(m, c){ return c.quando && (!m || c.quando < m) ? c.quando : m; }, null);
      var novos = (j.pedidos || []).map(function(p){
        var c = {quem: p.quem || conv, texto: p.titulo, quando: capIaData(p.quando, primeiro), conversa: conv,
                 marcada: p.confianca >= 0.6, motivo: "", ia: p};
        if(fila.some(function(it){ return it.oque === c.texto && it.quem === c.quem; })){ c.marcada = false; c.motivo = "já está na fila"; }
        else if(p.confianca < 0.6) c.motivo = "a IA não tem certeza de que é pedido";
        return c;
      });
      impCandidatos = impCandidatos.filter(function(c){ return c.conversa !== conv; }).concat(novos);
      impCandidatos.sort(function(a, b){ return (a.quando || 0) - (b.quando || 0); });
      CAP_IA_FEITO[conv] = CAP_TXT[conv].length;
      pintarImport();
      var abertos = novos.filter(function(c){ return c.ia.situacao !== "resolvido"; }).length;
      toast("IA: " + novos.length + (novos.length === 1 ? " pedido" : " pedidos") + " em “" + conv + "”" +
        (novos.length ? " (" + abertos + " em aberto, " + (novos.length - abertos) + " já resolvidos na conversa)." : "."));
    }, function(e){
      toast("A IA não conseguiu ler “" + conv + "”: " + e.message + " A lista das regras continua valendo.");
    }).then(function(){
      capIa.rodando--; capIaPintarBotao();
      if(!capIa.rodando) capIaStatusTexto("");
    });
  });
}

/* cada linha que veio da IA mostra o que ela entendeu */
var capPintarImpOrig = pintarImport;
pintarImport = function(){
  capPintarImpOrig.apply(this, arguments);
  Array.prototype.forEach.call(document.querySelectorAll("#impLista .imp-cx, #impDescartados .imp-cx"), function(cx){
    var c = impCandidatos[+cx.getAttribute("data-i")];
    if(!c || !c.ia) return;
    var li = cx.closest("li"), alvo = li && li.querySelector(".imp-txt");
    if(!alvo || alvo.querySelector(".cap-ia")) return;
    var p = c.ia, sit = {resolvido: ["ok", "resolvido na conversa"], em_andamento: ["warn", "TI já respondeu"], aberto: ["crit", "sem resposta da TI"]}[p.situacao] || ["neutral", p.situacao];
    var cls = [p.categoria, p.subcategoria].filter(Boolean).join(" › ");
    var d = document.createElement("div");
    d.className = "cap-ia";
    d.innerHTML = '<span class="tag ' + sit[0] + '">' + esc(sit[1]) + "</span>" +
      (cls ? '<span class="tag neutral">' + esc(cls) + "</span>" : "") +
      (p.prioridade ? '<span class="tag neutral">' + esc(p.prioridade) + "</span>" : "") +
      (p.fonte === "regras" ? "" : '<span class="cap-ia-ia">IA</span>') +
      ((p.descricao || p.resolucao) ? '<div class="cap-ia-d">' + esc(p.descricao || "") + (p.resolucao ? (p.descricao ? " " : "") + "<b>Feito:</b> " + esc(p.resolucao) : "") + "</div>" : "");
    alvo.appendChild(d);
  });
};

/* ao mandar para a fila, o que a IA entendeu vai junto: classificação já
   escolhida (em destaque, para conferir) e a descrição no campo Detalhes */
var capIaLevando = [];
if($("impMandar")) $("impMandar").addEventListener("click", function(){
  capIaLevando = impCandidatos.filter(function(c){ return c.marcada && c.ia; })
    .map(function(c){ return {quem: c.quem, texto: c.texto, ia: c.ia, conversa: c.conversa, original: c.original}; });
  setTimeout(function(){
    var mexeu = 0;
    capIaLevando.forEach(function(x){
      var it = fila.filter(function(f){ return !f.chamado && !f.ia && f.oque === x.texto && f.quem === x.quem; })[0];
      if(!it) return;
      if(x.ia.fonte === "regras"){
        /* leitor de regras: a classificação fica com a sugestão pelo histórico */
        it.detalhe = [x.original || x.texto, x.ia.resolucao ? "Resolvido na conversa: " + x.ia.resolucao : "",
                      x.ia.resposta ? "TI respondeu na conversa: " + x.ia.resposta : "",
                      "Origem: WhatsApp, " + x.conversa + "."].filter(Boolean).join("\n\n");
        mexeu++;
        return;
      }
      it.ia = true; it.sugFeito = true; it.sug = [];
      CLS_LINHA.forEach(function(f){ var id = capIdDe(f, x.ia[f]); if(id){ it[f] = id; it.sug.push(f); } });
      it.detalhe = [x.ia.descricao, x.ia.resolucao ? "Resolvido na conversa: " + x.ia.resolucao : "",
                    "Origem: WhatsApp, " + x.conversa + "."].filter(Boolean).join("\n\n");
      mexeu++;
    });
    capIaLevando = [];
    if(mexeu){ save(K.fila, fila); renderFila(); }
  }, 0);
}, true);
var capCamposOrig = camposDaAnotacao;
camposDaAnotacao = function(item){
  var f = capCamposOrig.apply(this, arguments);
  if(item && item.detalhe) f[B.campo.detalhes] = item.detalhe;
  return f;
};

(function(){
  var topo = $("impMandar") && $("impMandar").parentNode;
  if(!topo) return;
  var b = document.createElement("button");
  b.type = "button"; b.className = "ghost"; b.id = "capIaBtn"; b.hidden = true;
  topo.insertBefore(b, $("impMandar"));
  b.addEventListener("click", function(){ capIaInterpretar(); });
  var st = document.createElement("div");
  st.className = "hint"; st.id = "capIaStatus"; st.hidden = true;
  topo.parentNode.insertBefore(st, topo.nextSibling);
  var s = document.createElement("style");
  s.textContent = ".cap-ia{display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-top:5px}" +
    ".cap-ia .tag{font-size:.68rem}" +
    ".cap-ia-ia{font-size:.62rem;font-weight:700;letter-spacing:.05em;color:var(--laranja);border:1px solid var(--laranja);border-radius:4px;padding:0 4px}" +
    ".cap-ia-d{flex-basis:100%;color:var(--muted);font-size:.78rem;line-height:1.35}" +
    "#capIaStatus{margin:6px 0 0}";
  document.head.appendChild(s);
  capIaPintarBotao();
})();

/* ---------- 8. leitor com contexto, sem IA (v39) ----------
   Gratuito e dentro do navegador. Em vez de olhar mensagem por mensagem, lê a
   conversa em ordem:
   - resposta da TI depois de um pedido diz o andamento dele: "feito",
     "liberei", "já está com acesso" = resolvido na conversa; outra resposta =
     TI já respondeu; nenhuma = sem resposta da TI;
   - a TI anunciando um trabalho feito sem pedido antes ("já fiz a virada do
     e-mail do DP") vira um item próprio, porque também precisa de registro;
   - o título sai limpo (sem "bom dia, pessoal", sem @menção, primeira letra
     maiúscula, cortado na palavra) e o texto inteiro vai para Detalhes. */
var CAP_RE_FEITO = /\b(feito|feita|resolvid[oa]|pront[oa]|liberad[oa]|liberei|conclu[ií]d[oa]|conclu[ií]|fiz|configurei|instalei|criei|ajustei|corrigi|resolvi|troquei|atualizei|resetei|desbloqueei|desbloquead[oa]|habilitei|cadastrei|enviei|mandei|j[aá] (est[aá]|foi|tem|consegue|funciona)|est[aá] com acesso|com acesso|j[aá] pode|pode testar|funcionando)\b/i;
var CAP_RE_ANUNCIO = /\b(fiz|configurei|instalei|criei|ajustei|corrigi|resolvi|troquei|atualizei|resetei|desbloqueei|habilitei|cadastrei|liberei|virada|migrei|est[aá] com acesso|com acesso)\b/i;
var CAP_RE_SAUDACAO = /^(\s*(bom dia|boa tarde|boa noite|oi+|ol[aá]|pessoal|galera|gente|time|ti|suporte|por favor|pf|pfv|pfvr|@\S+)[\s,!.:;-]*)+/i;
function capTitulo(t){
  var x = String(t || "").replace(/\s+/g, " ").replace(CAP_RE_SAUDACAO, "").trim();
  if(!x) x = String(t || "").trim();
  x = x.charAt(0).toUpperCase() + x.slice(1);
  if(x.length > 90){ x = x.slice(0, 90); var sp = x.lastIndexOf(" "); if(sp > 50) x = x.slice(0, sp); x = x.replace(/[\s,;:.-]+$/, "") + "…"; }
  return x;
}
/* palavras que dizem o assunto (fora as que aparecem em qualquer resposta) */
var CAP_GENERICAS = {};
("feito feita pronto pronta resolvido resolvida liberado liberada liberei acesso acessos conseguir consegue funciona funcionando " +
 "testar teste tbm tambem copia agora ja sim nao mais vou olhar ver verificar fiz fizemos com sem para").split(" ").forEach(function(w){ CAP_GENERICAS[w] = 1; });
function capPalavrasAssunto(t){
  return capPalavras(t).filter(function(w){ return w.length >= 4 && !CAP_GENERICAS[w]; });
}
function capEhTI(c){ return c.motivo === "mensagem sua (TI)" || c.motivo === "remetente ignorado"; }
function capContexto(r, conversa){
  var ordem = r.slice().sort(function(a, b){ return (a.quando || 0) - (b.quando || 0); });
  var novos = [];
  ordem.forEach(function(c){
    if(capEhTI(c)){
      var texto = String(c.texto || "").trim();
      /* a qual pedido essa resposta se refere: o mais recente, ainda não
         resolvido, que fale do mesmo assunto (palavra em comum). Resposta curta
         e genérica ("feito", "pronto, liberado") vale para o pedido de até 4 h
         antes; com duas palavras em comum, até 3 dias. */
      var alvo = null, pt = capPalavrasAssunto(texto);
      var curta = texto.length <= 30 && CAP_RE_FEITO.test(texto) && !pt.length;
      ordem.forEach(function(p){
        if(!p.ia || p.ia.fonte !== "regras" || p.ia.situacao === "resolvido") return;
        if(!p.quando || !c.quando || c.quando < p.quando) return;
        var gap = c.quando - p.quando, pp = capPalavrasAssunto(p.original || p.texto);
        var comum = pt.filter(function(w){ return pp.indexOf(w) !== -1; }).length;
        if((gap <= 4 * 3600000 && (comum >= 1 || curta)) || (gap <= 3 * 86400000 && comum >= 2)) alvo = p;
      });
      var feito = CAP_RE_FEITO.test(texto);
      if(alvo){
        if(feito){ alvo.ia.situacao = "resolvido"; alvo.ia.resolucao = texto; alvo.ia.resposta = ""; }
        else if(alvo.ia.situacao === "aberto"){ alvo.ia.situacao = "em_andamento"; alvo.ia.resposta = texto; }
      } else if(texto.length >= 15 && CAP_RE_ANUNCIO.test(texto) && !/\?\s*$/.test(texto)){
        var n = {quem: conversa || "WhatsApp", texto: capTitulo(texto), original: texto, quando: c.quando, conversa: conversa,
                 marcada: true, motivo: "", ia: {fonte: "regras", situacao: "resolvido", resolucao: texto, descricao: "Atendimento feito pela TI, anunciado na conversa."}};
        novos.push(n);
      }
      return;
    }
    if(c.motivo) return;
    c.original = c.texto;
    c.texto = capTitulo(c.texto);
    /* o texto inteiro só aparece embaixo quando o título cortou ou limpou algo */
    var igual = String(c.texto).toLowerCase() === String(c.original).replace(/\s+/g, " ").trim().toLowerCase();
    c.ia = {fonte: "regras", situacao: "aberto", resolucao: "", resposta: "", descricao: igual ? "" : c.original};
  });
  ordem.concat(novos).forEach(function(c){
    if(c.ia && c.ia.fonte === "regras" && !c.motivo &&
       fila.some(function(it){ return it.oque === c.texto && it.quem === c.quem; })){ c.marcada = false; c.motivo = "já está na fila"; }
  });
  ordem.forEach(function(c){
    if(c.ia && c.ia.fonte === "regras" && c.ia.situacao === "em_andamento") c.ia.descricao = (c.ia.descricao ? c.ia.descricao + " · " : "") + "TI respondeu: " + c.ia.resposta;
  });
  return r.concat(novos);
}
var capCandCtx = candidatosDe;
candidatosDe = function(txt, conversa){
  return capContexto(capCandCtx.apply(this, arguments), conversa);
};

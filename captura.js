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
      if(s){ s.classList.add("cap-sug"); s.title = "Sugerido pelos chamados parecidos. Confira."; }
    });
  });
  var av = $("capSugAviso");
  if(av){
    av.hidden = !total;
    av.textContent = total ? total + (total === 1 ? " anotação veio" : " anotações vieram") +
      " com classificação sugerida (em destaque), tirada dos chamados parecidos já feitos. Confira antes de criar." : "";
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

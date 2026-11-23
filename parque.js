"use strict";
/* ---------------- v34: aba Parque mais limpa ----------------
   Ações da linha num menu "⋯", cartões que minimizam e a visão Kanban do
   inventário. Carregado pelo boot.js fora de ordem garantida: espera o
   inventario.js e o mais.js (termo e leitor de QR) estarem prontos.
   Só grava no Bitrix quando você confirma mover um equipamento de coluna, e
   aí grava só a Situação dele (crm.item.update no 1040). */
function pqQuando(fn, n){
  n = n || 0;
  if($("invAtualizar") && $("termoCaixa") && typeof invPintarParque === "function" && typeof termoAbrir === "function" &&
     typeof maisItem === "function" && typeof INV !== "undefined"){ fn(); return; }
  if(n > 160) return;
  setTimeout(function(){ pqQuando(fn, n + 1); }, 150);
}

/* ================= 5b. ações da linha numa linha só (v34) =================
   Quatro botões empilhados deixavam cada linha da tabela com quatro andares.
   Fica "editar" à mostra e o resto num "⋯" que abre um menu flutuante (fixo na
   tela, para não ser cortado pela rolagem da tabela). Os botões continuam os
   mesmos, com os mesmos data-*, então os cliques de sempre funcionam. */
function acoesCompactar(td){
  if(!td || td.querySelector(".acoes-mais")) return;
  var ed = td.querySelector("[data-inv-editar]");
  var outros = Array.prototype.filter.call(td.querySelectorAll("button, a"), function(x){ return x !== ed; });
  if(!ed || !outros.length) return;
  var menu = document.createElement("div");
  menu.className = "acoes-menu"; menu.setAttribute("role", "menu"); menu.hidden = true;
  outros.forEach(function(x){ x.setAttribute("role", "menuitem"); menu.appendChild(x); });
  var mais = document.createElement("button");
  mais.type = "button"; mais.className = "mini acoes-mais";
  mais.setAttribute("aria-haspopup", "menu"); mais.setAttribute("aria-expanded", "false");
  mais.title = outros.map(function(x){ return x.textContent; }).join(", ");
  mais.setAttribute("aria-label", "Mais ações: " + mais.title);
  mais.textContent = "⋯";
  td.textContent = "";
  var linha = document.createElement("div"); linha.className = "acoes-linha";
  linha.appendChild(ed); linha.appendChild(mais); linha.appendChild(menu);
  td.appendChild(linha);
}
var acoesAberto = null;
function acoesFechar(){
  if(!acoesAberto) return;
  acoesAberto.menu.hidden = true;
  acoesAberto.botao.setAttribute("aria-expanded", "false");
  acoesAberto = null;
}
function acoesMenu(botao){
  var menu = botao.parentNode.querySelector(".acoes-menu");
  var era = acoesAberto && acoesAberto.botao === botao;
  acoesFechar();
  if(era || !menu) return;
  menu.hidden = false;
  var r = botao.getBoundingClientRect(), m = menu.getBoundingClientRect();
  var top = r.bottom + 4;
  if(top + m.height > window.innerHeight - 8) top = Math.max(8, r.top - m.height - 4);
  menu.style.top = top + "px";
  menu.style.left = Math.max(8, Math.min(r.right - m.width, window.innerWidth - m.width - 8)) + "px";
  botao.setAttribute("aria-expanded", "true");
  acoesAberto = {botao: botao, menu: menu};
  var primeiro = menu.querySelector("button, a"); if(primeiro) primeiro.focus();
}
document.addEventListener("click", function(e){
  if(acoesAberto && !acoesAberto.menu.contains(e.target) && e.target !== acoesAberto.botao) acoesFechar();
});
document.addEventListener("keydown", function(e){
  if(e.key === "Escape" && acoesAberto){ var b = acoesAberto.botao; acoesFechar(); b.focus(); }
});
window.addEventListener("scroll", acoesFechar, true);
window.addEventListener("resize", acoesFechar);
(function(){
  var s = document.createElement("style");
  s.textContent =
    ".acoes-linha{display:flex;gap:6px;align-items:center;justify-content:flex-end;white-space:nowrap}" +
    ".acoes-mais{min-width:32px;font-weight:700;letter-spacing:.06em}" +
    ".acoes-mais[aria-expanded=true]{border-color:var(--accent);color:var(--accent)}" +
    ".acoes-menu{position:fixed;z-index:60;display:flex;flex-direction:column;gap:4px;min-width:132px;padding:6px;" +
      "background:var(--surface);border:1px solid var(--line);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.28)}" +
    ".acoes-menu[hidden]{display:none}" +
    ".acoes-menu .mini{text-align:left;width:100%;padding:6px 10px}" +
    "#tab-parque #invCorpo td{vertical-align:middle}";
  document.head.appendChild(s);
})();

/* ================= 6. minimizar cartões da aba Parque (v34) =================
   Rotinas, termo, cadastro de equipamento e leitor de QR ganham "minimizar":
   fica só a linha do título. O estado fica neste navegador (ctip.minimizados).
   Abrir um termo, um equipamento ou o leitor de novo expande o cartão. */
K.minimizados = "ctip.minimizados";
var MIN_CARTOES = ["rotCaixa", "termoCaixa", "invNovo", "qrCaixa"];
function minEstado(){ var m = load(K.minimizados, null); return m && typeof m === "object" ? m : {}; }
function minPintar(card){
  var m = !!minEstado()[card.id];
  card.classList.toggle("minimizado", m);
  var b = card.querySelector(":scope > .min-btn");
  if(b){ b.textContent = m ? "+ mostrar" : "− minimizar"; b.setAttribute("aria-expanded", m ? "false" : "true"); }
}
function minMudar(id, valor){
  var m = minEstado();
  if(valor) m[id] = true; else delete m[id];
  save(K.minimizados, m);
  /* leitor minimizado não fica com a câmera ligada escondida */
  if(valor && id === "qrCaixa" && typeof qrParar === "function") qrParar();
  var c = $(id); if(c) minPintar(c);
}
function minExpandir(id){ if(minEstado()[id]) minMudar(id, false); }
function minPreparar(card){
  if(!card || card.dataset.minimizavel) return;
  card.dataset.minimizavel = "1";
  card.classList.add("minimizavel");
  var poe = function(){
    if(card.querySelector(":scope > .min-btn")) return;
    var b = document.createElement("button");
    b.type = "button"; b.className = "mini min-btn";
    b.title = "Mostra só o título deste cartão";
    card.appendChild(b);
    minPintar(card);
  };
  poe();
  /* termo, cadastro e leitor redesenham o cartão inteiro: o botão volta sozinho */
  new MutationObserver(poe).observe(card, {childList: true});
  card.addEventListener("click", function(e){
    if(e.target.classList && e.target.classList.contains("min-btn")) minMudar(card.id, !card.classList.contains("minimizado"));
  });
}
(function(){
  var s = document.createElement("style");
  s.textContent =
    ".card.minimizavel{position:relative}" +
    ".card.minimizavel > :first-child{padding-right:118px}" +
    ".card.minimizavel > .min-btn{position:absolute;top:12px;right:14px;z-index:2}" +
    ".card.minimizado{padding-top:12px;padding-bottom:12px}" +
    ".card.minimizado > .min-btn{top:50%;transform:translateY(-50%)}" +
    ".card.minimizado > *:not(:first-child):not(.min-btn){display:none!important}" +
    ".card.minimizado > :first-child{margin-bottom:0!important}" +
    ".card.minimizado > :first-child button:not(.min-btn){display:none}" +
    /* kanban do parque */
    ".ik-vista{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}" +
    ".ik-vista button{border:0;border-radius:0;padding:6px 12px;background:transparent;color:var(--muted);font-size:.8rem}" +
    ".ik-vista button[aria-pressed=true]{background:var(--surface-2);color:var(--fg);font-weight:700}" +
    "#invKanban .kb-col{flex:1 0 220px}" +
    "#invKanban .kb-lista{max-height:68vh;overflow-y:auto;padding-right:2px}" +
    "#invKanban .kb-card.neutral{border-left-color:var(--muted)}" +
    ".ik-mover{margin-top:7px;width:100%;font-size:.75rem;padding:5px 7px}" +
    "@media (hover:hover) and (pointer:fine){.ik-mover{display:none}}" +
    ".ik-mais{color:var(--muted);font-size:.74rem;text-align:center;padding:6px 0}";
  document.head.appendChild(s);
})();
pqQuando(function(){
  /* o rotinas (servico.js) e o termo/leitor (este arquivo) aparecem em tempos diferentes */
  var tenta = function(n){
    MIN_CARTOES.forEach(function(id){ if($(id)) minPreparar($(id)); });
    if(n < 60 && MIN_CARTOES.some(function(id){ return !$(id); })) setTimeout(function(){ tenta(n + 1); }, 250);
  };
  tenta(0);
  /* quem abre o cartão de propósito quer vê-lo */
  var oT = termoAbrir; termoAbrir = function(){ minExpandir("termoCaixa"); return oT.apply(this, arguments); };
  if($("qrBtn")) $("qrBtn").addEventListener("click", function(){ minExpandir("qrCaixa"); }, true);
  if(typeof invNovoAbrir === "function"){ var oN = invNovoAbrir; invNovoAbrir = function(){ minExpandir("invNovo"); return oN.apply(this, arguments); }; }
  document.addEventListener("click", function(e){
    var t = e.target;
    if(t && (t.id === "rotNova" || (t.getAttribute && t.getAttribute("data-rot-editar")))) minExpandir("rotCaixa");
  }, true);
});

/* ================= 7. kanban do parque (v34) =================
   Uma coluna por Situação do inventário, na ordem das opções do portal. Usa os
   mesmos filtros e a mesma busca da lista. Arrastar um cartão (ou, no celular,
   escolher em "mover para") pergunta antes; só "Mover" grava, e grava só a
   Situação daquele equipamento (crm.item.update no 1040). */
K.parqueVista = "ctip.parqueVista";
var IK = {pend: null, ocupado: false, erro: "", arrastando: null, cols: {}};
var IK_POR_COLUNA = 80;
function ikVista(){ return load(K.parqueVista, "lista") === "kanban" ? "kanban" : "lista"; }
function ikOpcoes(){
  var m = (INV.enums && INV.enums[INV_C.status]) || {};
  return Object.keys(m).map(function(id){ return {id: id, nome: m[id]}; });
}
function ikColunas(lista){
  var cols = [], porNome = {};
  ikOpcoes().forEach(function(o){ var c = {id: o.id, nome: o.nome, itens: []}; cols.push(c); porNome[o.nome] = c; });
  lista.forEach(function(it){
    var nome = it.status || "— sem situação —";
    if(!porNome[nome]){ porNome[nome] = {id: "", nome: nome, itens: []}; cols.push(porNome[nome]); }
    porNome[nome].itens.push(it);
  });
  /* com filtro de situação ligado, só a coluna dele */
  if(invFiltro.status) cols = cols.filter(function(c){ return c.nome === invFiltro.status; });
  return cols;
}
function ikCartao(it){
  var g = invGarantia(it);
  var opcoes = ikOpcoes().filter(function(o){ return o.nome !== it.status; });
  return '<article class="kb-card ' + (invInativo(it) ? "neutral" : g.cls) + (IK.pend && String(IK.pend.id) === String(it.id) ? " pendente" : "") +
      '" data-id="' + esc(it.id) + '" tabindex="0" draggable="true" title="Clique para editar; arraste para mudar a situação">' +
    '<div class="kb-topo"><span class="kb-id">#' + esc(it.id) + '</span><span class="tag ' + g.cls + '">' + esc(g.txt) + "</span></div>" +
    '<div class="kb-titulo">' + esc(invNome(it)) + "</div>" +
    '<div class="kb-meta">' + esc(it.usuario || "sem pessoa") + "</div>" +
    '<div class="kb-pe"><span>' + esc(it.serie ? "S/N " + it.serie : "sem série") + "</span>" + (it.local ? '<span class="kb-h">' + esc(it.local) + "</span>" : "") + "</div>" +
    (opcoes.length ? '<select class="ik-mover" data-ik-mover="' + esc(it.id) + '" aria-label="Mover para outra situação"><option value="">mover para…</option>' +
      opcoes.map(function(o){ return '<option value="' + esc(o.id) + '">' + esc(o.nome) + "</option>"; }).join("") + "</select>" : "") +
    "</article>";
}
function ikPintar(){
  var q = $("invKanban"); if(!q) return;
  var kanban = ikVista() === "kanban";
  var tw = document.querySelector("#tab-parque .tablewrap");
  if(tw) tw.hidden = kanban;
  q.hidden = !kanban;
  Array.prototype.forEach.call(document.querySelectorAll("#ikVista button"), function(b){
    b.setAttribute("aria-pressed", b.getAttribute("data-vista") === ikVista() ? "true" : "false");
  });
  var cf = $("ikConfirma");
  if(!kanban || !INV.itens){ q.innerHTML = ""; cf.hidden = true; return; }
  if(IK.arrastando) return;
  var cols = ikColunas(invLista());
  IK.cols = {};
  q.innerHTML = cols.map(function(c){
    IK.cols[c.nome] = c;
    c.itens.sort(function(a, b){
      if(!a.usuario !== !b.usuario) return a.usuario ? -1 : 1;
      return (a.usuario || "").localeCompare(b.usuario || "", "pt-BR") || invNome(a).localeCompare(invNome(b), "pt-BR");
    });
    var venc = c.itens.filter(function(it){ return !invInativo(it) && invGarantia(it).chave === "vencida"; }).length;
    var fechada = /baix|doad|descart|vendid|perdid|roub|sucat|devolv/i.test(c.nome);
    return '<section class="kb-col' + (fechada ? " fechada" : "") + (IK.pend && IK.pend.para.nome === c.nome ? " destino" : "") + '" data-col="' + esc(c.nome) + '">' +
      '<header><b title="' + esc(c.nome) + '">' + esc(c.nome) + '</b><span class="cnt">' + c.itens.length + "</span>" +
        (venc ? '<span class="tag crit">' + venc + " garantia" + (venc === 1 ? "" : "s") + " vencida" + (venc === 1 ? "" : "s") + "</span>" : "") + "</header>" +
      '<div class="kb-lista">' + (c.itens.length ? c.itens.slice(0, IK_POR_COLUNA).map(ikCartao).join("") +
        (c.itens.length > IK_POR_COLUNA ? '<div class="ik-mais">e mais ' + (c.itens.length - IK_POR_COLUNA) + ": use a busca ou os filtros</div>" : "")
        : '<div class="kb-vazio">vazia</div>') + "</div></section>";
  }).join("") || '<div class="hint">Nada com esses filtros.</div>';
  cf.hidden = !IK.pend;
  if(IK.pend){
    var it = maisItem(IK.pend.id);
    $("ikPergunta").innerHTML = "Mover <b>#" + esc(IK.pend.id) + " " + esc(it ? invNome(it) : "") + "</b> de “" + esc(IK.pend.de) +
      "” para <b>“" + esc(IK.pend.para.nome) + "”</b>? Isso muda a Situação no Inventário de TI do Bitrix.";
    $("ikSim").disabled = IK.ocupado; $("ikNao").disabled = IK.ocupado;
    $("ikSim").textContent = IK.ocupado ? "Movendo…" : "Mover";
  }
  $("ikErro").hidden = !IK.erro; $("ikErro").textContent = IK.erro;
}
function ikSoltar(id, nomeColuna){
  var it = maisItem(id), col = IK.cols[nomeColuna] || ikOpcoes().filter(function(o){ return o.nome === nomeColuna; })[0];
  if(!it || !col || IK.ocupado) return;
  var de = it.status || "— sem situação —";
  if(col.nome === de) return;
  if(!col.id){ toast("Essa coluna não é uma opção de Situação do portal. Nada foi movido."); return; }
  IK.erro = "";
  IK.pend = {id: it.id, de: de, para: {id: col.id, nome: col.nome}};
}
function ikMover(){
  var p = IK.pend;
  if(!p || IK.ocupado) return;
  var it = maisItem(p.id);
  if(!it){ IK.pend = null; ikPintar(); return; }
  var m = INV.meta[INV_C.status];
  var campos = {}; campos[INV_C.status] = (m && m.multi) ? [p.para.id] : p.para.id;
  IK.ocupado = true; ikPintar();
  bitrixCall("crm.item.update", {entityTypeId: INV_TIPO, id: it.id, fields: campos}).then(function(){
    IK.ocupado = false; IK.pend = null;
    var cru = Object.assign({}, it.cru); cru[INV_C.status] = campos[INV_C.status];
    var novo = invNormalizar(cru);
    INV.itens = INV.itens.map(function(x){ return String(x.id) === String(it.id) ? novo : x; });
    toast("#" + it.id + " agora está em " + p.para.nome + ".");
    invTudo();
    invCarregar(true).then(invTudo, function(){});
  }, function(e){
    IK.ocupado = false; IK.pend = null;
    IK.erro = "O Bitrix não aceitou mover o #" + it.id + " (" + e.message + "). Ele continua em “" + p.de + "”.";
    ikPintar();
  });
}
pqQuando(function(){
  var linha = $("invContagem") && $("invContagem").parentNode;
  if(!linha) return;
  var v = document.createElement("span");
  v.className = "ik-vista"; v.id = "ikVista"; v.setAttribute("role", "group"); v.setAttribute("aria-label", "Ver como");
  v.innerHTML = '<button type="button" data-vista="lista">Lista</button><button type="button" data-vista="kanban">Kanban</button>';
  linha.insertBefore(v, linha.firstChild);
  v.addEventListener("click", function(e){
    var vista = e.target.getAttribute && e.target.getAttribute("data-vista");
    if(!vista) return;
    save(K.parqueVista, vista); IK.pend = null; IK.erro = ""; ikPintar();
  });
  var tw = document.querySelector("#tab-parque .tablewrap");
  var caixa = document.createElement("div");
  caixa.innerHTML = '<div class="kb-confirma" id="ikConfirma" role="alert" hidden><span id="ikPergunta"></span>' +
      '<button class="primary" id="ikSim" type="button">Mover</button><button class="ghost" id="ikNao" type="button">Cancelar</button></div>' +
    '<div class="aviso" id="ikErro" style="margin:0 0 12px" hidden></div>' +
    '<div class="kanban" id="invKanban" hidden></div>';
  while(caixa.firstChild) tw.parentNode.insertBefore(caixa.firstChild, tw);
  $("ikSim").addEventListener("click", ikMover);
  $("ikNao").addEventListener("click", function(){ IK.pend = null; ikPintar(); });

  var q = $("invKanban");
  var colDe = function(el){ return el && el.closest ? el.closest(".kb-col") : null; };
  var limpa = function(){ Array.prototype.forEach.call(q.querySelectorAll(".kb-col.sobre"), function(n){ n.classList.remove("sobre"); }); };
  q.addEventListener("dragstart", function(e){
    var card = e.target.closest ? e.target.closest(".kb-card") : null;
    if(!card || IK.ocupado){ e.preventDefault(); return; }
    IK.arrastando = card.dataset.id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", card.dataset.id);
    setTimeout(function(){ card.classList.add("arrastando"); }, 0);
  });
  q.addEventListener("dragover", function(e){
    var col = colDe(e.target);
    if(!IK.arrastando || !col) return;
    e.preventDefault(); e.dataTransfer.dropEffect = "move";
    if(!col.classList.contains("sobre")){ limpa(); col.classList.add("sobre"); }
  });
  q.addEventListener("dragleave", function(e){
    var col = colDe(e.target);
    if(col && !col.contains(e.relatedTarget)) col.classList.remove("sobre");
  });
  q.addEventListener("drop", function(e){
    var col = colDe(e.target);
    if(!IK.arrastando || !col) return;
    e.preventDefault();
    var id = IK.arrastando; IK.arrastando = null;
    ikSoltar(id, col.dataset.col); ikPintar();
  });
  q.addEventListener("dragend", function(){ IK.arrastando = null; limpa(); ikPintar(); });
  q.addEventListener("change", function(e){
    var id = e.target.getAttribute("data-ik-mover");
    if(!id || !e.target.value) return;
    var o = ikOpcoes().filter(function(x){ return x.id === e.target.value; })[0];
    if(o){ ikSoltar(id, o.nome); ikPintar(); }
  });
  q.addEventListener("click", function(e){
    if(e.target.closest && e.target.closest(".ik-mover")) return;
    var card = e.target.closest ? e.target.closest(".kb-card") : null;
    if(card) invEditar(card.dataset.id);
  });
  q.addEventListener("keydown", function(e){
    if(e.key !== "Enter") return;
    var card = e.target.closest ? e.target.closest(".kb-card") : null;
    if(card) invEditar(card.dataset.id);
  });

  var orig = invPintarParque;
  invPintarParque = function(){
    orig.apply(this, arguments);
    Array.prototype.forEach.call(document.querySelectorAll("#invCorpo [data-inv-editar]"), function(b){ acoesCompactar(b.parentNode); });
    ikPintar();
  };
  $("invCorpo").addEventListener("click", function(e){
    var mb = e.target.closest ? e.target.closest(".acoes-mais") : null;
    if(mb){ e.stopPropagation(); acoesMenu(mb); return; }
    if(e.target.closest && e.target.closest(".acoes-menu")) acoesFechar();
  });
  invPintarParque();
});

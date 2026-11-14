"use strict";
/* ---------------- painel ---------------- */
["jorIni","jorFim","jorDias"].forEach(function(id){
  $(id).addEventListener("change", function(){
    save(K.jornada, {ini:$("jorIni").value, fim:$("jorFim").value, dias:$("jorDias").value});
    renderPainel();
  });
});
(function(){ var j = load(K.jornada, null);
  if(j){ $("jorIni").value=j.ini; $("jorFim").value=j.fim; $("jorDias").value=j.dias; } })();

/* um chamado está fechado quando o funil diz que está, não pelo nome da etapa */
function fechado(c){
  return c.semantica === "S" || c.semantica === "F" || c.etapa === "Concluir";
}
function situacao(c){
  var s = slaDeLabel(c.prioridade) || slaDe(c.prioridade);
  /* para chamado fechado o relógio para na conclusão. Contar até agora inflava
     as horas de quem já entregou — no painel não aparecia porque concluído
     pintava de verde de qualquer jeito, mas num relatório seria número errado.
     movedTime é quando ele entrou na etapa atual; para um fechado, é o fecho. */
  var fim = (fechado(c) && c.movido) ? new Date(c.movido) : new Date();
  var gasto = horasUteis(new Date(c.aberto), fim);
  if(!s) return {cls:"neutral", txt:"sem SLA", gasto:gasto, limite:0};
  var pct = s.h ? gasto / s.h : 0;
  if(c.semantica === "S" || c.etapa === "Concluir")
    return pct >= 1
      ? {cls:"crit", txt:"concluído fora do prazo", gasto:gasto, limite:s.h}
      : {cls:"ok",   txt:"concluído", gasto:gasto, limite:s.h};
  if(c.semantica === "F")
    return {cls:"neutral", txt:"encerrado", gasto:gasto, limite:s.h};
  if(/pausa|aguardando terceiros/i.test(c.etapa || ""))
    return {cls:"neutral", txt:"pausado", gasto:gasto, limite:s.h};
  if(pct >= 1) return {cls:"crit", txt:"estourou", gasto:gasto, limite:s.h};
  if(pct >= 0.75) return {cls:"warn", txt:"perto do prazo", gasto:gasto, limite:s.h};
  return {cls:"ok", txt:"no prazo", gasto:gasto, limite:s.h};
}

/* ---------------- filtros ----------------
   Valem para a Lista e para o Dashboard ao mesmo tempo, de propósito: filtro
   que só pega numa das abas faz a outra mentir sem avisar. */
var FILTROS = {
  fltEmpresa:    function(c){ return c.empresa; },
  fltResp:       function(c){ return labelUsuario(c.responsavelId); },
  fltPrioridade: function(c){ return rotuloCurto(c.prioridade); },
  fltCategoria:  function(c){ return c.categoria; },
  fltEtapa:      function(c){ return c.etapa; }
};
function montarFiltros(){
  Object.keys(FILTROS).forEach(function(id){
    var sel = $(id); if(!sel) return;
    var atual = sel.value;
    var vistos = {};
    chamados.forEach(function(c){
      var v = FILTROS[id](c);
      if(v) vistos[v] = true;
    });
    var nomes = Object.keys(vistos).sort(function(a,b){ return a.localeCompare(b, "pt-BR"); });
    var zero = sel.querySelector('option[value=""]');
    sel.innerHTML = "";
    sel.appendChild(zero || new Option(sel.dataset.todos || "Todos", ""));
    nomes.forEach(function(n){ sel.appendChild(new Option(n, n)); });
    /* mantém a escolha mesmo que a lista tenha sido redesenhada */
    sel.value = (nomes.indexOf(atual) !== -1) ? atual : "";
  });
}
/* ---------------- parede de contadores ----------------
   Cada contador é uma pergunta sobre os chamados ABERTOS, e clicar nele vira
   filtro. São três blocos porque são três perguntas diferentes: onde o chamado
   está (Fluxo), como está o prazo (SLA) e o que está mal cadastrado (Atenção).
   Este último é o que deixa buraco no relatório semanal. */
function emPausa(c){ return /pausa|aguardando terceiros/i.test(c.etapa || ""); }
function emAtendimento(c){ return /em atendimento/i.test(c.etapa || ""); }
var TILES = [
  {g:"Fluxo", id:"afazer",   r:"A fazer",         t:function(c){ return !emPausa(c) && !emAtendimento(c); }},
  {g:"Fluxo", id:"atend",    r:"Em atendimento",  t:emAtendimento},
  {g:"Fluxo", id:"pausa",    r:"Pausados",        t:emPausa},
  {g:"Fluxo", id:"meus",     r:"Meus",            t:function(c){ return euId !== null && String(c.responsavelId) === String(euId); }},
  {g:"SLA", id:"crit",   r:"Estourados",     cor:"crit", t:function(c){ return situacao(c).cls === "crit"; }},
  {g:"SLA", id:"warn",   r:"Perto do prazo", cor:"warn", t:function(c){ return situacao(c).cls === "warn"; }},
  {g:"SLA", id:"ok",     r:"No prazo",       cor:"good", t:function(c){ return situacao(c).cls === "ok"; }},
  {g:"SLA", id:"semsla", r:"Sem SLA",        t:function(c){ return situacao(c).txt === "sem SLA"; }},
  {g:"Atenção", id:"semresp",  r:"Sem responsável",    cor:"warn", t:function(c){ return !labelUsuario(c.responsavelId); }},
  {g:"Atenção", id:"sematend", r:"Sem 1º atendimento", cor:"warn", t:function(c){ return !c.primeiroAtend; }},
  {g:"Atenção", id:"semempresa", r:"Sem empresa",      cor:"warn", t:function(c){ return !c.empresa; }},
  {g:"Atenção", id:"semprio",  r:"Sem prioridade",     cor:"warn", t:function(c){ return !c.prioridade; }}
];
var tileAtivo = null;   /* só nesta visita: filtro esquecido ligado faz o painel mentir amanhã */
function tilePorId(id){
  for(var i = 0; i < TILES.length; i++) if(TILES[i].id === id) return TILES[i];
  return null;
}

/* ---------------- busca geral ----------------
   Uma caixa só, que procura em tudo o que a lista carrega de cada chamado.
   Sem acento e sem maiúscula; com várias palavras, o chamado precisa ter todas. */
function semAcento(t){
  return String(t === null || t === undefined ? "" : t)
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
function textoDeBusca(c){
  return semAcento([c.id, c.titulo, c.solicitante, c.equipamento, c.empresa, c.categoria,
    c.subcategoria, c.etapa, labelUsuario(c.responsavelId), c.detalhes, c.resolucao]
    .filter(Boolean).join(" \n "));
}
function casaComBusca(c, busca){
  var termos = semAcento(busca).split(/\s+/).filter(Boolean);
  if(!termos.length) return true;
  var texto = textoDeBusca(c);
  return termos.every(function(t){ return texto.indexOf(t) !== -1; });
}
/* quem precisa se redesenhar junto com o painel entra aqui, em vez de o painel
   conhecer cada módulo pelo nome */
var aposPainel = [];

/* semTile: os contadores contam ignorando o próprio filtro de contador, senão
   clicar em um zeraria todos os outros */
function passaFiltros(c, semTile){
  if(!semTile && tileAtivo){
    var tl = tilePorId(tileAtivo);
    if(tl && (fechado(c) || !tl.t(c))) return false;
  }
  var ok = true;
  Object.keys(FILTROS).forEach(function(id){
    var sel = $(id);
    if(sel && sel.value && FILTROS[id](c) !== sel.value) ok = false;
  });
  if(!ok) return false;
  var busca = $("fltBusca") ? $("fltBusca").value.trim() : "";
  if(busca && !casaComBusca(c, busca)) return false;
  var sit = $("fltSituacao") ? $("fltSituacao").value : "";
  if(sit && situacao(c).cls !== sit) return false;
  return true;
}
function filtroAtivo(){
  var n = 0;
  Object.keys(FILTROS).forEach(function(id){ if($(id) && $(id).value) n++; });
  if($("fltBusca") && $("fltBusca").value.trim()) n++;
  if($("fltSituacao") && $("fltSituacao").value) n++;
  if(tileAtivo) n++;
  return n;
}
function visiveis(){
  var mostrarTodos = $("chkConcluidos") && $("chkConcluidos").checked;
  return chamados.filter(function(c){
    if(!mostrarTodos && (c.semantica === "S" || c.semantica === "F" || c.etapa === "Concluir")) return false;
    return passaFiltros(c);
  });
}
Object.keys(FILTROS).concat(["fltBusca","fltSituacao"]).forEach(function(id){
  var el = $(id);
  if(el) el.addEventListener(el.tagName === "INPUT" ? "input" : "change", renderPainel);
});
if($("fltLimpar")) $("fltLimpar").addEventListener("click", function(){
  Object.keys(FILTROS).forEach(function(id){ if($(id)) $(id).value = ""; });
  if($("fltBusca")) $("fltBusca").value = "";
  if($("fltSituacao")) $("fltSituacao").value = "";
  tileAtivo = null;
  renderPainel();
});

function renderTiles(){
  var alvo = $("kpis"); if(!alvo) return;
  var base = chamados.filter(function(c){ return !fechado(c) && passaFiltros(c, true); });
  var grupos = [], porNome = {};
  TILES.forEach(function(t){
    if(!porNome[t.g]){ porNome[t.g] = []; grupos.push(t.g); }
    porNome[t.g].push(t);
  });
  var pend = fila.filter(function(it){ return !it.chamado; }).length;
  alvo.innerHTML = grupos.map(function(g){
    var extras = g !== "Fluxo" ? "" :
      /* os dois que não são filtro: o total, que limpa o contador ativo, e a
         fila de captura, que leva para a aba dela */
      '<button type="button" class="tile' + (tileAtivo ? "" : " ativo") + (base.length ? "" : " zero") +
        '" data-tile=""><span>Abertos</span><b>' + base.length + "</b></button>";
    var fim = g !== "Fluxo" ? "" :
      '<button type="button" class="tile' + (pend ? "" : " zero") +
        '" data-ir="captura" title="Anotações que ainda não viraram chamado">' +
        "<span>Fila de captura</span><b>" + pend + "</b></button>";
    return '<div class="tile-grupo"><h4>' + esc(g) + '</h4><div class="tile-linha">' + extras +
      porNome[g].map(function(t){
        var n = base.filter(t.t).length;
        return '<button type="button" class="tile ' + (t.cor || "") + (n ? "" : " zero") +
          (tileAtivo === t.id ? " ativo" : "") + '" data-tile="' + t.id + '"' +
          ' aria-pressed="' + (tileAtivo === t.id) + '"><span>' + esc(t.r) + "</span><b>" + n + "</b></button>";
      }).join("") + fim + "</div></div>";
  }).join("");
}
if($("kpis")) $("kpis").addEventListener("click", function(e){
  var b = e.target.closest ? e.target.closest(".tile") : null;
  if(!b) return;
  if(b.dataset.ir){
    document.querySelector('nav.tabs button[data-tab="' + b.dataset.ir + '"]').click();
    return;
  }
  var id = b.dataset.tile || null;
  /* clicar de novo no contador ativo desliga o filtro */
  tileAtivo = (id && tileAtivo !== id) ? id : null;
  renderPainel();
});

/* ---------------- abas internas ----------------
   Vale para qualquer grupo .subtabs da página (o do painel e o da ficha do
   chamado): cada clique só mexe nos botões do próprio grupo. */
Array.prototype.forEach.call(document.querySelectorAll(".subtabs button"), function(b){
  b.addEventListener("click", function(){
    Array.prototype.forEach.call(b.parentNode.querySelectorAll("button"), function(o){
      o.setAttribute("aria-selected", o === b ? "true" : "false");
      var s = $("sub-" + o.dataset.sub); if(s) s.hidden = (o !== b);
    });
    if(b.dataset.sub === "dash") renderDash();
  });
});

function renderPainel(){
  montarFiltros();
  var lista = visiveis();
  var tb = $("tbChamados"); tb.innerHTML = "";
  $("painelVazio").hidden = lista.length > 0;
  lista.sort(function(a,b){
    var sa = situacao(a), sb = situacao(b);
    var pa = sa.limite ? sa.gasto/sa.limite : 0, pb = sb.limite ? sb.gasto/sb.limite : 0;
    return pb - pa;
  });
  lista.forEach(function(c){
    var s = situacao(c);
    var link = c.origem === "bitrix"
      ? '<a href="' + B.portal + '/crm/type/' + B.tipo + '/details/' + encodeURIComponent(c.id) + '/" target="_blank" rel="noopener" class="mini">abrir</a>'
      : '<span class="tag neutral">local</span>';
    var tr = document.createElement("tr");
    tr.dataset.id = c.id;
    tr.style.cursor = "pointer";
    tr.title = "Abrir para documentar";
    tr.innerHTML =
      "<td>" + esc(c.titulo || ("#" + c.id)) + (typeof selosDe === "function" ? selosDe(c) : "") + "</td>" +
      "<td>" + esc(c.empresa || "—") + "</td>" +
      "<td>" + esc(c.solicitante || "—") + "</td>" +
      "<td>" + esc(c.categoria || "—") + "</td>" +
      "<td>" + esc(rotuloCurto(c.prioridade)) + "</td>" +
      "<td>" + esc(c.etapa || "—") + "</td>" +
      "<td>" + esc(labelUsuario(c.responsavelId) || "—") + "</td>" +
      '<td class="num" title="' + esc(dataHora(c.aberto)) + '">' + esc(dataCurta(c.aberto)) + "</td>" +
      '<td class="num">' + s.gasto.toFixed(1) + " h</td>" +
      '<td class="num">' + (s.limite ? s.limite + " h" : "—") + "</td>" +
      '<td><span class="tag ' + s.cls + '">' + s.txt + "</span></td>" +
      '<td style="text-align:right">' + link + "</td>";
    tb.appendChild(tr);
  });
  renderTiles();
  if(typeof renderKanban === "function") renderKanban();

  var f = filtroAtivo();
  if($("fltResumo")) $("fltResumo").textContent = f
    ? lista.length + " de " + chamados.length + " chamados, com " +
      (f > 1 ? f + " filtros ativos." : "1 filtro ativo.")
    : "Sem filtro: mostrando tudo que foi carregado.";

  /* o dashboard lê a mesma lista filtrada, então é redesenhado junto */
  if(typeof renderDash === "function") renderDash();
  aposPainel.forEach(function(f){ f(); });
}

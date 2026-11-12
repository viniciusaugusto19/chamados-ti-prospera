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

function situacao(c){
  var s = slaDeLabel(c.prioridade) || slaDe(c.prioridade);
  var gasto = horasUteis(new Date(c.aberto), new Date());
  if(!s) return {cls:"neutral", txt:"sem SLA", gasto:gasto, limite:0};
  var pct = s.h ? gasto / s.h : 0;
  if(c.semantica === "S" || c.etapa === "Concluir")
    return {cls:"ok", txt:"concluído", gasto:gasto, limite:s.h};
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
function passaFiltros(c){
  var ok = true;
  Object.keys(FILTROS).forEach(function(id){
    var sel = $(id);
    if(sel && sel.value && FILTROS[id](c) !== sel.value) ok = false;
  });
  if(!ok) return false;
  var busca = $("fltBusca") ? $("fltBusca").value.trim().toLowerCase() : "";
  if(busca && String(c.titulo || "").toLowerCase().indexOf(busca) === -1) return false;
  var sit = $("fltSituacao") ? $("fltSituacao").value : "";
  if(sit && situacao(c).cls !== sit) return false;
  return true;
}
function filtroAtivo(){
  var n = 0;
  Object.keys(FILTROS).forEach(function(id){ if($(id) && $(id).value) n++; });
  if($("fltBusca") && $("fltBusca").value.trim()) n++;
  if($("fltSituacao") && $("fltSituacao").value) n++;
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
  renderPainel();
});

/* ---------------- abas internas do painel ---------------- */
Array.prototype.forEach.call(document.querySelectorAll(".subtabs button"), function(b){
  b.addEventListener("click", function(){
    Array.prototype.forEach.call(document.querySelectorAll(".subtabs button"), function(o){
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
  var n = {crit:0, warn:0, ok:0, pausa:0};
  lista.sort(function(a,b){
    var sa = situacao(a), sb = situacao(b);
    var pa = sa.limite ? sa.gasto/sa.limite : 0, pb = sb.limite ? sb.gasto/sb.limite : 0;
    return pb - pa;
  });
  lista.forEach(function(c){
    var s = situacao(c);
    if(s.cls==="crit") n.crit++; else if(s.cls==="warn") n.warn++; else if(s.cls==="ok") n.ok++;
    if(s.txt === "pausado") n.pausa++;
    var link = c.origem === "bitrix"
      ? '<a href="' + B.portal + '/crm/type/' + B.tipo + '/details/' + encodeURIComponent(c.id) + '/" target="_blank" rel="noopener" class="mini">abrir</a>'
      : '<span class="tag neutral">local</span>';
    var tr = document.createElement("tr");
    tr.dataset.id = c.id;
    tr.style.cursor = "pointer";
    tr.title = "Abrir para documentar";
    tr.innerHTML =
      "<td>" + esc(c.titulo || ("#" + c.id)) + "</td>" +
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
  $("kpis").innerHTML =
    '<div class="kpi"><b>' + lista.length + "</b><span>em aberto</span></div>" +
    '<div class="kpi crit"><b>' + n.crit + "</b><span>estourados</span></div>" +
    '<div class="kpi warn"><b>' + n.warn + "</b><span>perto do prazo</span></div>" +
    '<div class="kpi good"><b>' + n.ok + "</b><span>no prazo</span></div>" +
    '<div class="kpi"><b>' + n.pausa + "</b><span>pausados</span></div>" +
    '<div class="kpi"><b>' + fila.filter(function(it){ return !it.chamado; }).length +
      "</b><span>na fila de captura</span></div>";

  var f = filtroAtivo();
  if($("fltResumo")) $("fltResumo").textContent = f
    ? lista.length + " de " + chamados.length + " chamados, com " +
      (f > 1 ? f + " filtros ativos." : "1 filtro ativo.")
    : "Sem filtro: mostrando tudo que foi carregado.";

  /* o dashboard lê a mesma lista filtrada, então é redesenhado junto */
  if(typeof renderDash === "function") renderDash();
}

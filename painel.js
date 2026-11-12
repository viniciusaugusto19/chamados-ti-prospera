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
  var base = {gasto:gasto, limite:s.h};
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
function visiveis(){
  var mostrarTodos = $("chkConcluidos") && $("chkConcluidos").checked;
  return chamados.filter(function(c){
    if(mostrarTodos) return true;
    return !(c.semantica === "S" || c.semantica === "F" || c.etapa === "Concluir");
  });
}
function renderPainel(){
  var lista = visiveis();
  var tb = $("tbChamados"); tb.innerHTML = "";
  $("painelVazio").hidden = lista.length > 0;
  var n = {crit:0, warn:0, ok:0};
  lista.sort(function(a,b){
    var sa = situacao(a), sb = situacao(b);
    var pa = sa.limite ? sa.gasto/sa.limite : 0, pb = sb.limite ? sb.gasto/sb.limite : 0;
    return pb - pa;
  });
  lista.forEach(function(c){
    var s = situacao(c);
    if(s.cls==="crit") n.crit++; else if(s.cls==="warn") n.warn++; else if(s.cls==="ok") n.ok++;
    var link = c.origem === "bitrix"
      ? '<a href="' + B.portal + '/crm/type/' + B.tipo + '/details/' + encodeURIComponent(c.id) + '/" target="_blank" rel="noopener" class="mini">abrir</a>'
      : '<span class="tag neutral">local</span>';
    var tr = document.createElement("tr");
    tr.dataset.id = c.id;
    tr.style.cursor = "pointer";
    tr.title = "Abrir para documentar";
    tr.innerHTML =
      "<td>" + esc(c.titulo || ("#" + c.id)) + "</td>" +
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
    '<div class="kpi"><b>' + fila.length + "</b><span>na fila de captura</span></div>";
}

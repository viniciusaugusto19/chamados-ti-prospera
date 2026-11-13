"use strict";
/* ---------------- exportação para o relatório semanal ----------------
   Isto existe para substituir o CSV que hoje sai do próprio Bitrix. A diferença
   que justifica o trabalho: o Bitrix exporta os campos, mas não exporta horas
   úteis gastas, limite de SLA nem se o chamado foi entregue dentro do prazo —
   essas três contas moram aqui, na jornada configurada no painel.

   Dois arquivos de propósito. Misturar linha de chamado com número agregado no
   mesmo CSV dá uma planilha que o Excel abre torta e que ninguém consegue
   somar. Um arquivo é a lista, o outro é o resumo. */

/* ---------------- período ----------------
   O período vale SÓ para o export. Os outros filtros (empresa, responsável,
   prioridade, categoria, etapa, busca, situação) continuam valendo para a tela
   inteira — o painel responde "o que está aberto agora", e essa pergunta não
   tem recorte de semana. */
function periodoSel(){
  var modo = $("expPeriodo") ? $("expPeriodo").value : "sexta";
  var de, ate = new Date();
  if(modo === "custom"){
    var a = $("expDe") ? $("expDe").value : "", b = $("expAte") ? $("expAte").value : "";
    de  = a ? new Date(a + "T00:00:00") : new Date(0);
    ate = b ? new Date(b + "T23:59:59") : new Date();
  } else if(modo === "7"){
    de = new Date(); de.setHours(0,0,0,0); de.setDate(de.getDate() - 7);
  } else if(modo === "mes"){
    de = new Date(); de.setHours(0,0,0,0); de.setDate(1);
  } else if(modo === "tudo"){
    de = new Date(0);
  } else {
    /* sexta a sexta: anda para trás até cair numa sexta. Rodando numa sexta,
       isso volta 7 dias cheios — a semana que fecha hoje. */
    de = new Date(); de.setHours(0,0,0,0);
    do { de.setDate(de.getDate() - 1); } while(de.getDay() !== 5);
  }
  return {de: de, ate: ate, modo: modo};
}
function dentroDoPeriodo(iso, p){
  if(!iso) return false;
  var d = new Date(iso);
  return !isNaN(d.getTime()) && d >= p.de && d <= p.ate;
}
/* movedTime é "quando entrou na etapa atual". Para um chamado fechado, é o
   fecho. Não é um campo "data de conclusão" do portal — é o mais próximo que o
   crm.item.list entrega sem uma chamada por chamado ao histórico de etapas. */
function concluidoEm(c){ return fechado(c) ? (c.movido || null) : null; }

/* a base do export NÃO é visiveis(): aquela esconde concluído, e concluído é
   metade do que o relatório precisa. Aqui entram os filtros, e só eles. */
function baseExport(){ return chamados.filter(passaFiltros); }

function recortesDe(c, p){
  return {
    abertoAgora: !fechado(c),
    abertoNo:    dentroDoPeriodo(c.aberto, p),
    concluidoNo: fechado(c) && dentroDoPeriodo(concluidoEm(c), p)
  };
}
function recortesLigados(){
  return {
    abertoAgora: !$("expAbertos")   || $("expAbertos").checked,
    abertoNo:    !$("expNovos")     || $("expNovos").checked,
    concluidoNo: !$("expConcluidos")|| $("expConcluidos").checked
  };
}
function listaExport(p){
  var on = recortesLigados();
  return baseExport().filter(function(c){
    var r = recortesDe(c, p);
    return (on.abertoAgora && r.abertoAgora) ||
           (on.abertoNo    && r.abertoNo)    ||
           (on.concluidoNo && r.concluidoNo);
  });
}

/* ---------------- CSV ----------------
   Separador ";" e vírgula decimal porque o destino é o Excel em português, que
   com "," de separador joga tudo numa coluna só. O BOM na frente é o que
   impede o Excel de comer os acentos. */
var CSV_SEP = ";";
function csvCampo(v){
  var s = (v === null || v === undefined) ? "" : String(v);
  return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csvLinha(a){ return a.map(csvCampo).join(CSV_SEP); }
function csvNum(n, casas){
  if(n === null || n === undefined || isNaN(n)) return "";
  return n.toFixed(casas === undefined ? 1 : casas).replace(".", ",");
}
function baixarCsv(nome, linhas){
  var blob = new Blob(["﻿" + linhas.join("\r\n")], {type:"text/csv;charset=utf-8"});
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 1500);
}
function ymd(d){
  return d.getFullYear() + "-" +
         String(d.getMonth()+1).padStart(2,"0") + "-" +
         String(d.getDate()).padStart(2,"0");
}
function sufixo(p){
  return (p.modo === "tudo" ? "tudo" : ymd(p.de) + "_a_" + ymd(p.ate));
}

/* ---------------- arquivo 1: os chamados ---------------- */
var COL_CHAMADOS = ["id","titulo","empresa","solicitante","categoria","subcategoria",
  "prioridade","etapa","responsavel","aberto_em","aberto_por","ultima_mudanca_em",
  "primeiro_atend_em","horas_ate_1o_atend","concluido_em","horas_uteis","sla_horas",
  "pct_do_prazo","situacao","dentro_do_prazo","tempo_trabalhado_min",
  "idade_dias","aberto_agora","aberto_no_periodo","concluido_no_periodo","link"];

function linhaChamado(c, p){
  var s = situacao(c), r = recortesDe(c, p);
  var fim = concluidoEm(c);
  var sn = function(b){ return b ? "sim" : "não"; };
  return [
    c.id,
    c.titulo || "",
    c.empresa || "",
    c.solicitante || "",
    c.categoria || "",
    c.subcategoria || "",
    rotuloCurto(c.prioridade),
    c.etapa || "",
    labelUsuario(c.responsavelId),
    dataHora(c.aberto),
    labelUsuario(c.criadoPor),
    dataHora(c.atualizado),
    c.primeiroAtend ? dataHora(c.primeiroAtend) : "",
    /* vazio = ninguém respondeu ainda, ou o campo não foi preenchido no portal.
       Zero seria mentira nos dois casos. */
    horasAteAtender(c) === null ? "" : csvNum(horasAteAtender(c)),
    fim ? dataHora(fim) : "",
    csvNum(s.gasto),
    s.limite || "",
    s.limite ? csvNum(s.gasto / s.limite * 100, 0) : "",
    s.txt,
    s.limite ? sn(s.gasto <= s.limite) : "",   /* sem SLA não dá para dizer sim nem não */
    /* só deste navegador: o cronômetro não existe no Bitrix */
    (typeof minutosTrabalhados === "function" ? minutosTrabalhados(c.id) : 0) || "",
    csvNum(diasCorridos(c.aberto)),
    sn(r.abertoAgora), sn(r.abertoNo), sn(r.concluidoNo),
    c.origem === "bitrix" ? (B.portal + "/crm/type/" + B.tipo + "/details/" + c.id + "/") : ""
  ];
}
function exportarChamados(){
  var p = periodoSel(), lista = listaExport(p);
  if(!lista.length){ toast("Nenhum chamado nesse recorte."); return; }
  lista.sort(function(a,b){ return idNum(b.id) - idNum(a.id); });
  var L = [csvLinha(COL_CHAMADOS)];
  lista.forEach(function(c){ L.push(csvLinha(linhaChamado(c, p))); });
  baixarCsv("chamados-ti_" + sufixo(p) + ".csv", L);
  toast(lista.length + " chamados exportados.");
}

/* ---------------- arquivo 2: o resumo ----------------
   Retangular de propósito: contexto, resumo e quebras usam as mesmas sete
   colunas. CSV com blocos de larguras diferentes quebra na importação. */
var COL_RESUMO = ["bloco","item","valor","estourados","perto_do_prazo","no_prazo","sem_sla_ou_pausado"];

function contarCls(lista){
  var n = {crit:0, warn:0, ok:0, neutral:0};
  lista.forEach(function(c){ var k = situacao(c).cls; if(n[k] !== undefined) n[k]++; });
  return n;
}
function linhaGrupo(bloco, rotulo, itens){
  var n = contarCls(itens);
  return csvLinha([bloco, rotulo, itens.length, n.crit, n.warn, n.ok, n.neutral]);
}
function blocoGrupos(L, bloco, grupos){
  if(!grupos.length){ L.push(csvLinha([bloco, "— nenhum —", 0, "", "", "", ""])); return; }
  grupos.forEach(function(g){ L.push(linhaGrupo(bloco, g.rotulo, g.itens)); });
}
/* mediana, não média: um chamado esquecido por três semanas puxa a média para
   um número que não descreve nenhum atendimento real */
function mediana(ns){
  var v = ns.slice().sort(function(a,b){ return a - b; });
  if(!v.length) return 0;
  var m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m-1] + v[m]) / 2;
}
function pctTexto(parte, total){
  if(!total) return "—";
  return (parte / total * 100).toFixed(0).replace(".", ",") + "%";
}
function filtrosEmTexto(){
  var ps = [];
  Object.keys(FILTROS).forEach(function(id){
    var sel = $(id);
    if(sel && sel.value) ps.push((sel.dataset.nome || id) + " = " + sel.value);
  });
  if($("fltBusca") && $("fltBusca").value.trim()) ps.push('busca = "' + $("fltBusca").value.trim() + '"');
  if($("fltSituacao") && $("fltSituacao").value) ps.push("situação = " + $("fltSituacao").value);
  return ps.length ? ps.join(" · ") : "nenhum";
}

function exportarResumo(){
  var p = periodoSel(), base = baseExport();
  var abertos  = base.filter(function(c){ return !fechado(c); });
  var abertoNo = base.filter(function(c){ return dentroDoPeriodo(c.aberto, p); });
  var conclNo  = base.filter(function(c){ return fechado(c) && dentroDoPeriodo(concluidoEm(c), p); });
  /* a métrica do padrão: dos que foram ENTREGUES na semana, quantos couberam no
     prazo. Quem não tem SLA definido fica fora da conta em vez de contar como
     acerto — senão a prioridade sem SLA inflaria o indicador. */
  var comSla   = conclNo.filter(function(c){ return situacao(c).limite; });
  var noPrazo  = comSla.filter(function(c){ var s = situacao(c); return s.gasto <= s.limite; });
  var n = contarCls(abertos);

  var L = [csvLinha(COL_RESUMO)];
  var ctx = function(k, v){ L.push(csvLinha(["Contexto", k, v, "", "", "", ""])); };
  var res = function(k, v){ L.push(csvLinha(["Resumo", k, v, "", "", "", ""])); };
  var j = jornada();

  ctx("Período", dataHora(p.de) + " até " + dataHora(p.ate));
  ctx("Gerado em", dataHora(new Date()));
  ctx("Dados lidos do Bitrix em", dashUltima ? dataHora(dashUltima) : "não carregado nesta sessão");
  ctx("Filtros aplicados", filtrosEmTexto());
  ctx("Jornada usada no cálculo", j.ini.h + "h às " + j.fim.h + "h, dias " + j.dias +
      (j.almoco ? ", menos 1h de intervalo" : ""));
  ctx("Base considerada", base.length + " chamados lidos");

  res("Abertos agora", abertos.length);
  res("Abertos no período", abertoNo.length);
  res("Concluídos no período", conclNo.length);
  res("Saldo do período (abertos - concluídos)", abertoNo.length - conclNo.length);
  res("Estourados agora", n.crit);
  res("Perto do prazo agora", n.warn);
  res("No prazo agora", n.ok);
  res("Sem SLA ou pausados agora", n.neutral);
  res("Concluídos no período com SLA definido", comSla.length);
  res("Concluídos no período dentro do prazo", noPrazo.length);
  res("% dentro do prazo (meta 90%)", pctTexto(noPrazo.length, comSla.length));
  /* a régua do primeiro atendimento, que a resolução não mostra */
  var semAtend = abertos.filter(function(c){ return horasAteAtender(c) === null; });
  var comAtend = base.filter(function(c){ return horasAteAtender(c) !== null; });
  res("Abertos que ninguém atendeu ainda", semAtend.length);
  res("Mediana de horas até o 1º atendimento", comAtend.length
    ? csvNum(mediana(comAtend.map(horasAteAtender))) : "—");
  var min = base.reduce(function(t, c){
    return t + (typeof minutosTrabalhados === "function" ? minutosTrabalhados(c.id) : 0);
  }, 0);
  res("Tempo cronometrado neste navegador (min)", min || "—");

  blocoGrupos(L, "Abertos por pessoa",     agrupar(abertos, function(c){ return labelUsuario(c.responsavelId); }));
  blocoGrupos(L, "Abertos por etapa",      agrupar(abertos, function(c){ return c.etapa; }));
  blocoGrupos(L, "Abertos por prioridade", agrupar(abertos, function(c){ return rotuloCurto(c.prioridade); }));
  blocoGrupos(L, "Abertos por empresa",    agrupar(abertos, function(c){ return c.empresa; }));
  blocoGrupos(L, "Abertos por categoria",  agrupar(abertos, function(c){ return c.categoria; }));

  /* idade em dias de calendário, na ordem das faixas — aqui a ordem é a
     informação, por isso não passa pelo agrupar(), que reordena por volume */
  var faixas = [
    {r:"menos de 1 dia", t:function(d){ return d < 1; }},
    {r:"1 a 3 dias",     t:function(d){ return d >= 1 && d < 3; }},
    {r:"3 a 7 dias",     t:function(d){ return d >= 3 && d < 7; }},
    {r:"7 a 30 dias",    t:function(d){ return d >= 7 && d < 30; }},
    {r:"mais de 30 dias",t:function(d){ return d >= 30; }}
  ];
  faixas.forEach(function(f){
    L.push(linhaGrupo("Abertos por idade", f.r,
      abertos.filter(function(c){ return f.t(diasCorridos(c.aberto)); })));
  });

  /* primeiro atendimento também vai em faixa, na ordem delas */
  FAIXAS_ATEND.forEach(function(f){
    L.push(linhaGrupo("Primeiro atendimento", f.r,
      abertos.filter(function(c){ return f.t(horasAteAtender(c)); })));
  });

  blocoGrupos(L, "Concluídos no período por pessoa",
    agrupar(conclNo, function(c){ return labelUsuario(c.responsavelId); }));
  blocoGrupos(L, "Concluídos no período por categoria",
    agrupar(conclNo, function(c){ return c.categoria; }));
  blocoGrupos(L, "Abertos no período por categoria",
    agrupar(abertoNo, function(c){ return c.categoria; }));

  baixarCsv("resumo-ti_" + sufixo(p) + ".csv", L);
  toast("Resumo exportado.");
}

/* ---------------- o que a pessoa vê antes de clicar ----------------
   Mostrar os números e as datas exatas aqui não é enfeite: é o que permite
   conferir o recorte antes de o arquivo virar anexo de um relatório. */
function pintarExport(){
  var alvo = $("expResumoTxt");
  if(!alvo) return;
  var custom = $("expPeriodo") && $("expPeriodo").value === "custom";
  if($("expDe"))  $("expDe").hidden  = !custom;
  if($("expAte")) $("expAte").hidden = !custom;

  var p = periodoSel(), base = baseExport();
  var nAb = base.filter(function(c){ return !fechado(c); }).length;
  var nNo = base.filter(function(c){ return dentroDoPeriodo(c.aberto, p); }).length;
  var nCo = base.filter(function(c){ return fechado(c) && dentroDoPeriodo(concluidoEm(c), p); }).length;
  var sel = listaExport(p).length;
  var faixa = p.modo === "tudo" ? "tudo que foi carregado"
            : dataHora(p.de) + " até " + dataHora(p.ate);
  alvo.innerHTML =
    "Período: <b>" + esc(faixa) + "</b>. " +
    "Nesse recorte: " + nAb + " abertos agora, " + nNo + " abertos no período, " +
    nCo + " concluídos no período. " +
    "<b>" + sel + "</b> " + (sel === 1 ? "chamado sai" : "chamados saem") + " no arquivo de lista. " +
    "Os filtros do painel também valem aqui (" + esc(filtrosEmTexto()) + ").";
}

["expPeriodo","expDe","expAte","expAbertos","expNovos","expConcluidos"].forEach(function(id){
  var el = $(id);
  if(el) el.addEventListener("change", pintarExport);
});
if($("btnExpChamados")) $("btnExpChamados").addEventListener("click", exportarChamados);
if($("btnExpResumo"))   $("btnExpResumo").addEventListener("click", exportarResumo);

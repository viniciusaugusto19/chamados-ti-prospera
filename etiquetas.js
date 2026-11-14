"use strict";
/* ---------------- etiquetas automáticas ----------------
   Dois selos que a página põe sozinha no chamado, por regra à vista:

   reincidente — o mesmo equipamento, ou o mesmo solicitante, abriu 3 ou mais
                 chamados nos últimos 30 dias. Um chamado sozinho não diz nada;
                 o terceiro do mesmo notebook no mês diz que consertar de novo
                 não é a resposta.
   parado      — está aberto, não está em pausa, e ninguém mexeu nele há 3 dias
                 úteis. É diferente de SLA estourado: pode estar no prazo e
                 esquecido.

   Equipamento e solicitante são texto livre no Bitrix, então "o mesmo" aqui é o
   mesmo texto, sem acento e sem maiúscula. "Notebook do Max" e "note Max" não se
   encontram — a regra só funciona na medida em que o campo é preenchido igual. */

var ETQ_DIAS = 30;       /* janela da reincidência */
var ETQ_MINIMO = 3;      /* a partir de quantos chamados vira reincidente */
var ETQ_PARADO_H = 24;   /* horas úteis sem mudança: 3 dias de 8h */

var etqMemo = {base: null, n: 0, eq: {}, sol: {}};

function etqChave(t){ return semAcento(t).replace(/\s+/g, " ").trim(); }
/* refeito só quando a lista de chamados é trocada, não a cada linha desenhada */
function etqIndice(){
  if(etqMemo.base === chamados && etqMemo.n === chamados.length) return etqMemo;
  var corte = Date.now() - ETQ_DIAS * 86400000, eq = {}, sol = {};
  chamados.forEach(function(c){
    var t = new Date(c.aberto).getTime();
    if(isNaN(t) || t < corte) return;
    var ke = etqChave(c.equipamento), ks = etqChave(c.solicitante);
    if(ke.length >= 3) (eq[ke] = eq[ke] || []).push(c);
    if(ks.length >= 3) (sol[ks] = sol[ks] || []).push(c);
  });
  etqMemo = {base: chamados, n: chamados.length, eq: eq, sol: sol};
  return etqMemo;
}
/* null, ou por que este chamado é reincidente */
function etqReincidencia(c){
  var i = etqIndice();
  var e = i.eq[etqChave(c.equipamento)], s = i.sol[etqChave(c.solicitante)];
  if(e && e.length >= ETQ_MINIMO && e.indexOf(c) !== -1) return {por: "equipamento", nome: c.equipamento, n: e.length};
  if(s && s.length >= ETQ_MINIMO && s.indexOf(c) !== -1) return {por: "solicitante", nome: c.solicitante, n: s.length};
  return null;
}
/* 0, ou há quantas horas úteis ninguém mexe */
function etqParado(c){
  if(fechado(c) || emPausa(c) || !c.atualizado) return 0;
  var d = new Date(c.atualizado);
  if(isNaN(d.getTime())) return 0;
  var h = horasUteis(d, new Date());
  return h >= ETQ_PARADO_H ? h : 0;
}
function selosDe(c){
  var out = "", r = etqReincidencia(c), p = etqParado(c);
  if(r) out += ' <span class="tag warn" title="' + esc(r.n + " chamados do mesmo " + r.por + " (" + r.nome + ") em " + ETQ_DIAS + " dias") +
               '">reincidente</span>';
  if(p) out += ' <span class="tag neutral" title="' + esc("Sem nenhuma mudança há " + Math.floor(p / 8) + " dias úteis") +
               '">parado</span>';
  return out;
}

/* os dois viram contador na parede, no bloco Atenção */
TILES.push({g: "Atenção", id: "reinc",  r: "Reincidentes", cor: "warn", t: function(c){ return !!etqReincidencia(c); }});
TILES.push({g: "Atenção", id: "parado", r: "Parados há 3 dias", cor: "warn", t: function(c){ return etqParado(c) > 0; }});

/* ---------------- quem mais abre chamado ----------------
   No dashboard: os equipamentos e os solicitantes com mais chamados na janela,
   contando os já concluídos — é justamente o que foi resolvido várias vezes que
   interessa. Respeita os filtros do painel. */
function pintarReincidencia(){
  if(!$("dashReincEq")) return;
  var corte = Date.now() - ETQ_DIAS * 86400000;
  var base = chamados.filter(function(c){
    var t = new Date(c.aberto).getTime();
    return !isNaN(t) && t >= corte && passaFiltros(c);
  });
  function top(campo){
    var m = {};
    base.forEach(function(c){
      var k = etqChave(c[campo]);
      if(k.length < 3) return;
      (m[k] = m[k] || {rotulo: c[campo], itens: []}).itens.push(c);
    });
    return Object.keys(m).map(function(k){ return m[k]; })
      .filter(function(g){ return g.itens.length >= 2; })
      .sort(function(a, b){ return b.itens.length - a.itens.length; });
  }
  pintarGrupos("dashReincEq", top("equipamento"), "Nenhum equipamento com mais de um chamado em " + ETQ_DIAS + " dias.");
  pintarGrupos("dashReincSol", top("solicitante"), "Nenhum solicitante com mais de um chamado em " + ETQ_DIAS + " dias.");
  var semEq = base.filter(function(c){ return etqChave(c.equipamento).length < 3; }).length;
  $("dashReincNota").textContent = base.length
    ? semEq + " de " + base.length + " chamados dos últimos " + ETQ_DIAS + " dias estão sem equipamento preenchido" +
      (semEq === base.length ? ": por isso a lista de equipamentos está vazia." : ".")
    : "";
}
aposPainel.push(pintarReincidencia);

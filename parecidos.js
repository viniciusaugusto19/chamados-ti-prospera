"use strict";
/* ---------------- já aconteceu antes ----------------
   Ao abrir um chamado, mostra os parecidos entre os que a página já carregou,
   com a resolução que foi escrita em cada um. A pergunta que responde é "como
   resolvemos isso da outra vez?".

   Parecido aqui é conta simples e à vista: palavras do nome em comum, mesma
   subcategoria, mesma categoria. Não é busca no portal inteiro nem
   entendimento do texto — por isso cada linha diz por que entrou.

   Só lê. A resolução dos parecidos é buscada um a um, e só dos poucos que
   entram na lista. */

var PC_MAX = 5;
/* palavras que aparecem em qualquer chamado de TI e por isso não aproximam dois */
var PC_VAZIAS = {};
("de do da dos das para por com sem que nao uma uns umas nos nas num numa pelo pela aos " +
 "esta estao foi ser ter tem mais muito como quando onde meu minha seu sua ele ela isso este essa " +
 "problema problemas erro erros ajuda favor urgente chamado chamados solicitacao suporte preciso " +
 "funciona funcionando consegue consigo fazer novo nova")
  .split(" ").forEach(function(p){ PC_VAZIAS[p] = true; });

var pcCache = {};          /* id -> {texto} | {erro}: resolução já buscada nesta visita */
var pc = {id: null, itens: []};
var pcSeq = 0;

function pcChamado(){ var s = $("dChamado"); return s && s.value ? s.value : null; }
function pcPalavras(t){
  var vistas = {}, out = [];
  String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .split(/[^a-z0-9]+/).forEach(function(p){
      if(p.length < 3 || PC_VAZIAS[p] || vistas[p]) return;
      vistas[p] = true; out.push(p);
    });
  return out;
}
function pcChave(t){
  return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\s+/g, " ").trim();
}
/* quantos chamados carregados têm o mesmo equipamento e o mesmo solicitante */
function pcResumo(id){
  var atual = null;
  chamados.forEach(function(c){ if(String(c.id) === String(id)) atual = c; });
  if(!atual) return "";
  var ke = pcChave(atual.equipamento), ks = pcChave(atual.solicitante), ne = 0, ns = 0;
  chamados.forEach(function(c){
    if(ke.length >= 3 && pcChave(c.equipamento) === ke) ne++;
    if(ks.length >= 3 && pcChave(c.solicitante) === ks) ns++;
  });
  var p = [];
  if(ne) p.push("Equipamento “" + atual.equipamento + "”: " + ne + (ne === 1 ? " chamado" : " chamados") + " entre os carregados");
  if(ns) p.push("Solicitante " + atual.solicitante + ": " + ns + (ns === 1 ? " chamado" : " chamados"));
  if(!ke) p.push("Este chamado está sem equipamento preenchido, então não dá para ver o histórico do aparelho");
  return p.join(" · ") + ".";
}
function pcParecidos(id){
  var atual = null;
  chamados.forEach(function(c){ if(String(c.id) === String(id)) atual = c; });
  if(!atual) return [];
  var minhas = pcPalavras(atual.titulo);
  var meuEq = pcChave(atual.equipamento);
  var achados = [];
  chamados.forEach(function(c){
    if(String(c.id) === String(id)) return;
    var dele = pcPalavras(c.titulo);
    var comuns = minhas.filter(function(p){ return dele.indexOf(p) !== -1; });
    var sub = !!atual.subcategoria && atual.subcategoria === c.subcategoria;
    var cat = !!atual.categoria && atual.categoria === c.categoria;
    /* mesmo equipamento pesa mais que tudo: é o defeito voltando */
    var eq = meuEq.length >= 3 && meuEq === pcChave(c.equipamento);
    /* só categoria igual não basta: metade dos chamados cai na mesma */
    if(!comuns.length && !sub && !eq) return;
    achados.push({c: c, comuns: comuns, sub: sub, cat: cat, eq: eq,
                  pontos: comuns.length * 2 + (sub ? 2 : 0) + (cat ? 1 : 0) + (eq ? 5 : 0)});
  });
  achados.sort(function(a, b){
    if(b.pontos !== a.pontos) return b.pontos - a.pontos;
    /* empate: quem já foi resolvido ensina mais do que quem ainda está aberto */
    var fa = fechado(a.c) ? 1 : 0, fb = fechado(b.c) ? 1 : 0;
    if(fb !== fa) return fb - fa;
    return idNum(b.c.id) - idNum(a.c.id);
  });
  return achados.slice(0, PC_MAX);
}
function pcResolucao(c){
  if(c.origem !== "bitrix"){
    pcCache[c.id] = {texto: (c.doc && c.doc.resolucao) || ""};
    return Promise.resolve();
  }
  if(pcCache[c.id]) return Promise.resolve();
  /* a lista do painel já traz a resolução; só busca um a um o que ficou
     guardado de antes de ela trazer */
  if(typeof c.resolucao === "string"){
    pcCache[c.id] = {texto: c.resolucao.trim()};
    return Promise.resolve();
  }
  return bitrixCall("crm.item.get", {entityTypeId: B.tipo, id: c.id}).then(function(j){
    var it = (j.result && j.result.item) ? j.result.item : {};
    pcCache[c.id] = {texto: String(it[B.campo.resolucao] || "").trim()};
  }, function(e){
    /* não guarda a falha: a próxima abertura tenta de novo */
    pcCache[c.id] = {erro: e.message, tentarDeNovo: true};
  });
}
function pcCarregar(){
  var id = pcChamado();
  var seq = ++pcSeq;
  pc = {id: id, itens: id ? pcParecidos(id) : []};
  pintarParecidos();
  if(!pc.itens.length) return;
  var podeLer = !!load(K.wh, "");
  pc.itens.reduce(function(p, a){
    return p.then(function(){
      if(seq !== pcSeq) return;
      if(pcCache[a.c.id] && pcCache[a.c.id].tentarDeNovo) delete pcCache[a.c.id];
      if(a.c.origem === "bitrix" && !podeLer){ pcCache[a.c.id] = {erro: "sem webhook", tentarDeNovo: true}; return; }
      return pcResolucao(a.c).then(function(){ if(seq === pcSeq) pintarParecidos(); });
    });
  }, Promise.resolve());
}

function pintarParecidos(){
  var ul = $("pcLista");
  if(!ul) return;
  var id = pcChamado();
  var itens = (id && pc.id === id) ? pc.itens : [];
  ul.innerHTML = itens.map(function(a){
    var c = a.c, r = pcCache[c.id];
    var porque = [];
    if(a.eq) porque.push("mesmo equipamento");
    if(a.comuns.length) porque.push("em comum no nome: " + a.comuns.join(", "));
    if(a.sub) porque.push("mesma subcategoria");
    else if(a.cat) porque.push("mesma categoria");
    var estado = fechado(c)
      ? "concluído" + (c.movido ? " em " + dataCurta(c.movido) : "")
      : "ainda aberto · " + (c.etapa || "sem etapa");
    var quem = labelUsuario(c.responsavelId);
    var corpo;
    if(!r) corpo = '<div class="cm-txt" style="color:var(--muted)">Buscando a resolução…</div>';
    else if(r.erro) corpo = '<div class="cm-txt" style="color:var(--muted)">Não consegui ler a resolução (' + esc(r.erro) + ").</div>";
    else if(!r.texto) corpo = '<div class="cm-txt" style="color:var(--muted)">' +
      (fechado(c) ? "Foi concluído sem resolução escrita." : "Ainda sem resolução escrita.") + "</div>";
    else corpo = '<div class="cm-txt">' + esc(r.texto) + "</div>";
    return "<li>" +
      '<div class="cm-topo"><b>' + (c.origem === "bitrix" ? "#" + esc(c.id) + " " : "") + esc(c.titulo || "") + "</b>" +
        "<span>" + esc(estado + (quem ? " · " + quem : "")) + "</span></div>" +
      corpo +
      '<div class="hint">' + esc(porque.join(" · ")) + "</div>" +
      '<div class="row-end" style="justify-content:flex-start;margin-top:8px">' +
        (r && r.texto ? '<button class="mini" type="button" data-usar="' + esc(c.id) + '">Usar como base da resolução</button>' : "") +
        '<button class="mini" type="button" data-abrir="' + esc(c.id) + '">Abrir este chamado</button>' +
      "</div></li>";
  }).join("");
  if($("cntParecidos")){
    $("cntParecidos").textContent = itens.length || "";
    $("cntParecidos").className = itens.length ? "pill" : "";
  }
  $("pcVazio").hidden = itens.length > 0;
  if($("pcResumo")) $("pcResumo").textContent = (id && pc.id === id) ? pcResumo(id) : "";
}

if($("pcLista")){
  $("pcLista").addEventListener("click", function(e){
    var usar = e.target.getAttribute("data-usar"), abrir = e.target.getAttribute("data-abrir");
    if(usar && pcCache[usar] && pcCache[usar].texto){
      /* acrescenta, nunca troca: o que já estava escrito na resolução fica */
      var ta = $("dResolucao"), antes = ta.value.trim();
      ta.value = (antes ? antes + "\n\n" : "") + pcCache[usar].texto;
      document.querySelector('.subtabs button[data-sub="fdoc"]').click();
      ta.focus();
      toast("Copiado para a Resolução. Ajuste o texto e clique em Salvar.");
    }
    if(abrir){
      $("dChamado").value = abrir;
      carregarItem(abrir);
      window.scrollTo(0, 0);
    }
  });
  $("dChamado").addEventListener("change", pcCarregar);
  /* mesmo motivo das tarefas: a linha do painel e o cartão do kanban trocam o
     seletor sem disparar "change" */
  setInterval(function(){
    var aba = document.querySelector('nav.tabs button[data-tab="documentar"]');
    if(!aba || aba.getAttribute("aria-selected") !== "true") return;
    if(pcChamado() !== pc.id) pcCarregar();
  }, 400);
  pintarParecidos();
}

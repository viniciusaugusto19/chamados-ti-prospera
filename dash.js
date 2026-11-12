"use strict";
/* ---------------- dashboard ao vivo ----------------
   Lê exatamente a mesma lista filtrada do painel. Nada aqui busca dados por
   conta própria: quem busca é carregarChamados(), e o relógio só decide
   quando pedir de novo. */
var DASH_SEG = 60;          /* de quanto em quanto tempo volta ao Bitrix */
var dashPausado = false;
var dashSeg = 0;
var dashUltima = null;      /* quando os dados foram lidos do portal */

function dashVisivel(){
  var s = $("sub-dash");
  var aba = document.querySelector('nav.tabs button[data-tab="painel"]');
  return !!(s && !s.hidden && aba && aba.getAttribute("aria-selected") === "true");
}
function agrupar(lista, fn){
  var m = {};
  lista.forEach(function(c){
    var k = fn(c);
    k = (k === undefined || k === null || k === "") ? "— sem valor —" : String(k);
    (m[k] = m[k] || []).push(c);
  });
  return Object.keys(m).map(function(k){ return {rotulo:k, itens:m[k]}; })
                       .sort(function(a,b){ return b.itens.length - a.itens.length; });
}
/* barra com os pedaços coloridos por situação de SLA: o tamanho diz volume,
   a cor diz risco. Uma pessoa com 8 chamados todos no prazo e outra com 4
   estourados não podem desenhar a mesma coisa. */
function linhaBarra(g, maior){
  var n = {crit:0, warn:0, ok:0, neutral:0};
  g.itens.forEach(function(c){ n[situacao(c).cls]++; });
  var larg = maior ? (g.itens.length / maior * 100) : 0;
  var segs = ["crit","warn","ok","neutral"].filter(function(k){ return n[k]; })
    .map(function(k){
      return '<span class="seg ' + k + '" style="flex:' + n[k] +
             '" title="' + n[k] + " " + rotuloSit(k) + '"></span>';
    }).join("");
  return '<li><span class="bl" title="' + esc(g.rotulo) + '">' + esc(g.rotulo) + "</span>" +
         '<span class="bw"><span class="bar" style="width:' + larg.toFixed(1) + '%">' +
         segs + "</span></span>" +
         '<span class="bn">' + g.itens.length + "</span></li>";
}
function rotuloSit(cls){
  return cls === "crit" ? "estourado" : cls === "warn" ? "perto do prazo"
       : cls === "ok" ? "no prazo" : "sem SLA ou pausado";
}
function pintarGrupos(alvoId, grupos, vazio){
  var alvo = $(alvoId); if(!alvo) return;
  if(!grupos.length){ alvo.innerHTML = '<div class="vazio-mini">' + vazio + "</div>"; return; }
  var maior = grupos[0].itens.length;
  alvo.innerHTML = grupos.slice(0, 10).map(function(g){ return linhaBarra(g, maior); }).join("");
}
/* horas úteis que faltam (negativo = já passou do prazo) */
function restanteUteis(c){
  var s = situacao(c);
  return s.limite ? s.limite - s.gasto : null;
}
function textoRestante(h){
  if(h === null) return "sem SLA";
  var v = Math.abs(h);
  var txt = v >= 10 ? v.toFixed(0) : v.toFixed(1);
  return h < 0 ? "estourou há " + txt + "h úteis" : "faltam " + txt + "h úteis";
}
function diasCorridos(iso){
  var d = new Date(iso);
  if(isNaN(d.getTime())) return 0;
  return (Date.now() - d.getTime()) / 86400000;
}

function renderDash(){
  if(!$("sub-dash")) return;
  var lista = visiveis();

  /* 1. carga por pessoa */
  pintarGrupos("dashPessoas",
    agrupar(lista, function(c){ return labelUsuario(c.responsavelId); }),
    "Ninguém com chamado aberto nesse filtro.");

  /* 2. onde a fila entope: etapa e prioridade */
  pintarGrupos("dashEtapas", agrupar(lista, function(c){ return c.etapa; }),
    "Nenhuma etapa com chamado.");
  pintarGrupos("dashPrioridades", agrupar(lista, function(c){ return rotuloCurto(c.prioridade); }),
    "Nenhuma prioridade com chamado.");

  /* 3. fila de risco: o que atacar agora, do pior para o melhor */
  var risco = lista.map(function(c){ return {c:c, r:restanteUteis(c), s:situacao(c)}; })
    .filter(function(x){ return x.r !== null && x.s.cls !== "neutral"; })
    .sort(function(a,b){ return a.r - b.r; })
    .slice(0, 12);
  var alvo = $("dashRisco");
  if(alvo){
    $("cntRisco").textContent = risco.length;
    alvo.innerHTML = risco.length ? risco.map(function(x){
      return '<li class="' + x.s.cls + '">' +
        '<span class="rk-t" title="' + esc(x.c.titulo || "") + '">' + esc(x.c.titulo || ("#" + x.c.id)) + "</span>" +
        '<span class="rk-q">' + esc(labelUsuario(x.c.responsavelId) || "sem responsável") + "</span>" +
        '<span class="rk-p">' + esc(rotuloCurto(x.c.prioridade)) + "</span>" +
        '<span class="rk-r">' + esc(textoRestante(x.r)) + "</span>" +
        "</li>";
    }).join("") : '<div class="vazio-mini">Nada com prazo em risco nesse filtro.</div>';
  }

  /* 4. idade e volume. Idade vai em dias de calendário, não em horas úteis:
        aqui a pergunta é "há quanto tempo isso está parado na mão de alguém",
        e para essa pergunta fim de semana conta. */
  var faixas = [
    {r:"menos de 1 dia", t:function(d){ return d < 1; }},
    {r:"1 a 3 dias",     t:function(d){ return d >= 1 && d < 3; }},
    {r:"3 a 7 dias",     t:function(d){ return d >= 3 && d < 7; }},
    {r:"7 a 30 dias",    t:function(d){ return d >= 7 && d < 30; }},
    {r:"mais de 30 dias",t:function(d){ return d >= 30; }}
  ];
  var porIdade = faixas.map(function(f){
    return {rotulo:f.r, itens: lista.filter(function(c){ return f.t(diasCorridos(c.aberto)); })};
  }).filter(function(g){ return g.itens.length; });
  /* esta é a única que não reordena por volume: a ordem das faixas é a informação */
  var alvoI = $("dashIdade");
  if(alvoI){
    var maiorI = porIdade.reduce(function(m,g){ return Math.max(m, g.itens.length); }, 0);
    alvoI.innerHTML = porIdade.length
      ? porIdade.map(function(g){ return linhaBarra(g, maiorI); }).join("")
      : '<div class="vazio-mini">Nenhum chamado nesse filtro.</div>';
  }
  pintarGrupos("dashEmpresas", agrupar(lista, function(c){ return c.empresa; }),
    "Nenhuma empresa com chamado.");
  pintarGrupos("dashCategorias", agrupar(lista, function(c){ return c.categoria; }),
    "Nenhuma categoria com chamado.");

  if($("dashLidoEm")) $("dashLidoEm").textContent = dashUltima
    ? dashUltima.toLocaleTimeString("pt-BR", {hour:"2-digit", minute:"2-digit", second:"2-digit"})
    : "ainda não";
}

/* ---------------- relógio ----------------
   Um único setInterval de 1s cuida de três coisas com ritmos diferentes:
   o contador na tela (1s), o recálculo do tempo decorrido (10s, porque SLA é
   contado em horas e não vale redesenhar tudo a cada segundo) e a releitura
   no Bitrix (DASH_SEG). Só anda com a aba aberta: dash escondido não gasta
   chamada de API nem bateria. */
setInterval(function(){
  if($("dashConta")) $("dashConta").textContent = dashPausado ? "pausado" : (DASH_SEG - (dashSeg % DASH_SEG)) + "s";
  if(!dashVisivel() || dashPausado) return;
  dashSeg++;
  if(dashSeg % 10 === 0) renderDash();
  if(dashSeg % DASH_SEG === 0){
    if(load(K.wh, "")) carregarChamados();   /* ele chama renderPainel, que chama renderDash */
    else renderDash();
  }
}, 1000);

if($("dashPausar")) $("dashPausar").addEventListener("click", function(){
  dashPausado = !dashPausado;
  this.textContent = dashPausado ? "Retomar" : "Pausar";
  $("dashVivo").classList.toggle("off", dashPausado);
  /* sem esperar o próximo segundo: quem clicou tem de ver que parou */
  $("dashConta").textContent = dashPausado ? "pausado" : DASH_SEG + "s";
  if(!dashPausado){ dashSeg = 0; renderDash(); }
});
if($("dashAgora")) $("dashAgora").addEventListener("click", function(){
  dashSeg = 0;
  if(load(K.wh, "")) carregarChamados(); else renderDash();
});

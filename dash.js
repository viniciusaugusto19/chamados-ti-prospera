"use strict";
/* ---------------- dashboard ao vivo ----------------
   Lê exatamente a mesma lista filtrada do painel. Nada aqui busca dados por
   conta própria: quem busca é carregarChamados(), e o relógio só decide
   quando pedir de novo. */
var DASH_SEG = 60;          /* intervalo com a janela à frente */
var DASH_BG  = 180;         /* e com ela minimizada ou atrás de outra coisa */
var dashSeg = 0;            /* segundos desde a última leitura */
var tick = 0;
var dashUltima = null;      /* quando os dados foram lidos do portal */
/* vigiar é o interruptor único: o botão Pausar do dash e a caixa de seleção
   lá em cima mexem no mesmo estado, e ele sobrevive ao F5 */
var vigiando = load(K.vigiar, true) !== false;
function intervaloAtual(){ return document.hidden ? DASH_BG : DASH_SEG; }

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

/* ---------------- alerta de chamado novo ----------------
   A detecção é pelo maior id já visto, não por comparar listas: id de processo
   inteligente só cresce, então "id maior que o último" é novo sem depender de
   a página ter guardado os 150 anteriores. */
var novosPendentes = load(K.novos, []);
function idNum(x){ var n = parseInt(x, 10); return isNaN(n) ? 0 : n; }
function ehMeu(c){ return euId !== null && String(c.responsavelId) === String(euId); }

/* chama isto quando a própria página cria um chamado: senão ele volta na
   leitura seguinte e a tela alerta sobre algo que você acabou de abrir */
function marcarVisto(id){
  var ultimo = load(K.ultimoId, null);
  save(K.ultimoId, Math.max(idNum(id), ultimo === null ? 0 : ultimo));
}
function detectarNovos(lista){
  if(!lista || !lista.length) return;
  var maior = lista.reduce(function(m, c){ return Math.max(m, idNum(c.id)); }, 0);
  var ultimo = load(K.ultimoId, null);
  /* primeiríssima carga: só marca o ponto de partida. Sem isso a página
     anunciaria os 150 chamados que já existiam como se fossem novos. */
  if(ultimo === null || ultimo === undefined){ save(K.ultimoId, maior); return; }
  var novos = lista.filter(function(c){ return idNum(c.id) > ultimo; });
  save(K.ultimoId, Math.max(maior, ultimo));
  if(!novos.length) return;
  novos.forEach(function(c){
    novosPendentes.push({id:c.id, titulo:c.titulo, meu:ehMeu(c),
                         prioridade:rotuloCurto(c.prioridade), quando:new Date().toISOString()});
  });
  /* os seus primeiro, e dentro de cada grupo o mais recente no topo */
  novosPendentes.sort(function(a,b){
    if(a.meu !== b.meu) return a.meu ? -1 : 1;
    return idNum(b.id) - idNum(a.id);
  });
  save(K.novos, novosPendentes);
  pintarFaixaNovos();
  notificarSistema(novos);
}
function pintarFaixaNovos(){
  var f = $("faixaNovos"), pill = $("pillNovos");
  if(pill){
    pill.textContent = novosPendentes.length;
    pill.hidden = !novosPendentes.length;
  }
  if(!f) return;
  if(!novosPendentes.length){ f.hidden = true; return; }
  var meus = novosPendentes.filter(function(n){ return n.meu; }).length;
  var tit = novosPendentes.length === 1 ? "1 chamado novo no Bitrix"
                                        : novosPendentes.length + " chamados novos no Bitrix";
  if(meus) tit += " — " + (meus === 1 ? "1 é seu" : meus + " são seus");
  $("faixaTitulo").textContent = tit;
  $("faixaLista").innerHTML = novosPendentes.slice(0, 8).map(function(n){
    return '<li' + (n.meu ? ' class="meu"' : "") + '>' +
      '<a href="' + B.portal + "/crm/type/" + B.tipo + "/details/" + encodeURIComponent(n.id) +
      '/" target="_blank" rel="noopener">#' + esc(n.id) + " " + esc(n.titulo || "(sem nome)") + "</a>" +
      (n.meu ? '<span class="selo-meu">seu</span>' : "") +
      '<span class="nv-p">' + esc(n.prioridade) + "</span></li>";
  }).join("") + (novosPendentes.length > 8
      ? '<li class="nv-mais">e mais ' + (novosPendentes.length - 8) + "</li>" : "");
  f.hidden = false;
}
function limparNovos(){
  novosPendentes = [];
  save(K.novos, novosPendentes);
  pintarFaixaNovos();
}
function notificarSistema(novos){
  if(!("Notification" in window) || Notification.permission !== "granted") return;
  try{
    var tit = novos.length === 1 ? "Novo chamado de TI" : novos.length + " chamados novos de TI";
    var corpo = novos.slice(0, 3).map(function(c){
      return (ehMeu(c) ? "(seu) " : "") + "#" + c.id + " " + (c.titulo || "sem nome");
    }).join("\n");
    if(novos.length > 3) corpo += "\n… e mais " + (novos.length - 3);
    var nt = new Notification(tit, {body: corpo, tag: "ctip-novos", renotify: true});
    nt.onclick = function(){
      window.focus();
      /* um chamado só: abre ele. Vários: traz a pessoa para o painel. */
      if(novos.length === 1) window.open(B.portal + "/crm/type/" + B.tipo + "/details/" + novos[0].id + "/", "_blank");
      else document.querySelector('nav.tabs button[data-tab="painel"]').click();
      nt.close();
    };
  }catch(e){ /* navegador recusou a notificação; a faixa na página continua */ }
}
function pintarEstadoAlerta(){
  var b = $("btnNotificar"), s = $("estadoAlerta");
  if(!b || !s) return;
  if(!("Notification" in window)){
    b.hidden = true; s.textContent = "Este navegador não tem notificação de sistema; o aviso aparece só na página.";
    return;
  }
  if(Notification.permission === "granted"){
    b.hidden = true;
    s.textContent = "Notificação do Windows ligada. O aviso chega mesmo com o navegador atrás de outra janela — desde que esta página siga aberta.";
  } else if(Notification.permission === "denied"){
    b.hidden = true;
    s.textContent = "Você bloqueou a notificação para este site. Para religar: cadeado na barra de endereço → Notificações → Permitir.";
  } else {
    b.hidden = false;
    s.textContent = "O aviso aparece na página. Para receber também fora do navegador, autorize a notificação.";
  }
}
function pintarVigia(){
  var cx = $("chkVigiar"), bt = $("dashPausar");
  if(cx) cx.checked = vigiando;
  if(bt) bt.textContent = vigiando ? "Pausar" : "Retomar";
  if($("dashVivo")) $("dashVivo").classList.toggle("off", !vigiando);
  if($("dashConta")) $("dashConta").textContent = vigiando ? intervaloAtual() + "s" : "pausado";
}
function trocarVigia(novo){
  vigiando = novo;
  save(K.vigiar, vigiando);
  if(vigiando) dashSeg = 0;
  pintarVigia();
}

/* ---------------- relógio ----------------
   Um setInterval de 1s cuida de ritmos diferentes: o contador (1s), o
   recálculo do tempo decorrido no dash (10s, porque SLA é contado em horas e
   não vale redesenhar tudo a cada segundo) e a releitura no Bitrix.
   A releitura roda em qualquer aba da página, senão o alerta só acharia você
   quando você já estivesse olhando o painel. Com a janela em segundo plano o
   intervalo abre para DASH_BG: menos chamada quando ninguém está vendo. */
setInterval(function(){
  tick++;
  if(dashVisivel() && vigiando && tick % 10 === 0) renderDash();
  if(!vigiando) return;
  dashSeg++;
  var alvo = intervaloAtual();
  if($("dashConta")) $("dashConta").textContent = Math.max(0, alvo - dashSeg) + "s";
  if(dashSeg >= alvo){
    dashSeg = 0;
    if(load(K.wh, "")) carregarChamados();   /* ele chama renderPainel, que chama renderDash */
    else if(dashVisivel()) renderDash();
  }
}, 1000);

if($("dashPausar")) $("dashPausar").addEventListener("click", function(){ trocarVigia(!vigiando); });
if($("chkVigiar")) $("chkVigiar").addEventListener("change", function(){ trocarVigia(this.checked); });
if($("dashAgora")) $("dashAgora").addEventListener("click", function(){
  dashSeg = 0;
  if(load(K.wh, "")) carregarChamados(); else renderDash();
});
if($("btnNotificar")) $("btnNotificar").addEventListener("click", function(){
  if(!("Notification" in window)) return;
  /* pedir permissão exige um clique da pessoa; por isso o botão existe */
  Notification.requestPermission().then(pintarEstadoAlerta, pintarEstadoAlerta);
});
if($("faixaFechar")) $("faixaFechar").addEventListener("click", limparNovos);
if($("faixaIr")) $("faixaIr").addEventListener("click", function(){
  document.querySelector('nav.tabs button[data-tab="painel"]').click();
  limparNovos();
});
pintarVigia();
pintarEstadoAlerta();
pintarFaixaNovos();

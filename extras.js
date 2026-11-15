"use strict";
/* ---------------- extras ----------------
   Cinco coisas pequenas que se penduram na página depois do início, sem mexer
   no que já existia: filtros favoritos, sinal na aba do navegador, cópia de
   segurança, meu desempenho e duas ajudas de resolução (sugestão ao digitar o
   nome do chamado e "copiar resposta ao usuário").

   Tudo fica neste navegador. Nada aqui fala com o Bitrix. */

K.favoritos = "ctip.favoritos";
K.horasDia = "ctip.horasDia";

/* ================= filtros favoritos =================
   Guarda a combinação de filtros que está na tela com um nome, e aplica de
   volta com um clique. Só o que filtra: a lista de chamados não é guardada. */
var favoritos = load(K.favoritos, []);
var FAV_CAMPOS = ["fltBusca", "fltEmpresa", "fltResp", "fltPrioridade", "fltCategoria", "fltEtapa", "fltSituacao"];
var FAV_NOMES = {fltEmpresa: "empresa", fltResp: "responsável", fltPrioridade: "prioridade",
                 fltCategoria: "categoria", fltEtapa: "etapa", fltSituacao: "situação"};

function favAtual(){
  var v = {};
  FAV_CAMPOS.forEach(function(id){ if($(id) && $(id).value) v[id] = $(id).value; });
  return {v: v, tile: tileAtivo || "", concluidos: !!($("chkConcluidos") && $("chkConcluidos").checked)};
}
function favPintar(){
  var alvo = $("favChips");
  if(!alvo) return;
  alvo.innerHTML = favoritos.length ? favoritos.map(function(f, i){
    return '<span style="display:inline-flex;gap:3px;align-items:center">' +
      '<button class="mini" type="button" data-fav="' + i + '">' + esc(f.nome) + "</button>" +
      '<button class="mini danger" type="button" data-favdel="' + i + '" title="Apagar este favorito">×</button></span>';
  }).join(" ") : '<span class="hint" style="margin:0">nenhum ainda</span>';
}
function favAplicar(f){
  /* as listas de filtro saem dos chamados carregados: garante que estão montadas */
  montarFiltros();
  var faltou = [];
  FAV_CAMPOS.forEach(function(id){
    if(!$(id)) return;
    var quero = (f.v && f.v[id]) || "";
    $(id).value = quero;
    /* a opção pode não existir mais (ninguém com aquele responsável, por exemplo) */
    if(quero && $(id).value !== quero) faltou.push(FAV_NOMES[id] + " “" + quero + "”");
  });
  if($("chkConcluidos")) $("chkConcluidos").checked = !!f.concluidos;
  tileAtivo = (f.tile && tilePorId(f.tile)) ? f.tile : null;
  renderPainel();
  toast(faltou.length ? "Filtro “" + f.nome + "” aplicado, menos " + faltou.join(", ") + ": não há chamado carregado com isso."
                      : "Filtro “" + f.nome + "” aplicado.");
}
function favSalvar(){
  var nome = $("favNome").value.trim().slice(0, 40);
  var a = favAtual();
  if(!nome){ toast("Dê um nome ao filtro antes de salvar."); $("favNome").focus(); return; }
  if(!Object.keys(a.v).length && !a.tile && !a.concluidos){ toast("Não há filtro ligado para salvar."); return; }
  a.nome = nome;
  var existia = false;
  favoritos = favoritos.map(function(f){ if(f.nome === nome){ existia = true; return a; } return f; });
  if(!existia) favoritos.push(a);
  save(K.favoritos, favoritos);
  $("favNome").value = "";
  favPintar();
  toast("Favorito “" + nome + "” " + (existia ? "atualizado." : "salvo."));
}
(function(){
  var resumo = $("fltResumo");
  if(!resumo) return;
  var d = document.createElement("div");
  d.className = "lote-topo"; d.id = "favLinha"; d.style.margin = "12px 0 0";
  d.innerHTML = '<span class="hint" style="margin:0">Favoritos:</span><span id="favChips"></span>' +
    '<span style="flex:1"></span>' +
    '<input type="text" id="favNome" maxlength="40" placeholder="Nome para o filtro atual" autocomplete="off" style="width:auto;flex:0 1 210px">' +
    '<button class="ghost" id="favSalvar" type="button">Salvar como favorito</button>';
  resumo.parentNode.appendChild(d);
  $("favSalvar").addEventListener("click", favSalvar);
  $("favNome").addEventListener("keydown", function(e){ if(e.key === "Enter") favSalvar(); });
  $("favChips").addEventListener("click", function(e){
    var t = e.target, i = t.getAttribute("data-fav"), x = t.getAttribute("data-favdel");
    if(i !== null && favoritos[i]){ favAplicar(favoritos[i]); return; }
    if(x === null || !favoritos[x]) return;
    /* dois toques, como no resto da página */
    if(t.dataset.confirma !== "1"){
      t.dataset.confirma = "1"; t.textContent = "apagar?";
      setTimeout(function(){ t.dataset.confirma = ""; t.textContent = "×"; }, 4000);
      return;
    }
    favoritos.splice(parseInt(x, 10), 1);
    save(K.favoritos, favoritos);
    favPintar();
  });
  favPintar();
})();

/* ================= sinal na aba do navegador =================
   O contador de alertas da aba Painel sobe para o título da janela: com a
   página em segundo plano, "(2) Chamados TI Prospera" aparece na aba. */
(function(){
  var pill = $("pillNovos");
  if(!pill || typeof MutationObserver === "undefined") return;
  var base = document.title.replace(/^\(\d+\)\s*/, "");
  function pintar(){
    var n = pill.hidden ? 0 : (parseInt(pill.textContent, 10) || 0);
    var novo = (n > 0 ? "(" + n + ") " : "") + base;
    if(document.title !== novo) document.title = novo;
  }
  new MutationObserver(pintar).observe(pill, {attributes: true, childList: true, characterData: true, subtree: true});
  pintar();
})();

/* ================= cópia de segurança =================
   Baixa num arquivo o que só existe neste navegador, e traz de volta. O arquivo
   NÃO leva o webhook, nem a sessão de login, nem os chamados lidos do Bitrix —
   esses voltam sozinhos ao conectar.

   Restaurar só acrescenta: nada do que já está aqui é apagado ou trocado. */
var CS_SIMPLES = [K.jornada, K.lote, K.tema, "ctip.modo", K.vigiar, "ctip.tarefas"];

function csMontar(){
  var dados = {};
  [K.fila, "ctip.modelos", K.cronos, K.favoritos, K.horasDia].concat(CS_SIMPLES).forEach(function(k){
    var v = load(k, null);
    if(v !== null && v !== undefined) dados[k] = v;
  });
  dados.chamadosLocais = chamados.filter(function(c){ return c.origem !== "bitrix"; });
  return {app: "chamados-ti", versao: 1, feitaEm: new Date().toISOString(), dados: dados};
}
function csBaixar(){
  var txt = JSON.stringify(csMontar(), null, 1);
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([txt], {type: "application/json"}));
  a.download = "chamados-ti-copia-" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
  $("csEstado").textContent = "Cópia baixada. Guarde o arquivo num lugar seu (OneDrive, por exemplo).";
}
/* devolve quantos itens entraram de cada coisa; nunca tira nada */
function csRestaurar(copia){
  if(!copia || copia.app !== "chamados-ti" || !copia.dados || typeof copia.dados !== "object")
    throw new Error("este arquivo não é uma cópia do Chamados TI");
  var d = copia.dados, n = {anotacoes: 0, modelos: 0, favoritos: 0, cronometros: 0, locais: 0, ajustes: 0};
  var lista = function(x){ return Array.isArray(x) ? x : []; };

  var filaAqui = load(K.fila, []);
  lista(d[K.fila]).forEach(function(it){
    if(!it || typeof it !== "object" || !it.oque) return;
    var ja = filaAqui.some(function(x){ return x.oque === it.oque && (x.iso || x.hora) === (it.iso || it.hora); });
    if(!ja){ filaAqui.push(it); n.anotacoes++; }
  });
  save(K.fila, filaAqui);

  [["ctip.modelos", "modelos"], [K.favoritos, "favoritos"]].forEach(function(par){
    var aqui = load(par[0], []);
    lista(d[par[0]]).forEach(function(m){
      if(!m || !m.nome) return;
      if(!aqui.some(function(x){ return x.nome === m.nome; })){ aqui.push(m); n[par[1]]++; }
    });
    save(par[0], aqui);
  });

  var cr = load(K.cronos, {}), crDe = (d[K.cronos] && typeof d[K.cronos] === "object") ? d[K.cronos] : {};
  Object.keys(crDe).forEach(function(id){
    var t = Number(crDe[id] && crDe[id].total) || 0;
    /* fica o maior total; cronômetro que estava rodando na cópia não volta rodando */
    if(t > ((cr[id] && cr[id].total) || 0)){ cr[id] = {total: t, inicio: (cr[id] && cr[id].inicio) || null}; n.cronometros++; }
  });
  save(K.cronos, cr);

  var hd = load(K.horasDia, {}), hdDe = (d[K.horasDia] && typeof d[K.horasDia] === "object") ? d[K.horasDia] : {};
  Object.keys(hdDe).forEach(function(dia){
    if(/^\d{4}-\d{2}-\d{2}$/.test(dia) && (Number(hdDe[dia]) || 0) > (hd[dia] || 0)) hd[dia] = Number(hdDe[dia]);
  });
  save(K.horasDia, hd);

  var todos = load(K.chamados, []);
  lista(d.chamadosLocais).forEach(function(c){
    if(!c || c.origem === "bitrix" || !c.id) return;
    if(!todos.some(function(x){ return String(x.id) === String(c.id); })){ todos.push(c); n.locais++; }
  });
  save(K.chamados, todos);

  /* ajustes simples: só entram se aqui ainda não houver */
  CS_SIMPLES.forEach(function(k){
    if(d[k] === undefined || d[k] === null) return;
    if(localStorage.getItem(k) === null){ save(k, d[k]); n.ajustes++; }
  });
  return n;
}
(function(){
  var aba = $("tab-conexao");
  if(!aba) return;
  var c = document.createElement("div");
  c.className = "card";
  c.innerHTML = "<h3>Cópia de segurança</h3>" +
    '<div class="hint" style="margin:0 0 12px">A fila de captura, os modelos, o cronômetro e os filtros favoritos ' +
      "ficam guardados só neste navegador: limpar os dados do navegador apaga tudo. Baixe uma cópia de vez em quando. " +
      "O arquivo <b>não leva</b> o webhook nem a sua sessão.</div>" +
    '<div class="row-end" style="justify-content:flex-start;margin-top:0">' +
      '<button class="primary" id="csBaixar" type="button">Baixar cópia</button>' +
      '<button class="ghost" id="csEscolher" type="button">Restaurar de um arquivo</button>' +
      '<input type="file" id="csArquivo" accept=".json,application/json" hidden>' +
    "</div>" +
    '<div class="hint" id="csEstado"></div>' +
    '<div class="hint">Restaurar só acrescenta o que falta: nada do que já está neste navegador é apagado ou trocado.</div>';
  aba.appendChild(c);
  $("csBaixar").addEventListener("click", csBaixar);
  $("csEscolher").addEventListener("click", function(){ $("csArquivo").click(); });
  $("csArquivo").addEventListener("change", function(){
    var arq = this.files && this.files[0], campo = this;
    if(!arq) return;
    var leitor = new FileReader();
    leitor.onload = function(){
      campo.value = "";
      try{
        var n = csRestaurar(JSON.parse(String(leitor.result)));
        var partes = [];
        if(n.anotacoes) partes.push(n.anotacoes + " anotações");
        if(n.modelos) partes.push(n.modelos + " modelos");
        if(n.favoritos) partes.push(n.favoritos + " favoritos");
        if(n.cronometros) partes.push(n.cronometros + " cronômetros");
        if(n.locais) partes.push(n.locais + " chamados locais");
        if(n.ajustes) partes.push(n.ajustes + " ajustes");
        $("csEstado").textContent = partes.length
          ? "Restaurado: " + partes.join(", ") + ". Recarregando a página…"
          : "O arquivo não tinha nada que já não estivesse aqui.";
        if(partes.length) setTimeout(function(){ location.reload(); }, 1500);
      }catch(e){
        $("csEstado").textContent = "Não restaurei nada: " + e.message + ".";
      }
    };
    leitor.onerror = function(){ $("csEstado").textContent = "Não consegui ler o arquivo."; };
    leitor.readAsText(arq);
  });
})();

/* ================= meu desempenho =================
   Só os chamados em que a pessoa é a responsável, entre os que a página
   carregou. As horas vêm do cronômetro da ficha. */
function mdDia(d){
  return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
}
function mdHoras(seg){
  var m = Math.round((seg || 0) / 60);
  return m < 60 ? m + " min" : Math.floor(m / 60) + "h " + ("0" + (m % 60)).slice(-2);
}
function pintarDesempenho(){
  var alvo = $("mdCorpo");
  if(!alvo) return;
  if(euId === null){
    alvo.innerHTML = '<div class="hint" style="margin:0">Carregue os chamados do Bitrix para a página saber quem é você.</div>';
    return;
  }
  var agora = Date.now(), d7 = agora - 7 * 86400000, d30 = agora - 30 * 86400000;
  var mes = new Date(); mes.setDate(1); mes.setHours(0, 0, 0, 0);
  var meus = chamados.filter(ehMeu);
  var fechouEm = function(c){ return (fechado(c) && c.movido) ? new Date(c.movido).getTime() : NaN; };
  var f7 = meus.filter(function(c){ return fechouEm(c) >= d7; }).length;
  var fMes = meus.filter(function(c){ return fechouEm(c) >= mes.getTime(); }).length;
  var abertos = meus.filter(function(c){ return !fechado(c); }).length;
  /* primeiro atendimento: dos meus abertos nos últimos 30 dias que têm a data */
  var tempos = [];
  meus.forEach(function(c){
    var a = new Date(c.aberto), p = c.primeiroAtend ? new Date(c.primeiroAtend) : null;
    if(!p || isNaN(a.getTime()) || isNaN(p.getTime()) || a.getTime() < d30 || p < a) return;
    tempos.push(horasUteis(a, p));
  });
  var media = tempos.length ? tempos.reduce(function(s, x){ return s + x; }, 0) / tempos.length : null;
  var hd = load(K.horasDia, {}), hoje = hd[mdDia(new Date())] || 0, semana = 0;
  for(var i = 0; i < 7; i++) semana += hd[mdDia(new Date(agora - i * 86400000))] || 0;
  var bloco = function(rot, val, cls){
    return '<div class="tile ' + (cls || "") + '" style="cursor:default"><span>' + esc(rot) + "</span><b>" + esc(val) + "</b></div>";
  };
  alvo.innerHTML = '<div class="tile-linha">' +
    bloco("Fechados em 7 dias", f7, f7 ? "good" : "zero") +
    bloco("Fechados no mês", fMes, fMes ? "good" : "zero") +
    bloco("Abertos comigo", abertos, abertos ? "" : "zero") +
    bloco("1º atendimento (média)", media === null ? "—" : media.toFixed(1) + " h", media === null ? "zero" : "") +
    bloco("Cronômetro hoje", mdHoras(hoje), hoje ? "" : "zero") +
    bloco("Cronômetro em 7 dias", mdHoras(semana), semana ? "" : "zero") +
    "</div>";
  $("mdNota").textContent = "Conta só os chamados em que você é o responsável, entre os " + chamados.length +
    " carregados. O primeiro atendimento é em horas úteis, sobre " + tempos.length +
    (tempos.length === 1 ? " chamado" : " chamados") + " dos últimos 30 dias. As horas do cronômetro por dia " +
    "começaram a ser anotadas quando esta parte entrou no ar: antes disso só existe o total por chamado. " +
    "Resolução no primeiro contato não aparece porque o Bitrix não registra quantos contatos houve.";
}
(function(){
  var grade = document.querySelector("#sub-dash .dash-grid");
  if(!grade) return;
  var b = document.createElement("div");
  b.className = "bloco dash-largo";
  b.innerHTML = '<h3>Meu desempenho</h3><div id="mdCorpo"></div><div class="hint" id="mdNota"></div>';
  grade.insertBefore(b, grade.children[1] || null);
  aposPainel.push(pintarDesempenho);
  pintarDesempenho();

  /* horas por dia: o cronômetro guarda só o total de cada chamado. De tempos em
     tempos olha quanto o total geral andou e põe a diferença no dia de hoje. */
  if(typeof cronos === "undefined" || typeof sessaoAberta !== "function") return;
  var soma = function(){
    var s = 0;
    Object.keys(cronos).forEach(function(id){ s += (cronos[id].total || 0) + sessaoAberta(cronos[id]); });
    return s;
  };
  var ultimo = soma();
  setInterval(function(){
    var agora = soma(), delta = agora - ultimo;
    ultimo = agora;
    /* salto grande ou para trás é zerar, restaurar cópia ou relógio do computador: não é trabalho */
    if(!(delta > 0 && delta <= 90)) return;
    var hd = load(K.horasDia, {}), dia = mdDia(new Date());
    hd[dia] = (hd[dia] || 0) + delta;
    var dias = Object.keys(hd).sort();
    while(dias.length > 90) delete hd[dias.shift()];
    save(K.horasDia, hd);
    if($("sub-dash") && !$("sub-dash").hidden) pintarDesempenho();
  }, 30000);
})();

/* ================= ajuda de resolução ================= */
/* ao digitar o nome de um chamado novo: o que já foi resolvido parecido */
function sgBuscar(titulo){
  if(typeof pcPalavras !== "function") return [];
  var minhas = pcPalavras(titulo);
  if(!minhas.length) return [];
  var achados = [];
  chamados.forEach(function(c){
    var res = String(c.resolucao || (c.doc && c.doc.resolucao) || "").trim();
    if(!res) return;
    var dele = pcPalavras(c.titulo);
    var comuns = minhas.filter(function(p){ return dele.indexOf(p) !== -1; });
    if(comuns.length) achados.push({c: c, res: res, n: comuns.length});
  });
  achados.sort(function(a, b){ return (b.n - a.n) || (idNum(b.c.id) - idNum(a.c.id)); });
  return achados.slice(0, 3);
}
(function(){
  var campo = $("fTitulo");
  if(!campo) return;
  var d = document.createElement("div");
  d.id = "sgLista"; d.hidden = true; d.style.marginTop = "10px";
  campo.parentNode.appendChild(d);
  var espera = null;
  function pintar(){
    var itens = sgBuscar(campo.value);
    d.hidden = !itens.length;
    d.innerHTML = itens.length ? '<div class="hint" style="margin:0 0 6px"><b>Já resolvido antes</b> — parecido pelo nome:</div>' +
      itens.map(function(a){
        var r = a.res.length > 170 ? a.res.slice(0, 170) + "…" : a.res;
        return '<div class="hint" style="margin:0 0 6px">' + (a.c.origem === "bitrix" ? "#" + esc(a.c.id) + " " : "") +
          "<b>" + esc(a.c.titulo || "") + "</b> — " + esc(r) +
          ' <button class="mini" type="button" data-sg="' + esc(a.c.id) + '">abrir</button></div>';
      }).join("") : "";
  }
  campo.addEventListener("input", function(){ clearTimeout(espera); espera = setTimeout(pintar, 250); });
  /* o Limpar e o Salvar esvaziam o campo sem disparar "input" */
  ["btnLimpar", "btnSalvarChamado"].forEach(function(id){
    if($(id)) $(id).addEventListener("click", function(){ setTimeout(pintar, 600); });
  });
  d.addEventListener("click", function(e){
    var id = e.target.getAttribute("data-sg");
    if(!id) return;
    document.querySelector('nav.tabs button[data-tab="documentar"]').click();
    $("dChamado").value = id;
    carregarItem(id);
  });
})();

/* na ficha: a resolução em forma de recado para quem pediu */
(function(){
  var ref = $("btnCopiarDoc");
  if(!ref) return;
  var b = document.createElement("button");
  b.className = "ghost"; b.type = "button"; b.id = "btnCopiarResposta";
  b.textContent = "Copiar resposta ao usuário";
  ref.parentNode.insertBefore(b, ref);
  b.addEventListener("click", function(){
    var res = $("dResolucao").value.trim(), id = $("dChamado").value, c = null;
    if(!res){ toast("Escreva a resolução primeiro."); $("dResolucao").focus(); return; }
    chamados.forEach(function(x){ if(String(x.id) === String(id)) c = x; });
    var nome = c && c.solicitante ? String(c.solicitante).trim().split(/\s+/)[0] : "";
    var txt = "Olá" + (nome ? ", " + nome : "") + "!\n\n" +
      "Sobre o chamado" + (c && c.origem === "bitrix" ? " #" + c.id : "") + (c && c.titulo ? " — " + c.titulo : "") + ":\n\n" +
      res + "\n\nSe o problema voltar, é só responder esta mensagem.\n\nTI Prospera";
    if(navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(txt).then(function(){ toast("Resposta copiada. Cole no WhatsApp ou no e-mail."); },
                                               function(){ fallbackCopy(txt); });
    else fallbackCopy(txt);
  });
})();

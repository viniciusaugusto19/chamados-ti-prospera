"use strict";
/* ---------------- v43/v44: solicitante de verdade + encerrar volta ao painel ----------------
   O campo Solicitante do Bitrix (ufCrm11_1751046908) é de USUÁRIO: espera o
   número de um colaborador. A página mandava o nome como apareceu no WhatsApp;
   o Bitrix lia o primeiro número do texto ("+55 11 9..." virava o usuário 55) e
   o chamado caía em nome de outra pessoa. Agora:

   - a lista de colaboradores ativos vem do Bitrix (user.get, só leitura);
   - cada anotação da fila tem um seletor "Solicitante", já preenchido quando o
     nome do WhatsApp bate com um colaborador (todas as palavras do nome) ou o
     número bate com o celular/telefone dele no Bitrix;
   - a escolha feita à mão fica lembrada para aquele contato (neste navegador);
   - v44: quem não é achado nem escolhido vai como "Atendimento e Suporte"
     (usuário 429), o solicitante padrão; o nome do WhatsApp vai nos Detalhes;
   - nada que não seja o número de um colaborador vai para o campo (o servidor
     também confere: texto vira o padrão, para janela antiga ainda aberta);
   - o mesmo seletor em Abrir chamado (antes o Solicitante dali nem era enviado);
   - v44: na aba Documentar dá para trocar o solicitante do chamado;
   - Encerrar chamado, depois de gravar, volta para o Painel.

   Telefones dos colaboradores ficam só na memória da aba; o navegador guarda
   apenas número e nome. Carregado pelo boot.js depois do captura.js. */
var SOL_PADRAO_ID = "429", SOL_PADRAO_NOME = "Atendimento e Suporte";
var SOL_ALIAS_K = "ctip.solicitanteDe", SOL_COLABS_K = "ctip.colabs";
var solColabs = (load(SOL_COLABS_K, null) || {}).lista || [];   /* [{id, nome}] */
var solFones = {};      /* id -> [últimos 8 dígitos], só na memória */
var solCarga = null, solTentativas = 0;

function solNorm(s){
  return semAcento(String(s || "")).replace(/\([^)]*\)/g, " ").split(/[^a-z0-9]+/)
    .filter(function(w){ return w.length > 1 && ["de", "da", "do", "das", "dos"].indexOf(w) === -1; });
}
function solDigitos(s){ return String(s || "").replace(/\D/g, ""); }
function solRotulo(c){
  var mesmo = solColabs.filter(function(x){ return x.nome === c.nome; }).length > 1;
  return c.nome + (mesmo ? " #" + c.id : "");
}
/* o padrão: como está no Bitrix quando a lista já chegou, senão o número fixo */
function solPadrao(){
  return solColabs.filter(function(c){ return c.id === SOL_PADRAO_ID; })[0] || {id: SOL_PADRAO_ID, nome: SOL_PADRAO_NOME};
}
function solPorRotulo(t){
  t = String(t || "").trim();
  if(!t) return null;
  var a = semAcento(t).trim();
  return solColabs.filter(function(c){ return semAcento(solRotulo(c)).trim() === a; })[0] || null;
}
function solCarregar(){
  if(solCarga) return solCarga;
  if(typeof bitrixCall !== "function" || !load(K.wh, "")) return Promise.resolve(solColabs);
  var todos = [];
  var pagina = function(start){
    return bitrixCall("user.get", {FILTER: {ACTIVE: true}, start: start}).then(function(j){
      todos = todos.concat(j.result || []);
      if(j.next !== undefined && j.next !== null && todos.length < 2000) return pagina(j.next);
    });
  };
  solCarga = pagina(0).then(function(){
    var fones = {};
    solColabs = todos.filter(function(u){ return u && u.ID && (!u.USER_TYPE || u.USER_TYPE === "employee"); }).map(function(u){
      var nome = [u.NAME, u.SECOND_NAME, u.LAST_NAME].filter(Boolean).join(" ").replace(/\s+/g, " ").trim() || ("usuário " + u.ID);
      fones[u.ID] = [u.PERSONAL_MOBILE, u.WORK_PHONE, u.PERSONAL_PHONE].map(solDigitos).filter(function(d){ return d.length >= 8; }).map(function(d){ return d.slice(-8); });
      return {id: String(u.ID), nome: nome};
    }).sort(function(a, b){ return a.nome.localeCompare(b.nome, "pt-BR"); });
    solFones = fones;
    save(SOL_COLABS_K, {em: Date.now(), lista: solColabs});
    /* a ficha passa a mostrar o nome em vez de "usuário 55" */
    if(typeof usuarios === "object" && usuarios){ solColabs.forEach(function(c){ usuarios[c.id] = c.nome; }); save(K.usuarios, usuarios); }
    solPintarLista();
    if(typeof renderFila === "function") renderFila();
    return solColabs;
  }, function(){
    solCarga = null;
    /* o acesso.js carrega logo depois deste arquivo, e sem sessão ainda (tela de
       entrar) ou sem rede também falha: tenta de novo, primeiro rápido */
    if(++solTentativas < 24) setTimeout(solCarregar, solTentativas < 8 ? 1500 : 15000);
    return solColabs;
  });
  return solCarga;
}
/* quem pediu, como apareceu na conversa -> colaborador do Bitrix */
function solAchar(quem){
  quem = String(quem || "").trim();
  if(!quem) return null;
  var alias = load(SOL_ALIAS_K, {}) || {}, chave = semAcento(quem).trim();
  if(alias[chave]){
    if(alias[chave] === "externo") return solPadrao();   /* escolha da v43 */
    var a = solColabs.filter(function(c){ return c.id === alias[chave]; })[0];
    if(a) return a;
  }
  var dig = solDigitos(quem);
  if(dig.length >= 8 && dig.length >= quem.replace(/[\s()+\-.]/g, "").length - 1){
    var f8 = dig.slice(-8);
    var porFone = solColabs.filter(function(c){ return (solFones[c.id] || []).indexOf(f8) !== -1; });
    return porFone.length === 1 ? porFone[0] : null;
  }
  var q = solNorm(quem);
  if(!q.length) return null;
  var porNome = solColabs.filter(function(c){ var t = solNorm(c.nome); return q.every(function(w){ return t.indexOf(w) !== -1; }); });
  return porNome.length === 1 ? porNome[0] : null;
}
function solLembrar(quem, id){
  var chave = semAcento(String(quem || "")).trim();
  if(!chave) return;
  var alias = load(SOL_ALIAS_K, {}) || {};
  if(id) alias[chave] = id; else delete alias[chave];
  save(SOL_ALIAS_K, alias);
}
function solPintarLista(){
  var dl = $("colabsLista");
  if(!dl){ dl = document.createElement("datalist"); dl.id = "colabsLista"; document.body.appendChild(dl); }
  var p = solPadrao();
  dl.innerHTML = '<option value="' + esc(solRotulo(p)) + '"></option>' +
    solColabs.filter(function(c){ return c.id !== p.id; }).map(function(c){ return '<option value="' + esc(solRotulo(c)) + '"></option>'; }).join("");
}

/* ---------- na fila da Captura ---------- */
var solRenderOrig = renderFila;
renderFila = function(){
  /* sem escolha à mão: o que o nome/telefone achar, senão o padrão. Refeito a
     cada desenho, para a lista de colaboradores que chega depois ainda valer. */
  fila.forEach(function(it){
    if(it.chamado || it.solManual) return;
    var c = solAchar(it.quem);
    if(c){ it.solId = c.id; it.solNome = solRotulo(c); it.solAuto = true; it.solPadrao = false; }
    else { var p = solPadrao(); it.solId = p.id; it.solNome = solRotulo(p); it.solAuto = false; it.solPadrao = true; }
  });
  solRenderOrig.apply(this, arguments);
  Array.prototype.forEach.call(document.querySelectorAll("#fila .q-cls"), function(box){
    var li = box.closest("li"), cx = li && li.querySelector(".fsel");
    if(!cx) return;
    var i = +cx.getAttribute("data-i"), it = fila[i];
    if(!it || box.querySelector(".q-sol")) return;
    var w = document.createElement("span");
    w.className = "q-sol-w";
    w.innerHTML = '<input type="text" class="q-sol" list="colabsLista" data-i="' + i + '" placeholder="Solicitante" ' +
      'title="Colaborador no Bitrix. Sem escolha, vai como ' + esc(SOL_PADRAO_NOME) + '." value="' + esc(it.solNome || "") + '">' +
      (it.solAuto ? '<span class="q-sol-auto" title="Achado pelo nome ou telefone do WhatsApp. Confira.">auto</span>' :
       it.solPadrao ? '<span class="q-sol-auto q-sol-pad" title="Não achei quem é pelo nome/telefone do WhatsApp. Troque se souber quem pediu.">padrão</span>' : "");
    box.insertBefore(w, box.firstChild);
  });
};
$("fila").addEventListener("change", function(e){
  if(!e.target.classList || !e.target.classList.contains("q-sol")) return;
  var it = fila[+e.target.getAttribute("data-i")];
  if(!it) return;
  var c = solPorRotulo(e.target.value);
  if(c){ it.solManual = true; it.solAuto = false; it.solPadrao = false; it.solId = c.id; it.solNome = solRotulo(c); solLembrar(it.quem, c.id); it.erro = ""; }
  else {
    /* apagou ou digitou quem não está na lista: volta ao automático/padrão */
    it.solManual = false; solLembrar(it.quem, "");
    if(String(e.target.value).trim()) toast("Não achei esse nome na lista de colaboradores. Ficou o automático.");
  }
  save(K.fila, fila); renderFila();
});
$("fila").addEventListener("focusin", function(e){ if(e.target.classList && e.target.classList.contains("q-sol")) solCarregar(); });
/* o campo de usuário só recebe número de colaborador; o nome do WhatsApp
   continua registrado nos Detalhes */
var solCamposOrig = camposDaAnotacao;
camposDaAnotacao = function(item){
  var f = solCamposOrig.apply(this, arguments), c = B.campo;
  delete f[c.solicitante];
  f[c.solicitante] = item && item.solId && /^\d+$/.test(item.solId) ? item.solId : solPadrao().id;
  if(item && item.quem && !(item.solNome && semAcento(item.solNome).indexOf(semAcento(item.quem)) === 0)){
    f[c.detalhes] = String(f[c.detalhes] || "") + "\n\nSolicitante como aparece no WhatsApp: " + item.quem + ".";
  }
  return f;
};

/* ---------- em Abrir chamado ---------- */
(function(){
  var inp = $("fSolicitante"); if(!inp) return;
  inp.setAttribute("list", "colabsLista");
  inp.placeholder = "Colaborador no Bitrix (vazio = " + SOL_PADRAO_NOME + ")";
  inp.addEventListener("focus", function(){ solCarregar(); });
})();
/* "abrir completo" a partir da fila leva o solicitante escolhido */
$("fila").addEventListener("click", function(e){
  var v = e.target.getAttribute && e.target.getAttribute("data-virar");
  if(v === null || v === undefined) return;
  var it = fila[parseInt(v, 10)];
  if(it && it.solNome) $("fSolicitante").value = it.solNome;
  else if(it){ var c = solAchar(it.quem); $("fSolicitante").value = solRotulo(c || solPadrao()); }
});
var solNovoOrig = camposDoNovoChamado;
camposDoNovoChamado = function(){
  var f = solNovoOrig.apply(this, arguments), c = B.campo;
  var t = String($("fSolicitante").value || "").trim();
  var col = solPorRotulo(t) || solAchar(t);
  delete f[c.solicitante];
  if(col && /^\d+$/.test(col.id)) f[c.solicitante] = col.id;
  else {
    f[c.solicitante] = solPadrao().id;
    if(t) f[c.detalhes] = String(f[c.detalhes] || "") + "\n\nSolicitante: " + t + ".";
  }
  return f;
};

/* ---------- v44: trocar o solicitante na aba Documentar ---------- */
(function(){
  var alvo = $("sub-fdoc"); if(!alvo) return;
  var b = document.createElement("div");
  b.className = "bloco"; b.id = "cardSolicitante"; b.hidden = true;
  b.innerHTML = '<h3>Solicitante</h3>' +
    '<input type="text" id="dSolicitante" list="colabsLista" autocomplete="off" placeholder="Colaborador no Bitrix">' +
    '<div class="hint" id="dSolHint">Quem pediu. Vai para o Bitrix ao Salvar ou Encerrar.</div>';
  alvo.insertBefore(b, alvo.firstChild);
  $("dSolicitante").addEventListener("focus", function(){ solCarregar(); });
  $("dSolicitante").addEventListener("change", function(){
    var t = this.value.trim(), c = solPorRotulo(t);
    this.classList.toggle("q-sol-falta", !!t && !c);
    $("dSolHint").textContent = !t ? "Vazio: fica como está no Bitrix (ou " + SOL_PADRAO_NOME + ", se não tiver ninguém)." :
      c ? "Vai para o Bitrix ao Salvar ou Encerrar." : "Nome fora da lista de colaboradores: não será gravado.";
  });
})();
function solIdAtual(){
  var v = itemAtual && itemAtual[B.campo.solicitante];
  v = Array.isArray(v) ? v[0] : v;
  return v && /^\d+$/.test(String(v)) && String(v) !== "0" ? String(v) : "";
}
var solPintarOrig = pintarChamado;
pintarChamado = function(){
  solPintarOrig.apply(this, arguments);
  var inp = $("dSolicitante"); if(!inp) return;
  var bitrix = itemAtual && itemAtual.origem !== "local" && itemAtual.id;
  $("cardSolicitante").hidden = !bitrix;
  var id = solIdAtual(), c = solColabs.filter(function(x){ return x.id === id; })[0];
  inp.value = c ? solRotulo(c) : (id ? labelUsuario(id) : "");
  inp.classList.remove("q-sol-falta");
  $("dSolHint").textContent = id ? "Quem pediu. Vai para o Bitrix ao Salvar ou Encerrar." :
    "Chamado sem solicitante: ao Salvar ou Encerrar vai como " + SOL_PADRAO_NOME + ", se você não escolher outro.";
};
var solSalvarOrig = camposParaSalvar;
camposParaSalvar = function(){
  var f = solSalvarOrig.apply(this, arguments), c = B.campo, inp = $("dSolicitante");
  if(!inp || !itemAtual || itemAtual.origem === "local") return f;
  var t = inp.value.trim(), col = solPorRotulo(t), atual = solIdAtual();
  if(col && /^\d+$/.test(col.id)){ if(col.id !== atual) f[c.solicitante] = col.id; }
  else if(!atual) f[c.solicitante] = solPadrao().id;
  else if(t) toast("Solicitante fora da lista de colaboradores: ficou o que estava no Bitrix.");
  return f;
};

/* ---------- encerrar volta ao painel ---------- */
var solGravarOrig = gravarNoBitrix;
gravarNoBitrix = function(fields, oque){
  var p = solGravarOrig.apply(this, arguments);
  if(oque === "Chamado encerrado"){
    /* vai ao Painel assim que o Bitrix confirma o encerramento (o aviso
       "Chamado encerrado em hh:mm"), sem esperar a releitura da lista, que pode
       demorar ou falhar. Falha na gravação: fica na ficha, com o erro. */
    var foi = false, ini = Date.now();
    var ir = function(){
      if(foi) return; foi = true;
      var b = document.querySelector('nav.tabs button[data-tab="painel"]');
      if(b) b.click();
      if(window.scrollTo) window.scrollTo(0, 0);
    };
    var gravou = function(){ return /^Chamado encerrado em/.test(($("docAviso") || {}).textContent || ""); };
    var olhar = setInterval(function(){
      if(foi || Date.now() - ini > 60000){ clearInterval(olhar); return; }
      if(gravou()){ clearInterval(olhar); ir(); }
    }, 150);
    p.then(ir, function(){ if(gravou()) ir(); });
  }
  return p;
};

(function(){
  var s = document.createElement("style");
  s.textContent = ".q-sol-w{display:inline-flex;align-items:center;gap:4px}" +
    "#fila input.q-sol{width:230px;max-width:100%;padding:6px 9px;font-size:.8rem}" +
    "#fila input.q-sol-falta{border-color:var(--crit)}" +
    ".q-sol-auto{font-size:.62rem;font-weight:700;letter-spacing:.04em;color:var(--warn);border:1px solid var(--warn);border-radius:4px;padding:0 4px}" +
    ".q-sol-pad{color:var(--muted);border-color:var(--muted)}" +
    "#dSolicitante{width:100%}#dSolicitante.q-sol-falta{border-color:var(--crit)}";
  document.head.appendChild(s);
  solPintarLista();
  renderFila();
  solCarregar();
})();

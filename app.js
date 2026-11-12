"use strict";
/* ---------------- abas ---------------- */
var tabs = document.querySelectorAll("nav.tabs button");
Array.prototype.forEach.call(tabs, function(b){
  b.addEventListener("click", function(){
    Array.prototype.forEach.call(tabs, function(o){
      o.setAttribute("aria-selected", o===b ? "true" : "false");
      var s = $("tab-" + o.dataset.tab); if(s) s.hidden = (o!==b);
    });
    if(b.dataset.tab === "painel") renderPainel();
    if(b.dataset.tab === "documentar") renderSelectChamados();
  });
});

$("btnTema").addEventListener("click", function(){
  var r = document.documentElement;
  var escuro = r.getAttribute("data-theme")==="dark" ||
    (!r.getAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
  r.setAttribute("data-theme", escuro ? "light" : "dark");
  save(K.tema, escuro ? "light" : "dark");
});
(function(){ var t = load(K.tema, null); if(t) document.documentElement.setAttribute("data-theme", t); })();

/* ---------------- captura ---------------- */
function renderFila(){
  var ul = $("fila"); ul.innerHTML = "";
  $("filaVazia").hidden = fila.length > 0;
  /* o número na aba é o que ainda falta virar chamado, não o tamanho da lista */
  $("pillFila").textContent = fila.filter(function(it){ return !it.chamado; }).length;
  fila.forEach(function(item, i){
    var li = document.createElement("li");
    var virado = !!item.chamado;
    if(virado) li.className = "feito";
    var selo = "";
    if(virado){
      selo = item.chamado === "local"
        ? '<span class="tag neutral">virou chamado local</span>'
        : '<a class="tag ok" target="_blank" rel="noopener" href="' + B.portal +
          '/crm/type/' + B.tipo + '/details/' + encodeURIComponent(item.chamado) +
          '/">virou o chamado #' + esc(item.chamado) + "</a>";
    }
    li.innerHTML =
      '<div class="txt"><b>' + esc(item.quem || "sem nome") + '</b> — ' + esc(item.oque) +
        (selo ? '<div class="virou">' + selo + "</div>" : "") + "</div>" +
      '<div class="when">' + esc(item.hora) + '</div>' +
      '<div class="acts">' +
        (virado ? "" : '<button class="mini" data-virar="' + i + '">virar chamado</button>') +
        '<button class="mini danger" data-del="' + i + '">apagar</button>' +
      '</div>';
    ul.appendChild(li);
  });
}
/* qual anotação está sendo transformada agora. Guardamos o carimbo de hora
   porque o índice muda se alguém apagar outra anotação no meio do caminho. */
var capturaEmUso = null;
function marcarCapturaComoVirada(idChamado){
  if(!capturaEmUso) return;
  for(var i=0;i<fila.length;i++){
    if(fila[i].iso === capturaEmUso){ fila[i].chamado = idChamado; break; }
  }
  capturaEmUso = null;
  save(K.fila, fila); renderFila();
}
$("fila").addEventListener("click", function(e){
  var v = e.target.getAttribute("data-virar"), d = e.target.getAttribute("data-del");
  if(d !== null && d !== undefined){
    fila.splice(parseInt(d,10),1); save(K.fila, fila); renderFila(); return;
  }
  if(v !== null && v !== undefined){
    var it = fila[parseInt(v,10)];
    capturaEmUso = it.iso || null;
    $("fSolicitante").value = it.quem || "";
    /* o que foi anotado na captura já é um nome curto: serve de título */
    $("fTitulo").value = (it.oque || "").slice(0, 100);
    $("fDetalhes").value = it.oque || "";
    document.querySelector('nav.tabs button[data-tab="abrir"]').click();
    toast("Levado para o formulário. Complete os obrigatórios.");
  }
});
function addCaptura(){
  var quem = $("capQuem").value.trim(), oque = $("capOque").value.trim();
  if(!oque){ $("capOque").focus(); return; }
  var agora = new Date();
  fila.unshift({ quem:quem, oque:oque,
    hora: agora.toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}),
    iso: agora.toISOString() });
  save(K.fila, fila); $("capQuem").value=""; $("capOque").value=""; $("capQuem").focus(); renderFila();
}
$("capAdd").addEventListener("click", addCaptura);
["capQuem","capOque"].forEach(function(id){
  $(id).addEventListener("keydown", function(e){ if(e.key==="Enter") addCaptura(); });
});

/* ---------------- abrir chamado ---------------- */
/* os seletores saem do próprio Bitrix: o value de cada opção é o id dela,
   que é o que o crm.item.add espera. Nenhum id fica escrito no código. */
var ABRIR_SELECTS = {categoria:"fCategoria", subcategoria:"fSubcategoria",
                     prioridade:"fPrioridade", canal:"fCanal", empresa:"fEmpresa"};
function pintarSelectsAbrir(){
  var vazios = [];
  Object.keys(ABRIR_SELECTS).forEach(function(nome){
    var sel = $(ABRIR_SELECTS[nome]);
    if(!sel) return;
    var mapa = enumRotulos[B.campo[nome]];
    if(!mapa || !Object.keys(mapa).length){ vazios.push(nome); return; }
    var atual = sel.value;
    sel.innerHTML = '<option value="">—</option>';
    Object.keys(mapa).forEach(function(id){
      var o = document.createElement("option");
      o.value = id; o.textContent = mapa[id];
      sel.appendChild(o);
    });
    if(atual) sel.value = atual;
  });
  return vazios;
}
function montarSelectsAbrir(){
  var vazios = pintarSelectsAbrir();          /* desenha já com o que está em cache */
  if(!load(K.wh, "")){
    if(vazios.length){
      $("abrirAviso").style.color = "var(--muted)";
      $("abrirAviso").textContent = "Conecte o webhook na aba Bitrix uma vez para a página " +
        "aprender as listas do portal — depois o formulário funciona mesmo sem conexão.";
    }
    return Promise.resolve();
  }
  return carregarMetaCampos().then(pintarSelectsAbrir);   /* atualiza com o que veio agora */
}
(function(){
  var se = $("fEtapa");
  ETAPAS.forEach(function(e){ var o=document.createElement("option"); o.textContent=e; se.appendChild(o); });
})();
$("fPrioridade").addEventListener("change", function(){
  /* o value é o id da opção; o prazo vem do rótulo */
  var s = slaDeLabel(this.value);
  $("slaHint").textContent = s ? s.t : "Escolha a prioridade para ver o prazo.";
});
$("btnLimpar").addEventListener("click", function(){
  ["fTitulo","fEmpresa","fCanal","fCategoria","fSubcategoria","fPrioridade","fDetalhes",
   "fSolicitante","fEquipamento","fResponsavel","fTipo"]
    .forEach(function(id){ if($(id)) $(id).value = ""; });
  $("slaHint").textContent = "Escolha a prioridade para ver o prazo.";
  $("abrirAviso").textContent = "";
  /* soltou o formulário: a anotação de origem deixa de estar em jogo, senão o
     próximo chamado criado marcaria a anotação errada como virada */
  capturaEmUso = null;
});

/* o Bitrix exige categoria, subcategoria, canal e detalhes. O nome e a
   prioridade a página exige por conta: sem nome o chamado não se identifica na
   lista, e sem prioridade ele nasce fora do controle de SLA */
var OBRIGATORIOS = [["fTitulo","Nome do chamado"],
                    ["fCategoria","Categoria"], ["fSubcategoria","Subcategoria"],
                    ["fCanal","Canal de abertura"], ["fDetalhes","Detalhes"],
                    ["fPrioridade","Prioridade"]];
function faltandoNoFormulario(){
  return OBRIGATORIOS.filter(function(r){ return !String($(r[0]).value || "").trim(); })
                     .map(function(r){ return r[1]; });
}
function camposDoNovoChamado(){
  var c = B.campo, f = {};
  f.title = $("fTitulo").value.trim();   /* é o nome que aparece na lista */
  f.opened = true;                       /* "Disponível para todos", obrigatório */
  f.categoryId = 27;                     /* funil dos chamados técnicos */
  f[c.categoria]    = $("fCategoria").value;
  f[c.subcategoria] = $("fSubcategoria").value;
  f[c.canal]        = $("fCanal").value;
  f[c.prioridade]   = $("fPrioridade").value;
  f[c.detalhes]     = $("fDetalhes").value.trim();
  if($("fEmpresa").value) f[c.empresa] = $("fEmpresa").value;
  var eq = String($("fEquipamento").value || "").trim();
  if(eq) f[c.equipamento] = [eq];        /* campo múltiplo: vai array */
  return f;
}
function salvarLocalmente(aviso){
  var c = {
    id: "local-" + Date.now(),
    titulo: $("fTitulo").value.trim(),
    empresa: $("fEmpresa").value,
    canal: labelEnum(B.campo.canal, $("fCanal").value),
    categoria: labelCategoria($("fCategoria").value),
    prioridade: labelPrioridade($("fPrioridade").value),
    etapa: $("fEtapa").value || ETAPAS[0],
    solicitante: $("fSolicitante").value, equipamento: $("fEquipamento").value,
    detalhes: $("fDetalhes").value, aberto: new Date().toISOString(),
    origem: "local", doc: null
  };
  chamados.unshift(c); save(K.chamados, chamados);
  marcarCapturaComoVirada("local");
  $("abrirAviso").style.color = "var(--good)";
  $("abrirAviso").textContent = aviso;
  $("btnLimpar").click();
  toast("Chamado salvo nesta página.");
}
$("btnSalvarChamado").addEventListener("click", function(){
  var btn = this;
  var faltam = faltandoNoFormulario();
  if(faltam.length){
    $("abrirAviso").style.color = "var(--crit)";
    $("abrirAviso").textContent = "Faltam: " + faltam.join(", ");
    return;
  }
  if(!load(K.wh, "")){
    salvarLocalmente("Salvo nesta página. Para criar no Bitrix, conecte o webhook na aba Bitrix.");
    return;
  }
  btn.disabled = true;
  $("abrirAviso").style.color = "var(--muted)";
  $("abrirAviso").textContent = "Criando no Bitrix...";
  bitrixCall("crm.item.add", {entityTypeId: B.tipo, fields: camposDoNovoChamado()})
    .then(function(j){
      var novo = j.result && j.result.item ? j.result.item : null;
      if(!novo || !novo.id) throw new Error("o Bitrix respondeu sem o número do chamado");
      $("abrirAviso").style.color = "var(--good)";
      $("abrirAviso").innerHTML = 'Chamado <b>#' + esc(novo.id) + '</b> criado no Bitrix. ' +
        '<a href="' + B.portal + '/page/chamados/chamado_tecnico/type/' + B.tipo +
        '/details/' + esc(novo.id) + '/" target="_blank" rel="noopener">abrir no portal</a>';
      toast("Chamado #" + novo.id + " criado.");
      marcarCapturaComoVirada(novo.id);   /* a anotação não volta para a fila */
      $("fTitulo").value = ""; $("fDetalhes").value = "";
      $("fSolicitante").value = ""; $("fEquipamento").value = "";
      carregarChamados();
    })
    .catch(function(e){
      /* nada foi criado: o formulário fica como está para não perder o que foi digitado */
      $("abrirAviso").style.color = "var(--crit)";
      $("abrirAviso").textContent = "Não criei o chamado: " + e.message +
        " — o que você digitou continua aqui.";
    })
    .then(function(){ btn.disabled = false; });
});

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
  /* o escuro é o padrão da página, não o do sistema: a identidade é preto com
     verde, e esta tela fica aberta o dia inteiro ao lado do Bitrix */
  var escuro = r.getAttribute("data-theme") !== "light";
  r.setAttribute("data-theme", escuro ? "light" : "dark");
  save(K.tema, escuro ? "light" : "dark");
});
(function(){ var t = load(K.tema, null); if(t) document.documentElement.setAttribute("data-theme", t); })();

/* ---------------- captura ----------------
   A fila é uma lista de trabalho, não um bloco de notas: cada anotação pendente
   se classifica na própria linha e entra num lote. Canal e empresa ficam em
   cima porque repetem; categoria, subcategoria e prioridade mudam por chamado. */
var CLS_LINHA = ["categoria","subcategoria","prioridade"];
var CLS_VAZIO = {categoria:"Categoria *", subcategoria:"Subcategoria *", prioridade:"Prioridade *"};

function opcoesEnum(nome, valor, curto){
  var mapa = enumRotulos[B.campo[nome]] || {};
  var ids = Object.keys(mapa);
  if(!ids.length) return null;
  return ids.map(function(id){
    var txt = curto ? rotuloCurto(mapa[id]) : mapa[id];
    return '<option value="' + esc(id) + '"' + (String(valor) === id ? " selected" : "") +
           ">" + esc(txt) + "</option>";
  }).join("");
}
function selectLinha(nome, item, i){
  /* a prioridade vem do Bitrix com o SLA inteiro escrito junto; numa linha
     compacta isso não cabe, então aqui vai só o nome dela */
  var ops = opcoesEnum(nome, item[nome], nome === "prioridade");
  if(!ops) return '<span class="q-semlista">conecte o Bitrix</span>';
  return '<select class="q-sel" data-cls="' + nome + '" data-i="' + i + '">' +
         '<option value="">' + CLS_VAZIO[nome] + "</option>" + ops + "</select>";
}
/* o que falta nesta anotação para virar chamado */
function faltaNaAnotacao(item){
  var falta = CLS_LINHA.filter(function(n){ return !item[n]; })
                       .map(function(n){ return CLS_VAZIO[n].replace(" *",""); });
  if(!$("loteCanal").value) falta.push("Canal");
  return falta;
}
function renderFila(){
  var ul = $("fila"); ul.innerHTML = "";
  $("filaVazia").hidden = fila.length > 0;
  var pendentes = fila.filter(function(it){ return !it.chamado; }).length;
  /* o número na aba é o que ainda falta virar chamado, não o tamanho da lista */
  $("pillFila").textContent = pendentes;
  fila.forEach(function(item, i){
    var li = document.createElement("li");
    var virado = !!item.chamado;
    li.className = virado ? "feito" : (item.erro ? "falhou" : "");
    var selo = "";
    if(virado){
      selo = item.chamado === "local"
        ? '<span class="tag neutral">virou chamado local</span>'
        : '<a class="tag ok" target="_blank" rel="noopener" href="' + B.portal +
          '/crm/type/' + B.tipo + '/details/' + encodeURIComponent(item.chamado) +
          '/">virou o chamado #' + esc(item.chamado) + "</a>";
    }
    li.innerHTML =
      '<div class="q-top">' +
        (virado ? '<span class="q-ok" aria-hidden="true">✓</span>'
                : '<input type="checkbox" class="fsel" data-i="' + i + '"' +
                  (item.marcada === false ? "" : " checked") + ' aria-label="incluir no lote">') +
        '<div class="txt"><b>' + esc(item.quem || "sem nome") + '</b> — ' + esc(item.oque) +
          (selo ? '<div class="virou">' + selo + "</div>" : "") + "</div>" +
        '<div class="when">' + esc(item.hora) + "</div>" +
        '<div class="acts">' +
          (virado ? "" : '<button class="mini" data-virar="' + i + '">abrir completo</button>') +
          '<button class="mini danger" data-del="' + i + '">apagar</button>' +
        "</div>" +
      "</div>" +
      (virado ? "" :
        '<div class="q-cls">' +
          CLS_LINHA.map(function(n){ return selectLinha(n, item, i); }).join("") +
          (item.erro ? '<span class="q-erro">' + esc(item.erro) + "</span>" : "") +
        "</div>");
    ul.appendChild(li);
  });
  $("btnLote").disabled = !pendentes;
  pintarAvisoLote();
}
function pintarAvisoLote(){
  var al = $("loteAviso"); if(!al) return;
  var marcadas = fila.filter(function(it){ return !it.chamado && it.marcada !== false; });
  if(!fila.filter(function(it){ return !it.chamado; }).length){
    al.textContent = "Nenhuma anotação pendente.";
    return;
  }
  if(!load(K.wh, "")){
    al.textContent = "Sem webhook conectado: o lote precisa do Bitrix. Conecte na aba Bitrix.";
    return;
  }
  var incompletas = marcadas.filter(function(it){ return faltaNaAnotacao(it).length; }).length;
  al.textContent = marcadas.length + (marcadas.length === 1 ? " anotação marcada" : " anotações marcadas") +
    (incompletas ? ", " + incompletas + " sem classificação completa." : ". Tudo classificado.");
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
/* a classificação fica guardada na anotação: classificar oito e ser
   interrompido não pode custar o trabalho todo */
$("fila").addEventListener("change", function(e){
  var t = e.target;
  if(t.classList.contains("q-sel")){
    fila[parseInt(t.dataset.i, 10)][t.dataset.cls] = t.value;
    save(K.fila, fila); pintarAvisoLote(); return;
  }
  if(t.classList.contains("fsel")){
    fila[parseInt(t.dataset.i, 10)].marcada = t.checked;
    save(K.fila, fila); pintarAvisoLote();
  }
});
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

/* ---------------- lote: várias anotações num clique ---------------- */
function montarSelectsLote(){
  [["loteCanal","canal","Canal de abertura *"], ["loteEmpresa","empresa","Empresa"]]
    .forEach(function(par){
      var sel = $(par[0]); if(!sel) return;
      var ops = opcoesEnum(par[1], sel.value, false);
      if(!ops) return;
      var atual = sel.value;
      sel.innerHTML = '<option value="">' + par[2] + "</option>" + ops;
      sel.value = atual;
    });
  var cfg = load(K.lote, null);
  if(cfg){
    if(cfg.canal && $("loteCanal")) $("loteCanal").value = cfg.canal;
    if(cfg.empresa && $("loteEmpresa")) $("loteEmpresa").value = cfg.empresa;
  }
}
["loteCanal","loteEmpresa"].forEach(function(id){
  $(id).addEventListener("change", function(){
    save(K.lote, {canal:$("loteCanal").value, empresa:$("loteEmpresa").value});
    pintarAvisoLote();
  });
});
$("loteTodas").addEventListener("change", function(){
  var marcar = this.checked;
  fila.forEach(function(it){ if(!it.chamado) it.marcada = marcar; });
  save(K.fila, fila); renderFila();
});

function camposDaAnotacao(item){
  var c = B.campo, f = {};
  f.title = String(item.oque || "").slice(0, 100);
  f.opened = true;
  f.categoryId = 27;
  f[c.categoria]    = item.categoria;
  f[c.subcategoria] = item.subcategoria;
  f[c.prioridade]   = item.prioridade;
  f[c.canal]        = $("loteCanal").value;
  f[c.detalhes]     = item.oque || "";
  if($("loteEmpresa").value) f[c.empresa] = $("loteEmpresa").value;
  if(item.quem) f[c.solicitante] = item.quem;
  return f;
}
var loteRodando = false;
$("btnLote").addEventListener("click", function(){
  if(loteRodando) return;                 /* dois cliques não criam dois chamados */
  if(!load(K.wh, "")){
    $("loteAviso").textContent = "Sem webhook conectado: o lote precisa do Bitrix. Conecte na aba Bitrix.";
    return;
  }
  var alvos = [];
  fila.forEach(function(it){ if(!it.chamado && it.marcada !== false) alvos.push(it); });
  if(!alvos.length){ toast("Marque pelo menos uma anotação."); return; }

  /* valida tudo ANTES de criar qualquer coisa: lote que para no meio deixa
     metade criada e a pessoa sem saber onde parou */
  var incompletas = alvos.filter(function(it){ return faltaNaAnotacao(it).length; });
  if(incompletas.length){
    incompletas.forEach(function(it){ it.erro = "falta " + faltaNaAnotacao(it).join(", "); });
    save(K.fila, fila); renderFila();
    $("loteAviso").textContent = "Não criei nada: " + incompletas.length +
      (incompletas.length === 1 ? " anotação está" : " anotações estão") + " sem classificação completa.";
    return;
  }

  loteRodando = true;
  this.disabled = true;
  var feitos = 0, falhas = 0, total = alvos.length;
  $("loteAviso").textContent = "Criando 1 de " + total + "...";

  alvos.reduce(function(p, item, k){
    return p.then(function(){
      $("loteAviso").textContent = "Criando " + (k + 1) + " de " + total + "...";
      return bitrixCall("crm.item.add", {entityTypeId: B.tipo, fields: camposDaAnotacao(item)})
        .then(function(j){
          var novo = j.result && j.result.item ? j.result.item : null;
          if(!novo || !novo.id) throw new Error("o Bitrix respondeu sem o número do chamado");
          item.chamado = novo.id; item.erro = null; feitos++;
          if(typeof marcarVisto === "function") marcarVisto(novo.id);
        })
        .catch(function(e){
          /* a anotação continua pendente de propósito: ela precisa poder ser
             tentada de novo depois que a causa for resolvida */
          item.erro = e.message; falhas++;
        })
        .then(function(){ save(K.fila, fila); renderFila(); });
    });
  }, Promise.resolve()).then(function(){
    loteRodando = false;
    $("btnLote").disabled = false;
    $("loteAviso").textContent =
      (feitos ? feitos + (feitos === 1 ? " chamado criado" : " chamados criados") : "Nenhum chamado criado") +
      (falhas ? ", " + falhas + (falhas === 1 ? " falhou — o erro está na linha." : " falharam — os erros estão nas linhas.") : ".");
    if(feitos) toast(feitos + (feitos === 1 ? " chamado criado." : " chamados criados."));
    if(feitos) carregarChamados();
  });
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
  return carregarMetaCampos().then(function(){
    pintarSelectsAbrir();
    /* a fila e a barra do lote usam as mesmas listas: redesenha com o que veio */
    montarSelectsLote(); renderFila();
    if(typeof montarSelectsAplicar === "function") montarSelectsAplicar();
  });
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
      /* este chamado nasceu aqui: não faz sentido a página alertar sobre ele
         na releitura de daqui a pouco */
      if(typeof marcarVisto === "function") marcarVisto(novo.id);
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

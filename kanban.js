"use strict";
/* ---------------- kanban ----------------
   A mesma lista do painel, com os mesmos filtros e contadores, só que em
   colunas: uma por etapa do funil, na ordem do funil.

   Arrastar um cartão muda a etapa no Bitrix, e mudar de etapa lá dispara as
   automações do portal (alertas, a tarefa do atendimento). Por isso soltar não
   grava: abre uma pergunta, e só o "Mover" grava. Só a etapa é enviada — nenhum
   outro campo do chamado passa por aqui.

   Concluir não se faz arrastando: exige a resolução escrita, e isso é na ficha. */

K.modo = "ctip.modo";
var kbPend = null;         /* {id, de, para:{id, nome}} esperando a resposta */
var kbArrastando = null;   /* id do cartão que está no ar */
var kbOcupado = false;
var kbSujo = false;        /* chegou dado novo no meio de um arrasto */
var kbErro = "";
var kbCols = {};           /* nome da coluna -> coluna, do último desenho */

function kbChamado(id){
  for(var i = 0; i < chamados.length; i++) if(String(chamados[i].id) === String(id)) return chamados[i];
  return null;
}
function kbPressao(c){ var s = situacao(c); return s.limite ? s.gasto / s.limite : 0; }
/* bitrix só se move com o funil lido: é dele que vem o id da etapa de destino */
function kbPodeArrastar(c){
  if(fechado(c)) return false;
  return c.origem !== "bitrix" || etapasLista.length > 0;
}

function kbColunas(lista){
  var comFechadas = $("chkConcluidos") && $("chkConcluidos").checked;
  var cols = [], porNome = {};
  function nova(id, nome, fechada){
    var col = {id: id, nome: nome, fechada: fechada, itens: []};
    porNome[nome] = col; cols.push(col);
    return col;
  }
  if(etapasLista.length){
    etapasLista.forEach(function(e){
      var f = e.semantica === "S" || e.semantica === "F";
      if(!f || comFechadas) nova(e.id, e.nome, f);
    });
  } else {
    /* sem o funil do Bitrix (página sem webhook), valem as etapas conhecidas */
    ETAPAS.forEach(function(n){
      var f = n === "Concluir";
      if(!f || comFechadas) nova(null, n, f);
    });
  }
  lista.forEach(function(c){
    var nome = c.etapa || "Sem etapa";
    /* etapa que o funil lido não tem: ganha coluna no fim, em vez de sumir */
    (porNome[nome] || nova(null, nome, fechado(c))).itens.push(c);
  });
  return cols;
}

function kbCartao(c){
  var s = situacao(c);
  var quem = [c.empresa, c.solicitante].filter(Boolean).join(" · ");
  var horas = s.limite ? s.gasto.toFixed(1) + " h de " + s.limite + " h" : s.gasto.toFixed(1) + " h";
  var arrasta = kbPodeArrastar(c);
  return '<article class="kb-card ' + s.cls +
      (kbPend && String(kbPend.id) === String(c.id) ? " pendente" : "") + '"' +
      ' data-id="' + esc(c.id) + '" tabindex="0" draggable="' + (arrasta ? "true" : "false") + '"' +
      ' title="' + (arrasta ? "Clique para documentar; arraste para mudar de etapa" : "Clique para documentar") + '">' +
    '<div class="kb-topo"><span class="kb-id">' + (c.origem === "bitrix" ? "#" + esc(c.id) : "local") + "</span>" +
      '<span class="tag ' + s.cls + '">' + esc(s.txt) + "</span></div>" +
    '<div class="kb-titulo">' + esc(c.titulo || ("#" + c.id)) + "</div>" +
    (quem ? '<div class="kb-meta">' + esc(quem) + "</div>" : "") +
    '<div class="kb-pe"><span>' + esc(rotuloCurto(c.prioridade) || "sem prioridade") + "</span>" +
      "<span>" + esc(labelUsuario(c.responsavelId) || "sem responsável") + "</span>" +
      '<span class="kb-h">' + horas + "</span></div>" +
    "</article>";
}

function renderKanban(){
  var alvo = $("kbQuadro");
  if(!alvo || $("sub-kanban").hidden) return;
  /* redesenhar com um cartão no ar soltaria o cartão da mão */
  if(kbArrastando){ kbSujo = true; return; }
  kbSujo = false;
  var lista = visiveis();

  /* a pergunta só vale enquanto o chamado está onde estava quando foi solto */
  if(kbPend && !kbOcupado){
    var pc = kbChamado(kbPend.id);
    if(!pc || pc.etapa !== kbPend.de){
      kbPend = null;
      toast("O chamado mudou de etapa enquanto a pergunta estava aberta. Nada foi movido.");
    }
  }

  var cols = kbColunas(lista);
  kbCols = {};
  alvo.innerHTML = cols.map(function(col){
    kbCols[col.nome] = col;
    col.itens.sort(function(a, b){ return kbPressao(b) - kbPressao(a); });
    var crit = col.fechada ? 0 : col.itens.filter(function(c){ return situacao(c).cls === "crit"; }).length;
    return '<section class="kb-col' + (col.fechada ? " fechada" : "") +
        (kbPend && kbPend.para.nome === col.nome ? " destino" : "") + '" data-col="' + esc(col.nome) + '">' +
      "<header><b title=\"" + esc(col.nome) + "\">" + esc(col.nome) + '</b><span class="cnt">' + col.itens.length + "</span>" +
        (crit ? '<span class="tag crit">' + crit + (crit === 1 ? " estourado" : " estourados") + "</span>" : "") +
      '</header><div class="kb-lista">' +
        (col.itens.length ? col.itens.map(kbCartao).join("") : '<div class="kb-vazio">vazia</div>') +
      "</div></section>";
  }).join("");

  $("kbVazio").hidden = chamados.length > 0;
  alvo.hidden = chamados.length === 0;

  var cf = $("kbConfirma");
  cf.hidden = !kbPend;
  if(kbPend){
    var c = kbChamado(kbPend.id);
    $("kbPergunta").innerHTML = "Mover <b>" + (c && c.origem === "bitrix" ? "#" + esc(kbPend.id) + " " : "") +
      esc(c ? (c.titulo || "") : "") + "</b> de “" + esc(kbPend.de) + "” para <b>“" + esc(kbPend.para.nome) + "”</b>?" +
      (c && c.origem === "bitrix" ? " Isso muda a etapa no Bitrix e dispara as automações dessa etapa." : "");
    $("kbSim").disabled = kbOcupado; $("kbNao").disabled = kbOcupado;
    $("kbSim").textContent = kbOcupado ? "Movendo…" : "Mover";
  }
  $("kbErro").hidden = !kbErro;
  $("kbErro").textContent = kbErro;
}

/* ---------------- soltar: decide se cabe uma pergunta ---------------- */
function kbSoltar(id, nomeColuna){
  var c = kbChamado(id), col = kbCols[nomeColuna];
  if(!c || !col || kbOcupado) return;
  var de = c.etapa || "Sem etapa";
  if(col.nome === de) return;
  kbErro = "";
  if(col.fechada){
    toast("Para encerrar, abra o chamado e use Encerrar: a resolução é obrigatória.");
    return;
  }
  if(c.origem === "bitrix" && !col.id){
    toast("Essa coluna não é uma etapa do funil do Bitrix. Nada foi movido.");
    return;
  }
  kbPend = {id: c.id, de: de, para: {id: col.id, nome: col.nome}};
}
function kbMover(){
  var p = kbPend;
  if(!p || kbOcupado) return;
  var c = kbChamado(p.id);
  if(!c){ kbPend = null; renderKanban(); return; }
  if(c.origem !== "bitrix"){
    c.etapa = p.para.nome;
    save(K.chamados, chamados);
    kbPend = null;
    toast("Movido para " + p.para.nome + " (chamado local).");
    renderPainel();
    return;
  }
  kbOcupado = true; renderKanban();
  bitrixCall("crm.item.update", {entityTypeId: B.tipo, id: c.id, fields: {stageId: p.para.id}})
    .then(function(){
      kbOcupado = false; kbPend = null;
      /* já aparece na coluna nova; a releitura logo abaixo é quem confirma */
      c.etapa = p.para.nome;
      toast("#" + c.id + " movido para " + p.para.nome + ".");
      renderPainel();
      carregarChamados();
    }, function(e){
      kbOcupado = false; kbPend = null;
      kbErro = "O Bitrix não aceitou mover o #" + c.id + " (" + e.message + "). Ele continua em “" + p.de + "”.";
      renderKanban();
    });
}

if($("kbQuadro")){
  var kbQ = $("kbQuadro");
  var kbColDe = function(el){ return el && el.closest ? el.closest(".kb-col") : null; };
  var kbLimpaSobre = function(){
    Array.prototype.forEach.call(kbQ.querySelectorAll(".kb-col.sobre"), function(n){ n.classList.remove("sobre"); });
  };
  kbQ.addEventListener("dragstart", function(e){
    var card = e.target.closest ? e.target.closest('.kb-card[draggable="true"]') : null;
    if(!card || kbOcupado){ e.preventDefault(); return; }
    kbArrastando = card.dataset.id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", card.dataset.id);
    /* no próximo quadro, senão a imagem que segue o cursor já sai apagada */
    setTimeout(function(){ card.classList.add("arrastando"); }, 0);
  });
  kbQ.addEventListener("dragover", function(e){
    var col = kbColDe(e.target);
    if(!kbArrastando || !col) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if(!col.classList.contains("sobre")){ kbLimpaSobre(); col.classList.add("sobre"); }
  });
  kbQ.addEventListener("dragleave", function(e){
    var col = kbColDe(e.target);
    if(col && !col.contains(e.relatedTarget)) col.classList.remove("sobre");
  });
  kbQ.addEventListener("drop", function(e){
    var col = kbColDe(e.target);
    if(!kbArrastando || !col) return;
    e.preventDefault();
    var id = kbArrastando;
    kbArrastando = null;
    kbSoltar(id, col.dataset.col);
    renderKanban();
  });
  kbQ.addEventListener("dragend", function(){
    kbArrastando = null;
    kbLimpaSobre();
    renderKanban();
  });
  /* clicar (ou Enter) no cartão leva para a ficha, como a linha da lista */
  var kbAbrir = function(card){
    document.querySelector('nav.tabs button[data-tab="documentar"]').click();
    $("dChamado").value = card.dataset.id;
    carregarItem(card.dataset.id);
  };
  kbQ.addEventListener("click", function(e){
    var card = e.target.closest ? e.target.closest(".kb-card") : null;
    if(card) kbAbrir(card);
  });
  kbQ.addEventListener("keydown", function(e){
    if(e.key !== "Enter") return;
    var card = e.target.closest ? e.target.closest(".kb-card") : null;
    if(card) kbAbrir(card);
  });
  $("kbSim").addEventListener("click", kbMover);
  $("kbNao").addEventListener("click", function(){
    if(kbOcupado) return;
    kbPend = null; renderKanban();
  });

  /* o modo escolhido (lista ou kanban) é lembrado; o dashboard não, porque
     abrir direto nele esconderia a lista de quem só quer ver os chamados */
  Array.prototype.forEach.call(document.querySelectorAll("#tab-painel .subtabs button"), function(b){
    b.addEventListener("click", function(){
      if(b.dataset.sub !== "dash") save(K.modo, b.dataset.sub);
      if(b.dataset.sub === "kanban") renderKanban();
    });
  });
  if(load(K.modo, "") === "kanban"){
    var kbBotao = document.querySelector('#tab-painel .subtabs button[data-sub="kanban"]');
    if(kbBotao) kbBotao.click();
  }
}

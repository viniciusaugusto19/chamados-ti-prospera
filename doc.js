"use strict";
/* ---------------- documentar ---------------- */
var testes = [], passos = [];
var LISTA_META = {
  listaTestes: {cnt:"cntTestes", vazio:"vazioTestes"},
  listaPassos: {cnt:"cntPassos", vazio:"vazioPassos"}
};
function renderLista(ul, arr, tag){
  ul.innerHTML = "";
  arr.forEach(function(t, i){
    var li = document.createElement("li");
    li.innerHTML =
      '<span class="marca">' + (i + 1) + '</span>' +
      '<span class="txt">' + esc(t) + '</span>' +
      '<button class="x" type="button" title="remover" data-rm="' + i + '" data-tag="' + tag + '">&times;</button>';
    ul.appendChild(li);
  });
  var m = LISTA_META[ul.id];
  if(m){
    if($(m.cnt)) $(m.cnt).textContent = arr.length;
    if($(m.vazio)) $(m.vazio).hidden = arr.length > 0;
  }
}
function bindLista(inputId, btnId, ulId, arr, tag){
  function add(){
    var v = $(inputId).value.trim(); if(!v) return;
    arr.push(v); $(inputId).value = ""; renderLista($(ulId), arr, tag); $(inputId).focus();
  }
  $(btnId).addEventListener("click", add);
  $(inputId).addEventListener("keydown", function(e){ if(e.key==="Enter") add(); });
  $(ulId).addEventListener("click", function(e){
    var i = e.target.getAttribute("data-rm");
    if(i !== null && i !== undefined){ arr.splice(parseInt(i,10),1); renderLista($(ulId), arr, tag); }
  });
}
bindLista("dTesteIn","dTesteAdd","listaTestes", testes, "t");
bindLista("dPassoIn","dPassoAdd","listaPassos", passos, "p");

function renderSelectChamados(){
  var sel = $("dChamado"); var atual = sel.value;
  sel.innerHTML = '<option value="">—</option>';
  chamados.forEach(function(c){
    var o = document.createElement("option");
    o.value = c.id;
    o.textContent = (c.origem === "bitrix" ? "#" + c.id + " " : "") + (c.titulo || c.id);
    sel.appendChild(o);
  });
  sel.value = atual;
}
function limparForm(){
  testes.length = 0; passos.length = 0;
  renderLista($("listaTestes"), testes, "t"); renderLista($("listaPassos"), passos, "p");
  $("dResolucao").value = ""; $("dPausaMotivo").value = "";
  $("dPausaIni").value = ""; $("dPausaFim").value = "";
  $("dContexto").hidden = true; $("cardEtapa").hidden = true;
  if($("cardHistorico")) $("cardHistorico").hidden = true;
  $("semChamado").hidden = false;
  $("btnEncerrar").hidden = true; $("docAviso").textContent = "";
  itemAtual = null;
}
/* trilho de etapas: botões no lugar do select; o select fica escondido
   só para o código de gravação continuar lendo um valor único */
function montarEtapaSelect(stageAtual){
  var sel = $("dEtapa"); sel.innerHTML = "";
  var tr = $("trilho"); tr.innerHTML = "";
  if(!etapasLista.length){ $("cardEtapa").hidden = true; return; }
  etapasLista.forEach(function(e){
    var o = document.createElement("option");
    o.value = e.id; o.textContent = e.nome; sel.appendChild(o);

    var b = document.createElement("button");
    b.type = "button"; b.dataset.id = e.id;
    if(e.semantica === "S") b.className = "encerra";
    b.setAttribute("aria-pressed", e.id === stageAtual ? "true" : "false");
    b.innerHTML = '<span class="bolha"></span><span>' + esc(e.nome) + "</span>" +
      (e.id === stageAtual ? '<span class="atual">atual</span>' : "");
    tr.appendChild(b);
  });
  sel.value = stageAtual || "";
  $("cardEtapa").hidden = false;
}
$("trilho").addEventListener("click", function(e){
  var b = e.target.closest("button[data-id]");
  if(!b) return;
  $("dEtapa").value = b.dataset.id;
  Array.prototype.forEach.call(this.querySelectorAll("button"), function(o){
    o.setAttribute("aria-pressed", o === b ? "true" : "false");
  });
});
function metaLinha(rotulo, valor){
  return "<div><dt>" + esc(rotulo) + "</dt><dd>" + esc(valor || "—") + "</dd></div>";
}
/* desenha o cabeçalho do chamado: título, selos, barra de SLA e dados */
function pintarChamado(d){
  $("semChamado").hidden = true;
  $("tkId").textContent = d.ref || "";
  $("tkTitulo").textContent = d.titulo || "(sem título)";

  var chips = [];
  var s = d.situacaoCalc;
  if(d.prioridade) chips.push('<span class="chip ' + (s ? s.cls : "") + '"><b>' + esc(rotuloCurto(d.prioridade)) + "</b></span>");
  if(d.etapa) chips.push('<span class="chip">' + esc(d.etapa) + "</span>");
  if(s) chips.push('<span class="chip ' + s.cls + '">' + esc(s.txt) + "</span>");
  if(d.categoria) chips.push('<span class="chip">' + esc(d.categoria) + "</span>");
  if(d.local) chips.push('<span class="chip">só nesta página</span>');
  $("tkChips").innerHTML = chips.join("");

  if(s && s.limite){
    var pct = Math.min(100, Math.round(s.gasto / s.limite * 100));
    $("tkSla").innerHTML =
      '<span class="sla-num">' + s.gasto.toFixed(1) + "h de " + s.limite + "h</span>" +
      '<span class="sla-track"><span class="sla-fill ' + s.cls + '" style="width:' + pct + '%"></span></span>' +
      '<span class="sla-num">' + pct + "%</span>";
    $("tkSla").hidden = false;
  } else { $("tkSla").hidden = true; }

  if(d.detalhes){ $("tkDetalhe").textContent = d.detalhes; $("tkDetalhe").hidden = false; }
  else { $("tkDetalhe").hidden = true; }

  /* linha sem valor sai da lista, em vez de virar uma fileira de travessões */
  var linhas = [
    ["Empresa",           d.empresa],
    ["Categoria",         d.categoria],
    ["Subcategoria",      d.subcategoria],
    ["Prioridade",        d.prioridade ? rotuloCurto(d.prioridade) : ""],
    ["Canal de abertura", d.canal],
    ["Equipamento",       d.equipamento],
    ["Aberto por",        d.criadoPorTxt],
    ["Aberto em",         d.abertoTxt],
    ["Responsável",       d.responsavelTxt],
    ["Etapa atual",       d.etapa],
    ["Nesta etapa desde", d.movidoTxt],
    ["Última alteração",  d.atualizadoTxt]
  ];
  $("tkMeta").innerHTML = linhas
    .filter(function(l){ return l[1] !== undefined && l[1] !== null && String(l[1]).trim() !== ""; })
    .map(function(l){ return metaLinha(l[0], l[1]); }).join("");
  $("dContexto").hidden = false;
}
/* linha do tempo das etapas, montada depois que o chamado já apareceu */
function pintarHistorico(id){
  var caixa = $("cardHistorico"), alvo = $("histLista");
  if(!caixa || !alvo) return;
  caixa.hidden = false;
  alvo.innerHTML = '<div class="vazio-mini">Buscando no Bitrix...</div>';
  historicoEtapas(id).then(function(h){
    if(h && h.erro){
      /* o portal não respondeu: dizer o porquê vale mais que sumir em silêncio */
      alvo.innerHTML = '<div class="vazio-mini">O portal não devolveu o histórico: ' +
        esc(h.erro) + "</div>";
      return;
    }
    if(!h.length){
      alvo.innerHTML = '<div class="vazio-mini">Sem movimentações registradas.</div>';
      return;
    }
    alvo.innerHTML = h.map(function(p){
      return '<li><span class="hist-quando">' + esc(dataHora(p.quando)) + "</span>" +
             '<span class="hist-etapa">' + esc(p.etapa) + "</span></li>";
    }).join("");
    /* troca de responsável é tentativa: só aparece se o portal devolver algo */
    historicoResponsaveis(id).then(function(r){
      if(r && r.erro) return anotaHistorico("A troca de responsável não é exposta pelo portal.");
      if(!r.length)   return anotaHistorico("Sem troca de responsável registrada.");
      var ids = r.map(function(x){ return x.value || x.VALUE; });
      carregarUsuarios(ids).then(function(){
        alvo.insertAdjacentHTML("beforeend", r.map(function(x){
          return '<li><span class="hist-quando">' + esc(dataHora(x.createdTime || x.CREATED_TIME)) +
                 "</span><span class=\"hist-etapa\">responsável: " +
                 esc(labelUsuario(x.value || x.VALUE)) + "</span></li>";
        }).join(""));
      });
    });
  });
}
function anotaHistorico(txt){
  var alvo = $("histLista");
  if(alvo) alvo.insertAdjacentHTML("afterend", '<div class="vazio-mini">' + esc(txt) + "</div>");
}
/* traz o chamado inteiro do Bitrix e preenche o formulário */
function carregarItem(id){
  var local = null;
  for(var i=0;i<chamados.length;i++){ if(String(chamados[i].id) === String(id)) local = chamados[i]; }
  if(!local){ limparForm(); return; }
  if(local.origem !== "bitrix"){
    limparForm();
    itemAtual = {id: local.id, origem: "local"};
    pintarChamado({
      ref: "local", titulo: local.titulo, categoria: local.categoria,
      prioridade: local.prioridade, etapa: local.etapa, detalhes: local.detalhes,
      abertoTxt: local.aberto ? new Date(local.aberto).toLocaleString("pt-BR") : "—",
      situacaoCalc: situacao(local), local: true
    });
    if(local.doc){
      (local.doc.testes||[]).forEach(function(t){ testes.push(t); });
      (local.doc.passos||[]).forEach(function(t){ passos.push(t); });
      $("dResolucao").value = local.doc.resolucao || "";
      renderLista($("listaTestes"), testes, "t"); renderLista($("listaPassos"), passos, "p");
    }
    return;
  }
  $("docAviso").style.color = "var(--muted)";
  $("docAviso").textContent = "Buscando o chamado no Bitrix...";
  var c = B.campo;
  Promise.all([
    bitrixCall("crm.item.get", {entityTypeId: B.tipo, id: id}),
    carregarMotivosPausa(),
    /* nomes de quem abriu, de quem é responsável e de quem mexeu por último */
    carregarUsuarios([local.criadoPor, local.responsavelId, local.atualizadoPor, local.movidoPor])
  ]).then(function(res){
    var it = res[0].result.item;
    itemAtual = it;
    limparForm();
    itemAtual = it;
    (Array.isArray(it[c.testes]) ? it[c.testes] : (it[c.testes] ? [it[c.testes]] : []))
      .forEach(function(t){ testes.push(t); });
    (Array.isArray(it[c.passos]) ? it[c.passos] : (it[c.passos] ? [it[c.passos]] : []))
      .forEach(function(t){ passos.push(t); });
    renderLista($("listaTestes"), testes, "t"); renderLista($("listaPassos"), passos, "p");
    $("dResolucao").value = it[c.resolucao] || "";
    if(it[c.pausaMotivo]) $("dPausaMotivo").value = it[c.pausaMotivo];
    if(it[c.pausaIni]) $("dPausaIni").value = String(it[c.pausaIni]).slice(0,16);
    if(it[c.pausaFim]) $("dPausaFim").value = String(it[c.pausaFim]).slice(0,16);
    var et = etapasBitrix[it.stageId] || {};
    pintarChamado({
      ref: "#" + it.id,
      titulo: it.title,
      categoria: it[c.categoria],
      subcategoria: it[c.subcategoria],
      empresa: it[c.empresa],
      canal: it[c.canal],
      equipamento: [].concat(it[c.equipamento] || []).filter(Boolean).join(", "),
      prioridade: it[c.prioridade],
      etapa: et.nome || it.stageId,
      detalhes: it[c.detalhes],
      abertoTxt: dataHora(it.createdTime) || "—",
      criadoPorTxt: labelUsuario(it.createdBy),
      responsavelTxt: labelUsuario(it.assignedById),
      movidoTxt: dataHora(it.movedTime),
      atualizadoTxt: it.updatedTime
        ? dataHora(it.updatedTime) + (labelUsuario(it.updatedBy) ? " por " + labelUsuario(it.updatedBy) : "")
        : "",
      situacaoCalc: situacao({
        prioridade: it[c.prioridade], aberto: it.createdTime,
        etapa: et.nome, semantica: et.semantica
      })
    });
    montarEtapaSelect(it.stageId);
    pintarHistorico(it.id);
    $("btnEncerrar").hidden = !etapasLista.some(function(e){ return e.semantica === "S"; });
    $("docAviso").textContent = "";
  }).catch(function(e){
    $("docAviso").style.color = "var(--crit)";
    $("docAviso").textContent = "Não consegui abrir o chamado: " + e.message;
  });
}
$("dChamado").addEventListener("change", function(){
  if(this.value) carregarItem(this.value); else limparForm();
});
function textoDoc(){
  var linhas = [];
  if(testes.length){ linhas.push("TESTES REALIZADOS"); testes.forEach(function(t,i){ linhas.push((i+1)+". "+t); }); linhas.push(""); }
  if(passos.length){ linhas.push("PRÓXIMOS PASSOS"); passos.forEach(function(t,i){ linhas.push((i+1)+". "+t); }); linhas.push(""); }
  if($("dResolucao").value.trim()){ linhas.push("RESOLUÇÃO"); linhas.push($("dResolucao").value.trim()); }
  var m = $("dPausaMotivo").value.trim();
  if(m){ linhas.push(""); linhas.push("PAUSA: " + m +
    ($("dPausaIni").value ? " · de " + $("dPausaIni").value : "") +
    ($("dPausaFim").value ? " até " + $("dPausaFim").value : "")); }
  return linhas.join("\n");
}
$("btnCopiarDoc").addEventListener("click", function(){
  var txt = textoDoc();
  if(!txt){ toast("Nada para copiar ainda."); return; }
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(
      function(){ toast("Copiado — cole no campo Resolução do Bitrix."); },
      function(){ fallbackCopy(txt); });
  } else { fallbackCopy(txt); }
});
function fallbackCopy(txt){
  var ta = document.createElement("textarea");
  ta.value = txt; ta.style.position="fixed"; ta.style.opacity="0";
  document.body.appendChild(ta); ta.select();
  try{ document.execCommand("copy"); toast("Copiado."); }
  catch(e){ toast("Não consegui copiar — selecione o texto manualmente."); }
  ta.remove();
}
/* trava: só grava se o chamado foi lido antes, senão as listas vazias apagariam
   o que já está no Bitrix */
function podeGravar(){
  var id = $("dChamado").value;
  if(!id){ toast("Escolha o chamado primeiro."); return false; }
  if(!itemAtual || String(itemAtual.id) !== String(id)){
    $("docAviso").style.color = "var(--crit)";
    $("docAviso").textContent = "O chamado não terminou de carregar. Selecione de novo antes de gravar — " +
      "gravar agora apagaria os testes e passos que já estão no Bitrix.";
    return false;
  }
  return true;
}
/* monta o pacote de campos para o crm.item.update */
function camposParaSalvar(){
  var c = B.campo, f = {};
  f[c.testes]    = testes.slice();          /* campo múltiplo: vai array */
  f[c.passos]    = passos.slice();          /* idem */
  f[c.resolucao] = $("dResolucao").value;
  /* pausa: só mexe se a tela conseguiu refletir o que está no Bitrix.
     Se o item tinha motivo e o select não casou, deixa o campo de fora
     em vez de apagar. */
  var tinhaMotivo = itemAtual && itemAtual[c.pausaMotivo];
  var mostraMotivo = $("dPausaMotivo").value;
  if(!(tinhaMotivo && !mostraMotivo)){
    f[c.pausaMotivo] = mostraMotivo || "";
    f[c.pausaIni] = $("dPausaIni").value ? $("dPausaIni").value + ":00" : "";
    f[c.pausaFim] = $("dPausaFim").value ? $("dPausaFim").value + ":00" : "";
  }
  return f;
}
function gravarNoBitrix(fields, oque){
  var id = $("dChamado").value;
  $("docAviso").style.color = "var(--muted)";
  $("docAviso").textContent = "Gravando...";
  return bitrixCall("crm.item.update", {entityTypeId: B.tipo, id: id, fields: fields})
    .then(function(){
      $("docAviso").style.color = "var(--good)";
      $("docAviso").textContent = oque + " em " +
        new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) + ".";
      toast(oque + " no Bitrix.");
      return carregarChamados();
    })
    .catch(function(e){
      $("docAviso").style.color = "var(--crit)";
      $("docAviso").textContent = "Falhou: " + e.message + " — nada foi gravado.";
      throw e;
    });
}
$("btnSalvarDoc").addEventListener("click", function(){
  var id = $("dChamado").value;
  if(!podeGravar()) return;
  if(itemAtual && itemAtual.origem === "local"){
    for(var i=0;i<chamados.length;i++){
      if(String(chamados[i].id) === String(id)){
        chamados[i].doc = { testes: testes.slice(), passos: passos.slice(),
          resolucao: $("dResolucao").value };
        break;
      }
    }
    save(K.chamados, chamados);
    $("docAviso").style.color = "var(--good)";
    $("docAviso").textContent = "Guardado nesta página (chamado local, não existe no Bitrix).";
    return;
  }
  var f = camposParaSalvar();
  var etapaEscolhida = $("dEtapa").value;
  if(etapaEscolhida && itemAtual && etapaEscolhida !== itemAtual.stageId) f.stageId = etapaEscolhida;
  gravarNoBitrix(f, "Chamado atualizado").catch(function(){});
});

/* encerrar: exige resolução preenchida e confirmação em dois toques */
var confirmando = false;
$("btnEncerrar").addEventListener("click", function(){
  var btn = this;
  if(!podeGravar()) return;
  if(!$("dResolucao").value.trim()){
    $("docAviso").style.color = "var(--crit)";
    $("docAviso").textContent = "Escreva a resolução antes de encerrar.";
    return;
  }
  var fim = etapasLista.filter(function(e){ return e.semantica === "S"; })[0];
  if(!fim){ toast("Não achei a etapa de encerramento no funil."); return; }
  if(!confirmando){
    confirmando = true;
    btn.textContent = "Confirmar encerramento";
    btn.style.borderColor = "var(--crit)"; btn.style.color = "var(--crit)";
    $("docAviso").style.color = "var(--warn)";
    $("docAviso").textContent = 'Vai mover para "' + fim.nome + '" no Bitrix. Clique de novo para confirmar.';
    setTimeout(function(){
      if(!confirmando) return;
      confirmando = false; btn.textContent = "Encerrar chamado";
      btn.style.borderColor = ""; btn.style.color = "";
    }, 8000);
    return;
  }
  confirmando = false;
  btn.textContent = "Encerrar chamado"; btn.style.borderColor = ""; btn.style.color = "";
  var f = camposParaSalvar();
  f.stageId = fim.id;
  gravarNoBitrix(f, "Chamado encerrado").catch(function(){});
});

/* ---------------- conexão ---------------- */
(function(){ var w = load(K.wh, ""); if(w) { $("wh").value = w; marcarConn(true); } })();
function marcarConn(ok){ $("connDot").className = "dot " + (ok ? "on" : "off"); }
$("btnMostrar").addEventListener("click", function(){
  $("wh").type = $("wh").type === "password" ? "text" : "password";
});
$("btnEsquecer").addEventListener("click", function(){
  $("wh").value = ""; save(K.wh, ""); marcarConn(false);
  $("diag").textContent = "Webhook apagado deste navegador.";
});
$("btnTestar").addEventListener("click", function(){
  var url = $("wh").value.trim().replace(/\/+$/, "");
  var d = $("diag");
  if(!url){ d.textContent = "Cole a URL do webhook primeiro."; return; }
  if(!/^https:\/\/[^/]+\/rest\/\d+\/[^/]+$/.test(url)){
    d.textContent = "A URL não tem o formato esperado.\nEsperado: https://SEU-PORTAL.bitrix24.com.br/rest/<id>/<token>";
    return;
  }
  save(K.wh, url);
  d.textContent = "Testando...\n\n1/3 chamando profile...";
  var ehFile = location.protocol === "file:";

  fetch(url + "/profile.json", {method:"POST"})
    .then(function(r){ return r.json().then(function(j){ return {st:r.status, j:j}; }); })
    .then(function(res){
      if(res.j && res.j.error){
        marcarConn(false);
        d.textContent = "1/3 profile — RECUSADO\n\nerro: " + res.j.error +
          "\ndescrição: " + (res.j.error_description || "—") +
          "\n\nO webhook respondeu, então a rede e o CORS estão de pé.\n" +
          "O problema é o token ou a permissão: gere outro webhook de entrada com escopo CRM.";
        return;
      }
      var nome = res.j && res.j.result ? (res.j.result.NAME + " " + (res.j.result.LAST_NAME||"")) : "?";
      d.textContent = "1/3 profile — OK, conectado como " + nome +
        "\n\n2/3 listando chamados (entityTypeId 1032)...";
      return fetch(url + "/crm.item.list.json", {
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body: JSON.stringify({entityTypeId:1032, start:0})
        })
        .then(function(r){ return r.json(); })
        .then(function(j){
          if(j.error){
            marcarConn(true);
            d.textContent += "\n\n2/3 chamados — RECUSADO\nerro: " + j.error +
              "\ndescrição: " + (j.error_description||"—") +
              "\n\nA conexão funciona, mas esse webhook não enxerga o processo 1032.\n" +
              "Marque o escopo CRM nele, ou me diga o erro que eu ajusto o entityTypeId.";
            return;
          }
          var itens = (j.result && j.result.items) ? j.result.items : [];
          marcarConn(true);
          d.textContent += "\n\n2/3 chamados — OK, " + itens.length + " itens nesta página" +
            "\n\n3/3 tudo pronto. Me avise que eu ligo o painel nesses dados.";
        });
    })
    .catch(function(err){
      marcarConn(false);
      d.textContent = "1/3 profile — FALHOU antes de chegar ao Bitrix\n\n" + err +
        "\n\nIsso quase sempre é CORS" + (ehFile ? ", e esta página está aberta como arquivo (file://), que é o caso mais comum." : ".") +
        "\n\nSaída: sirva a página por localhost. Na pasta do arquivo, rode\n" +
        "   python -m http.server 8000\n" +
        "e abra http://localhost:8000/index.html\n\n" +
        "Se continuar falhando por localhost, me mande este texto que eu monto a saída sem navegador.";
    });
});

/* clicar na linha do painel leva o chamado para a aba Documentar */
$("tbChamados").addEventListener("click", function(e){
  if(e.target.tagName === "A") return;          /* o link "abrir" segue para o Bitrix */
  var tr = e.target.closest("tr");
  if(!tr || !tr.dataset.id) return;
  document.querySelector('nav.tabs button[data-tab="documentar"]').click();
  $("dChamado").value = tr.dataset.id;
  carregarItem(tr.dataset.id);
});

/* ---------------- carga: botão, filtro e automático ---------------- */
var jaCarregou = false;
$("btnCarregar").addEventListener("click", function(){ jaCarregou = true; carregarChamados(); });
$("chkConcluidos").addEventListener("change", renderPainel);
document.querySelector('nav.tabs button[data-tab="painel"]').addEventListener("click", function(){
  if(!jaCarregou && load(K.wh, "")){ jaCarregou = true; carregarChamados(); }
});

"use strict";
function bitrixCall(metodo, params){
  var wh = load(K.wh, "");
  if(!wh) return Promise.reject(new Error("sem webhook"));
  return fetch(wh + "/" + metodo + ".json", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify(params || {})
  }).then(function(r){ return r.json(); })
    .then(function(j){
      if(j.error) throw new Error(j.error_description || j.error);
      /* o item lido vem com id de opção nos campos de lista; troca pelo texto
         antes de chegar na tela. O motivo de pausa fica de fora de propósito:
         o <select> dele usa o id da opção como value. */
      if(metodo === "crm.item.get" && j.result && j.result.item){
        return carregarMetaCampos().then(function(){
          var it = j.result.item;
          CAMPOS_LISTA.forEach(function(n){
            var cid = B.campo[n];
            if(it[cid]) it[cid] = labelEnum(cid, it[cid]);
          });
          return j;
        });
      }
      return j;
    });
}


/* ---------------- carga do Bitrix ---------------- */
function carregarEtapas(){
  return bitrixCall("crm.status.list", {filter:{"ENTITY_ID":"DYNAMIC_" + B.tipo + "_STAGE_27"}, order:{SORT:"ASC"}})
    .then(function(j){
      etapasLista = (j.result || []).map(function(s){
        etapasBitrix[s.STATUS_ID] = {nome: s.NAME, semantica: s.SEMANTICS};
        return {id: s.STATUS_ID, nome: s.NAME, semantica: s.SEMANTICS};
      });
    })
    .catch(function(){ /* sem etapas nomeadas, seguimos com o id cru */ });
}
/* uma só chamada a crm.item.fields serve os campos de lista e os motivos de pausa */
var metaCampos = null;
function carregarMetaCampos(){
  if(metaCampos) return metaCampos;
  metaCampos = bitrixCall("crm.item.fields", {entityTypeId: B.tipo})
    .then(function(j){
      var fs = (j.result && j.result.fields) ? j.result.fields : {};
      CAMPOS_LISTA.map(function(n){ return B.campo[n]; }).forEach(function(cid){
        var d = fs[cid];
        if(!d || !d.items) return;
        var m = {};
        d.items.forEach(function(i){ m[i.ID] = i.VALUE; });
        enumRotulos[cid] = m;
      });
      var d = fs[B.campo.pausaMotivo];
      motivosPausa = (d && d.items) ? d.items.map(function(i){ return {id:i.ID, nome:i.VALUE}; }) : [];
      /* guarda as listas para a tela continuar utilizável sem webhook */
      save(K.enums, enumRotulos);
    })
    .catch(function(){ /* segue sem os rótulos */ });
  return metaCampos;
}
/* opções do campo "Ticket pausado motivo" — lista fechada no Bitrix */
function carregarMotivosPausa(){
  return carregarMetaCampos().then(function(){
    var sel = $("dPausaMotivo");
    if(!sel) return;
    sel.innerHTML = '<option value="">—</option>';
    motivosPausa.forEach(function(m){
      var o = document.createElement("option"); o.value = m.id; o.textContent = m.nome; sel.appendChild(o);
    });
  });
}

/* nomes dos usuários: o Bitrix devolve só o id em quem abriu e no responsável.
   Vai em lote (batch) para não virar uma chamada por pessoa, e fica guardado. */
var motivoSemNomes = "";
function avisarSemNomes(){
  var alvo = $("avisoNomes");
  if(!alvo) return;
  if(!motivoSemNomes){ alvo.hidden = true; return; }
  alvo.hidden = false;
  alvo.innerHTML = "Os nomes das pessoas estão aparecendo como <b>usuário &lt;número&gt;</b> " +
    "porque o Bitrix recusou a leitura de usuários: <code>" + esc(motivoSemNomes) + "</code>. " +
    "No portal, edite o webhook de entrada e marque também o escopo <b>Usuários (user)</b> — " +
    "só o de CRM não basta para traduzir id em nome.";
}
function carregarUsuarios(ids){
  var faltam = [];
  (ids || []).forEach(function(id){
    if(id === null || id === undefined || id === "" || String(id) === "0") return;
    if(usuarios[id] === undefined && faltam.indexOf(String(id)) === -1) faltam.push(String(id));
  });
  if(!faltam.length) return Promise.resolve();
  var lotes = [];
  for(var i=0; i<faltam.length; i+=50) lotes.push(faltam.slice(i, i+50));
  return lotes.reduce(function(p, lote){
    return p.then(function(){
      var cmd = {};
      lote.forEach(function(id){ cmd["u" + id] = "user.get?ID=" + encodeURIComponent(id); });
      return bitrixCall("batch", {halt: 0, cmd: cmd}).then(function(j){
        var res  = (j.result && j.result.result) ? j.result.result : {};
        var errs = (j.result && j.result.result_error) ? j.result.result_error : {};
        lote.forEach(function(id){
          var r = res["u" + id];
          var u = (r && r.length) ? r[0] : null;
          var nome = u ? [u.NAME, u.LAST_NAME].filter(Boolean).join(" ").trim() : "";
          if(nome || (u && u.EMAIL)){ usuarios[id] = nome || u.EMAIL; return; }
          /* sem nome: guardar o motivo vale mais do que exibir "usuário 429" e
             calar. O caso comum é o webhook sem o escopo "user" marcado. */
          var e = errs["u" + id];
          if(e) motivoSemNomes = e.error_description || e.error || String(e);
          usuarios[id] = "usuário " + id;
        });
      });
    });
  }, Promise.resolve())
   .then(function(){ save(K.usuarios, usuarios); avisarSemNomes(); })
   .catch(function(e){ motivoSemNomes = e.message; avisarSemNomes(); });
}

/* por onde o chamado passou. Este método existe para processos inteligentes. */
function historicoEtapas(id){
  return bitrixCall("crm.stagehistory.list", {
    entityTypeId: B.tipo,
    filter: {OWNER_ID: id},
    order: {ID: "ASC"},
    select: ["ID","OWNER_ID","CREATED_TIME","STAGE_ID","STAGE_SEMANTIC_ID"]
  }).then(function(j){
    var itens = (j.result && j.result.items) ? j.result.items : (j.result || []);
    return (itens || []).map(function(h){
      var et = etapasBitrix[h.STAGE_ID] || {};
      return {quando: h.CREATED_TIME, etapa: et.nome || h.STAGE_ID, semantica: h.STAGE_SEMANTIC_ID};
    });
  }).catch(function(e){ return {erro: e.message}; });
}

/* troca de responsável: não há método REST documentado para processos
   inteligentes. Tentamos uma vez; se o portal não expuser, a seção some. */
function historicoResponsaveis(id){
  return bitrixCall("crm.item.history.list", {entityTypeId: B.tipo, filter: {ownerId: id}})
    .then(function(j){
      var itens = (j.result && j.result.items) ? j.result.items : [];
      return itens.filter(function(h){ return /assigned/i.test(h.fieldName || h.FIELD || ""); });
    })
    .catch(function(e){ return {erro: e.message}; });
}

function carregarChamados(){
  var st = $("statusCarga");
  if(!load(K.wh, "")){ st.textContent = "Sem webhook. Conecte na aba Bitrix."; return; }
  st.textContent = "Carregando...";
  var todos = [], campos = B.campo;
  function pagina(start){
    return bitrixCall("crm.item.list", {
      entityTypeId: B.tipo,
      order: {id: "DESC"},
      start: start,
      select: ["id","title","stageId","createdTime","createdBy","updatedTime",
               "updatedBy","movedTime","movedBy","assignedById",
               campos.categoria, campos.prioridade, campos.detalhes]
    }).then(function(j){
      var itens = (j.result && j.result.items) ? j.result.items : [];
      todos = todos.concat(itens);
      if(j.next && todos.length < 300) return pagina(j.next);
    });
  }
  carregarEtapas()
    .then(function(){ return carregarMetaCampos(); })
    .then(function(){ return pagina(0); })
    .then(function(){
      var deBitrix = todos.map(function(it){
        var et = etapasBitrix[it.stageId] || {};
        return {
          id: it.id,
          titulo: it.title,
          categoria: labelCategoria(it[campos.categoria]),
          prioridade: labelPrioridade(it[campos.prioridade]),
          detalhes: it[campos.detalhes],
          etapa: et.nome || it.stageId,
          semantica: et.semantica,
          aberto: it.createdTime,
          criadoPor: it.createdBy,
          responsavelId: it.assignedById,
          atualizado: it.updatedTime,
          atualizadoPor: it.updatedBy,
          movido: it.movedTime,
          movidoPor: it.movedBy,
          origem: "bitrix"
        };
      });
      var locais = chamados.filter(function(c){ return c.origem !== "bitrix"; });
      chamados = deBitrix.concat(locais);
      save(K.chamados, chamados);
      st.textContent = deBitrix.length + " chamados lidos do Bitrix em " +
        new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) + ".";
      renderPainel(); renderSelectChamados();
      /* os nomes chegam depois; quando chegarem, o painel se redesenha */
      var ids = [];
      deBitrix.forEach(function(c){ ids.push(c.criadoPor, c.responsavelId); });
      return carregarUsuarios(ids).then(function(){ renderPainel(); });
    })
    .catch(function(e){
      st.textContent = "Falhou: " + e.message + " — confira o webhook na aba Bitrix.";
    });
}

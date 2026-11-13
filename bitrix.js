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
      /* guarda rótulo e tipo de TODOS os campos, não só dos que mapeei: é o que
         deixa a ficha mostrar qualquer um dos 34 personalizados com o nome que
         ele tem no portal. Campo novo criado lá aparece aqui sozinho. */
      Object.keys(fs).forEach(function(cid){
        var d = fs[cid] || {};
        campoMeta[cid] = {
          titulo: d.title || d.formLabel || d.listLabel || cid,
          tipo: d.type,
          multiplo: !!d.isMultiple
        };
        /* todo campo de lista ganha tradução de id para texto, não só os cinco
           do formulário — senão campo novo volta a aparecer como número */
        if(d.type === "enumeration" && d.items){
          var m = {};
          d.items.forEach(function(i){ m[i.ID] = i.VALUE; });
          enumRotulos[cid] = m;
        }
      });
      var d = fs[B.campo.pausaMotivo];
      motivosPausa = (d && d.items) ? d.items.map(function(i){ return {id:i.ID, nome:i.VALUE}; }) : [];
      /* guarda as listas para a tela continuar utilizável sem webhook */
      save(K.enums, enumRotulos);
      save(K.campos, campoMeta);
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
/* quem o portal recusou nesta visita. Fica só na memória, de propósito: se
   fosse para o cache, "usuário 429" viraria o nome definitivo e corrigir o
   escopo do webhook depois não adiantaria nada. */
var semNome = {};
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
    if(usuarios[id] !== undefined || semNome[id]) return;
    if(faltam.indexOf(String(id)) === -1) faltam.push(String(id));
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
             calar. O caso comum é o webhook sem o escopo "user" marcado.
             Marca só nesta visita — labelUsuario já mostra "usuário N" sozinho
             quando o nome falta, e assim a próxima visita tenta de novo. */
          var e = errs["u" + id];
          if(e) motivoSemNomes = e.error_description || e.error || String(e);
          semNome[id] = true;
        });
      });
    });
  }, Promise.resolve())
   .then(function(){ save(K.usuarios, usuarios); avisarSemNomes(); })
   .catch(function(e){ motivoSemNomes = e.message; avisarSemNomes(); });
}

/* quem é o dono deste webhook. Uma chamada só, guardada: o webhook não muda
   de dono no meio do caminho. */
function carregarEu(){
  var salvo = load(K.eu, null);
  if(salvo && salvo.id){ euId = salvo.id; return Promise.resolve(); }
  return bitrixCall("profile", {}).then(function(j){
    var r = (j && j.result) ? j.result : {};
    if(!r.ID) return;
    euId = r.ID;
    var nome = [r.NAME, r.LAST_NAME].filter(Boolean).join(" ").trim();
    save(K.eu, {id: r.ID, nome: nome});
    if(nome && usuarios[r.ID] === undefined){ usuarios[r.ID] = nome; save(K.usuarios, usuarios); }
  }).catch(function(){ /* sem profile, o alerta só perde o destaque de "seu" */ });
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

/* comentários da linha do tempo. O método existe para processos inteligentes,
   mas nem todo portal o expõe ao webhook — por isso devolve {erro} em vez de
   quebrar, e a seção se explica na tela. */
function comentarios(id){
  return bitrixCall("crm.timeline.comment.list", {
    filter: {ENTITY_ID: id, ENTITY_TYPE_ID: B.tipo},
    order: {ID: "ASC"}
  }).then(function(j){
    var itens = (j.result && j.result.items) ? j.result.items :
                (Array.isArray(j.result) ? j.result : []);
    return itens.map(function(c){
      return {
        quando: c.CREATED || c.created,
        autor:  c.AUTHOR_ID || c.authorId,
        texto:  c.COMMENT || c.comment || "",
        arquivos: c.FILES || c.files || []
      };
    });
  }).catch(function(e){ return {erro: e.message}; });
}

/* anexos: o valor de um campo tipo file vem como objeto (ou lista deles) com a
   url dentro. O download sai pelo portal, com a sessão de quem está no
   navegador — por isso o link abre em aba nova em vez de baixar daqui. */
function arquivosDoCampo(v){
  if(!v) return [];
  var lista = Array.isArray(v) ? v : [v];
  return lista.map(function(f){
    if(!f || typeof f !== "object") return null;
    var u = f.urlMachine || f.url || f.downloadUrl || "";
    if(!u) return null;
    if(u.indexOf("http") !== 0) u = B.portal + u;
    return {nome: f.name || f.NAME || "arquivo", url: u};
  }).filter(Boolean);
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
               campos.categoria, campos.subcategoria, campos.prioridade, campos.detalhes,
               campos.empresa, campos.solicitante, campos.externo,
               campos.primeiroAtend]
    }).then(function(j){
      var itens = (j.result && j.result.items) ? j.result.items : [];
      todos = todos.concat(itens);
      if(j.next && todos.length < 300) return pagina(j.next);
    });
  }
  carregarEtapas()
    .then(function(){ return carregarMetaCampos(); })
    .then(function(){ return carregarEu(); })
    .then(function(){ return pagina(0); })
    .then(function(){
      var deBitrix = todos.map(function(it){
        var et = etapasBitrix[it.stageId] || {};
        return {
          id: it.id,
          titulo: it.title,
          categoria: labelCategoria(it[campos.categoria]),
          subcategoria: labelEnum(campos.subcategoria, it[campos.subcategoria]),
          prioridade: labelPrioridade(it[campos.prioridade]),
          detalhes: it[campos.detalhes],
          empresa: labelEnum(campos.empresa, it[campos.empresa]),
          /* quem pediu pode ser colaborador interno ou usuário externo */
          solicitante: valorLegivel(campos.solicitante, it[campos.solicitante]) ||
                       valorLegivel(campos.externo, it[campos.externo]),
          etapa: et.nome || it.stageId,
          semantica: et.semantica,
          aberto: it.createdTime,
          primeiroAtend: it[campos.primeiroAtend],
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
      dashUltima = new Date();        /* o dash mostra de quando são os dados */
      /* compara com o que já tínhamos antes de a tela se redesenhar */
      if(typeof detectarNovos === "function") detectarNovos(deBitrix);
      if(typeof detectarPrazos === "function") detectarPrazos(deBitrix);
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

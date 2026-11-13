"use strict";
/* ---------------- tarefas realizadas ----------------
   Quando o chamado entra em atendimento, a automação do Bitrix cria uma tarefa
   ligada a ele. Em vez de inventar um lugar novo, o que foi feito vai para
   dentro dessa tarefa, como item concluído de uma lista do checklist chamada
   "Tarefas realizadas". Quem abre a tarefa no portal vê a mesma coisa.

   O item de checklist que já nasce concluído não guarda data própria, então o
   dia e a hora vão escritos no começo do texto.

   Enquanto não dá para gravar (chamado ainda sem tarefa, webhook sem a
   permissão Tarefas, Bitrix fora do ar), o que for incluído fica guardado neste
   navegador e é enviado depois, por um botão — nunca sozinho. */

K.tarefas = "ctip.tarefas";
var TF_LISTA = "Tarefas realizadas";   /* nome da lista dentro do checklist da tarefa */
var TF_RE = /^(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}) · ([\s\S]+)$/;
var tfPend = load(K.tarefas, {});      /* id do chamado -> [{t: texto já com dia e hora}] */
var tfSeq = 0;                         /* descarta resposta de chamado que já saiu da tela */
var tfOcupado = false;
var tf = tfNovo(null);

function tfNovo(id){
  return {id:id, estado:"", erro:"", aviso:"", tarefas:[], tarefa:null, raiz:null, itens:[], outros:0};
}
/* o vínculo de um item de processo inteligente numa tarefa é "T" + o tipo em
   hexadecimal + "_" + id. Para o processo 1032 dá T408_<id>. */
function tfVinculo(id){ return "T" + Number(B.tipo).toString(16) + "_" + id; }
function tfChamado(){ var s = $("dChamado"); return s && s.value ? s.value : null; }
function tfEhLocal(id){
  for(var i = 0; i < chamados.length; i++)
    if(String(chamados[i].id) === String(id)) return chamados[i].origem !== "bitrix";
  return true;
}
function tfDois(n){ return String(n).padStart(2, "0"); }
function tfCarimbo(d){
  return tfDois(d.getDate()) + "/" + tfDois(d.getMonth() + 1) + "/" + d.getFullYear() +
         " " + tfDois(d.getHours()) + ":" + tfDois(d.getMinutes());
}
function tfPartes(titulo){
  var m = TF_RE.exec(String(titulo || ""));
  return m ? {quando: m[1], texto: m[2]} : {quando: "", texto: String(titulo || "")};
}
function tfNorm(t){
  return {
    id: t.id || t.ID,
    titulo: t.title || t.TITLE || "",
    status: String(t.status || t.STATUS || ""),
    vinc: [].concat(t.ufCrmTask || t.UF_CRM_TASK || []).map(function(v){ return String(v).toLowerCase(); })
  };
}
function tfLinkTarefa(id){
  return B.portal + "/company/personal/user/" + (euId || 0) + "/tasks/task/view/" + encodeURIComponent(id) + "/";
}

/* ---------------- leitura ---------------- */
function tfCarregar(){
  var id = tfChamado();
  var seq = ++tfSeq;
  tf = tfNovo(id);
  if(!id){ pintarTarefas(); return; }
  if(tfEhLocal(id)){ tf.estado = "local"; pintarTarefas(); return; }
  if(!load(K.wh, "")){ tf.estado = "semwebhook"; pintarTarefas(); return; }
  tf.estado = "carregando"; pintarTarefas();
  var vinc = tfVinculo(id).toLowerCase();
  bitrixCall("tasks.task.list", {
    filter: {UF_CRM_TASK: tfVinculo(id)},
    select: ["ID", "TITLE", "STATUS", "UF_CRM_TASK"],
    order: {ID: "desc"}
  }).then(function(j){
    if(seq !== tfSeq) return;
    var bruto = (j.result && j.result.tasks) ? j.result.tasks : [];
    /* confere o vínculo em cada tarefa devolvida, em vez de confiar no filtro:
       se o portal ignorasse o filtro, viriam tarefas de outros assuntos e a
       página gravaria o que você fez na tarefa errada */
    var minhas = bruto.map(tfNorm).filter(function(t){ return t.vinc.indexOf(vinc) !== -1; });
    if(!minhas.length){
      tf.estado = bruto.length ? "semvinculo" : "semtarefa";
      pintarTarefas(); return;
    }
    tf.tarefas = minhas;
    /* a que ainda está aberta primeiro; status 5 é tarefa concluída */
    var abertas = minhas.filter(function(t){ return t.status !== "5"; });
    tf.tarefa = abertas[0] || minhas[0];
    return tfLerChecklist(seq);
  }).catch(function(e){
    if(seq !== tfSeq) return;
    tf.estado = /scope|privileg|access denied|acesso negado/i.test(e.message) ? "semescopo" : "erro";
    tf.erro = e.message;
    pintarTarefas();
  });
}
function tfLerChecklist(seq){
  var alvo = tf;
  return bitrixCall("task.checklistitem.getlist", {TASKID: Number(alvo.tarefa.id)}).then(function(j){
    if(seq !== tfSeq) return;
    var todos = Array.isArray(j.result) ? j.result : [];
    /* no checklist, quem tem PARENT_ID 0 é o nome de uma lista; os itens
       apontam para ela */
    var raiz = null;
    todos.forEach(function(i){
      if(!raiz && Number(i.PARENT_ID) === 0 &&
         String(i.TITLE || "").trim().toLowerCase() === TF_LISTA.toLowerCase()) raiz = i;
    });
    alvo.raiz = raiz ? raiz.ID : null;
    alvo.itens = raiz ? todos.filter(function(i){ return String(i.PARENT_ID) === String(raiz.ID); }) : [];
    alvo.outros = todos.filter(function(i){ return Number(i.PARENT_ID) !== 0; }).length - alvo.itens.length;
    alvo.estado = "ok";
    pintarTarefas();
    return carregarUsuarios(alvo.itens.map(function(i){ return i.CREATED_BY; }))
      .then(function(){ if(seq === tfSeq) pintarTarefas(); });
  });
}

/* ---------------- gravação ---------------- */
/* a ordem das chaves importa: este método do Bitrix recusa TASKID depois de FIELDS */
function tfGarantirLista(alvo){
  if(alvo.raiz) return Promise.resolve(alvo.raiz);
  return bitrixCall("task.checklistitem.add", {
    TASKID: Number(alvo.tarefa.id),
    FIELDS: {TITLE: TF_LISTA, PARENT_ID: 0}
  }).then(function(j){ alvo.raiz = j.result; return alvo.raiz; });
}
function tfEnviar(alvo, titulo){
  return tfGarantirLista(alvo).then(function(raiz){
    return bitrixCall("task.checklistitem.add", {
      TASKID: Number(alvo.tarefa.id),
      FIELDS: {TITLE: titulo, PARENT_ID: Number(raiz), IS_COMPLETE: "Y"}
    });
  }).then(function(j){
    alvo.itens.push({ID: String(j.result), TITLE: titulo, IS_COMPLETE: "Y",
                     CREATED_BY: euId, PARENT_ID: String(alvo.raiz)});
  });
}
function tfGuardar(id, titulo){
  if(!tfPend[id]) tfPend[id] = [];
  tfPend[id].push({t: titulo});
  save(K.tarefas, tfPend);
}
function tfTirar(id, n){
  if(!tfPend[id]) return;
  tfPend[id].splice(n, 1);
  if(!tfPend[id].length) delete tfPend[id];
  save(K.tarefas, tfPend);
}

function tfIncluir(){
  var id = tfChamado(), inp = $("tfIn");
  var v = inp.value.trim();
  if(!id || !v || tfOcupado) return;
  /* a hora é a de agora, não a de quando chegar ao Bitrix */
  var titulo = tfCarimbo(new Date()) + " · " + v;
  if(tf.id !== id || tf.estado !== "ok"){
    tfGuardar(id, titulo);
    inp.value = ""; pintarTarefas(); inp.focus();
    return;
  }
  var alvo = tf;
  tfOcupado = true; alvo.aviso = ""; pintarTarefas();
  tfEnviar(alvo, titulo).then(function(){
    inp.value = "";
  }, function(e){
    /* recusada pelo Bitrix: não some. Fica aqui, com o motivo à vista. */
    tfGuardar(id, titulo);
    inp.value = "";
    alvo.aviso = "O Bitrix não aceitou gravar (" + e.message + "). A tarefa ficou guardada neste navegador.";
  }).then(function(){
    tfOcupado = false; pintarTarefas(); inp.focus();
  });
}
/* manda o que estava guardado, uma por vez e na ordem. Para na primeira recusa:
   o que foi fica no Bitrix, o que não foi continua guardado. */
function tfEnviarPendentes(){
  var id = tfChamado();
  if(!id || tf.id !== id || tf.estado !== "ok" || tfOcupado) return;
  var lote = (tfPend[id] || []).slice();
  if(!lote.length) return;
  var alvo = tf, feitas = 0;
  tfOcupado = true; alvo.aviso = ""; pintarTarefas();
  lote.reduce(function(p, item){
    return p.then(function(){
      return tfEnviar(alvo, item.t).then(function(){
        feitas++;
        tfTirar(id, (tfPend[id] || []).indexOf(item));
      });
    });
  }, Promise.resolve()).then(function(){
    toast(feitas + (feitas === 1 ? " tarefa enviada" : " tarefas enviadas") + " para o Bitrix.");
  }, function(e){
    alvo.aviso = "Parei em " + feitas + " de " + lote.length + ": o Bitrix respondeu \"" + e.message +
                 "\". O que não foi continua guardado aqui.";
  }).then(function(){
    tfOcupado = false; pintarTarefas();
  });
}

/* ---------------- tela ---------------- */
function tfTextoEstado(pend){
  var guarda = " O que você incluir fica guardado neste navegador.";
  if(tf.estado === "carregando") return "Procurando a tarefa deste chamado no Bitrix…";
  if(tf.estado === "local") return "Chamado local, sem Bitrix: as tarefas ficam guardadas neste navegador.";
  if(tf.estado === "semwebhook") return "Sem webhook conectado." + guarda;
  if(tf.estado === "semtarefa")
    return "Este chamado ainda não tem tarefa no Bitrix — ela nasce quando o chamado entra em atendimento." +
           guarda + " Quando a tarefa existir, clique em Procurar de novo para enviar.";
  if(tf.estado === "semvinculo")
    return "O Bitrix devolveu tarefas, mas nenhuma delas está ligada a este chamado. " +
           "Não gravo em tarefa que não sei se é dele." + guarda;
  if(tf.estado === "semescopo")
    return "O seu webhook não tem a permissão <b>Tarefas (task)</b>. No Bitrix, edite o webhook de entrada, " +
           "marque Tarefas e clique em Procurar de novo." + guarda +
           " <span style=\"opacity:.75\">(" + esc(tf.erro) + ")</span>";
  if(tf.estado === "erro")
    return "Não consegui falar com as tarefas do Bitrix: " + esc(tf.erro) + "." + guarda;
  if(tf.estado === "ok"){
    var t = tf.tarefa;
    return "Gravando na tarefa <a href=\"" + esc(tfLinkTarefa(t.id)) + "\" target=\"_blank\" rel=\"noopener\" style=\"color:var(--accent)\">#" +
           esc(t.id) + " " + esc(t.titulo) + "</a>" + (t.status === "5" ? " (já concluída)" : "") +
           ", na lista “" + TF_LISTA + "” do checklist." +
           (tf.outros > 0 ? " A tarefa tem mais " + tf.outros +
             (tf.outros === 1 ? " item em outra lista" : " itens em outras listas") + " do checklist." : "") +
           (pend ? " Há " + pend + (pend === 1 ? " guardada" : " guardadas") + " neste navegador esperando envio." : "");
  }
  return "";
}
function pintarTarefas(){
  var ul = $("listaTarefas");
  if(!ul) return;
  var id = tfChamado();
  var meu = !!id && tf.id === id;
  var itens = (meu && tf.estado === "ok") ? tf.itens : [];
  var pend = id ? (tfPend[id] || []) : [];

  ul.innerHTML = "";
  itens.forEach(function(it, n){
    var p = tfPartes(it.TITLE), feito = it.IS_COMPLETE === "Y";
    var sub = [p.quando, labelUsuario(it.CREATED_BY),
               feito ? "" : "ainda não marcada como feita no Bitrix"].filter(Boolean).join(" · ");
    var li = document.createElement("li");
    li.innerHTML =
      '<span class="marca">' + (feito ? (n + 1) : "○") + "</span>" +
      '<span class="txt">' + esc(p.texto) + (sub ? '<div class="hint">' + esc(sub) + "</div>" : "") + "</span>";
    ul.appendChild(li);
  });
  pend.forEach(function(pd, n){
    var p = tfPartes(pd.t);
    var li = document.createElement("li");
    li.dataset.guardada = "1";
    li.innerHTML =
      '<span class="marca" title="Ainda não está no Bitrix">↑</span>' +
      '<span class="txt">' + esc(p.texto) +
        '<div class="hint">' + esc([p.quando, "só neste navegador"].filter(Boolean).join(" · ")) + "</div></span>" +
      '<button class="x" type="button" title="remover" data-pend="' + n + '">&times;</button>';
    ul.appendChild(li);
  });

  var total = itens.length + pend.length;
  if($("cntTarefas")){ $("cntTarefas").textContent = total || ""; $("cntTarefas").className = total ? "pill" : ""; }
  if($("vazioTarefas")) $("vazioTarefas").hidden = total > 0;
  $("tfIn").disabled = tfOcupado;
  $("tfAdd").disabled = tfOcupado;
  $("tfAdd").textContent = tfOcupado ? "Enviando…" : "Incluir";

  var qual = $("tfQual");
  qual.hidden = !(meu && tf.estado === "ok" && tf.tarefas.length > 1);
  if(!qual.hidden){
    qual.innerHTML = "";
    tf.tarefas.forEach(function(t){
      qual.appendChild(new Option("#" + t.id + " " + t.titulo + (t.status === "5" ? " (concluída)" : ""), t.id));
    });
    qual.value = tf.tarefa.id;
  }
  var env = $("tfEnviarPend");
  env.hidden = !(meu && tf.estado === "ok" && pend.length > 0);
  env.disabled = tfOcupado;
  env.textContent = "Enviar " + pend.length + " para a tarefa do Bitrix";
  var dn = $("tfDeNovo");
  dn.hidden = !meu || tf.estado === "local" || tf.estado === "semwebhook" || tf.estado === "carregando";
  dn.textContent = tf.estado === "ok" ? "Atualizar" : "Procurar de novo";

  $("tfEstado").innerHTML = meu ? tfTextoEstado(pend.length) : "";
  var av = $("tfAviso");
  av.hidden = !(meu && tf.aviso);
  av.textContent = meu ? tf.aviso : "";
}

if($("tfAdd")){
  $("tfAdd").addEventListener("click", tfIncluir);
  $("tfIn").addEventListener("keydown", function(e){ if(e.key === "Enter") tfIncluir(); });
  $("listaTarefas").addEventListener("click", function(e){
    var n = e.target.getAttribute("data-pend");
    if(n === null || n === undefined || tfOcupado) return;
    /* só o que ainda não foi enviado sai por aqui; o que já está no Bitrix se
       corrige na própria tarefa, onde fica o registro de quem mexeu */
    tfTirar(tfChamado(), parseInt(n, 10));
    pintarTarefas();
  });
  $("tfDeNovo").addEventListener("click", function(){ if(!tfOcupado) tfCarregar(); });
  $("tfEnviarPend").addEventListener("click", tfEnviarPendentes);
  $("tfQual").addEventListener("change", function(){
    if(tfOcupado){ this.value = tf.tarefa.id; return; }
    var escolhida = null, v = this.value;
    tf.tarefas.forEach(function(t){ if(String(t.id) === String(v)) escolhida = t; });
    if(!escolhida) return;
    tf.tarefa = escolhida; tf.raiz = null; tf.itens = []; tf.outros = 0; tf.aviso = "";
    tf.estado = "carregando"; pintarTarefas();
    var seq = ++tfSeq, alvo = tf;
    tfLerChecklist(seq).catch(function(e){
      if(seq !== tfSeq) return;
      alvo.estado = "erro"; alvo.erro = e.message; pintarTarefas();
    });
  });
  $("dChamado").addEventListener("change", tfCarregar);
  /* o chamado também chega aqui por um clique na linha do painel, que troca o
     seletor sem disparar "change". Conferir de tempo em tempo, só com a aba
     Documentar à frente, pega os dois caminhos sem mexer no resto. */
  setInterval(function(){
    var aba = document.querySelector('nav.tabs button[data-tab="documentar"]');
    if(!aba || aba.getAttribute("aria-selected") !== "true" || tfOcupado) return;
    if(tfChamado() !== tf.id) tfCarregar();
  }, 400);
  pintarTarefas();
}

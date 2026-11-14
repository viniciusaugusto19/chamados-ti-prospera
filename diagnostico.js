"use strict";
/* ---------------- diagnóstico do portal ----------------
   A página supõe várias coisas sobre o Bitrix: que o webhook tem certas
   permissões, que os campos mapeados existem, que o funil tem as etapas com os
   nomes que os contadores procuram, que a tarefa do atendimento nasce ligada ao
   chamado. Quando uma delas não vale, o sintoma aparece longe da causa.

   Isto confere tudo de uma vez, na máquina de quem usa, SÓ LENDO. Nenhum passo
   cria, altera ou apaga nada no portal. O resultado pode ser copiado como texto
   — e o texto não leva a URL do webhook. */

var dgLinhas = [];
var dgRodando = false;
var DG_ROTULO = {ok: "ok", warn: "atenção", crit: "falhou", neutral: "nota"};

function dgMsg(e){ return e && e.message ? e.message : String(e); }
function dgSemEscopo(m){ return /scope|privileg|access denied|acesso negado/i.test(m); }
function dgLinha(nivel, titulo, detalhe){
  dgLinhas.push({nivel: nivel, titulo: titulo, detalhe: detalhe || ""});
  dgPintar();
}
function dgPintar(){
  var ul = $("dgLista");
  if(!ul) return;
  ul.innerHTML = dgLinhas.map(function(l){
    return '<li class="' + (l.nivel === "neutral" ? "" : l.nivel) + '">' +
      '<span style="flex:1;min-width:0"><b style="font-weight:600">' + esc(l.titulo) + "</b>" +
        (l.detalhe ? '<div class="hint" style="margin-top:2px">' + esc(l.detalhe) + "</div>" : "") + "</span>" +
      '<span class="tag ' + l.nivel + '">' + DG_ROTULO[l.nivel] + "</span></li>";
  }).join("");
  var n = {ok: 0, warn: 0, crit: 0};
  dgLinhas.forEach(function(l){ if(n[l.nivel] !== undefined) n[l.nivel]++; });
  $("dgResumo").textContent = dgRodando ? "Conferindo…" :
    (dgLinhas.length ? n.ok + " ok · " + n.warn + " atenção · " + n.crit + " falhou" : "");
  $("dgRodar").disabled = dgRodando;
  $("dgRodar").textContent = dgRodando ? "Conferindo…" : (dgLinhas.length ? "Rodar de novo" : "Rodar diagnóstico");
  $("dgCopiar").hidden = dgRodando || !dgLinhas.length;
}
function dgTexto(){
  var L = ["Diagnóstico Chamados TI — " + dataHora(new Date().toISOString())];
  dgLinhas.forEach(function(l){
    L.push("[" + DG_ROTULO[l.nivel] + "] " + l.titulo + (l.detalhe ? " — " + l.detalhe : ""));
  });
  return L.join("\n");
}

/* ---------------- os passos ---------------- */
function dgPerfil(ctx){
  return bitrixCall("profile", {}).then(function(j){
    var r = j.result || {};
    ctx.eu = r.ID;
    dgLinha("ok", "Webhook válido",
      "Conectado como " + ([r.NAME, r.LAST_NAME].filter(Boolean).join(" ") || "?") + " (usuário " + r.ID + ").");
  }, function(e){
    dgLinha("crit", "O webhook não respondeu", dgMsg(e) + ". Confira a URL no quadro acima e use Testar conexão.");
    throw {parar: true};
  });
}
function dgEscopos(ctx){
  return bitrixCall("scope", {}).then(function(j){
    var s = Array.isArray(j.result) ? j.result : [];
    if(!s.length){
      dgLinha("warn", "O portal não informou as permissões do webhook", "Os passos abaixo mostram cada uma na prática.");
      return;
    }
    var temUser = s.indexOf("user") !== -1 || s.indexOf("user_basic") !== -1 || s.indexOf("user_brief") !== -1;
    var falta = [];
    if(s.indexOf("crm") === -1) falta.push("CRM (crm)");
    if(!temUser) falta.push("Usuários (user)");
    if(s.indexOf("task") === -1) falta.push("Tarefas (task)");
    if(falta.length){
      dgLinha(s.indexOf("crm") === -1 ? "crit" : "warn", "Faltam permissões no webhook",
        "Edite o webhook no Bitrix e marque: " + falta.join(", ") + ". Sem CRM nada funciona; sem Usuários as " +
        "pessoas aparecem como número; sem Tarefas a aba Tarefas realizadas só guarda no navegador.");
    } else {
      dgLinha("ok", "Permissões do webhook", "CRM, Usuários e Tarefas estão marcados.");
    }
    var usa = ["crm", "user", "user_basic", "user_brief", "task"];
    var sobra = s.filter(function(x){ return usa.indexOf(x) === -1; });
    if(sobra.length){
      dgLinha("warn", "O webhook pode mais do que a página usa",
        "Permissões que a página não usa: " + sobra.join(", ") + ". Vale gerar um webhook só com CRM, Usuários e " +
        "Tarefas: se a URL escapar, o estrago é menor.");
    }
  }, function(e){
    dgLinha("warn", "Não consegui ler as permissões do webhook", dgMsg(e) + ". Os passos abaixo mostram cada uma na prática.");
  });
}
function dgFunil(ctx){
  return bitrixCall("crm.status.list", {filter: {"ENTITY_ID": "DYNAMIC_" + B.tipo + "_STAGE_27"}, order: {SORT: "ASC"}})
    .then(function(j){
      var et = j.result || [];
      ctx.etapas = {};
      et.forEach(function(s){ ctx.etapas[s.STATUS_ID] = s.NAME; });
      if(!et.length){
        dgLinha("crit", "Não achei o funil dos chamados",
          "O processo " + B.tipo + ", funil 27, não devolveu etapas. Kanban e trilho de etapas ficam sem colunas.");
        return;
      }
      var nomes = et.map(function(s){ return s.NAME; });
      dgLinha("ok", "Funil lido", et.length + " etapas: " + nomes.join(" → ") + ".");
      var avisos = [];
      if(!et.some(function(s){ return s.SEMANTICS === "S"; }))
        avisos.push("nenhuma etapa é de conclusão com sucesso, então o botão Encerrar não aparece");
      if(!nomes.some(function(n){ return /em atendimento/i.test(n); }))
        avisos.push("nenhuma se chama \"Em atendimento\", então o contador Em atendimento fica zerado");
      if(!nomes.some(function(n){ return /pausa|aguardando terceiros/i.test(n); }))
        avisos.push("nenhuma tem \"pausa\" ou \"aguardando terceiros\" no nome, então nenhum chamado conta como pausado e o SLA não para");
      if(avisos.length) dgLinha("warn", "Nomes de etapa que a página procura", "No funil atual: " + avisos.join("; ") + ".");
    }, function(e){
      dgLinha("crit", "Não consegui ler o funil", dgMsg(e) + ".");
    });
}
function dgCampos(ctx){
  return bitrixCall("crm.item.fields", {entityTypeId: B.tipo}).then(function(j){
    var fs = (j.result && j.result.fields) ? j.result.fields : {};
    var total = Object.keys(fs).filter(function(k){ return /^ufCrm/.test(k); }).length;
    var falta = Object.keys(B.campo).filter(function(n){ return !fs[B.campo[n]]; });
    if(falta.length){
      dgLinha("crit", "Campos que a página usa e o portal não tem mais",
        falta.map(function(n){ return n + " (" + B.campo[n] + ")"; }).join(", ") +
        ". Foram apagados ou recriados no portal; a página lê e grava nesses identificadores.");
    } else {
      dgLinha("ok", "Campos do chamado", total + " campos personalizados no portal; os " +
        Object.keys(B.campo).length + " que a página usa existem.");
    }
    var naoLista = ["testes", "passos"].filter(function(n){
      var d = fs[B.campo[n]]; return d && !d.isMultiple;
    });
    if(naoLista.length){
      dgLinha("warn", "Campo que deixou de ser lista",
        naoLista.join(" e ") + ": a página envia vários itens, e o portal agora aceita um valor só. " +
        "Ao salvar a ficha, parte do que foi escrito pode não entrar.");
    }
    var pr = fs[B.campo.prioridade];
    if(pr && pr.items){
      var semSla = pr.items.filter(function(i){
        return !SLA.some(function(s){ return String(i.VALUE).indexOf(s.n) === 0; });
      }).map(function(i){ return "\"" + String(i.VALUE).slice(0, 40) + "\""; });
      if(semSla.length){
        dgLinha("warn", "Prioridades sem prazo reconhecido",
          semSla.join(", ") + ". Chamado com uma delas cai como \"sem SLA\" e nunca fica vermelho. " +
          "O nome da opção precisa começar pelo nome da prioridade (Alta, Média, Baixa…).");
      } else {
        dgLinha("ok", "Prioridades", "As " + pr.items.length + " opções têm prazo reconhecido.");
      }
    }
  }, function(e){
    dgLinha("crit", "Não consegui ler os campos do chamado", dgMsg(e) + ".");
  });
}
function dgChamados(ctx){
  return bitrixCall("crm.item.list", {entityTypeId: B.tipo, order: {id: "DESC"}, start: 0,
                                      select: ["id", "stageId", "assignedById"]})
    .then(function(j){
      ctx.itens = (j.result && j.result.items) ? j.result.items : [];
      var total = typeof j.total === "number" ? j.total : ctx.itens.length;
      if(total > 300){
        dgLinha("warn", "Mais chamados do que a página lê",
          "O processo tem " + total + " chamados e a página carrega os 300 mais recentes. Contadores e relatório " +
          "valem para esses 300; um chamado antigo ainda aberto fica de fora.");
      } else {
        dgLinha("ok", "Leitura dos chamados", total + " chamados no processo, todos ao alcance da página.");
      }
    }, function(e){
      ctx.itens = [];
      dgLinha("crit", "Não consegui listar os chamados", dgMsg(e) + ".");
    });
}
function dgUsuarios(ctx){
  if(!ctx.eu) return Promise.resolve();
  return bitrixCall("user.get", {ID: ctx.eu}).then(function(j){
    var u = (j.result && j.result[0]) ? j.result[0] : null;
    if(u && (u.NAME || u.EMAIL)) dgLinha("ok", "Nomes das pessoas", "O portal devolve nome para o id de usuário.");
    else dgLinha("warn", "Nomes das pessoas", "O portal respondeu sem nome. Responsável e autor podem aparecer como número.");
  }, function(e){
    dgLinha("warn", "Nomes das pessoas",
      dgMsg(e) + ". Responsável e autor aparecem como \"usuário N\" até o webhook ter a permissão Usuários.");
  });
}
function dgFicha(ctx){
  var it = ctx.itens && ctx.itens[0];
  if(!it) return Promise.resolve();
  return bitrixCall("crm.stagehistory.list", {entityTypeId: B.tipo, filter: {OWNER_ID: it.id}, order: {ID: "ASC"},
                                              select: ["ID", "OWNER_ID", "CREATED_TIME", "STAGE_ID", "STAGE_SEMANTIC_ID"]})
    .then(function(){
      dgLinha("ok", "Histórico de etapas", "O bloco \"Por onde passou\" da ficha tem de onde ler.");
    }, function(e){
      dgLinha("warn", "Histórico de etapas", dgMsg(e) + ". O bloco \"Por onde passou\" da ficha fica vazio.");
    })
    .then(function(){
      return bitrixCall("crm.timeline.comment.list", {filter: {ENTITY_ID: it.id, ENTITY_TYPE_ID: B.tipo}, order: {ID: "ASC"}});
    })
    .then(function(){
      dgLinha("ok", "Comentários do chamado", "O bloco de comentários da ficha tem de onde ler.");
    }, function(e){
      dgLinha("warn", "Comentários do chamado", dgMsg(e) + ". O bloco de comentários da ficha não aparece.");
    });
}
/* a pergunta que só o portal responde: a tarefa que a automação cria quando o
   chamado entra em atendimento nasce LIGADA ao chamado? */
function dgTarefa(ctx){
  if(typeof tfVinculo !== "function") return Promise.resolve();
  var cand = (ctx.itens || []).filter(function(it){
    return /em atendimento/i.test((ctx.etapas || {})[it.stageId] || "");
  }).slice(0, 5);
  if(!cand.length){
    dgLinha("neutral", "Tarefa do atendimento",
      "Nenhum chamado está em atendimento agora, então não há onde conferir se a tarefa nasce ligada a ele. " +
      "Rode de novo quando houver um.");
    return Promise.resolve();
  }
  var testados = [];
  function tenta(i){
    if(i >= cand.length){
      dgLinha("warn", "Nenhum chamado em atendimento tem tarefa ligada",
        "Conferi " + testados.join(", ") + ". Ou a automação cria a tarefa sem ligar ao chamado, ou esses chamados " +
        "entraram em atendimento sem passar por ela. Enquanto for assim, Tarefas realizadas só guarda no navegador.");
      return Promise.resolve();
    }
    var it = cand[i], vinc = tfVinculo(it.id);
    testados.push("#" + it.id);
    return bitrixCall("tasks.task.list", {filter: {UF_CRM_TASK: vinc}, select: ["ID", "TITLE", "STATUS", "UF_CRM_TASK"],
                                          order: {ID: "desc"}})
      .then(function(j){
        var bruto = (j.result && j.result.tasks) ? j.result.tasks : [];
        var minhas = bruto.map(tfNorm).filter(function(t){ return t.vinc.indexOf(vinc.toLowerCase()) !== -1; });
        if(bruto.length && !minhas.length){
          dgLinha("crit", "O portal não respeitou a busca de tarefa por chamado",
            "Pedi as tarefas do chamado #" + it.id + " e vieram " + bruto.length + " sem essa ligação. " +
            "A página não grava em tarefa que não sabe ser do chamado, então Tarefas realizadas só guarda no navegador.");
          return;
        }
        if(!minhas.length) return tenta(i + 1);
        ctx.tarefa = minhas[0];
        dgLinha("ok", "Tarefa do atendimento", "O chamado #" + it.id + " tem a tarefa #" + minhas[0].id + " ligada a ele.");
      });
  }
  return tenta(0).then(function(){
    if(!ctx.tarefa) return;
    return bitrixCall("task.checklistitem.getlist", {TASKID: Number(ctx.tarefa.id)}).then(function(j){
      var todos = Array.isArray(j.result) ? j.result : [];
      var tem = todos.some(function(x){
        return Number(x.PARENT_ID) === 0 && String(x.TITLE || "").trim().toLowerCase() === TF_LISTA.toLowerCase();
      });
      dgLinha("ok", "Checklist da tarefa", todos.length + " itens lidos. A lista \"" + TF_LISTA + "\" " +
        (tem ? "já existe nessa tarefa." : "ainda não existe nela; é criada na primeira inclusão."));
    });
  }).catch(function(e){
    var m = dgMsg(e);
    dgLinha("crit", dgSemEscopo(m) ? "O webhook não tem a permissão Tarefas" : "Não consegui ler as tarefas",
      m + (dgSemEscopo(m) ? ". Edite o webhook no Bitrix e marque Tarefas (task)." : "."));
  });
}

/* ---------------- onde mora o inventário de TI ----------------
   As próximas partes da página (o que a pessoa tem, QR code, parque por
   situação) leem o inventário, e o inventário é do portal: pode ser um processo
   inteligente ou uma Lista. Este passo procura pelo nome e mostra, de cada
   candidato, quantos registros tem e como se chamam os campos.

   Só nomes de campo. Nenhum dado de equipamento ou de pessoa é lido para o
   texto — a contagem pede só o id. */
var DG_INV = /invent|ativo|equipament|patrim|notebook|celular|parque/i;
function dgCamposTexto(fs, soPersonalizados){
  return Object.keys(fs).filter(function(k){ return !soPersonalizados || /^ufCrm/i.test(k); }).map(function(k){
    var d = fs[k] || {};
    return (d.title || d.NAME || k) + " [" + (d.type || d.TYPE || "?") +
      (d.isMultiple || d.MULTIPLE === "Y" ? ", vários" : "") + "] " + k;
  });
}
function dgUmProcesso(t){
  var n = null;
  return bitrixCall("crm.item.list", {entityTypeId: t.entityTypeId, select: ["id"], start: 0})
    .then(function(j){
      n = typeof j.total === "number" ? j.total : ((j.result && j.result.items) || []).length;
    }, function(){ /* sem a contagem, os campos ainda servem */ })
    .then(function(){ return bitrixCall("crm.item.fields", {entityTypeId: t.entityTypeId}); })
    .then(function(j){
      var nomes = dgCamposTexto((j.result && j.result.fields) ? j.result.fields : {}, true);
      dgLinha("neutral", "Candidato a inventário: " + t.title,
        "Processo inteligente " + t.entityTypeId + (n !== null ? ", " + n + " registros" : "") + ". " +
        (nomes.length ? nomes.length + " campos personalizados: " + nomes.join(" · ") + "." : "Sem campos personalizados."));
    }, function(e){
      dgLinha("neutral", "Candidato a inventário: " + t.title,
        "Processo inteligente " + t.entityTypeId + ". Não consegui ler os campos: " + dgMsg(e) + ".");
    });
}
function dgUmaLista(l){
  return bitrixCall("lists.field.get", {IBLOCK_TYPE_ID: "lists", IBLOCK_ID: l.ID}).then(function(j){
    var fs = (j.result && typeof j.result === "object") ? j.result : {};
    var nomes = dgCamposTexto(fs, false);
    dgLinha("neutral", "Candidato a inventário: " + l.NAME,
      "Lista " + l.ID + ". " + (nomes.length ? nomes.length + " campos: " + nomes.join(" · ") + "." : "Não devolveu campos."));
  }, function(e){
    dgLinha("neutral", "Candidato a inventário: " + l.NAME, "Lista " + l.ID + ". Não consegui ler os campos: " + dgMsg(e) + ".");
  });
}
function dgInventario(ctx){
  var achou = 0;
  function emFila(itens, um){
    return itens.reduce(function(p, x){ return p.then(function(){ return um(x); }); }, Promise.resolve());
  }
  return bitrixCall("crm.type.list", {}).then(function(j){
    var tipos = (j.result && Array.isArray(j.result.types)) ? j.result.types : [];
    if(!tipos.length) return;
    dgLinha("neutral", "Processos inteligentes do portal",
      tipos.length + ": " + tipos.map(function(t){ return t.title + " (" + t.entityTypeId + ")"; }).join(" · ") + ".");
    var cand = tipos.filter(function(t){
      return Number(t.entityTypeId) !== Number(B.tipo) && DG_INV.test(t.title || "");
    }).slice(0, 4);
    achou += cand.length;
    return emFila(cand, dgUmProcesso);
  }, function(e){
    dgLinha("neutral", "Não consegui listar os processos inteligentes", dgMsg(e) + ".");
  }).then(function(){
    return bitrixCall("lists.get", {IBLOCK_TYPE_ID: "lists"}).then(function(j){
      var listas = Array.isArray(j.result) ? j.result : [];
      if(!listas.length) return;
      dgLinha("neutral", "Listas do portal",
        listas.length + ": " + listas.map(function(l){ return l.NAME + " (" + l.ID + ")"; }).join(" · ") + ".");
      var cand = listas.filter(function(l){ return DG_INV.test(l.NAME || ""); }).slice(0, 4);
      achou += cand.length;
      return emFila(cand, dgUmaLista);
    }, function(e){
      var m = dgMsg(e);
      dgLinha("neutral", "Não consegui ler as Listas do portal",
        m + (dgSemEscopo(m) ? ". Se o inventário for uma Lista, marque a permissão Listas (lists) no webhook só para " +
          "este diagnóstico e rode de novo." : "."));
    });
  }).then(function(){
    if(!achou) dgLinha("neutral", "Inventário de TI",
      "Não achei nenhum processo ou lista com nome de inventário (inventário, ativos, equipamentos, patrimônio, " +
      "parque). Se ele tem outro nome, está na relação acima: me diga qual é.");
  });
}

function dgRodarTudo(){
  if(dgRodando) return;
  dgLinhas = [];
  if(!load(K.wh, "")){
    dgLinha("crit", "Sem webhook", "Cole a URL no quadro acima e clique em Testar conexão primeiro.");
    return;
  }
  dgRodando = true; dgPintar();
  var ctx = {};
  dgPerfil(ctx)
    .then(function(){ return dgEscopos(ctx); })
    .then(function(){ return dgFunil(ctx); })
    .then(function(){ return dgCampos(ctx); })
    .then(function(){ return dgChamados(ctx); })
    .then(function(){ return dgUsuarios(ctx); })
    .then(function(){ return dgFicha(ctx); })
    .then(function(){ return dgTarefa(ctx); })
    .then(function(){ return dgInventario(ctx); })
    .then(function(){
      dgLinha("neutral", "Gravação não é testada aqui",
        "Este diagnóstico só lê. Criar chamado, salvar a ficha, mover no kanban e incluir tarefa realizada " +
        "só se provam usando.");
    })
    .catch(function(e){
      if(!(e && e.parar)) dgLinha("crit", "O diagnóstico parou no meio", dgMsg(e) + ".");
    })
    .then(function(){ dgRodando = false; dgPintar(); });
}

if($("dgRodar")){
  $("dgRodar").addEventListener("click", dgRodarTudo);
  $("dgCopiar").addEventListener("click", function(){
    var txt = dgTexto();
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(
        function(){ toast("Diagnóstico copiado."); },
        function(){ fallbackCopy(txt); });
    } else { fallbackCopy(txt); }
  });
  dgPintar();
}

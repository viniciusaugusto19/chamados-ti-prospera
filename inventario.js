"use strict";
/* ---------------- inventário de TI (v30) ----------------
   Lê o processo inteligente "Inventário de TI" (1040) do Bitrix, só leitura,
   e usa o que vem de lá em quatro lugares:
     - na ficha do chamado: os equipamentos de quem pediu, com atalho do AnyDesk;
     - na aba Parque: situação, garantia vencendo e etiquetas com QR code;
     - no QR code colado no equipamento: abre Abrir chamado já preenchido;
     - na pílula da aba Parque: quantas garantias vencidas ou perto de vencer.
   Nada daqui é guardado no navegador: a lista vive na memória e some ao fechar
   a página. O cadastro do Bitrix tem CPF, RG, e-mails e anexos; a página pede
   só os campos listados em INV_C e nunca esses. */

var INV_TIPO = 1040;
var INV_C = {
  serie:      "ufCrm13_1747944369736",
  marca:      "ufCrm13_1747945106460",
  modelo:     "ufCrm13_1747945117169",
  usuario:    "ufCrm13_1747945201848",
  local:      "ufCrm13_1747998235072",
  aquisicao:  "ufCrm13_1747998330510",
  garantia:   "ufCrm13_1747998401972",
  status:     "ufCrm13_1747998495705",
  tipo:       "ufCrm13_1748026872",
  imei:       "ufCrm13_1748027717705",
  chip:       "ufCrm13_1748027974855",
  seguro:     "ufCrm13_1748030212975",
  teamviewer: "ufCrm13_1753704464050",
  anydesk:    "ufCrm13_1753704496020"
};
K.qrInv = "ctip.qrInv";

var INV = {itens: null, carregando: null, quando: null, erro: "", enums: {}};
var INV_DIAS_ALERTA = 60;

/* ---------------- leitura ---------------- */
function invTxt(v){
  if(v === null || v === undefined) return "";
  if(Array.isArray(v)) return v.map(invTxt).filter(Boolean).join(", ");
  if(typeof v === "object") return "";
  return String(v).trim();
}
function invRotulo(campo, v){
  if(v === null || v === undefined || v === "") return "";
  if(Array.isArray(v)) return v.map(function(x){ return invRotulo(campo, x); }).filter(Boolean).join(", ");
  var m = INV.enums[campo];
  return (m && m[v]) || String(v);
}
function invNormalizar(it){
  return {
    id: it.id,
    titulo: invTxt(it.title),
    serie: invTxt(it[INV_C.serie]),
    marca: invTxt(it[INV_C.marca]),
    modelo: invTxt(it[INV_C.modelo]),
    usuario: invTxt(it[INV_C.usuario]),
    local: invTxt(it[INV_C.local]),
    garantia: invTxt(it[INV_C.garantia]),
    status: invRotulo(INV_C.status, it[INV_C.status]),
    tipo: invRotulo(INV_C.tipo, it[INV_C.tipo]),
    seguro: invRotulo(INV_C.seguro, it[INV_C.seguro]),
    imei: invTxt(it[INV_C.imei]),
    chip: invTxt(it[INV_C.chip]),
    teamviewer: invTxt(it[INV_C.teamviewer]),
    anydesk: invTxt(it[INV_C.anydesk])
  };
}
function invCarregar(forcar){
  if(INV.itens && !forcar) return Promise.resolve(INV.itens);
  if(INV.carregando) return INV.carregando;
  INV.erro = "";
  var todos = [];
  function pagina(start){
    return bitrixCall("crm.item.list", {
      entityTypeId: INV_TIPO,
      order: {id: "ASC"},
      start: start,
      select: ["id","title"].concat(Object.keys(INV_C).map(function(k){ return INV_C[k]; }))
    }).then(function(j){
      var itens = (j.result && j.result.items) ? j.result.items : [];
      todos = todos.concat(itens);
      if(j.next && itens.length && todos.length < 2000) return pagina(j.next);
    });
  }
  INV.carregando = bitrixCall("crm.item.fields", {entityTypeId: INV_TIPO})
    .then(function(j){
      var fs = (j.result && j.result.fields) ? j.result.fields : {};
      Object.keys(fs).forEach(function(cid){
        var d = fs[cid] || {};
        if(d.type === "enumeration" && d.items){
          var m = {};
          d.items.forEach(function(i){ m[i.ID] = i.VALUE; });
          INV.enums[cid] = m;
        }
      });
    })
    .catch(function(){ /* sem os rótulos, a lista ainda vale: mostra o id da opção */ })
    .then(function(){ return pagina(0); })
    .then(function(){
      INV.itens = todos.map(invNormalizar);
      INV.quando = new Date();
      INV.carregando = null;
      return INV.itens;
    })
    .catch(function(e){
      INV.carregando = null;
      INV.erro = e.message || String(e);
      throw e;
    });
  return INV.carregando;
}

/* ---------------- regras ---------------- */
function invSemAcento(s){
  var r = new RegExp("[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]", "g");
  return String(s || "").toLowerCase().normalize("NFD").replace(r, "");
}
var INV_LIGACAO = {da:1, de:1, do:1, dos:1, das:1, e:1, di:1, du:1};
function invTokens(s){
  return invSemAcento(s).replace(/[^a-z0-9]+/g, " ").split(" ").filter(function(t){
    return t && !INV_LIGACAO[t];
  });
}
/* de quem é o equipamento: o campo Usuário do inventário é texto livre, então
   o casamento é por nome. "certos" tem os nomes que batem por inteiro; "talvez"
   tem só o primeiro nome batendo, que pode ser outra pessoa. */
function invDaPessoa(nome){
  var certos = [], talvez = [];
  var a = invTokens(nome);
  if(!a.length || !INV.itens) return {certos: certos, talvez: talvez};
  INV.itens.forEach(function(it){
    var b = invTokens(it.usuario);
    if(!b.length) return;
    var comuns = b.filter(function(t){ return a.indexOf(t) !== -1; }).length;
    if(!comuns) return;
    if((b.length >= 2 && comuns === b.length) || (a.length >= 2 && comuns === a.length) ||
       (comuns >= 2 && a[0] === b[0])){ certos.push(it); return; }
    if((a.length === 1 || b.length === 1) && a[0] === b[0]) talvez.push(it);
  });
  return {certos: certos, talvez: talvez};
}
function invInativo(it){
  return /baix|doad|descart|vendid|perdid|roub|sucat|devolv/i.test(it.status || "");
}
/* dias até a data (só a parte da data conta; o horário que o Bitrix manda é ruído) */
function invDiasAte(iso){
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if(!m) return null;
  var alvo = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  var h = new Date();
  var hoje = Date.UTC(h.getFullYear(), h.getMonth(), h.getDate());
  return Math.round((alvo - hoje) / 86400000);
}
function invDataBr(iso){
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? m[3] + "/" + m[2] + "/" + m[1] : "";
}
/* situação da garantia: cls usa as mesmas cores dos outros selos da página */
function invGarantia(it){
  var d = invDiasAte(it.garantia);
  if(d === null) return {dias: null, cls: "neutral", txt: "sem data", chave: "sem"};
  if(d < 0) return {dias: d, cls: "crit", txt: "vencida em " + invDataBr(it.garantia), chave: "vencida"};
  if(d <= INV_DIAS_ALERTA) return {dias: d, cls: "warn", txt: d === 0 ? "vence hoje" : "vence em " + d + (d === 1 ? " dia" : " dias"), chave: "vencendo"};
  return {dias: d, cls: "ok", txt: "até " + invDataBr(it.garantia), chave: "ok"};
}
function invNome(it){
  return [it.tipo, [it.marca, it.modelo].filter(Boolean).join(" ")].filter(Boolean).join(" · ") || it.titulo || ("item " + it.id);
}
/* o texto que vai no campo Equipamento do chamado: é a chave do histórico por
   equipamento, então tem de ser sempre o mesmo para o mesmo aparelho */
function invTextoEquip(it){
  return [[it.marca, it.modelo].filter(Boolean).join(" ") || it.tipo || it.titulo, it.serie ? "(S/N " + it.serie + ")" : ""]
    .filter(Boolean).join(" ");
}
/* ID do AnyDesk: 9 ou 10 dígitos, às vezes com espaços. Qualquer outra coisa
   escrita no campo (um apelido, uma senha) não vira link. */
function invAnydeskId(txt){
  var t = String(txt || "");
  var m = /(\d[\d\s.\-]{7,13}\d)/.exec(t);
  if(!m) return "";
  var d = m[1].replace(/[\s.\-]/g, "");
  return /^\d{9,10}$/.test(d) ? d : "";
}
function invChamadosDoEquip(it){
  if(!it.serie || it.serie.length < 4) return 0;
  var s = invSemAcento(it.serie);
  return chamados.filter(function(c){ return c.equipamento && invSemAcento(c.equipamento).indexOf(s) !== -1; }).length;
}
function invCopiar(txt){
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(function(){ toast("Copiado."); }, function(){ fallbackCopy(txt); });
  } else fallbackCopy(txt);
}

/* ---------------- estilo ---------------- */
(function(){
  var s = document.createElement("style");
  s.textContent =
    ".inv-linha{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:9px 0;border-top:1px solid var(--line)}" +
    ".inv-linha:first-child{border-top:0}" +
    ".inv-linha .inv-quem{flex:1 1 260px;min-width:0}" +
    ".inv-linha .inv-quem b{display:block;font-size:.88rem}" +
    ".inv-linha .inv-quem span{font-size:.76rem;color:var(--muted)}" +
    ".inv-acoes{display:flex;gap:6px;flex-wrap:wrap;align-items:center}" +
    "a.mini{text-decoration:none;display:inline-block}" +
    "#invFicha h4{margin:12px 0 2px;font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}" +
    "#invBuscaFicha{max-width:420px}" +
    "#tab-parque .tile-linha{margin:12px 0}" +
    "#tab-parque .tile.on{border-color:var(--laranja)}" +
    "#tab-parque .tile.crit b{color:var(--crit)} #tab-parque .tile.warn b{color:var(--warn)}" +
    "#invImpressao{display:none}" +
    ".inv-et{box-sizing:border-box;width:6cm;height:3.2cm;border:1px solid #000;padding:.2cm;display:flex;gap:.25cm;" +
      "align-items:center;font-family:Arial,sans-serif;color:#000;background:#fff;page-break-inside:avoid;break-inside:avoid}" +
    ".inv-et .inv-qr{flex:0 0 2.5cm;width:2.5cm;height:2.5cm}" +
    ".inv-et .inv-qr svg{width:100%;height:100%;display:block}" +
    ".inv-et .inv-tx{display:flex;flex-direction:column;gap:.08cm;font-size:8pt;line-height:1.15;min-width:0;overflow:hidden}" +
    ".inv-et .inv-tx b{font-size:9pt}" +
    "@media print{" +
      "body.inv-imprime > *:not(#invImpressao){display:none!important}" +
      "body.inv-imprime{background:#fff!important;visibility:visible!important}" +
      "body.inv-imprime #invImpressao{display:flex!important;flex-wrap:wrap;gap:.2cm}" +
      "@page{margin:1cm}" +
    "}";
  document.head.appendChild(s);
})();

/* ---------------- ficha do chamado: equipamentos de quem pediu ---------------- */
var invFichaNome = "";
function invLinhaFicha(it, rotulo){
  var g = invGarantia(it);
  var ad = invAnydeskId(it.anydesk);
  var nCh = invChamadosDoEquip(it);
  var fone = /celular|smartphone|telefone|iphone/i.test(it.tipo || "");
  var extra = [];
  if(it.serie) extra.push("S/N " + esc(it.serie));
  if(it.local) extra.push(esc(it.local));
  if(it.status) extra.push(esc(it.status));
  if(fone && it.chip) extra.push("linha " + esc(it.chip));
  if(nCh) extra.push(nCh + (nCh === 1 ? " chamado" : " chamados") + " com este S/N");
  var acoes = "";
  if(ad){
    acoes += '<a class="mini" href="anydesk:' + ad + '" title="Abre o AnyDesk neste computador, se estiver instalado">AnyDesk ' + ad + "</a>" +
             '<button class="mini" type="button" data-inv-copia="' + ad + '">copiar ID</button>';
  } else if(it.anydesk){
    acoes += '<span class="hint" style="margin:0" title="O campo AnyDesk do inventário não tem um ID de 9 ou 10 dígitos">AnyDesk sem ID válido</span>';
  }
  if(it.teamviewer) acoes += '<button class="mini" type="button" data-inv-copia="' + esc(it.teamviewer) + '">copiar TeamViewer</button>';
  acoes += '<button class="mini" type="button" data-inv-usar="' + esc(it.id) + '" title="Põe este equipamento no campo Equipamento de um novo chamado">usar em novo chamado</button>' +
           '<a class="mini" target="_blank" rel="noopener" href="' + B.portal + "/crm/type/" + INV_TIPO + "/details/" + encodeURIComponent(it.id) + '/">Bitrix</a>';
  return '<div class="inv-linha"><div class="inv-quem"><b>' + esc(invNome(it)) + "</b><span>" +
    (rotulo ? esc(rotulo) + " · " : "") + extra.join(" · ") + "</span></div>" +
    '<span class="tag ' + g.cls + '" title="Garantia">' + esc(g.txt) + "</span>" +
    '<div class="inv-acoes">' + acoes + "</div></div>";
}
function invPintarFicha(){
  var el = $("invFicha");
  if(!el) return;
  var nome = invFichaNome;
  if(!nome){ el.hidden = true; return; }
  el.hidden = false;
  var cab = "<h3>Equipamentos de " + esc(nome) + "</h3>";
  if(!INV.itens){
    el.innerHTML = cab + '<div class="hint" style="margin:0">' +
      (INV.erro ? "Não consegui ler o inventário: " + esc(INV.erro) : "Procurando no Inventário de TI…") + "</div>";
    return;
  }
  var r = invDaPessoa(nome);
  var h = cab;
  if(r.certos.length){
    h += r.certos.map(function(it){ return invLinhaFicha(it, ""); }).join("");
  } else if(!r.talvez.length){
    h += '<div class="hint" style="margin:0">Nenhum equipamento no inventário com esse nome no campo Usuário.</div>';
  }
  if(r.talvez.length){
    h += "<h4>Só o primeiro nome bate — pode ser outra pessoa</h4>" +
      r.talvez.map(function(it){ return invLinhaFicha(it, it.usuario); }).join("");
  }
  h += '<div style="margin-top:11px"><input type="text" id="invBuscaFicha" placeholder="Procurar outro nome, série ou modelo no inventário" autocomplete="off"></div>' +
       '<div id="invBuscaRes"></div>';
  el.innerHTML = h;
}
function invBuscaTexto(q){
  var t = invSemAcento(q).trim();
  if(!t || !INV.itens) return [];
  return INV.itens.filter(function(it){
    return invSemAcento([it.usuario, it.serie, it.marca, it.modelo, it.titulo, it.local, it.tipo].join(" ")).indexOf(t) !== -1;
  }).slice(0, 8);
}
(function(){
  var tk = $("tkId") && $("tkId").closest(".ticket");
  if(!tk) return;
  var c = document.createElement("div");
  c.className = "card"; c.id = "invFicha"; c.hidden = true; c.style.marginTop = "14px";
  tk.parentNode.insertBefore(c, tk.nextSibling);
  c.addEventListener("input", function(e){
    if(e.target.id !== "invBuscaFicha") return;
    var rs = invBuscaTexto(e.target.value);
    $("invBuscaRes").innerHTML = rs.length ? rs.map(function(it){ return invLinhaFicha(it, it.usuario || "sem usuário"); }).join("")
      : (e.target.value.trim() ? '<div class="hint">Nada encontrado.</div>' : "");
  });
  c.addEventListener("click", function(e){
    var cp = e.target.getAttribute && e.target.getAttribute("data-inv-copia");
    if(cp){ invCopiar(cp); return; }
    var us = e.target.getAttribute && e.target.getAttribute("data-inv-usar");
    if(us) invUsarEmChamado(us);
  });
  /* a ficha é pintada por pintarChamado (doc.js): pendura depois dela */
  if(typeof pintarChamado === "function"){
    var orig = pintarChamado;
    pintarChamado = function(d){
      orig(d);
      invFichaNome = (d && d.solicitante) ? String(d.solicitante).trim() : "";
      if(/^usuário \d+$/.test(invFichaNome)) invFichaNome = "";
      invPintarFicha();
      if(invFichaNome && !INV.itens && !INV.carregando && load(K.wh, "")){
        invCarregar().then(invPintarFicha, invPintarFicha);
      }
    };
  }
})();

/* leva o equipamento para Abrir chamado */
function invUsarEmChamado(id){
  var it = null;
  (INV.itens || []).forEach(function(x){ if(String(x.id) === String(id)) it = x; });
  if(!it){ toast("Equipamento não encontrado no inventário."); return; }
  document.querySelector('nav.tabs button[data-tab="abrir"]').click();
  $("fEquipamento").value = invTextoEquip(it);
  if(it.usuario && !$("fSolicitante").value) $("fSolicitante").value = it.usuario;
  var fold = $("fEquipamento").closest("details");
  if(fold) fold.open = true;
  invAvisoAbrir(it);
  toast("Equipamento preenchido. Complete os obrigatórios.");
}
function invAvisoAbrir(it){
  var a = $("invAvisoAbrir");
  if(!a){
    var tab = $("tab-abrir"), ref = tab.querySelector("p.lead");
    a = document.createElement("div");
    a.id = "invAvisoAbrir"; a.className = "note"; a.style.marginBottom = "14px";
    tab.insertBefore(a, ref ? ref.nextSibling : tab.firstChild);
    a.addEventListener("click", function(e){
      var cp = e.target.getAttribute && e.target.getAttribute("data-inv-copia");
      if(cp) invCopiar(cp);
    });
  }
  var g = invGarantia(it), ad = invAnydeskId(it.anydesk);
  a.hidden = false;
  a.innerHTML = "<b>Equipamento do inventário:</b> " + esc(invNome(it)) + (it.serie ? " · S/N " + esc(it.serie) : "") +
    (it.usuario ? " · com " + esc(it.usuario) : "") + " · garantia: " + esc(g.txt) +
    (ad ? ' · <a href="anydesk:' + ad + '">abrir AnyDesk ' + ad + '</a> <button class="mini" type="button" data-inv-copia="' + ad + '">copiar ID</button>' : "");
}

/* ---------------- QR code colado no equipamento ---------------- */
var invQrPendente = null;
(function(){
  try{
    var m = /[?&]inv=(\d+)/.exec(location.search);
    if(m){
      invQrPendente = m[1];
      sessionStorage.setItem(K.qrInv, invQrPendente);
      if(history.replaceState) history.replaceState(null, "", location.pathname);
    } else {
      invQrPendente = sessionStorage.getItem(K.qrInv);
    }
  }catch(e){ /* sem sessionStorage: o QR ainda funciona se a sessão já estiver aberta */ }
})();
function invQrLimpar(){
  invQrPendente = null;
  try{ sessionStorage.removeItem(K.qrInv); }catch(e){ /* segue */ }
}
function invQrTentar(n){
  if(!invQrPendente) return;
  if(n > 240){ invQrLimpar(); return; }
  var tela = $("acTela");
  var pronto = document.body.style.visibility !== "hidden" && !(tela && !tela.hidden) && !!load(K.wh, "");
  if(!pronto){ setTimeout(function(){ invQrTentar(n + 1); }, 1000); return; }
  var id = invQrPendente;
  invQrLimpar();
  invCarregar().then(function(){
    var achou = null;
    INV.itens.forEach(function(x){ if(String(x.id) === String(id)) achou = x; });
    if(!achou){ toast("Esse QR é de um equipamento que não está mais no inventário."); return; }
    invUsarEmChamado(achou.id);
  }).catch(function(e){ toast("Li o QR, mas não consegui ler o inventário: " + e.message); });
}
setTimeout(function(){ invQrTentar(0); }, 600);

/* ---------------- aba Parque ---------------- */
var invFiltro = {busca: "", status: "", tipo: "", gar: "", ordem: "usuario"};
var invMarcados = {};

(function(){
  var nav = document.querySelector("nav.tabs");
  var ref = document.querySelector('nav.tabs button[data-tab="abrir"]');
  if(!nav || !ref) return;
  var b = document.createElement("button");
  b.setAttribute("role", "tab"); b.setAttribute("aria-selected", "false"); b.dataset.tab = "parque";
  b.innerHTML = 'Parque<span class="pill" id="pillParque" hidden>0</span>';
  nav.insertBefore(b, ref.nextSibling);

  var s = document.createElement("section");
  s.id = "tab-parque"; s.hidden = true;
  s.innerHTML =
    "<h2>Parque de equipamentos</h2>" +
    '<p class="lead">Lido do processo <b>Inventário de TI</b> do Bitrix, só leitura: o cadastro continua lá e é lá que se edita. ' +
    "A página pede só os campos de equipamento; o CPF, o RG e os anexos que existem nesse cadastro não são lidos. " +
    "Nada fica guardado neste navegador.</p>" +
    '<div class="card" style="padding:13px 16px"><div class="lote-topo" style="margin:0">' +
      '<button class="primary" type="button" id="invAtualizar">Carregar do Bitrix</button>' +
      '<span class="hint" id="invStatus" style="margin:0"></span></div></div>' +
    '<div id="invResumo"></div>' +
    '<div class="card"><div class="lote-topo">' +
      '<input type="text" id="invBusca" placeholder="Buscar por pessoa, série, modelo, local…" autocomplete="off" style="flex:1 1 220px">' +
      '<select id="invFStatus"><option value="">Qualquer situação</option></select>' +
      '<select id="invFTipo"><option value="">Qualquer tipo</option></select>' +
      '<select id="invFGar"><option value="">Qualquer garantia</option><option value="vencida">Garantia vencida</option>' +
        '<option value="vencendo">Vence em até ' + INV_DIAS_ALERTA + ' dias</option><option value="sem">Sem data de garantia</option></select>' +
      '<select id="invOrdem"><option value="usuario">Ordenar por pessoa</option><option value="garantia">Ordenar por garantia</option>' +
        '<option value="tipo">Ordenar por tipo</option></select>' +
    "</div>" +
    '<div class="lote-topo" style="margin-top:8px"><span class="hint" id="invContagem" style="margin:0"></span><span style="flex:1"></span>' +
      '<button class="ghost" type="button" id="invMarcarTodos">Marcar os da lista</button>' +
      '<button class="ghost" type="button" id="invLimparMarcas">Desmarcar</button>' +
      '<button class="primary" type="button" id="invImprimir">Imprimir etiquetas com QR</button></div>' +
    '<div class="hint" id="invDicaEt">Cola-se a etiqueta no equipamento. Ler o QR com o celular abre o Chamados TI em Abrir chamado, com o equipamento já preenchido (precisa estar logado e com o Bitrix ligado).</div></div>' +
    '<div class="tablewrap"><table><thead><tr><th style="width:28px"></th><th>Equipamento</th><th>Série</th><th>Pessoa</th><th>Local</th><th>Situação</th><th>Garantia</th><th>Remoto</th><th></th></tr></thead>' +
    '<tbody id="invCorpo"></tbody></table></div>';
  var painel = $("tab-painel");
  painel.parentNode.insertBefore(s, painel.nextSibling);
  /* a folha de etiquetas fica direto no body: ao imprimir, todo o resto some */
  var imp = document.createElement("div");
  imp.id = "invImpressao"; imp.setAttribute("aria-hidden", "true");
  document.body.appendChild(imp);

  function mostrar(){
    Array.prototype.forEach.call(document.querySelectorAll("nav.tabs button"), function(o){
      o.setAttribute("aria-selected", o === b ? "true" : "false");
      var sec = $("tab-" + o.dataset.tab); if(sec) sec.hidden = (o !== b);
    });
    invPintarParque();
    if(!INV.itens && !INV.carregando && load(K.wh, "")) invAtualizar();
  }
  b.addEventListener("click", mostrar);
  /* as outras abas não conhecem a Parque: escondem-na quando clicadas */
  Array.prototype.forEach.call(document.querySelectorAll("nav.tabs button"), function(o){
    if(o === b) return;
    o.addEventListener("click", function(){ s.hidden = true; b.setAttribute("aria-selected", "false"); });
  });

  $("invAtualizar").addEventListener("click", function(){ invAtualizar(true); });
  $("invBusca").addEventListener("input", function(){ invFiltro.busca = this.value; invPintarParque(); });
  $("invFStatus").addEventListener("change", function(){ invFiltro.status = this.value; invPintarParque(); });
  $("invFTipo").addEventListener("change", function(){ invFiltro.tipo = this.value; invPintarParque(); });
  $("invFGar").addEventListener("change", function(){ invFiltro.gar = this.value; invPintarParque(); });
  $("invOrdem").addEventListener("change", function(){ invFiltro.ordem = this.value; invPintarParque(); });
  $("invResumo").addEventListener("click", function(e){
    var t = e.target.closest ? e.target.closest("[data-invf]") : null;
    if(!t) return;
    var k = t.getAttribute("data-invf"), v = t.getAttribute("data-invv");
    if(k === "gar") { invFiltro.gar = invFiltro.gar === v ? "" : v; $("invFGar").value = invFiltro.gar; }
    if(k === "status"){ invFiltro.status = invFiltro.status === v ? "" : v; $("invFStatus").value = invFiltro.status; }
    invPintarParque();
  });
  $("invCorpo").addEventListener("click", function(e){
    var cp = e.target.getAttribute("data-inv-copia");
    if(cp){ invCopiar(cp); return; }
    var us = e.target.getAttribute("data-inv-usar");
    if(us){ invUsarEmChamado(us); return; }
    var qr = e.target.getAttribute("data-inv-qr");
    if(qr){ invImprimir([qr]); return; }
  });
  $("invCorpo").addEventListener("change", function(e){
    var id = e.target.getAttribute("data-inv-marca");
    if(!id) return;
    if(e.target.checked) invMarcados[id] = true; else delete invMarcados[id];
    invContagemEt();
  });
  $("invMarcarTodos").addEventListener("click", function(){
    invLista().forEach(function(it){ invMarcados[it.id] = true; });
    invPintarParque();
  });
  $("invLimparMarcas").addEventListener("click", function(){ invMarcados = {}; invPintarParque(); });
  $("invImprimir").addEventListener("click", function(){
    var ids = Object.keys(invMarcados);
    if(!ids.length) ids = invLista().map(function(it){ return it.id; });
    invImprimir(ids);
  });
})();

function invAtualizar(forcar){
  var st = $("invStatus");
  if(!load(K.wh, "")){ st.textContent = "Sem Bitrix ligado. Conecte na aba Bitrix."; return; }
  st.textContent = "Carregando…";
  invCarregar(forcar).then(function(){
    invTudo();
  }, function(e){
    st.textContent = "Falhou: " + e.message + " — confira o webhook na aba Bitrix.";
  });
}
/* tudo o que depende da lista do inventário se redesenha quando ela chega */
function invTudo(){
  invPintarParque(); invPintarFicha(); invPintarPilula();
}
function invAlertas(){
  return (INV.itens || []).filter(function(it){
    if(invInativo(it)) return false;
    var g = invGarantia(it);
    return g.chave === "vencida" || (g.chave === "vencendo" && g.dias <= 30);
  });
}
function invPintarPilula(){
  var p = $("pillParque");
  if(!p) return;
  var n = invAlertas().length;
  p.hidden = !n; p.textContent = n;
  p.parentNode.title = n ? n + " equipamento(s) com garantia vencida ou vencendo em até 30 dias" : "";
}
function invLista(){
  var f = invFiltro, t = invSemAcento(f.busca).trim();
  var l = (INV.itens || []).filter(function(it){
    if(f.status && it.status !== f.status) return false;
    if(f.tipo && it.tipo !== f.tipo) return false;
    if(f.gar){
      if(invInativo(it)) return false;
      if(invGarantia(it).chave !== f.gar) return false;
    }
    if(t && invSemAcento([it.usuario, it.serie, it.marca, it.modelo, it.titulo, it.local, it.tipo].join(" ")).indexOf(t) === -1) return false;
    return true;
  });
  var cmp = {
    /* sem pessoa (estoque) vai para o fim, não para o começo */
    usuario: function(a, b){
      if(!a.usuario !== !b.usuario) return a.usuario ? -1 : 1;
      return (a.usuario || "").localeCompare(b.usuario || "", "pt-BR");
    },
    tipo: function(a, b){
      if(!a.tipo !== !b.tipo) return a.tipo ? -1 : 1;
      return (a.tipo || "").localeCompare(b.tipo || "", "pt-BR") || invNome(a).localeCompare(invNome(b), "pt-BR");
    },
    garantia: function(a, b){
      var x = invGarantia(a).dias, y = invGarantia(b).dias;
      return (x === null ? 99999 : x) - (y === null ? 99999 : y);
    }
  }[f.ordem] || null;
  if(cmp) l.sort(cmp);
  return l;
}
function invContagemEt(){
  var n = Object.keys(invMarcados).length;
  $("invImprimir").textContent = n ? "Imprimir " + n + (n === 1 ? " etiqueta" : " etiquetas") + " com QR" : "Imprimir etiquetas com QR (a lista)";
}
function invPintarParque(){
  var corpo = $("invCorpo");
  if(!corpo) return;
  var st = $("invStatus");
  if(INV.itens && INV.quando){
    st.textContent = INV.itens.length + " equipamentos lidos às " +
      INV.quando.toLocaleTimeString("pt-BR", {hour: "2-digit", minute: "2-digit"}) + ".";
  } else if(INV.erro){
    st.textContent = "Falhou: " + INV.erro;
  }
  if(!INV.itens){
    $("invResumo").innerHTML = ""; corpo.innerHTML = ""; $("invContagem").textContent = "";
    return;
  }
  /* opções dos filtros vêm do que existe na lista */
  var uniq = function(campo){
    var m = {};
    INV.itens.forEach(function(it){ if(it[campo]) m[it[campo]] = (m[it[campo]] || 0) + 1; });
    return m;
  };
  var porStatus = uniq("status"), porTipo = uniq("tipo");
  var preenche = function(id, mapa, vazio, atual){
    var sel = $(id), v = atual;
    sel.innerHTML = '<option value="">' + vazio + "</option>" + Object.keys(mapa).sort().map(function(k){
      return '<option value="' + esc(k) + '">' + esc(k) + " (" + mapa[k] + ")</option>";
    }).join("");
    sel.value = v;
  };
  preenche("invFStatus", porStatus, "Qualquer situação", invFiltro.status);
  preenche("invFTipo", porTipo, "Qualquer tipo", invFiltro.tipo);

  var ativos = INV.itens.filter(function(it){ return !invInativo(it); });
  var cont = {vencida: 0, vencendo: 0, sem: 0};
  ativos.forEach(function(it){ var g = invGarantia(it).chave; if(cont[g] !== undefined) cont[g]++; });
  var tile = function(rot, val, cls, k, v, on){
    return '<button type="button" class="tile ' + (cls || "") + (on ? " on" : "") + '" data-invf="' + k + '" data-invv="' + esc(v) + '"><span>' +
      esc(rot) + "</span><b>" + val + "</b></button>";
  };
  var t = tile("Garantia vencida", cont.vencida, cont.vencida ? "crit" : "", "gar", "vencida", invFiltro.gar === "vencida") +
          tile("Vence em " + INV_DIAS_ALERTA + " dias", cont.vencendo, cont.vencendo ? "warn" : "", "gar", "vencendo", invFiltro.gar === "vencendo") +
          tile("Sem data de garantia", cont.sem, "", "gar", "sem", invFiltro.gar === "sem");
  Object.keys(porStatus).sort().forEach(function(k){
    t += tile(k, porStatus[k], "", "status", k, invFiltro.status === k);
  });
  $("invResumo").innerHTML = '<div class="tile-linha">' + t + "</div>" +
    '<div class="hint" style="margin:-4px 0 12px">As três primeiras contas não incluem equipamentos baixados, doados ou descartados. ' +
    "Clique num quadro para filtrar a lista; clique de novo para soltar.</div>";

  var l = invLista();
  $("invContagem").textContent = l.length + " de " + INV.itens.length + " equipamentos.";
  corpo.innerHTML = l.length ? l.map(function(it){
    var g = invGarantia(it), ad = invAnydeskId(it.anydesk);
    var rem = ad ? '<a class="mini" href="anydesk:' + ad + '">AnyDesk</a> <button class="mini" type="button" data-inv-copia="' + ad + '">ID</button>' :
      (it.teamviewer ? '<button class="mini" type="button" data-inv-copia="' + esc(it.teamviewer) + '">TeamViewer</button>' : "—");
    return "<tr><td><input type=\"checkbox\" data-inv-marca=\"" + esc(it.id) + "\"" + (invMarcados[it.id] ? " checked" : "") + " aria-label=\"marcar para etiqueta\"></td>" +
      "<td><b>" + esc(invNome(it)) + "</b></td><td class=\"num\">" + esc(it.serie || "—") + "</td>" +
      "<td>" + esc(it.usuario || "—") + "</td><td>" + esc(it.local || "—") + "</td>" +
      "<td>" + esc(it.status || "—") + "</td>" +
      '<td><span class="tag ' + g.cls + '">' + esc(g.txt) + "</span></td><td>" + rem + "</td>" +
      '<td><button class="mini" type="button" data-inv-qr="' + esc(it.id) + '">etiqueta</button> ' +
      '<button class="mini" type="button" data-inv-usar="' + esc(it.id) + '">chamado</button></td></tr>';
  }).join("") : '<tr><td colspan="9"><div class="hint" style="margin:6px 0">Nada com esses filtros.</div></td></tr>';
  invContagemEt();
}

/* ---------------- etiquetas com QR ---------------- */
var invQrCarregando = null;
function invCarregarQr(){
  if(typeof qrcode === "function") return Promise.resolve();
  if(invQrCarregando) return invQrCarregando;
  invQrCarregando = new Promise(function(ok, falha){
    var s = document.createElement("script");
    s.src = "qr.js";
    s.onload = ok;
    s.onerror = function(){ invQrCarregando = null; falha(new Error("não consegui carregar o gerador de QR")); };
    document.body.appendChild(s);
  });
  return invQrCarregando;
}
function invUrlQr(id){
  return location.href.split("#")[0].split("?")[0] + "?inv=" + encodeURIComponent(id);
}
function invImprimir(ids){
  if(!INV.itens) return;
  if(ids.length > 240){ toast("Muitas etiquetas de uma vez. Filtre a lista e imprima em partes."); return; }
  invCarregarQr().then(function(){
    var porId = {};
    INV.itens.forEach(function(it){ porId[it.id] = it; });
    var h = "";
    ids.forEach(function(id){
      var it = porId[id];
      if(!it) return;
      var q = qrcode(0, "M");
      q.addData(invUrlQr(it.id));
      q.make();
      h += '<div class="inv-et"><div class="inv-qr">' + q.createSvgTag({cellSize: 4, margin: 0, scalable: true}) + "</div>" +
        '<div class="inv-tx"><b>TI Prospera</b><span>' + esc([it.marca, it.modelo].filter(Boolean).join(" ") || it.tipo || it.titulo) +
        "</span><span>" + (it.serie ? "S/N " + esc(it.serie) : "") + "</span><span>inventário #" + esc(it.id) + "</span></div></div>";
    });
    if(!h){ toast("Nada para imprimir."); return; }
    $("invImpressao").innerHTML = h;
    document.body.classList.add("inv-imprime");
    var fim = function(){
      document.body.classList.remove("inv-imprime");
      window.removeEventListener("afterprint", fim);
    };
    window.addEventListener("afterprint", fim);
    window.print();
  }).catch(function(e){ toast(e.message); });
}

/* ---------------- ligação com o resto da página ---------------- */
/* a lista do inventário vem depois dos chamados, sem o técnico pedir: é o que
   faz a pílula da aba Parque aparecer sozinha */
(function(){
  if(typeof carregarChamados !== "function") return;
  var orig = carregarChamados;
  carregarChamados = function(){
    var r = orig.apply(this, arguments);
    setTimeout(function(){
      if(INV.itens || INV.carregando) return;
      invCarregar().then(invTudo, function(){ /* o aviso aparece na aba Parque */ });
    }, 4000);
    return r;
  };
})();

"use strict";
/* ---------------- v32: feriados, respostas prontas, relatórios, termo, leitor de QR ----------------
   Carregado pelo boot.js depois do extras.js e do inventario.js, fora de ordem
   garantida: o que depende do inventário espera ele aparecer (maisQuandoParque).
   Nada daqui grava no Bitrix. Respostas prontas, ajustes do termo e feriados
   ficam neste navegador (ctip.respostas, ctip.termo, ctip.feriados). */

K.respostas = "ctip.respostas";
K.termo = "ctip.termo";

function maisCopiar(txt, msg){
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(function(){ toast(msg || "Copiado."); }, function(){ fallbackCopy(txt); });
  } else fallbackCopy(txt);
}
function maisChamadoAtual(){
  var sel = $("dChamado"), id = sel ? sel.value : "", c = null;
  if(!id) return null;
  chamados.forEach(function(x){ if(String(x.id) === String(id)) c = x; });
  return c;
}
function maisDataBr(d){
  return ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2) + "/" + d.getFullYear();
}
function maisHora(d){
  return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
}
function maisNum(v, casas){
  return Number(v).toLocaleString("pt-BR", {minimumFractionDigits: casas || 0, maximumFractionDigits: casas || 0});
}

/* ---------------- estilo ---------------- */
(function(){
  var s = document.createElement("style");
  s.textContent =
    "#ferCaixa .lote-topo{gap:14px;flex-wrap:wrap}" +
    "#ferExtras{min-height:64px}" +
    "#rpCaixa textarea{min-height:190px;margin-top:10px}" +
    ".rp-item{border-top:1px solid var(--line);padding:10px 0}" +
    ".rp-item:first-child{border-top:0}" +
    ".rp-item input{margin-bottom:6px}" +
    ".rp-item textarea{min-height:90px}" +
    ".rel-mapa{border-collapse:separate;border-spacing:2px;font-size:.72rem;width:100%}" +
    ".rel-mapa th{font-weight:600;color:var(--muted);padding:2px 3px;text-align:center}" +
    ".rel-mapa td{text-align:center;padding:5px 0;border-radius:4px;min-width:20px;font-variant-numeric:tabular-nums}" +
    ".rel-tab{width:100%;border-collapse:collapse;font-size:.82rem}" +
    ".rel-tab th,.rel-tab td{padding:5px 6px;border-bottom:1px solid var(--line);text-align:right}" +
    ".rel-tab th:first-child,.rel-tab td:first-child{text-align:left}" +
    "ul.barras .bn.largo{flex:0 0 auto;min-width:26px;white-space:nowrap;font-weight:600}" +
    "#qrCaixa video{width:100%;max-width:380px;border-radius:10px;background:#000;display:block;margin:8px 0}" +
    "#qrRes .inv-linha{border-top:0}" +
    "#termoImpressao{display:none}" +
    ".termo-doc{font-family:Arial,sans-serif;color:#000;background:#fff;font-size:10.5pt;line-height:1.45;max-width:17.5cm;margin:0 auto}" +
    ".termo-doc h1{font-size:13pt;text-align:center;margin:0 0 4px}" +
    ".termo-doc .sub{text-align:center;font-size:9pt;margin:0 0 14px}" +
    ".termo-doc table{width:100%;border-collapse:collapse;margin:8px 0 12px}" +
    ".termo-doc td{border:1px solid #000;padding:4px 6px;vertical-align:top}" +
    ".termo-doc td.r{width:30%;font-weight:bold;background:#f1f1f1}" +
    ".termo-doc ol{padding-left:18px;margin:6px 0 12px}" +
    ".termo-doc .ass{display:flex;gap:1.2cm;margin-top:1.6cm}" +
    ".termo-doc .ass div{flex:1;border-top:1px solid #000;padding-top:4px;font-size:9pt;text-align:center}" +
    "@media print{" +
      "body.termo-imprime > *:not(#termoImpressao){display:none!important}" +
      "body.termo-imprime{background:#fff!important;visibility:visible!important}" +
      "body.termo-imprime #termoImpressao{display:block!important}" +
      "@page{margin:1.5cm}" +
    "}";
  document.head.appendChild(s);
})();

/* ================= 1. feriados ================= */
var FER_GRUPOS = [
  ["nac", "Nacionais"],
  ["sp", "Estado de SP (9 de julho)"],
  ["embu", "Embu das Artes (18/2 e Corpus Christi)"],
  ["spcap", "São Paulo capital (25/1 e Corpus Christi)"],
  ["carnaval", "Carnaval (segunda e terça)"]
];
function ferProximos(){
  var hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  var lista = [];
  [hoje.getFullYear(), hoje.getFullYear() + 1].forEach(function(ano){
    var m = feriadosDoAno(ano);
    Object.keys(m).forEach(function(k){
      var p = k.split("-"), d = new Date(+p[0], +p[1] - 1, +p[2]);
      if(d >= hoje) lista.push({d: d, nome: m[k]});
    });
  });
  lista.sort(function(a, b){ return a.d - b.d; });
  return lista.slice(0, 6);
}
function ferPintar(){
  var cfg = feriadosConfig();
  FER_GRUPOS.forEach(function(g){ var c = $("fer_" + g[0]); if(c) c.checked = !!cfg.grupos[g[0]]; });
  var ta = $("ferExtras");
  if(ta && document.activeElement !== ta){
    ta.value = cfg.extras.map(function(x){ var p = x.split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }).join("\n");
  }
  var px = ferProximos();
  $("ferProximos").innerHTML = px.length ? "Próximos que o prazo pula: " + px.map(function(x){
    return "<b>" + maisDataBr(x.d).slice(0, 5) + "</b> " + esc(x.nome);
  }).join(" · ") + "." : "Nenhum feriado ligado.";
}
function ferSalvar(){
  var g = {};
  FER_GRUPOS.forEach(function(x){ g[x[0]] = !!($("fer_" + x[0]) && $("fer_" + x[0]).checked); });
  var extras = [], ruins = [];
  String($("ferExtras").value || "").split(/\n+/).forEach(function(l){
    l = l.trim(); if(!l) return;
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(l);
    var d = m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
    if(!d || d.getDate() !== +m[1] || d.getMonth() !== +m[2] - 1) { ruins.push(l); return; }
    var k = diaChave(d);
    if(extras.indexOf(k) === -1) extras.push(k);
  });
  extras.sort();
  save(K.feriados, {grupos: g, extras: extras});
  feriadosLimparCache();
  $("ferAviso").textContent = ruins.length ? "Ignorei, por não ser data no formato dd/mm/aaaa: " + ruins.join(", ") + "." : "";
  ferPintar();
  if(typeof renderPainel === "function") renderPainel();
}
(function(){
  var jor = $("jorIni") && $("jorIni").closest(".card");
  if(!jor) return;
  var dica = jor.querySelector(".hint");
  if(dica) dica.innerHTML = dica.innerHTML.replace("Feriados não são descontados.", "Feriados são descontados: veja o cartão Feriados, logo abaixo.");
  var c = document.createElement("div");
  c.className = "card"; c.id = "ferCaixa";
  c.innerHTML = "<h3>Feriados</h3>" +
    '<div class="lote-topo">' + FER_GRUPOS.map(function(g){
      return '<label class="cx"><input type="checkbox" id="fer_' + g[0] + '"> ' + esc(g[1]) + "</label>";
    }).join("") + "</div>" +
    '<div class="field" style="margin-top:10px"><label for="ferExtras">Outras folgas da empresa (emenda, recesso): uma data por linha, dd/mm/aaaa</label>' +
    '<textarea id="ferExtras" placeholder="24/12/2026"></textarea></div>' +
    '<div class="hint" id="ferAviso" style="color:var(--crit)"></div>' +
    '<div class="hint" id="ferProximos"></div>' +
    '<div class="hint">Dia de feriado não conta hora no prazo do SLA nem no tempo de atendimento. ' +
    "Os de Embu e de São Paulo seguem a lista de feriados municipais do TJSP. Vale para este navegador.</div>";
  jor.parentNode.insertBefore(c, jor.nextSibling);
  FER_GRUPOS.forEach(function(g){ $("fer_" + g[0]).addEventListener("change", ferSalvar); });
  $("ferExtras").addEventListener("change", ferSalvar);
  ferPintar();
})();

/* ================= 2. respostas prontas ================= */
var RP_PADRAO = [
  {nome: "Recebido", texto: "{saudacao}, {nome}!\n\nRecebemos seu chamado {numero} — {titulo}.\nPrazo de atendimento: {prazo}.\n\nQualquer novidade, aviso por aqui.\n{tecnico} — TI Prospera"},
  {nome: "Em atendimento", texto: "{saudacao}, {nome}!\n\nJá estou cuidando do chamado {numero} ({titulo}). Te aviso assim que terminar.\n\n{tecnico} — TI Prospera"},
  {nome: "Pedir acesso remoto", texto: "{saudacao}, {nome}!\n\nPara resolver o chamado {numero}, preciso acessar seu computador. Abra o AnyDesk e me mande o número que aparece em \"Este local de trabalho\".\n\n{tecnico} — TI Prospera"},
  {nome: "Pedir informação", texto: "{saudacao}, {nome}!\n\nSobre o chamado {numero} ({titulo}), preciso de uma informação: [escreva a pergunta].\n\nPode me responder por aqui?\n{tecnico} — TI Prospera"},
  {nome: "Aguardando peça ou terceiro", texto: "{saudacao}, {nome}!\n\nO chamado {numero} ({titulo}) está aguardando [o que falta: peça, fornecedor, aprovação]. Assim que chegar, retomo e te aviso.\n\n{tecnico} — TI Prospera"},
  {nome: "Concluído", texto: "{saudacao}, {nome}!\n\nO chamado {numero} — {titulo} foi concluído.\n\n{resolucao}\n\nSe o problema voltar, é só responder esta mensagem.\n{tecnico} — TI Prospera"},
  {nome: "Sem retorno", texto: "{saudacao}, {nome}!\n\nTentei falar com você sobre o chamado {numero} ({titulo}) e não tive retorno. Se ainda precisar, me responda até amanhã; se não, encerro o chamado.\n\n{tecnico} — TI Prospera"}
];
var RP_VARIAVEIS = "{saudacao} {nome} {nomecompleto} {numero} {titulo} {prazo} {tecnico} {resolucao}";
function rpLista(){
  var l = load(K.respostas, null);
  return Array.isArray(l) && l.length ? l : RP_PADRAO.slice();
}
function rpPrazo(c){
  var s = slaDeLabel(c.prioridade) || slaDe(c.prioridade);
  if(!s || !s.h || !c.aberto) return "sem prazo definido";
  var d = fimUteis(new Date(c.aberto), s.h);
  return maisDataBr(d) + " às " + maisHora(d);
}
function rpPreencher(texto, c){
  var agora = new Date().getHours();
  var eu = load(K.eu, null);
  var nomeComp = c && c.solicitante ? String(c.solicitante).trim() : "";
  var res = $("dResolucao") ? $("dResolucao").value.trim() : "";
  var vars = {
    saudacao: agora < 12 ? "Bom dia" : (agora < 18 ? "Boa tarde" : "Boa noite"),
    nome: nomeComp.split(/\s+/)[0] || "",
    nomecompleto: nomeComp,
    numero: c && c.origem === "bitrix" ? "#" + c.id : (c && /^\d+$/.test(String(c.id)) ? "#" + c.id : ""),
    titulo: c ? (c.titulo || "") : "",
    prazo: c ? rpPrazo(c) : "",
    tecnico: eu && eu.nome ? String(eu.nome).split(/\s+/)[0] : "",
    resolucao: res
  };
  var t = String(texto).replace(/\{(\w+)\}/g, function(m, k){ return vars.hasOwnProperty(k) ? vars[k] : m; });
  /* "Olá, !" e "chamado  (" ficam feios: limpa o que sobrou de variável vazia */
  return t.replace(/, !/g, "!").replace(/ — TI Prospera/g, function(m){ return vars.tecnico ? m : "TI Prospera"; })
          .replace(/^TI Prospera$/m, "TI Prospera").replace(/\n{3,}/g, "\n\n").replace(/ {2,}/g, " ").trim();
}
function rpPintarSelect(){
  var sel = $("rpModelo"); if(!sel) return;
  sel.innerHTML = '<option value="">Escolha uma resposta pronta…</option>' + rpLista().map(function(r, i){
    return '<option value="' + i + '">' + esc(r.nome) + "</option>";
  }).join("");
}
function rpUsar(){
  var i = $("rpModelo").value, ta = $("rpTexto");
  if(i === ""){ ta.hidden = true; $("rpCopiar").disabled = true; return; }
  var c = maisChamadoAtual();
  ta.value = rpPreencher(rpLista()[+i].texto, c);
  ta.hidden = false; $("rpCopiar").disabled = false;
  $("rpNota").textContent = c ? "" : "Nenhum chamado aberto na ficha: nome, número e prazo ficaram vazios.";
}
function rpPintarEditor(){
  var ed = $("rpEditor");
  ed.innerHTML = '<div class="hint" style="margin:0 0 8px">Palavras entre chaves viram o dado do chamado: ' + esc(RP_VARIAVEIS) +
    ". Trechos entre colchetes, como [escreva a pergunta], são para você completar antes de mandar.</div>" +
    rpLista().map(function(r, i){
      return '<div class="rp-item"><input type="text" data-rp-nome="' + i + '" value="' + esc(r.nome) + '" maxlength="60">' +
        '<textarea data-rp-texto="' + i + '">' + esc(r.texto) + "</textarea>" +
        '<button class="mini" type="button" data-rp-apagar="' + i + '">apagar</button></div>';
    }).join("") +
    '<div class="lote-topo" style="margin-top:10px"><button class="ghost" type="button" id="rpNova">Nova resposta</button>' +
    '<button class="ghost" type="button" id="rpRestaurar">Voltar às respostas de fábrica</button>' +
    '<span style="flex:1"></span><button class="primary" type="button" id="rpGuardar">Guardar</button></div>';
}
function rpLerEditor(){
  var l = [];
  Array.prototype.forEach.call(document.querySelectorAll("[data-rp-nome]"), function(inp){
    var i = inp.getAttribute("data-rp-nome");
    var ta = document.querySelector('[data-rp-texto="' + i + '"]');
    var nome = inp.value.trim(), texto = ta ? ta.value : "";
    if(nome && texto.trim()) l.push({nome: nome, texto: texto});
  });
  return l;
}
(function(){
  var barra = $("btnCopiarDoc") && $("btnCopiarDoc").closest(".barra-acao");
  if(!barra) return;
  var c = document.createElement("div");
  c.className = "card"; c.id = "rpCaixa";
  c.innerHTML = "<h3>Respostas prontas</h3>" +
    '<div class="lote-topo"><select id="rpModelo" style="flex:1 1 240px"></select>' +
    '<button class="ghost" type="button" id="rpCopiar" disabled>Copiar</button>' +
    '<button class="ghost" type="button" id="rpEditar">Editar respostas</button></div>' +
    '<textarea id="rpTexto" hidden></textarea>' +
    '<div class="hint" id="rpNota"></div>' +
    '<div id="rpEditor" hidden></div>' +
    '<div class="hint">Recados para quem pediu, já com o nome, o número e o prazo do chamado aberto na ficha. ' +
    "O texto pode ser ajustado aqui antes de copiar; nada é gravado no Bitrix.</div>";
  barra.parentNode.insertBefore(c, barra);
  rpPintarSelect();
  $("rpModelo").addEventListener("change", rpUsar);
  $("rpCopiar").addEventListener("click", function(){
    var t = $("rpTexto").value.trim();
    if(!t) return;
    if(/\[[^\]]+\]/.test(t)) toast("Atenção: ainda tem trecho entre colchetes para completar.");
    maisCopiar(t, "Resposta copiada. Cole no WhatsApp, no Teams ou no e-mail.");
  });
  $("rpEditar").addEventListener("click", function(){
    var ed = $("rpEditor");
    if(ed.hidden){ rpPintarEditor(); ed.hidden = false; } else ed.hidden = true;
  });
  $("rpEditor").addEventListener("click", function(e){
    var t = e.target;
    var ap = t.getAttribute("data-rp-apagar");
    if(ap !== null){
      var l = rpLerEditor(); l.splice(+ap, 1);
      if(!l.length){ toast("Fica pelo menos uma resposta."); return; }
      save(K.respostas, l); rpPintarEditor(); rpPintarSelect(); return;
    }
    if(t.id === "rpNova"){
      var l2 = rpLerEditor(); l2.push({nome: "Nova resposta", texto: "{saudacao}, {nome}!\n\n\n\n{tecnico} — TI Prospera"});
      save(K.respostas, l2); rpPintarEditor(); rpPintarSelect(); return;
    }
    if(t.id === "rpRestaurar"){
      save(K.respostas, RP_PADRAO.slice()); rpPintarEditor(); rpPintarSelect(); toast("Respostas de fábrica de volta."); return;
    }
    if(t.id === "rpGuardar"){
      var l3 = rpLerEditor();
      if(!l3.length){ toast("Cada resposta precisa de nome e texto."); return; }
      save(K.respostas, l3); rpPintarSelect(); $("rpEditor").hidden = true; toast("Respostas guardadas.");
    }
  });
  /* trocou de chamado na ficha: a resposta escolhida se refaz com os dados do novo */
  if($("dChamado")) $("dChamado").addEventListener("change", function(){ setTimeout(function(){ if($("rpModelo").value !== "") rpUsar(); }, 400); });
})();

/* ================= 3. relatórios no Dashboard ================= */
var REL_DIAS = 90;
var REL_SEM = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
function relBase(){
  return chamados.filter(function(c){
    if(!c.aberto || isNaN(new Date(c.aberto).getTime())) return false;
    return typeof passaFiltros === "function" ? passaFiltros(c) : true;
  });
}
function relConcluido(c){ return (c.semantica === "S" || c.etapa === "Concluir") && c.movido; }
function relMapa(base){
  var desde = Date.now() - REL_DIAS * 86400000;
  var horas = []; for(var h = 7; h <= 18; h++) horas.push(h);
  var m = {}, maior = 0, n = 0, fora = 0, diasUsados = {1: 1, 2: 1, 3: 1, 4: 1, 5: 1};
  base.forEach(function(c){
    var d = new Date(c.aberto);
    if(d.getTime() < desde) return;
    n++;
    var dia = d.getDay(), hr = d.getHours();
    if(hr < 7 || hr > 18){ fora++; return; }
    diasUsados[dia] = 1;
    var k = dia + "-" + hr;
    m[k] = (m[k] || 0) + 1;
    if(m[k] > maior) maior = m[k];
  });
  if(!n) return '<div class="vazio-mini">Nenhum chamado aberto nos últimos ' + REL_DIAS + " dias.</div>";
  var dias = [1, 2, 3, 4, 5, 6, 0].filter(function(d){ return diasUsados[d]; });
  var h2 = '<table class="rel-mapa"><thead><tr><th></th>' + horas.map(function(h){ return "<th>" + h + "h</th>"; }).join("") + "</tr></thead><tbody>";
  dias.forEach(function(d){
    h2 += "<tr><th>" + REL_SEM[d] + "</th>" + horas.map(function(h){
      var v = m[d + "-" + h] || 0, pct = maior ? Math.round(v / maior * 85) + (v ? 10 : 0) : 0;
      return '<td title="' + REL_SEM[d] + " " + h + "h: " + v + '" style="background:color-mix(in srgb, var(--laranja) ' + pct + '%, var(--surface-2))">' + (v || "") + "</td>";
    }).join("") + "</tr>";
  });
  h2 += "</tbody></table>";
  return h2 + '<div class="hint">' + n + " chamados abertos nos últimos " + REL_DIAS + " dias" +
    (fora ? ", " + fora + " fora das 7h às 19h (não aparecem no quadro)" : "") + ".</div>";
}
function relSolucao(base){
  var desde = Date.now() - REL_DIAS * 86400000, g = {};
  base.forEach(function(c){
    if(!relConcluido(c)) return;
    var fim = new Date(c.movido);
    if(fim.getTime() < desde) return;
    var h = horasUteis(new Date(c.aberto), fim);
    var k = c.categoria || "— sem categoria —";
    (g[k] = g[k] || []).push(h);
  });
  var l = Object.keys(g).map(function(k){
    var v = g[k], s = 0; v.forEach(function(x){ s += x; });
    return {rot: k, media: s / v.length, n: v.length};
  }).sort(function(a, b){ return b.media - a.media; });
  if(!l.length) return '<div class="vazio-mini">Nenhum chamado concluído nos últimos ' + REL_DIAS + " dias.</div>";
  var maior = l[0].media || 1;
  return '<ul class="barras">' + l.slice(0, 10).map(function(x){
    return '<li><span class="bl" title="' + esc(x.rot) + '">' + esc(x.rot) + "</span>" +
      '<span class="bw"><span class="bar" style="width:' + (x.media / maior * 100).toFixed(1) + '%"><span class="seg neutral" style="flex:1;opacity:1;background:var(--laranja)"></span></span></span>' +
      '<span class="bn largo" title="' + x.n + ' concluídos">' + maisNum(x.media, 1) + " h · " + x.n + "</span></li>";
  }).join("") + "</ul>" +
    '<div class="hint">Média de horas úteis da abertura à conclusão, nos últimos ' + REL_DIAS + " dias; o número depois do ponto é quantos chamados.</div>";
}
function relSegunda(d){
  var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var dow = x.getDay(); x.setDate(x.getDate() - (dow === 0 ? 6 : dow - 1));
  return x;
}
function relSemanas(base){
  var ini = relSegunda(new Date()); ini.setDate(ini.getDate() - 7 * 7);
  var sem = [];
  for(var i = 0; i < 8; i++){ var d = new Date(ini); d.setDate(d.getDate() + 7 * i); sem.push({ini: d, ab: 0, fe: 0}); }
  var idx = function(t){
    var k = Math.floor((relSegunda(new Date(t)) - ini) / (7 * 86400000) + 0.01);
    return k >= 0 && k < 8 ? k : -1;
  };
  base.forEach(function(c){
    var a = idx(c.aberto); if(a >= 0) sem[a].ab++;
    if(relConcluido(c)){ var f = idx(c.movido); if(f >= 0) sem[f].fe++; }
  });
  var maior = 1; sem.forEach(function(s){ maior = Math.max(maior, s.ab, s.fe); });
  var barra = function(v, cor){
    return '<span style="display:inline-block;vertical-align:middle;height:9px;border-radius:3px;margin-right:6px;background:' + cor +
      ";width:" + Math.max(v ? 3 : 0, Math.round(v / maior * 70)) + 'px"></span>' + v;
  };
  return '<table class="rel-tab"><thead><tr><th>Semana de</th><th>Abertos</th><th>Concluídos</th><th>Saldo</th></tr></thead><tbody>' +
    sem.map(function(s){
      var saldo = s.ab - s.fe;
      return "<tr><td>" + maisDataBr(s.ini).slice(0, 5) + "</td><td>" + barra(s.ab, "var(--laranja)") + "</td><td>" + barra(s.fe, "var(--good)") +
        '</td><td style="color:' + (saldo > 0 ? "var(--crit)" : "var(--good)") + '">' + (saldo > 0 ? "+" : "") + saldo + "</td></tr>";
    }).join("") + "</tbody></table>" +
    '<div class="hint">Saldo positivo é fila crescendo. Conta só os chamados que a página carregou (os 300 mais recentes e os abertos mais antigos).</div>';
}
function relSla(base){
  var meses = [], hoje = new Date();
  for(var i = 5; i >= 0; i--){ meses.push({d: new Date(hoje.getFullYear(), hoje.getMonth() - i, 1), ok: 0, fora: 0}); }
  base.forEach(function(c){
    if(!relConcluido(c)) return;
    var f = new Date(c.movido);
    var k = (f.getFullYear() - meses[0].d.getFullYear()) * 12 + f.getMonth() - meses[0].d.getMonth();
    if(k < 0 || k > 5) return;
    var s = situacao(c);
    if(!s.limite) return;
    if(s.cls === "ok") meses[k].ok++; else meses[k].fora++;
  });
  var nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return '<ul class="barras">' + meses.map(function(m){
    var t = m.ok + m.fora, pct = t ? m.ok / t * 100 : 0;
    return '<li><span class="bl">' + nomes[m.d.getMonth()] + "/" + String(m.d.getFullYear()).slice(2) + "</span>" +
      '<span class="bw"><span class="bar" style="width:' + (t ? 100 : 0) + '%">' +
      (m.ok ? '<span class="seg ok" style="flex:' + m.ok + '" title="' + m.ok + ' no prazo"></span>' : "") +
      (m.fora ? '<span class="seg crit" style="flex:' + m.fora + '" title="' + m.fora + ' fora do prazo"></span>' : "") +
      '</span></span><span class="bn largo">' + (t ? maisNum(pct) + "% de " + t : "—") + "</span></li>";
  }).join("") + "</ul>" +
    '<div class="hint">Concluídos no mês que tinham SLA: verde no prazo, vermelho fora. Sem prioridade, o chamado não entra.</div>';
}
function relPintar(){
  if(!$("relMapa")) return;
  var base = relBase();
  $("relMapa").innerHTML = relMapa(base);
  $("relSolucao").innerHTML = relSolucao(base);
  $("relSemanas").innerHTML = relSemanas(base);
  $("relSla").innerHTML = relSla(base);
}
(function(){
  var grade = document.querySelector("#sub-dash .dash-grid");
  if(!grade) return;
  [["relSemanas", "Abertos e concluídos por semana", true],
   ["relSla", "Prazo cumprido por mês", false],
   ["relSolucao", "Tempo médio de solução por categoria", false],
   ["relMapa", "Quando os chamados chegam", true]].forEach(function(b){
    var d = document.createElement("div");
    d.className = "bloco" + (b[2] ? " dash-largo" : "");
    d.innerHTML = "<h3>" + esc(b[1]) + '</h3><div id="' + b[0] + '"></div>';
    grade.appendChild(d);
  });
  if(typeof aposPainel !== "undefined" && aposPainel.push) aposPainel.push(relPintar);
  relPintar();
})();

/* ================= 4 e 5. parque: termo de responsabilidade e leitor de QR ================= */
/* o inventario.js chega fora de ordem: espera a aba Parque existir */
function maisQuandoParque(fn, n){
  n = n || 0;
  if($("invAtualizar") && typeof invPintarParque === "function" && typeof INV !== "undefined") { fn(); return; }
  if(n > 100) return;
  setTimeout(function(){ maisQuandoParque(fn, n + 1); }, 150);
}
function maisItem(id){
  var it = null;
  (INV.itens || []).forEach(function(x){ if(String(x.id) === String(id)) it = x; });
  return it;
}

/* ---------- termo ---------- */
var TERMO_CLAUSULAS = [
  "O equipamento é de propriedade da empresa e é cedido para uso exclusivo nas atividades de trabalho.",
  "O colaborador se responsabiliza pela guarda e pela conservação do equipamento e dos acessórios listados.",
  "Perda, furto, roubo ou dano devem ser comunicados à TI imediatamente; em caso de furto ou roubo, com o boletim de ocorrência.",
  "Não é permitido emprestar o equipamento, instalar programas sem autorização da TI nem retirar as etiquetas de identificação.",
  "O equipamento deve ser devolvido em bom estado ao término do vínculo com a empresa ou quando a empresa solicitar."
];
var termoId = null;
function termoAjustes(){
  var t = load(K.termo, null) || {};
  return {
    cidade: t.cidade || "Embu das Artes",
    empresa: t.empresa || "",
    clausulas: Array.isArray(t.clausulas) && t.clausulas.length ? t.clausulas : TERMO_CLAUSULAS.slice()
  };
}
function termoEmpresas(){
  var m = enumRotulos[B.campo.empresa] || {}, l = [];
  Object.keys(m).forEach(function(k){ if(m[k] && l.indexOf(m[k]) === -1) l.push(m[k]); });
  ["Astro34", "Fastco", "Spectral Solutions"].forEach(function(x){
    if(!l.some(function(y){ return y.toLowerCase() === x.toLowerCase(); })) l.push(x);
  });
  return l;
}
function termoAbrir(id){
  var it = maisItem(id);
  if(!it){ toast("Equipamento não encontrado no inventário."); return; }
  termoId = it.id;
  var a = termoAjustes();
  var caixa = $("termoCaixa");
  var hoje = new Date();
  var iso = hoje.getFullYear() + "-" + ("0" + (hoje.getMonth() + 1)).slice(-2) + "-" + ("0" + hoje.getDate()).slice(-2);
  caixa.innerHTML = "<h3>Termo de responsabilidade — " + esc(invNome(it)) + (it.serie ? " · S/N " + esc(it.serie) : "") + "</h3>" +
    '<div class="grid g2">' +
      '<div class="field"><label for="tmTipo">Tipo</label><select id="tmTipo"><option value="entrega">Entrega ao colaborador</option><option value="devolucao">Devolução à TI</option></select></div>' +
      '<div class="field"><label for="tmPessoa">Colaborador <span class="req">*</span></label><input type="text" id="tmPessoa" maxlength="120" value="' + esc(it.usuario || "") + '"></div>' +
      '<div class="field"><label for="tmEmpresa">Empresa</label><select id="tmEmpresa"><option value="">—</option>' +
        termoEmpresas().map(function(x){ return '<option value="' + esc(x) + '"' + (x === a.empresa ? " selected" : "") + ">" + esc(x) + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label for="tmEstado">Estado do equipamento</label><select id="tmEstado">' +
        ["Novo", "Bom", "Regular", "Com avarias"].map(function(x){ return "<option>" + x + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label for="tmAcessorios">Acessórios entregues junto</label><input type="text" id="tmAcessorios" maxlength="200" placeholder="carregador, mochila, mouse"></div>' +
      '<div class="field"><label for="tmData">Data</label><input type="date" id="tmData" value="' + iso + '"></div>' +
      '<div class="field"><label for="tmCidade">Cidade</label><input type="text" id="tmCidade" maxlength="60" value="' + esc(a.cidade) + '"></div>' +
      '<div class="field"><label for="tmObs">Observações</label><input type="text" id="tmObs" maxlength="300" placeholder="riscos na tampa, tela sem marcas…"></div>' +
    "</div>" +
    '<details style="margin-top:12px"><summary>Cláusulas do termo de entrega (uma por linha)</summary>' +
      '<textarea id="tmClausulas" style="min-height:150px;margin-top:8px">' + esc(a.clausulas.join("\n")) + "</textarea>" +
      '<div class="hint">Texto de partida, escrito pela TI. Vale passar pelo RH ou pelo jurídico antes de usar como padrão. Fica guardado neste navegador.</div></details>' +
    '<div class="lote-topo" style="margin-top:14px"><button class="primary" type="button" id="tmImprimir">Gerar e imprimir</button>' +
      '<button class="ghost" type="button" id="tmFechar">Fechar</button></div>' +
    '<div class="hint">Na janela de impressão, escolha "Salvar como PDF" para guardar o arquivo. O CPF fica em branco para a pessoa preencher à mão: a página não lê CPF do inventário.</div>';
  $("tmData").style.cssText = "width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg)";
  caixa.style.display = "";
  if(caixa.scrollIntoView) caixa.scrollIntoView({block: "start"});
  if(!it.usuario) $("tmPessoa").focus();
}
function termoHtml(it, v){
  var linhas = [["Equipamento", invNome(it)], ["Marca e modelo", [it.marca, it.modelo].filter(Boolean).join(" ")],
                ["Número de série", it.serie], ["Nº no inventário", "#" + it.id]];
  if(it.imei) linhas.push(["IMEI", it.imei]);
  if(it.chip) linhas.push(["Linha / chip", it.chip]);
  linhas.push(["Acessórios", v.acessorios || "nenhum"], ["Estado", v.estado]);
  if(v.obs) linhas.push(["Observações", v.obs]);
  var p = v.data.split("-"), dataBr = p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : v.data;
  var entrega = v.tipo === "entrega";
  var corpo = entrega
    ? "<p>Eu, <b>" + esc(v.pessoa) + "</b>, CPF ____________________, declaro ter recebido" + (v.empresa ? " da <b>" + esc(v.empresa) + "</b>" : " da empresa") +
      " o equipamento descrito abaixo, nas condições indicadas, e me comprometo com o que segue.</p>"
    : "<p>A TI declara ter recebido de <b>" + esc(v.pessoa) + "</b>, CPF ____________________, o equipamento descrito abaixo" +
      (v.empresa ? ", de propriedade da <b>" + esc(v.empresa) + "</b>" : "") + ", no estado indicado.</p>";
  return '<div class="termo-doc"><h1>TERMO DE RESPONSABILIDADE — ' + (entrega ? "ENTREGA" : "DEVOLUÇÃO") + " DE EQUIPAMENTO</h1>" +
    '<p class="sub">' + esc(v.empresa || "") + (v.empresa ? " · " : "") + "TI Prospera</p>" + corpo +
    "<table>" + linhas.map(function(l){ return '<tr><td class="r">' + esc(l[0]) + "</td><td>" + esc(l[1] || "—") + "</td></tr>"; }).join("") + "</table>" +
    (entrega ? "<ol>" + v.clausulas.map(function(c){ return "<li>" + esc(c) + "</li>"; }).join("") + "</ol>" : "") +
    "<p>" + esc(v.cidade) + ", " + esc(dataBr) + ".</p>" +
    '<div class="ass"><div>' + esc(v.pessoa) + "<br>Colaborador</div><div>" + esc(v.tecnico || "") + "<br>TI Prospera</div></div></div>";
}
function termoImprimir(){
  var it = maisItem(termoId);
  if(!it) return;
  var v = {
    tipo: $("tmTipo").value, pessoa: $("tmPessoa").value.trim(), empresa: $("tmEmpresa").value,
    estado: $("tmEstado").value, acessorios: $("tmAcessorios").value.trim(), data: $("tmData").value,
    cidade: $("tmCidade").value.trim() || "Embu das Artes", obs: $("tmObs").value.trim(),
    clausulas: $("tmClausulas").value.split(/\n+/).map(function(x){ return x.trim(); }).filter(Boolean),
    tecnico: (load(K.eu, null) || {}).nome || ""
  };
  if(!v.pessoa){ toast("Diga quem recebe ou devolve o equipamento."); $("tmPessoa").focus(); return; }
  if(!v.data){ toast("Falta a data."); return; }
  if(!v.clausulas.length) v.clausulas = TERMO_CLAUSULAS.slice();
  save(K.termo, {cidade: v.cidade, empresa: v.empresa, clausulas: v.clausulas});
  $("termoImpressao").innerHTML = termoHtml(it, v);
  document.body.classList.add("termo-imprime");
  var fim = function(){ document.body.classList.remove("termo-imprime"); window.removeEventListener("afterprint", fim); };
  window.addEventListener("afterprint", fim);
  window.print();
}

/* ---------- leitor de QR ---------- */
var qrFluxo = null, qrTimer = null, qrDetector = null;
function qrParar(){
  if(qrTimer){ clearInterval(qrTimer); qrTimer = null; }
  if(qrFluxo){ qrFluxo.getTracks().forEach(function(t){ t.stop(); }); qrFluxo = null; }
  var v = $("qrVideo"); if(v){ v.srcObject = null; v.hidden = true; }
}
function qrAbrir(){
  var caixa = $("qrCaixa");
  caixa.style.display = "";
  $("qrRes").innerHTML = ""; $("qrManual").value = "";
  if(caixa.scrollIntoView) caixa.scrollIntoView({block: "start"});
  var st = $("qrStatus");
  if(!INV.itens && !INV.carregando && typeof invCarregar === "function") invCarregar().then(invTudo, function(){});
  if(!("BarcodeDetector" in window) || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    st.textContent = "Este navegador não lê QR pela página (o iPhone e o Firefox não leem). Use a câmera normal do celular — o QR da etiqueta abre o Chamados TI direto — ou digite a série abaixo.";
    $("qrManual").focus();
    return;
  }
  st.textContent = "Abrindo a câmera…";
  Promise.resolve(BarcodeDetector.getSupportedFormats ? BarcodeDetector.getSupportedFormats() : ["qr_code"]).then(function(f){
    if(f.indexOf("qr_code") === -1) throw new Error("este aparelho não lê QR code");
    qrDetector = new BarcodeDetector({formats: ["qr_code"]});
    return navigator.mediaDevices.getUserMedia({video: {facingMode: "environment"}, audio: false});
  }).then(function(fluxo){
    qrFluxo = fluxo;
    var v = $("qrVideo");
    v.srcObject = fluxo; v.hidden = false;
    v.setAttribute("playsinline", ""); v.muted = true;
    /* não espera o play: em alguns aparelhos ele demora a responder, e a leitura
       só começa a achar algo quando o vídeo tem imagem de qualquer jeito */
    var pr = v.play();
    if(pr && pr.catch) pr.catch(function(){});
  }).then(function(){
    st.textContent = "Aponte para o QR da etiqueta.";
    var ocupado = false;
    qrTimer = setInterval(function(){
      if(ocupado || !qrFluxo) return;
      ocupado = true;
      qrDetector.detect($("qrVideo")).then(function(cods){
        ocupado = false;
        if(cods && cods.length && cods[0].rawValue){ qrParar(); qrTratar(cods[0].rawValue); }
      }, function(){ ocupado = false; });
    }, 350);
  }).catch(function(e){
    qrParar();
    st.textContent = "Não consegui usar a câmera (" + (e && e.message ? e.message : e) + "). Dê permissão de câmera ao site ou digite a série abaixo.";
  });
}
/* o que veio do QR (ou do campo): o endereço da etiqueta (?inv=123), o número
   do inventário, ou a série escrita na etiqueta */
function qrAchar(txt){
  txt = String(txt || "").trim();
  if(!txt || !INV.itens) return null;
  var m = /[?&]inv=(\d+)/.exec(txt) || /^#?(\d{1,7})$/.exec(txt);
  if(m){ var porId = maisItem(m[1]); if(porId) return porId; }
  var ch = typeof invSerieChave === "function" ? invSerieChave(txt) : txt.toLowerCase();
  var achou = null;
  INV.itens.forEach(function(it){ if(!achou && it.serie && invSerieChave(it.serie) === ch) achou = it; });
  return achou;
}
function qrTratar(txt){
  qrParar();   /* achou (pela câmera ou digitando): a câmera não precisa ficar ligada */
  var st = $("qrStatus"), res = $("qrRes");
  var segue = function(){
    var it = qrAchar(txt);
    if(!it){
      st.textContent = "Não achei esse equipamento no inventário.";
      res.innerHTML = '<div class="hint">Lido: ' + esc(String(txt).slice(0, 120)) + "</div>";
      return;
    }
    st.textContent = "Achei.";
    var g = invGarantia(it);
    res.innerHTML = '<div class="inv-linha"><div class="inv-quem"><b>' + esc(invNome(it)) + "</b><span>" +
      [it.serie ? "S/N " + esc(it.serie) : "", it.usuario ? "com " + esc(it.usuario) : "em estoque", esc(it.local || ""), esc(it.status || "")].filter(Boolean).join(" · ") +
      '</span></div><span class="tag ' + g.cls + '">' + esc(g.txt) + "</span>" +
      '<div class="inv-acoes"><button class="mini" type="button" data-qr-acao="chamado" data-id="' + esc(it.id) + '">abrir chamado</button>' +
      '<button class="mini" type="button" data-qr-acao="editar" data-id="' + esc(it.id) + '">editar</button>' +
      '<button class="mini" type="button" data-qr-acao="termo" data-id="' + esc(it.id) + '">termo</button>' +
      '<button class="mini" type="button" data-qr-acao="etiqueta" data-id="' + esc(it.id) + '">etiqueta</button></div></div>';
  };
  if(INV.itens) segue();
  else {
    st.textContent = "Carregando o inventário…";
    invCarregar().then(function(){ invTudo(); segue(); }, function(e){ st.textContent = "Não consegui ler o inventário: " + e.message; });
  }
}

maisQuandoParque(function(){
  var topo = $("invNovoBtn");
  var bq = document.createElement("button");
  bq.className = "ghost"; bq.type = "button"; bq.id = "qrBtn"; bq.textContent = "Ler etiqueta";
  bq.title = "Abre a câmera e acha o equipamento pelo QR da etiqueta";
  topo.parentNode.insertBefore(bq, topo.nextSibling);

  var ref = $("invNovo");
  var q = document.createElement("div");
  q.className = "card"; q.id = "qrCaixa"; q.style.display = "none";
  q.innerHTML = "<h3>Ler etiqueta</h3>" +
    '<video id="qrVideo" hidden></video>' +
    '<div class="hint" id="qrStatus" style="margin:0 0 8px"></div>' +
    '<div class="lote-topo"><input type="text" id="qrManual" placeholder="Ou digite a série ou o nº do inventário" autocomplete="off" style="flex:1 1 220px">' +
    '<button class="ghost" type="button" id="qrBuscar">Buscar</button><button class="ghost" type="button" id="qrFechar">Fechar</button></div>' +
    '<div id="qrRes" style="margin-top:8px"></div>';
  ref.parentNode.insertBefore(q, ref.nextSibling);

  var t = document.createElement("div");
  t.className = "card"; t.id = "termoCaixa"; t.style.display = "none";
  q.parentNode.insertBefore(t, q.nextSibling);
  var imp = document.createElement("div");
  imp.id = "termoImpressao"; imp.setAttribute("aria-hidden", "true");
  document.body.appendChild(imp);

  bq.addEventListener("click", qrAbrir);
  $("qrFechar").addEventListener("click", function(){ qrParar(); q.style.display = "none"; });
  $("qrBuscar").addEventListener("click", function(){ qrTratar($("qrManual").value); });
  $("qrManual").addEventListener("keydown", function(e){ if(e.key === "Enter") qrTratar(this.value); });
  $("qrRes").addEventListener("click", function(e){
    var a = e.target.getAttribute("data-qr-acao"), id = e.target.getAttribute("data-id");
    if(!a) return;
    if(a !== "etiqueta") { qrParar(); q.style.display = "none"; }
    if(a === "chamado") invUsarEmChamado(id);
    else if(a === "editar") invEditar(id);
    else if(a === "termo") termoAbrir(id);
    else if(a === "etiqueta") invImprimir([id]);
  });
  t.addEventListener("click", function(e){
    if(e.target.id === "tmImprimir") termoImprimir();
    else if(e.target.id === "tmFechar") t.style.display = "none";
  });

  /* "termo" em cada linha da tabela, ao lado de "editar" */
  var orig = invPintarParque;
  invPintarParque = function(){
    orig.apply(this, arguments);
    Array.prototype.forEach.call(document.querySelectorAll("#invCorpo [data-inv-editar]"), function(b){
      var id = b.getAttribute("data-inv-editar");
      var tb = document.createElement("button");
      tb.className = "mini"; tb.type = "button"; tb.setAttribute("data-inv-termo", id); tb.textContent = "termo";
      b.parentNode.insertBefore(tb, b.nextSibling);
      b.parentNode.insertBefore(document.createTextNode(" "), tb);
    });
  };
  $("invCorpo").addEventListener("click", function(e){
    var id = e.target.getAttribute && e.target.getAttribute("data-inv-termo");
    if(id) termoAbrir(id);
  });
  invPintarParque();
});

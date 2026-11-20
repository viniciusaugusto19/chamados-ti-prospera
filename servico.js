"use strict";
/* ---------------- v33: o que usa o servidor de acesso ----------------
   Avaliação de satisfação, histórico de quem já teve o equipamento e rotinas
   preventivas/vencimentos. Tudo passa pela função "chamados" do Supabase
   (acPedir, em acesso.js) e fica guardado lá, para a equipe inteira ver.
   Sem servidor configurado (SERVIDOR.url vazio), nada daqui aparece.
   Chega fora de ordem, como extras.js, inventario.js e mais.js: o que depende
   deles espera (svQuando). */

function svLigado(){ return !!(SERVIDOR && SERVIDOR.url); }
function svPedir(corpo){
  if(typeof acPedir !== "function") return Promise.reject(new Error("a tela de acesso ainda não carregou"));
  return acPedir(corpo);
}
function svQuando(teste, fn, n){
  n = n || 0;
  var ok = false;
  try{ ok = teste(); }catch(e){ ok = false; }
  if(ok){ fn(); return; }
  if(n > 160) return;
  setTimeout(function(){ svQuando(teste, fn, n + 1); }, 150);
}
function svData(iso){
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? m[3] + "/" + m[2] + "/" + m[1] : "";
}
function svDataHora(iso){
  var d = new Date(iso);
  if(isNaN(d.getTime())) return "";
  return ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2) + "/" + d.getFullYear() + " " +
         ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
}
function svHoje(){
  var h = new Date();
  return h.getFullYear() + "-" + ("0" + (h.getMonth() + 1)).slice(-2) + "-" + ("0" + h.getDate()).slice(-2);
}
function svDias(iso){
  var p = String(iso || "").split("-");
  if(p.length !== 3) return null;
  var alvo = Date.UTC(+p[0], +p[1] - 1, +p[2]), h = new Date();
  return Math.round((alvo - Date.UTC(h.getFullYear(), h.getMonth(), h.getDate())) / 86400000);
}

(function(){
  var s = document.createElement("style");
  s.textContent =
    "#avBloco .av-media{font-size:2rem;font-weight:700;line-height:1}" +
    "#avBloco .av-linha{display:flex;gap:16px;align-items:baseline;flex-wrap:wrap;margin-bottom:10px}" +
    "#avBloco ul.av-coment{list-style:none;margin:10px 0 0;padding:0;font-size:.82rem}" +
    "#avBloco ul.av-coment li{padding:6px 0;border-top:1px solid var(--line)}" +
    "#rotCaixa table{width:100%;border-collapse:collapse;font-size:.84rem}" +
    "#rotCaixa td,#rotCaixa th{padding:7px 6px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}" +
    "#rotCaixa th{font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600}" +
    "#rotCaixa td.ac{white-space:nowrap;text-align:right}" +
    "#rotForm{margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}" +
    "#rotForm input[type=date],#rotForm input[type=number]{width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg)}" +
    "#ehCaixa{margin-top:14px;padding-top:12px;border-top:1px solid var(--line)}" +
    "#ehCaixa ul{list-style:none;margin:6px 0 0;padding:0;font-size:.82rem}" +
    "#ehCaixa li{padding:5px 0;border-top:1px solid var(--line)}" +
    "#ehCaixa li:first-child{border-top:0}";
  document.head.appendChild(s);
})();

/* ================= 1. avaliação de satisfação ================= */
var AV = {linhas: null, quando: 0, carregando: null, erro: ""};
function avUrl(token){
  return location.href.split("#")[0].split("?")[0].replace(/[^\/]*$/, "") + "avaliar.html?t=" + encodeURIComponent(token);
}
function avCarregar(forcar){
  if(!svLigado()) return Promise.resolve([]);
  if(AV.carregando) return AV.carregando;
  if(AV.linhas && !forcar && Date.now() - AV.quando < 120000) return Promise.resolve(AV.linhas);
  AV.carregando = svPedir({acao: "avaliacao.listar"}).then(function(j){
    AV.linhas = j.linhas || []; AV.quando = Date.now(); AV.erro = ""; AV.carregando = null;
    return AV.linhas;
  }, function(e){ AV.carregando = null; AV.erro = e.message; throw e; });
  return AV.carregando;
}
function avDoChamado(id){
  return (AV.linhas || []).filter(function(a){ return String(a.chamado) === String(id); });
}
function avPintarFicha(){
  var info = $("avInfo"); if(!info) return;
  var c = typeof maisChamadoAtual === "function" ? maisChamadoAtual() : null;
  if(!c){ info.textContent = ""; return; }
  var l = avDoChamado(c.id);
  if(!l.length){ info.textContent = ""; return; }
  var resp = l.filter(function(a){ return a.respondido_em; })[0];
  info.innerHTML = resp
    ? "Avaliação de quem pediu: <b>" + resp.nota + " de 5</b>" + (resp.comentario ? " — “" + esc(resp.comentario) + "”" : "") + "."
    : "Avaliação pedida em " + esc(svDataHora(l[0].pedido_em)) + ", ainda sem resposta.";
}
function avPedir(){
  var c = typeof maisChamadoAtual === "function" ? maisChamadoAtual() : null;
  if(!c || !/^\d+$/.test(String(c.id))){ toast("Abra na ficha um chamado do Bitrix primeiro."); return; }
  var btn = $("avPedir"); btn.disabled = true;
  svPedir({acao: "avaliacao.criar", chamado: Number(c.id), titulo: c.titulo || ""}).then(function(j){
    var link = avUrl(j.token);
    var txt = (typeof rpPreencher === "function"
      ? rpPreencher("{saudacao}, {nome}!\n\nO chamado {numero} — {titulo} foi concluído. Pode avaliar o atendimento? Leva 10 segundos:\n", c)
      : "Pode avaliar o atendimento do chamado #" + c.id + "? Leva 10 segundos:") + "\n" + link + "\n\nObrigado!\nTI Prospera";
    var ta = $("rpTexto");
    if(ta){ ta.value = txt; ta.hidden = false; if($("rpCopiar")) $("rpCopiar").disabled = false; }
    if(typeof maisCopiar === "function") maisCopiar(txt, j.reaproveitado ? "Link de avaliação (o mesmo de antes) copiado." : "Pedido de avaliação copiado. Cole no WhatsApp ou no Teams.");
    avCarregar(true).then(avPintarFicha, function(){});
  }, function(e){ toast("Não consegui criar o link: " + e.message); })
    .then(function(){ btn.disabled = false; });
}
function avPintarDash(){
  var alvo = $("avCorpo"); if(!alvo) return;
  if(!AV.linhas){
    alvo.innerHTML = '<div class="vazio-mini">' + (AV.erro ? "Não consegui ler as avaliações: " + esc(AV.erro) : "Lendo as avaliações…") + "</div>";
    return;
  }
  var desde = Date.now() - 90 * 86400000;
  var pedidas = AV.linhas.filter(function(a){ return new Date(a.pedido_em).getTime() >= desde; });
  var resp = pedidas.filter(function(a){ return a.respondido_em && a.nota; });
  if(!pedidas.length){
    alvo.innerHTML = '<div class="vazio-mini">Nenhuma avaliação pedida nos últimos 90 dias. Peça pela ficha do chamado, no cartão Respostas prontas.</div>';
    return;
  }
  var soma = 0, dist = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0};
  resp.forEach(function(a){ soma += a.nota; dist[a.nota]++; });
  var media = resp.length ? soma / resp.length : 0, maior = 1;
  [1, 2, 3, 4, 5].forEach(function(k){ maior = Math.max(maior, dist[k]); });
  var baixas = resp.filter(function(a){ return a.nota <= 3; }).slice(0, 6);
  alvo.innerHTML =
    '<div class="av-linha"><span class="av-media">' + (resp.length ? media.toLocaleString("pt-BR", {minimumFractionDigits: 1, maximumFractionDigits: 1}) : "—") +
      '</span><span class="hint" style="margin:0">média de 1 a 5 · ' + resp.length + " de " + pedidas.length + " responderam (" +
      Math.round(resp.length / pedidas.length * 100) + "%)</span></div>" +
    '<ul class="barras">' + [5, 4, 3, 2, 1].map(function(k){
      return '<li><span class="bl">' + k + (k === 1 ? " estrela" : " estrelas") + '</span><span class="bw"><span class="bar" style="width:' +
        (dist[k] / maior * 100).toFixed(1) + '%"><span class="seg ' + (k >= 4 ? "ok" : (k === 3 ? "warn" : "crit")) + '" style="flex:1"></span></span></span>' +
        '<span class="bn">' + dist[k] + "</span></li>";
    }).join("") + "</ul>" +
    (baixas.length ? '<ul class="av-coment">' + baixas.map(function(a){
      return "<li><b>#" + esc(a.chamado) + "</b> · " + a.nota + "/5 · " + esc(a.titulo || "") + (a.comentario ? " — “" + esc(a.comentario) + "”" : "") + "</li>";
    }).join("") + "</ul>" : "") +
    '<div class="hint">Últimos 90 dias. Embaixo, as notas 3 ou menos, para olhar o que deu errado.</div>';
}

/* ================= 2. histórico do equipamento ================= */
function ehRotulo(campo){
  if(campo === "title") return "Nome do cadastro";
  var nome = "";
  if(typeof INV_C !== "undefined" && typeof INV_FORM !== "undefined"){
    Object.keys(INV_C).forEach(function(k){
      if(INV_C[k] !== campo) return;
      INV_FORM.forEach(function(f){ if(f.k === k) nome = f.rot; });
    });
  }
  return nome || campo;
}
function ehValor(campo, v){
  if(v === null || v === undefined || v === "") return "(vazio)";
  if(typeof INV !== "undefined" && INV.enums && INV.enums[campo] && INV.enums[campo][v]) return INV.enums[campo][v];
  if(/^\d{4}-\d{2}-\d{2}/.test(v)) return svData(v);
  return v;
}
function ehPintar(item, linhas){
  var cx = $("ehCaixa"); if(!cx) return;
  var campoPessoa = typeof INV_C !== "undefined" ? INV_C.usuario : "";
  var antigos = linhas.filter(function(h){ return h.campo === campoPessoa && h.acao === "mudou" && h.de; });
  var teve = antigos.map(function(h){ return "<b>" + esc(h.de) + "</b> (até " + esc(svData(h.em)) + ")"; });
  cx.innerHTML = "<h4 style=\"margin:0\">Histórico deste equipamento</h4>" +
    (teve.length ? '<div class="hint" style="margin:6px 0 0">Já esteve com: ' + teve.join(", ") + ".</div>" : "") +
    (linhas.length ? "<ul>" + linhas.map(function(h){
      var quando = esc(svDataHora(h.em)) + (h.quem_nome ? " · " + esc(h.quem_nome) : "");
      return h.acao === "criou"
        ? "<li>" + quando + " · cadastrou com " + esc(ehRotulo(h.campo)) + ": " + esc(ehValor(h.campo, h.para)) + "</li>"
        : "<li>" + quando + " · " + esc(ehRotulo(h.campo)) + ": " + esc(ehValor(h.campo, h.de)) + " → <b>" + esc(ehValor(h.campo, h.para)) + "</b></li>";
    }).join("") + "</ul>" : '<div class="hint" style="margin:6px 0 0">Nada registrado ainda.</div>') +
    '<div class="hint">Conta o que foi mudado por esta página a partir de 20/11/2026. Mudança feita direto no portal do Bitrix não aparece aqui.</div>';
}
function ehCarregar(item){
  var form = $("invNovo"); if(!form) return;
  var cx = $("ehCaixa");
  if(!cx){ cx = document.createElement("div"); cx.id = "ehCaixa"; form.appendChild(cx); }
  cx.innerHTML = '<div class="hint" style="margin:0">Lendo o histórico…</div>';
  svPedir({acao: "equip.historico", item: Number(item)}).then(function(j){ ehPintar(item, j.linhas || []); },
    function(e){ cx.innerHTML = '<div class="hint" style="margin:0">Não consegui ler o histórico: ' + esc(e.message) + "</div>"; });
}

/* ================= 3. rotinas e vencimentos ================= */
var ROT = {lista: null, erro: "", carregando: null, editando: null, apagar: null, mostrarFeitas: false};
var ROT_REPETIR = [[0, "não repete"], [1, "todo mês"], [2, "a cada 2 meses"], [3, "a cada 3 meses"], [6, "a cada 6 meses"],
                   [12, "todo ano"], [24, "a cada 2 anos"], [36, "a cada 3 anos"]];
function rotRepete(n){
  var r = ROT_REPETIR.filter(function(x){ return x[0] === n; })[0];
  return r ? r[1] : "a cada " + n + " meses";
}
function rotSituacao(r){
  var d = svDias(r.proxima);
  if(!r.ativo) return {cls: "neutral", txt: "feita", devida: false, d: d};
  if(d === null) return {cls: "neutral", txt: "sem data", devida: false, d: d};
  if(d < 0) return {cls: "crit", txt: "atrasada " + (-d) + (d === -1 ? " dia" : " dias"), devida: true, d: d};
  if(d === 0) return {cls: "crit", txt: "vence hoje", devida: true, d: d};
  if(d <= (r.aviso_dias || 0)) return {cls: "warn", txt: "em " + d + (d === 1 ? " dia" : " dias"), devida: true, d: d};
  return {cls: "ok", txt: "em " + d + " dias", devida: false, d: d};
}
function rotDevidas(){
  return (ROT.lista || []).filter(function(r){ return rotSituacao(r).devida; });
}
function rotCarregar(){
  if(!svLigado()) return Promise.resolve([]);
  if(ROT.carregando) return ROT.carregando;
  ROT.carregando = svPedir({acao: "rotinas.listar"}).then(function(j){
    ROT.lista = j.rotinas || []; ROT.erro = ""; ROT.carregando = null;
    rotPintar(); if(typeof invPintarPilula === "function") invPintarPilula();
    return ROT.lista;
  }, function(e){ ROT.carregando = null; ROT.erro = e.message; rotPintar(); throw e; });
  return ROT.carregando;
}
function rotForm(r){
  r = r || {titulo: "", tipo: "preventiva", proxima: svHoje(), repetir_meses: 1, aviso_dias: 7, obs: ""};
  return '<div id="rotForm"><div class="grid g2">' +
    '<div class="field"><label for="rotTitulo">O que é <span class="req">*</span></label><input type="text" id="rotTitulo" maxlength="120" value="' + esc(r.titulo) + '" placeholder="Conferir o backup do servidor · Renovar certificado do site"></div>' +
    '<div class="field"><label for="rotTipo">Tipo</label><select id="rotTipo"><option value="preventiva"' + (r.tipo === "preventiva" ? " selected" : "") + '>Preventiva (tarefa da TI)</option>' +
      '<option value="vencimento"' + (r.tipo === "vencimento" ? " selected" : "") + ">Vencimento (licença, domínio, contrato…)</option></select></div>" +
    '<div class="field"><label for="rotProxima">Próxima data <span class="req">*</span></label><input type="date" id="rotProxima" value="' + esc(r.proxima) + '"></div>' +
    '<div class="field"><label for="rotRepetir">Repete</label><select id="rotRepetir">' + ROT_REPETIR.map(function(x){
      return '<option value="' + x[0] + '"' + (x[0] === Number(r.repetir_meses) ? " selected" : "") + ">" + x[1] + "</option>";
    }).join("") + "</select></div>" +
    '<div class="field"><label for="rotAviso">Avisar quantos dias antes</label><input type="number" id="rotAviso" min="0" max="365" value="' + esc(r.aviso_dias) + '"></div>' +
    '<div class="field"><label for="rotObs">Observação</label><input type="text" id="rotObs" maxlength="500" value="' + esc(r.obs || "") + '" placeholder="Onde fica, com quem falar, quanto custa…"></div>' +
    '</div><div class="lote-topo" style="margin-top:12px"><button class="primary" type="button" id="rotSalvar">' + (r.id ? "Salvar alteração" : "Criar rotina") + "</button>" +
    '<button class="ghost" type="button" id="rotCancelar">Cancelar</button></div></div>';
}
function rotPintar(){
  var corpo = $("rotCorpo"); if(!corpo) return;
  var cont = $("rotCont");
  if(ROT.erro && !ROT.lista){ corpo.innerHTML = '<div class="hint" style="margin:0">Não consegui ler as rotinas: ' + esc(ROT.erro) + "</div>"; return; }
  if(!ROT.lista){ corpo.innerHTML = '<div class="hint" style="margin:0">Lendo as rotinas…</div>'; return; }
  var ativas = ROT.lista.filter(function(r){ return r.ativo; });
  var feitas = ROT.lista.length - ativas.length;
  var dev = rotDevidas().length;
  if(cont){ cont.hidden = !dev; cont.textContent = dev; }
  var lista = (ROT.mostrarFeitas ? ROT.lista : ativas).slice().sort(function(a, b){ return String(a.proxima).localeCompare(String(b.proxima)); });
  var tabela = lista.length ? "<table><thead><tr><th>Quando</th><th>O que</th><th>Repete</th><th></th></tr></thead><tbody>" + lista.map(function(r){
    var s = rotSituacao(r);
    return "<tr><td><span class=\"tag " + s.cls + "\">" + esc(s.txt) + "</span><br><span class=\"hint\" style=\"margin:0\">" + esc(svData(r.proxima)) + "</span></td>" +
      "<td><b>" + esc(r.titulo) + "</b><br><span class=\"hint\" style=\"margin:0\">" + (r.tipo === "vencimento" ? "vencimento" : "preventiva") +
        (r.ultima_feita ? " · última feita em " + esc(svData(r.ultima_feita)) : "") + (r.obs ? " · " + esc(r.obs) : "") + "</span></td>" +
      "<td>" + esc(rotRepete(Number(r.repetir_meses))) + "</td>" +
      '<td class="ac">' + (r.ativo ? '<button class="mini" type="button" data-rot-feito="' + r.id + '">feito</button> ' +
        '<button class="mini" type="button" data-rot-chamado="' + r.id + '">abrir chamado</button> ' : "") +
        '<button class="mini" type="button" data-rot-editar="' + r.id + '">editar</button> ' +
        '<button class="mini" type="button" data-rot-apagar="' + r.id + '">' + (ROT.apagar === r.id ? "confirmar?" : "apagar") + "</button></td></tr>";
  }).join("") + "</tbody></table>" : '<div class="hint" style="margin:0">Nenhuma rotina cadastrada. Comece pelo que vence e ninguém lembra: certificado, domínio, licenças, contrato de impressora, backup.</div>';
  corpo.innerHTML = tabela + (feitas ? '<div class="hint"><a href="#" id="rotFeitas">' + (ROT.mostrarFeitas ? "Esconder" : "Mostrar") + " as " + feitas + " já feitas, que não repetem</a></div>" : "");
}
function rotSalvar(){
  var r = {
    acao: "rotinas.salvar", titulo: $("rotTitulo").value.trim(), tipo: $("rotTipo").value, proxima: $("rotProxima").value,
    repetir_meses: Number($("rotRepetir").value), aviso_dias: Number($("rotAviso").value || 0), obs: $("rotObs").value.trim()
  };
  if(!r.titulo){ toast("Diga o que é a rotina."); $("rotTitulo").focus(); return; }
  if(!r.proxima){ toast("Falta a data."); return; }
  if(ROT.editando){ r.id = ROT.editando.id; r.ativo = true; }
  $("rotSalvar").disabled = true;
  svPedir(r).then(function(){
    toast(ROT.editando ? "Rotina alterada." : "Rotina criada.");
    ROT.editando = null; $("rotFormLugar").innerHTML = "";
    return rotCarregar();
  }, function(e){ toast("Não salvou: " + e.message); if($("rotSalvar")) $("rotSalvar").disabled = false; });
}
function rotAcao(e){
  var t = e.target;
  if(t.id === "rotFeitas"){ e.preventDefault(); ROT.mostrarFeitas = !ROT.mostrarFeitas; rotPintar(); return; }
  if(t.id === "rotNova"){ ROT.editando = null; $("rotFormLugar").innerHTML = rotForm(null); $("rotTitulo").focus(); return; }
  if(t.id === "rotSalvar"){ rotSalvar(); return; }
  if(t.id === "rotCancelar"){ ROT.editando = null; $("rotFormLugar").innerHTML = ""; return; }
  var achar = function(id){ return (ROT.lista || []).filter(function(r){ return String(r.id) === String(id); })[0]; };
  var id;
  if((id = t.getAttribute("data-rot-editar"))){
    ROT.editando = achar(id); $("rotFormLugar").innerHTML = rotForm(ROT.editando); $("rotTitulo").focus(); return;
  }
  if((id = t.getAttribute("data-rot-apagar"))){
    if(String(ROT.apagar) !== String(id)){ ROT.apagar = Number(id); rotPintar(); return; }
    ROT.apagar = null;
    svPedir({acao: "rotinas.apagar", id: Number(id)}).then(function(){ toast("Rotina apagada."); return rotCarregar(); },
      function(err){ toast("Não apagou: " + err.message); });
    return;
  }
  if((id = t.getAttribute("data-rot-feito"))){
    t.disabled = true;
    svPedir({acao: "rotinas.feito", id: Number(id)}).then(function(j){
      toast(j.proxima ? "Feito. Próxima em " + svData(j.proxima) + "." : "Feito. Esta não repete.");
      return rotCarregar();
    }, function(err){ t.disabled = false; toast("Não marcou: " + err.message); });
    return;
  }
  if((id = t.getAttribute("data-rot-chamado"))){
    var r = achar(id); if(!r) return;
    document.querySelector('nav.tabs button[data-tab="abrir"]').click();
    $("fTitulo").value = (r.tipo === "vencimento" ? "Renovar: " : "Preventiva: ") + r.titulo;
    $("fDetalhes").value = (r.tipo === "vencimento" ? "Vence em " : "Prevista para ") + svData(r.proxima) + "." + (r.obs ? "\n" + r.obs : "");
    toast("Chamado preenchido. Complete os obrigatórios. Depois de resolver, marque a rotina como feita no Parque.");
  }
}

/* ================= ligação com o resto da página ================= */
if(svLigado()){
  /* avaliação: botão e linha no cartão Respostas prontas (mais.js) */
  svQuando(function(){ return $("rpCaixa") && $("rpCopiar"); }, function(){
    var b = document.createElement("button");
    b.className = "ghost"; b.type = "button"; b.id = "avPedir"; b.textContent = "Pedir avaliação";
    b.title = "Cria um link para quem pediu dar uma nota de 1 a 5 ao atendimento e copia o recado";
    $("rpCopiar").parentNode.appendChild(b);
    b.addEventListener("click", avPedir);
    var info = document.createElement("div");
    info.className = "hint"; info.id = "avInfo";
    $("rpNota").parentNode.insertBefore(info, $("rpNota").nextSibling);
    if($("dChamado")) $("dChamado").addEventListener("change", function(){ setTimeout(avPintarFicha, 300); });
    if(typeof pintarChamado === "function"){
      var origPC = pintarChamado;
      pintarChamado = function(){ origPC.apply(this, arguments); setTimeout(function(){ avCarregar().then(avPintarFicha, function(){}); }, 50); };
    }
  });

  /* avaliação: bloco no Dashboard */
  (function(){
    var grade = document.querySelector("#sub-dash .dash-grid");
    if(!grade) return;
    var d = document.createElement("div");
    d.className = "bloco"; d.id = "avBloco";
    d.innerHTML = '<h3>Satisfação de quem pediu</h3><div id="avCorpo"></div>';
    grade.appendChild(d);
    var pintar = function(){ avPintarDash(); avCarregar().then(avPintarDash, avPintarDash); };
    if(typeof aposPainel !== "undefined" && aposPainel.push) aposPainel.push(pintar);
  })();

  /* histórico: no formulário de edição do equipamento (inventario.js) */
  svQuando(function(){ return typeof invNovoAbrir === "function" && $("invNovo"); }, function(){
    var orig = invNovoAbrir;
    invNovoAbrir = function(id){
      orig.apply(this, arguments);
      if(typeof invEditando !== "undefined" && invEditando && $("invNovo").style.display !== "none") ehCarregar(invEditando.id);
    };
    /* depois de salvar a edição o histórico ganhou linha: relê */
    if(typeof invNovoSalvar === "function"){
      var origS = invNovoSalvar;
      invNovoSalvar = function(){
        var ed = typeof invEditando !== "undefined" && invEditando ? invEditando.id : null;
        origS.apply(this, arguments);
        if(ed) setTimeout(function(){ if($("ehCaixa")) ehCarregar(ed); }, 2500);
      };
    }
  });

  /* rotinas: cartão na aba Parque, e as devidas entram na pílula da aba */
  svQuando(function(){ return $("invAtualizar") && $("invNovo") && typeof invPintarPilula === "function"; }, function(){
    var c = document.createElement("div");
    c.className = "card"; c.id = "rotCaixa";
    c.innerHTML = '<div class="lote-topo" style="margin:0 0 10px"><h3 style="margin:0">Rotinas e vencimentos <span class="pill" id="rotCont" hidden>0</span></h3>' +
      '<span style="flex:1"></span><button class="ghost" type="button" id="rotNova">Nova rotina</button></div>' +
      '<div id="rotCorpo"></div><div id="rotFormLugar"></div>' +
      '<div class="hint">Fica no servidor: a equipe toda vê a mesma lista. Quando a data chega (ou entra no aviso), a rotina fica amarela ou vermelha e conta na bolinha da aba Parque.</div>';
    var ref = $("invNovo");
    ref.parentNode.insertBefore(c, ref);
    c.addEventListener("click", rotAcao);
    var origP = invPintarPilula;
    invPintarPilula = function(){
      origP.apply(this, arguments);
      var p = $("pillParque"); if(!p) return;
      var g = typeof invAlertas === "function" ? invAlertas().length : 0, r = rotDevidas().length, n = g + r;
      p.hidden = !n; p.textContent = n;
      p.parentNode.title = n ? [g ? g + " garantia(s) vencida(s) ou vencendo em até 30 dias" : "", r ? r + " rotina(s) para fazer" : ""].filter(Boolean).join(" e ") : "";
    };
    rotPintar();
    /* lê agora (assim que o login estiver feito) e de 10 em 10 minutos */
    svQuando(function(){ return typeof acPedir === "function" && typeof acEu !== "undefined" && acEu; }, function(){
      rotCarregar().catch(function(){});
      setInterval(function(){ rotCarregar().catch(function(){}); }, 600000);
    });
  });
}

"use strict";
/* ---------------- importar conversa do WhatsApp ----------------
   O atendimento acontece no grupo e o registro fica para depois — e "depois"
   vira nunca. Isto lê o export da conversa e separa o que parece pedido do que
   é conversa, para a fila da Captura receber só o que vale.

   Nada disto sai do navegador: o texto é lido em memória, as anotações vão para
   o localStorage, e só o que você mandar criar chega no Bitrix. Nenhuma linha da
   conversa é enviada para lugar nenhum. */

/* ---------------- formatos ----------------
   Android pt-BR:  13/11/2026 08:42 - Max Anderson: a impressora parou
   iOS pt-BR:      [13/11/2026 08:42:11] Max Anderson: a impressora parou
   O WhatsApp enfia marcas invisíveis (LRM, espaço estreito) antes da hora e no
   começo da linha; sem limpar isso, nenhuma expressão casa. */
function limparInvisiveis(s){
  return String(s || "").replace(/[‎‏‪-‮  ]/g, " ");
}
var RE_CARIMBO = /^\s*\[?\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})[,]?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([APap]\.?\s?[Mm]\.?)?\s*\]?\s*(?:-\s*)?/;
/* nome do remetente: vem antes do primeiro ":" e é curto. Mensagem de sistema
   ("Fulano entrou no grupo") não tem ":" e cai fora por aqui. */
var RE_AUTOR = /^([^:\n]{1,60}?):\s?([\s\S]*)$/;

var LIXO_MSG = /^\s*(<\s*m[íi]dia oculta\s*>|<\s*arquivo de m[íi]dia oculto\s*>|<\s*anexado:|‎?imagem ocultada|‎?[áa]udio ocultado|‎?v[íi]deo ocultado|‎?figurinha omitida|‎?gif omitido|‎?documento omitido|esta mensagem foi apagada|mensagem apagada|você apagou esta mensagem|null)\s*$/i;

function dataDoCarimbo(m){
  var dia = +m[1], mes = +m[2], ano = +m[3];
  if(ano < 100) ano += 2000;
  var h = +m[4], min = +m[5], seg = m[6] ? +m[6] : 0;
  var ampm = (m[7] || "").toLowerCase().replace(/[\s.]/g, "");
  if(ampm === "pm" && h < 12) h += 12;
  if(ampm === "am" && h === 12) h = 0;
  var d = new Date(ano, mes - 1, dia, h, min, seg);
  return isNaN(d.getTime()) ? null : d;
}

/* quebra o texto em mensagens. Linha sem carimbo é continuação da anterior
   (mensagem de várias linhas); linha com carimbo mas sem "Nome:" é aviso do
   sistema e zera a continuação, senão ela gruda na mensagem de cima. */
function lerConversa(txt){
  var linhas = limparInvisiveis(txt).split(/\r?\n/);
  var msgs = [], atual = null;
  linhas.forEach(function(linha){
    var m = RE_CARIMBO.exec(linha);
    if(!m){
      if(atual && linha.trim()) atual.texto += "\n" + linha.trim();
      return;
    }
    var resto = linha.slice(m[0].length);
    var a = RE_AUTOR.exec(resto);
    if(!a){ atual = null; return; }        /* entrou no grupo, mudou o assunto… */
    atual = {quando: dataDoCarimbo(m), quem: a[1].trim(), texto: a[2].trim()};
    msgs.push(atual);
  });
  return msgs.filter(function(x){ return x.texto && !LIXO_MSG.test(x.texto); });
}

/* ---------------- o que parece pedido ----------------
   Palavra-chave, não entendimento: a página é estática e roda sozinha no
   navegador. Acerta o óbvio e erra o escrito torto — por isso tudo passa pela
   sua conferência antes de virar chamado. */
var PALAVRAS = [
  /* sintoma */
  "problema","erro","falha","falhou","parou","parado","parada","travou","travando","trava",
  "lento","lenta","devagar","caiu","caindo","quebrou","quebrado","sumiu","desapareceu",
  "n[ãa]o funciona","n[ãa]o consigo","n[ãa]o abre","n[ãa]o liga","n[ãa]o entra","n[ãa]o carrega",
  "n[ãa]o imprime","n[ãa]o conecta","n[ãa]o aparece","n[ãa]o recebe","n[ãa]o envia","fora do ar",
  "sem acesso","sem sinal","sem internet","sem rede","sem som","sem imagem","bloquead",
  /* pedido */
  "preciso","precisamos","pode ver","d[áa] uma olhada","me ajuda","consegue","poderia","solicito",
  "solicita[çc][ãa]o","por favor","pfv","verificar","verifica","urgente","liberar","libera",
  "instalar","instala[çc][ãa]o","configurar","configura","atualizar","formatar","resetar","reset",
  "criar","cadastrar","habilitar","trocar","substituir",
  /* coisa */
  "impressora","toner","papel","scanner","digitalizar","notebook","computador","desktop","monitor",
  "teclado","mouse","cabo","fonte","carregador","celular","telefone","ramal","headset","fone","webcam",
  "wifi","wi-fi","internet","rede","roteador","switch","vpn","servidor","nobreak","estabilizador",
  "e-?mail","outlook","office","excel","word","powerpoint","teams","onedrive","sharepoint","drive",
  "bitrix","omie","sistema","planilha","login","senha","acesso","usu[áa]rio","conta","licen[çc]a",
  "backup","antiv[íi]rus","windows","impress[ãa]o","pendrive","hd","mem[óo]ria"
];
var RE_PALAVRAS = new RegExp("(" + PALAVRAS.join("|") + ")", "i");

/* conversa que não é pedido: cumprimento, agradecimento, confirmação */
var RE_RUIDO = /^\s*(bom dia|boa tarde|boa noite|ok+|okay|blz|beleza|valeu|vlw|obrigad[oa]|obg|de nada|por nada|imagina|tudo bem|tudo certo|tudo bom|certo|show|perfeito|t[áa] bom|ta bom|isso|sim|n[ãa]o|oi|ol[áa]|e a[íi]|bom fim de semana|boa semana|at[ée] mais|abra[çc]o[s]?|fechou|combinado|j[áa] vou ver|vou ver|vou verificar|resolvido|feito|pronto|aham|uhum|k{2,}|rs+|hahah*)[\s!?.…,]*$/i;
function soSimbolos(s){ return !/[a-zA-ZÀ-ÿ0-9]/.test(s); }

/* "bom dia", "obrigada", um emoji sozinho. Sai ANTES do agrupamento, senão o
   "Bom dia!" de 08:32 gruda no pedido de 08:33 da mesma pessoa e acaba virando
   o começo do título do chamado no Bitrix. */
function ehRuido(texto){
  var t = String(texto).replace(/\s+/g, " ").trim();
  return t.length < 12 || soSimbolos(t) || RE_RUIDO.test(t);
}
function pareceChamado(msg){
  return RE_PALAVRAS.test(msg.texto.replace(/\s+/g, " ").trim());
}

/* mensagens seguidas da mesma pessoa viram um pedido só: ninguém escreve o
   problema inteiro numa linha. 10 minutos é o intervalo em que ainda é o mesmo
   assunto — passou disso, é outra conversa. */
var JUNTAR_MIN = 10;
function agruparSeguidas(msgs){
  var out = [];
  msgs.forEach(function(m){
    var ult = out[out.length - 1];
    var perto = ult && ult.quem === m.quem && ult.quando && m.quando &&
                (m.quando - ult.quando) <= JUNTAR_MIN * 60000;
    if(perto){ ult.texto += " " + m.texto; return; }
    out.push({quando:m.quando, quem:m.quem, texto:m.texto});
  });
  return out;
}

/* ---------------- estado da revisão ----------------
   A lista acumula: cada arquivo lido entra nela sem apagar o anterior, porque
   os pedidos da semana estão espalhados em vários grupos e ninguém quer
   importar, mandar para a fila, voltar e repetir cinco vezes. */
var impCandidatos = [];   /* [{quem, texto, quando, conversa, marcada, motivo}] */
var impConversas  = [];   /* nomes das conversas já lidas nesta revisão */

function nomesIgnorados(){
  return ($("impIgnorar") ? $("impIgnorar").value : "")
    .split(",").map(function(s){ return s.trim().toLowerCase(); })
    .filter(Boolean);
}
function ehIgnorado(quem){
  var q = String(quem || "").toLowerCase();
  return nomesIgnorados().some(function(n){ return q.indexOf(n) !== -1; });
}
/* o que já está na fila não entra de novo: colar o mesmo arquivo duas vezes é
   acidente comum, e anotação repetida vira chamado repetido */
function jaNaFila(c){
  var iso = c.quando ? c.quando.toISOString() : "";
  return fila.some(function(it){
    return it.oque === c.texto && (it.iso === iso || it.quem === c.quem);
  });
}

/* o nome do arquivo que o WhatsApp gera já diz de qual grupo veio */
function nomeDaConversa(arquivo){
  var n = String(arquivo || "").replace(/\.txt$/i, "")
    .replace(/^conversa do whatsapp com\s*/i, "")
    .replace(/^whatsapp chat with\s*/i, "")
    .trim();
  return (!n || /^_?chat$/i.test(n)) ? "conversa" : n;
}

function candidatosDe(txt, conversa){
  var msgs = lerConversa(txt);
  if(!msgs.length) return [];
  /* o ruído sai de lado antes de agrupar, mas continua aparecendo na lista de
     descartados: nada some calado, e um julgamento errado dá para resgatar */
  var ruidos = [], uteis = [];
  msgs.forEach(function(m){ (ehRuido(m.texto) ? ruidos : uteis).push(m); });

  return agruparSeguidas(uteis).map(function(m){
    var motivo = "";
    if(jaNaFila(m))             motivo = "já está na fila";
    else if(ehIgnorado(m.quem)) motivo = "remetente ignorado";
    else if(!pareceChamado(m))  motivo = "parece conversa, não pedido";
    return {quem:m.quem, texto:m.texto, quando:m.quando, conversa:conversa,
            marcada: !motivo, motivo:motivo};
  }).concat(ruidos.map(function(m){
    return {quem:m.quem, texto:m.texto, quando:m.quando, conversa:conversa, marcada:false,
            motivo: ehIgnorado(m.quem) ? "remetente ignorado" : "parece conversa, não pedido"};
  }));
}

/* junta na lista que já está na tela, sem repetir. Ler o mesmo arquivo duas
   vezes (ou um grupo que aparece em dois exports) não pode dobrar a linha. */
function adicionarCandidatos(novos, conversa){
  if(conversa && impConversas.indexOf(conversa) === -1) impConversas.push(conversa);
  novos.forEach(function(c){
    var repetido = impCandidatos.some(function(x){
      return x.texto === c.texto && x.quem === c.quem &&
             String(x.quando) === String(c.quando);
    });
    if(!repetido) impCandidatos.push(c);
  });
  impCandidatos.sort(function(a, b){ return (a.quando || 0) - (b.quando || 0); });
}

function naoReconheci(){
  $("impResultado").hidden = !impCandidatos.length;
  toast("Não reconheci nenhuma mensagem nesse texto.");
  if($("impAviso")) $("impAviso").textContent =
    "Não achei linhas no formato do WhatsApp (data, hora, nome e dois-pontos). " +
    "Use Exportar conversa → Sem mídia, e mande o arquivo .txt inteiro.";
}
function limparImport(){
  impCandidatos = []; impConversas = [];
  $("impResultado").hidden = true;
  if($("impLidos")) $("impLidos").textContent = "";
}

function linhaCandidato(c, i, desc){
  var quando = c.quando ? c.quando.toLocaleString("pt-BR",
    {day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit"}) : "";
  /* a conversa só aparece quando há mais de uma: com um arquivo só, ela seria
     a mesma etiqueta repetida em toda linha */
  var grupo = (impConversas.length > 1 && c.conversa)
    ? '<span class="imp-grupo">' + esc(c.conversa) + "</span>" : "";
  return '<li' + (desc ? ' class="desc"' : "") + '>' +
    '<input type="checkbox" class="imp-cx" data-i="' + i + '"' + (c.marcada ? " checked" : "") +
      ' aria-label="incluir">' +
    '<div class="imp-txt">' + grupo + "<b>" + esc(c.quem) + "</b> " + esc(c.texto) +
      (c.motivo ? '<span class="imp-motivo">' + esc(c.motivo) + "</span>" : "") + "</div>" +
    '<div class="when">' + esc(quando) + "</div></li>";
}
function pintarImport(){
  var box = $("impResultado"); if(!box) return;
  var entram = [], fora = [];
  impCandidatos.forEach(function(c, i){ (c.motivo ? fora : entram).push([c, i]); });
  $("impLista").innerHTML = entram.length
    ? entram.map(function(p){ return linhaCandidato(p[0], p[1], false); }).join("")
    : '<div class="vazio-mini">Nenhuma mensagem parecia pedido. Veja a lista de descartados abaixo.</div>';
  $("impDescartados").innerHTML = fora.map(function(p){ return linhaCandidato(p[0], p[1], true); }).join("");
  var ver = $("impVerDescartados");
  ver.hidden = !fora.length;
  ver.textContent = ($("impDescartados").hidden ? "mostrar" : "esconder") +
    " o que eu descartei (" + fora.length + ")";
  var marcadas = impCandidatos.filter(function(c){ return c.marcada; }).length;
  $("impTitulo").textContent = impCandidatos.length + " mensagens" +
    (impConversas.length > 1 ? " de " + impConversas.length + " conversas" : "") +
    ", " + entram.length + " parecem pedido, " + marcadas + " marcadas.";
  $("impMandar").disabled = !marcadas;
  $("impMandar").textContent = "Mandar " + marcadas + " para a fila";
  box.hidden = false;
}

function mandarParaFila(){
  var escolhidas = impCandidatos.filter(function(c){ return c.marcada; });
  if(!escolhidas.length) return;
  /* mais antiga primeiro, para a fila ficar na ordem em que aconteceu */
  escolhidas.sort(function(a,b){ return (a.quando||0) - (b.quando||0); });
  escolhidas.forEach(function(c){
    var d = c.quando || new Date();
    fila.unshift({
      quem: c.quem,
      oque: c.texto,
      hora: d.toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}),
      iso:  d.toISOString(),
      origem: "whatsapp"
    });
  });
  save(K.fila, fila);
  impCandidatos = impCandidatos.filter(function(c){ return !c.marcada; });
  impCandidatos.forEach(function(c){ if(!c.motivo) c.motivo = "já está na fila"; });
  /* sobrou só o que a página descartou? Então o trabalho acabou: cartão aberto
     exibindo "bom dia" e "valeu" é ruído. Reler o arquivo traz tudo de volta,
     já marcando como repetido o que foi para a fila. */
  var sobrouPedido = impCandidatos.some(function(c){ return !c.motivo; });
  if(sobrouPedido) pintarImport(); else limparImport();
  renderFila();
  toast(escolhidas.length + (escolhidas.length === 1 ? " anotação" : " anotações") + " na fila. Classifique e crie.");
}

/* ---------------- ligações ---------------- */
if($("impLer")) $("impLer").addEventListener("click", function(){
  var t = $("impTexto").value;
  if(!t.trim()){ $("impTexto").focus(); return; }
  var novos = candidatosDe(t, "texto colado");
  if(!novos.length){ naoReconheci(); return; }
  adicionarCandidatos(novos, "texto colado");
  pintarLidos();
  pintarImport();
});

function lerArquivo(f){
  return new Promise(function(ok){
    var r = new FileReader();
    r.onload  = function(){ ok({nome: f.name, texto: String(r.result || "")}); };
    r.onerror = function(){ ok({nome: f.name, texto: "", erro: true}); };
    r.readAsText(f, "utf-8");
  });
}
if($("impArquivo")) $("impArquivo").addEventListener("change", function(){
  var arquivos = Array.prototype.slice.call(this.files || []);
  /* zera o campo: sem isso, escolher o mesmo arquivo de novo não dispara nada */
  this.value = "";
  if(!arquivos.length) return;
  if($("impLidos")) $("impLidos").textContent = "Lendo " + arquivos.length +
    (arquivos.length === 1 ? " arquivo…" : " arquivos…");

  Promise.all(arquivos.map(lerArquivo)).then(function(res){
    var vazios = [];
    res.forEach(function(r){
      var conversa = nomeDaConversa(r.nome);
      var novos = r.erro ? [] : candidatosDe(r.texto, conversa);
      if(!novos.length){ vazios.push(r.nome); return; }
      adicionarCandidatos(novos, conversa);
    });
    pintarLidos(vazios);
    if(!impCandidatos.length){ naoReconheci(); return; }
    pintarImport();
    /* o texto só vai para a caixa quando é um arquivo só: com cinco, ela viraria
       um paredão de conversa que ninguém vai ler */
    if(arquivos.length === 1 && !res[0].erro) $("impTexto").value = res[0].texto;
  });
});
function pintarLidos(vazios){
  var el = $("impLidos"); if(!el) return;
  var partes = [];
  if(impConversas.length) partes.push("Lido: " + impConversas.join(" · "));
  if(vazios && vazios.length)
    partes.push("sem mensagem reconhecida em " + vazios.join(", "));
  el.textContent = partes.join(" — ");
}
if($("impLimpar")) $("impLimpar").addEventListener("click", function(){
  limparImport();
  $("impTexto").value = "";
  toast("Lista de importação limpa.");
});
if($("impLista")) $("impLista").addEventListener("change", function(e){
  if(!e.target.classList.contains("imp-cx")) return;
  impCandidatos[parseInt(e.target.dataset.i, 10)].marcada = e.target.checked;
  pintarImport();
});
if($("impDescartados")) $("impDescartados").addEventListener("change", function(e){
  if(!e.target.classList.contains("imp-cx")) return;
  var c = impCandidatos[parseInt(e.target.dataset.i, 10)];
  c.marcada = e.target.checked;
  /* resgatar um descartado tira o motivo: ele passa para a lista de cima */
  if(e.target.checked) c.motivo = "";
  pintarImport();
});
if($("impVerDescartados")) $("impVerDescartados").addEventListener("click", function(){
  $("impDescartados").hidden = !$("impDescartados").hidden;
  pintarImport();
});
["impTodos","impNenhum"].forEach(function(id){
  var b = $(id); if(!b) return;
  b.addEventListener("click", function(){
    var marcar = (id === "impTodos");
    impCandidatos.forEach(function(c){ if(!c.motivo || !marcar) c.marcada = marcar; });
    pintarImport();
  });
});
if($("impMandar")) $("impMandar").addEventListener("click", mandarParaFila);

/* o dono do webhook já vem no campo de ignorar: num grupo de suporte, as
   mensagens dele são respostas, não pedidos */
(function(){
  var eu = load(K.eu, null);
  if(eu && eu.nome && $("impIgnorar") && !$("impIgnorar").value) $("impIgnorar").value = eu.nome;
})();

/* ---------------- classificar várias de uma vez ----------------
   Vinte anotações importadas dariam sessenta cliques nos três seletores. Aqui
   você escolhe uma vez e aplica nas marcadas; as exceções você corrige na linha.
   De propósito é um botão, e não um filtro que vale sozinho: classificação
   errada entrando calada no Bitrix custa mais do que o clique. */
function montarSelectsAplicar(){
  CLS_LINHA.forEach(function(nome){
    var sel = $("apl" + nome.charAt(0).toUpperCase() + nome.slice(1));
    if(!sel) return;
    var ops = opcoesEnum(nome, sel.value, nome === "prioridade");
    if(!ops) return;
    var atual = sel.value;
    sel.innerHTML = '<option value="">' + CLS_VAZIO[nome].replace(" *", "") + "</option>" + ops;
    sel.value = atual;
  });
}
if($("btnAplicar")) $("btnAplicar").addEventListener("click", function(){
  var escolha = {};
  CLS_LINHA.forEach(function(nome){
    var sel = $("apl" + nome.charAt(0).toUpperCase() + nome.slice(1));
    if(sel && sel.value) escolha[nome] = sel.value;
  });
  var nomes = Object.keys(escolha);
  if(!nomes.length){ toast("Escolha ao menos uma classificação para aplicar."); return; }
  var n = 0;
  fila.forEach(function(it){
    if(it.chamado || it.marcada === false) return;
    nomes.forEach(function(k){ it[k] = escolha[k]; });
    n++;
  });
  if(!n){ toast("Nenhuma anotação marcada e pendente."); return; }
  save(K.fila, fila); renderFila();
  toast(nomes.join(" e ") + " aplicad" + (nomes.length > 1 ? "as" : "a") + " em " + n + ".");
});

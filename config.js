"use strict";
/* ---------------- SLA ---------------- */
var SLA = [
  {n:"Alta",                h:4,   t:"Até 4 horas úteis — operação parada ou risco de perda de dados"},
  {n:"Média",               h:8,   t:"Até 1 dia útil (8h) — falha parcial com alternativa temporária"},
  {n:"Baixa",               h:24,  t:"Até 3 dias úteis (24h) — dúvidas, melhorias, sem impacto direto"},
  {n:"N2 Presencial",       h:72,  t:"Agendamento em 72h úteis"},
  {n:"N2 P&D",              h:8,   t:"8h úteis"},
  {n:"ICL Hardware",        h:16,  t:"2 dias úteis"},
  {n:"ICL Software",        h:24,  t:"3 dias úteis"},
  {n:"ICL Calibração",      h:120, t:"15 dias úteis"},
  {n:"ICL API",             h:24,  t:"3 dias úteis"},
  {n:"ICL Dashboard",       h:24,  t:"3 dias úteis"}
];
var ETAPAS = ["Registro de Chamado","Disparo de alertas","Análise do chamado",
              "Em atendimento","Aguardando terceiros (Pausa)","Automação de Conclusão","Concluir"];

/* ---------------- Bitrix: processo 1032 (Chamado Técnico) ---------------- */
var B = {
  tipo: 1032,
  portal: "https://straylight.bitrix24.com.br",
  campo: {
    categoria:   "ufCrm11_1751054181669",
    subcategoria:"ufCrm11_1791217994942",
    prioridade:  "ufCrm11_1759935160305",
    canal:       "ufCrm11_1755618058164",
    /* dos dois campos "Empresa" do portal, o escolhido foi a lista fixa
       (Astro34 / Fastco / Spectral Solutions), não o vínculo com o CRM */
    empresa:     "ufCrm11_1767980057027",
    /* "Equipamento cliente" ufCrm11_1755633226 está zerado em 150 chamados;
       o que vale é este, e ele é múltiplo */
    equipamento: "ufCrm11_1756228195",
    detalhes:    "ufCrm11_1751284890540",
    descricao:   "ufCrm11_1724351543085",
    resolucao:   "ufCrm11_1751290355233",
    testes:      "ufCrm11_1755618106980",
    passos:      "ufCrm11_1755615692022",
    pausaMotivo: "ufCrm11_1764332637629",
    pausaIni:    "ufCrm11_1755624999423",
    pausaFim:    "ufCrm11_1755624321694",
    solicitante: "ufCrm11_1751046908",   /* colaborador astro/fastco/spectro */
    externo:     "ufCrm11_1751046553",   /* usuário externo */
    equipInterno:"ufCrm11_1755634127",   /* celular, notebook */
    anexos:      "ufCrm11_1755614491701",
    anexos2:     "ufCrm11_1751290447491",/* evidência de aprovação */
    primeiroAtend:"ufCrm11PrimeiroAtend"
  }
};
var etapasBitrix = {};   /* stageId -> {nome, semantica} */
var etapasLista  = [];   /* [{id, nome, semantica}] na ordem do funil */
var motivosPausa = [];   /* [{id, nome}] do campo Ticket pausado motivo */
var itemAtual    = null; /* chamado carregado na aba Documentar */
/* campo -> {id da opção: rótulo}, vindo do crm.item.fields.
   Hidratado do cache em util.js, que é quem define o storage. */
var enumRotulos  = {};

/* campos de lista voltam do Bitrix como id da opção, não como texto */
function labelEnum(campo, v){
  if(v === null || v === undefined || v === "") return "";
  var m = enumRotulos[campo];
  return (m && m[v]) || String(v);
}
function labelPrioridade(v){ return labelEnum(B.campo.prioridade, v); }
function labelCategoria(v){ return labelEnum(B.campo.categoria, v); }

/* campos de lista que a tela monta sozinha a partir do crm.item.fields */
var CAMPOS_LISTA = ["categoria","subcategoria","prioridade","canal","empresa"];

/* ficha de campo vinda do crm.item.fields: identificador -> rótulo e tipo.
   É o que permite mostrar qualquer um dos 34 campos personalizados com o nome
   que ele tem no portal, sem eu precisar adivinhar identificador aqui. */
var campoMeta = {};
function labelCampo(cid){
  var m = campoMeta[cid];
  return (m && m.titulo) || cid;
}
function ehArquivo(cid){
  var m = campoMeta[cid];
  return !!(m && m.tipo === "file");
}
/* campos que a ficha não repete porque já têm lugar próprio na tela */
function temLugarProprio(cid){
  var c = B.campo;
  return cid === c.detalhes || cid === c.descricao || cid === c.resolucao ||
         cid === c.testes || cid === c.passos ||
         cid === c.pausaMotivo || cid === c.pausaIni || cid === c.pausaFim ||
         cid === c.anexos || cid === c.anexos2 ||
         /* CAMPOS_LISTA guarda nomes internos, não identificadores: comparar
            direto deixaria Categoria e Prioridade aparecerem duas vezes */
         CAMPOS_LISTA.map(function(n){ return c[n]; }).indexOf(cid) !== -1;
}
/* valor de um campo qualquer em texto que uma pessoa lê */
function valorLegivel(cid, v){
  if(v === null || v === undefined || v === "") return "";
  if(Array.isArray(v)){
    var p = v.map(function(x){ return valorLegivel(cid, x); }).filter(Boolean);
    return p.join(", ");
  }
  var m = campoMeta[cid] || {};
  if(m.tipo === "enumeration") return labelEnum(cid, v);
  if(m.tipo === "boolean") return (v === "Y" || v === true || v === 1) ? "Sim" : "Não";
  if(m.tipo === "employee" || m.tipo === "user") return labelUsuario(v);
  if(m.tipo === "date" || m.tipo === "datetime") return dataHora(v) || String(v);
  if(typeof v === "object") return "";   /* arquivo e vínculo têm trilha própria */
  return String(v);
}

/* quem é o dono do webhook. O webhook de entrada carrega a identidade de quem
   o criou, então profile devolve a pessoa que está usando a página. É o que
   permite destacar "este chamado é seu" no alerta. */
var euId = null;

/* id do usuário -> nome. Hidratado do cache em util.js. */
var usuarios = {};
function labelUsuario(id){
  if(id === null || id === undefined || id === "" || String(id) === "0") return "";
  return usuarios[id] || ("usuário " + id);
}
/* data e hora como as pessoas leem, a partir do ISO que o Bitrix devolve */
function dataHora(iso){
  if(!iso) return "";
  var d = new Date(iso);
  if(isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("pt-BR", {day:"2-digit", month:"2-digit", year:"numeric",
                                    hour:"2-digit", minute:"2-digit"});
}
function dataCurta(iso){
  if(!iso) return "—";
  var d = new Date(iso);
  if(isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", {day:"2-digit", month:"2-digit"}) + " " +
         d.toLocaleTimeString("pt-BR", {hour:"2-digit", minute:"2-digit"});
}

/* a prioridade no Bitrix vem com o SLA escrito junto; casamos pelo começo do rótulo */
function slaDeLabel(label){
  label = labelPrioridade(label);
  if(!label) return null;
  var txt = String(label);
  var achado = null;
  for(var i=0;i<SLA.length;i++){
    if(txt.indexOf(SLA[i].n) === 0 && (!achado || SLA[i].n.length > achado.n.length)) achado = SLA[i];
  }
  return achado;
}
function rotuloCurto(label){
  label = labelPrioridade(label);
  var s = slaDeLabel(label);
  return s ? s.n : (label ? String(label).split(",")[0].slice(0,22) : "—");
}

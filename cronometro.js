"use strict";
/* ---------------- cronômetro do chamado ----------------
   Tempo decorrido e tempo trabalhado são coisas diferentes. O SLA conta da
   abertura até agora, mesmo que o chamado tenha ficado parado esperando peça;
   isto conta só os minutos em que você esteve de fato em cima dele. É o número
   que responde "onde foi o meu tempo esta semana", que o painel nunca soube.

   Por enquanto ele vive só neste navegador e sai como coluna no CSV do
   relatório: o processo 1032 não tem campo de tempo trabalhado. Criado o campo
   no portal, a gravação passa a ser possível sem refazer nada disto. */

var CRONO_TETO_H = 12;   /* sessão esquecida aberta não vira jornada fantasma */
var cronos = load(K.cronos, {});   /* id -> {total: segundos, inicio: iso|null} */

function cronoDe(id){
  if(!id) return null;
  if(!cronos[id]) cronos[id] = {total: 0, inicio: null};
  return cronos[id];
}
/* segundos da sessão em curso, com teto. Quem deixou rodando de sexta para
   segunda não pode ver 60 horas de trabalho no relatório. */
function sessaoAberta(c){
  if(!c || !c.inicio) return 0;
  var ini = new Date(c.inicio);
  if(isNaN(ini.getTime())) return 0;
  var s = (Date.now() - ini.getTime()) / 1000;
  return Math.max(0, Math.min(s, CRONO_TETO_H * 3600));
}
function segundosDoChamado(id){
  var c = cronos[id];
  if(!c) return 0;
  return (c.total || 0) + sessaoAberta(c);
}
/* usado pelo export; minutos inteiros, porque segundo não interessa a ninguém */
function minutosTrabalhados(id){
  var s = segundosDoChamado(id);
  return s ? Math.round(s / 60) : 0;
}
function hms(seg){
  seg = Math.floor(seg);
  var h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
  return (h ? h + "h " : "") + String(m).padStart(h ? 2 : 1, "0") + "m " +
         String(s).padStart(2, "0") + "s";
}

function cronoAtual(){
  var sel = $("dChamado");
  return sel && sel.value ? sel.value : null;
}
function pintarCrono(){
  var card = $("cardCrono");
  if(!card) return;
  var id = cronoAtual();
  card.hidden = !id;
  if(!id) return;
  var c = cronoDe(id);
  var rodando = !!c.inicio;
  $("cronoTempo").textContent = hms(segundosDoChamado(id));
  $("cronoTempo").classList.toggle("rodando", rodando);
  $("cronoBtn").textContent = rodando ? "Pausar" : (c.total ? "Retomar" : "Iniciar");
  $("cronoZerar").hidden = !(c.total || rodando);
  var av = $("cronoAviso");
  if(av){
    av.textContent = rodando
      ? (sessaoAberta(c) >= CRONO_TETO_H * 3600
          ? "Esta sessão passou de " + CRONO_TETO_H + "h e parou de contar — provavelmente ficou aberta sem querer."
          : "Contando. Fica rodando mesmo se você fechar a aba.")
      : (c.total ? "Pausado." : "Começa a contar quando você clicar.");
  }
}
function trocarCrono(){
  var id = cronoAtual();
  if(!id) return;
  var c = cronoDe(id);
  if(c.inicio){ c.total = (c.total || 0) + sessaoAberta(c); c.inicio = null; }
  else c.inicio = new Date().toISOString();
  save(K.cronos, cronos);
  pintarCrono();
}

if($("cronoBtn")) $("cronoBtn").addEventListener("click", trocarCrono);
if($("cronoZerar")) $("cronoZerar").addEventListener("click", function(){
  var id = cronoAtual();
  if(!id) return;
  /* dois toques: zerar sem querer apaga o tempo de um atendimento inteiro */
  if(this.dataset.confirma !== "1"){
    this.dataset.confirma = "1";
    this.textContent = "confirmar";
    var b = this;
    setTimeout(function(){ b.dataset.confirma = ""; b.textContent = "zerar"; }, 4000);
    return;
  }
  this.dataset.confirma = ""; this.textContent = "zerar";
  delete cronos[id];
  save(K.cronos, cronos);
  pintarCrono();
  toast("Cronômetro zerado neste chamado.");
});
if($("dChamado")) $("dChamado").addEventListener("change", pintarCrono);
/* sem isto a aba abriria mostrando a leitura de até um segundo atrás */
(function(){
  var aba = document.querySelector('nav.tabs button[data-tab="documentar"]');
  if(aba) aba.addEventListener("click", pintarCrono);
})();

/* o relógio só redesenha com a aba Documentar à frente: contar é um cálculo de
   datas, não depende de ninguém olhar, e redesenhar escondido é desperdício */
setInterval(function(){
  var aba = document.querySelector('nav.tabs button[data-tab="documentar"]');
  if(aba && aba.getAttribute("aria-selected") === "true") pintarCrono();
}, 1000);
pintarCrono();

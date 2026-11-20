"use strict";
/* ---------------- storage ---------------- */
var K = {fila:"ctip.fila", chamados:"ctip.chamados", wh:"ctip.wh", tema:"ctip.tema",
         jornada:"ctip.jornada", enums:"ctip.enums", usuarios:"ctip.usuarios",
         campos:"ctip.campos", ultimoId:"ctip.ultimoId", novos:"ctip.novos",
         vigiar:"ctip.vigiar", eu:"ctip.eu", lote:"ctip.lote",
         prazos:"ctip.prazos", cronos:"ctip.cronos"};
function load(k, fb){ try{ var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; }catch(e){ return fb; } }
function save(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){ toast("Não consegui salvar neste navegador."); } }

var fila     = load(K.fila, []);
var chamados = load(K.chamados, []);

/* listas do Bitrix guardadas da última conexão: sem isso, abrir a página sem
   webhook deixaria os seletores do formulário vazios e a aba inutilizável */
(function(){
  var cache = load(K.enums, null);
  if(cache && typeof cache === "object"){
    for(var k in cache) enumRotulos[k] = cache[k];
  }
  var cm = load(K.campos, null);
  if(cm && typeof cm === "object"){
    for(var c in cm) campoMeta[c] = cm[c];
  }
  /* versões antigas gravavam "usuário 429" como se fosse o nome quando o
     user.get era recusado. Isso envenenava o cache: marcar o escopo user no
     webhook depois não surtia efeito, porque a página nunca mais tentava
     buscar. Entram só os nomes de verdade; o resto é descartado e refeito. */
  var us = load(K.usuarios, null);
  if(us && typeof us === "object"){
    var limpou = false;
    for(var u in us){
      if(/^usuário \d+$/.test(String(us[u]))){ limpou = true; continue; }
      usuarios[u] = us[u];
    }
    if(limpou) save(K.usuarios, usuarios);
  }
})();

/* ---------------- util ---------------- */
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g, function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }
function toast(msg){
  var t = document.createElement("div"); t.className="toast"; t.textContent=msg;
  document.body.appendChild(t); setTimeout(function(){ t.remove(); }, 2600);
}
function hhmm(s){ var p=String(s||"").split(":"); var h=parseInt(p[0],10), m=parseInt(p[1],10);
  return {h:isNaN(h)?8:h, m:isNaN(m)?0:m}; }

/* intervalo descontado da jornada: 08:00-17:00 menos 1h = 8h líquidas,
   que é a conta de "1 dia útil = 8h" da tabela de SLA do Bitrix */
var ALMOCO_PADRAO = {ini:{h:12,m:0}, fim:{h:13,m:0}};

/* horas úteis entre duas datas, respeitando jornada, intervalo e dias úteis */
function horasUteis(ini, fim){
  var j = jornada();
  if(fim <= ini) return 0;
  var total = 0;
  var cur = new Date(ini.getTime());
  var guard = 0;
  while(cur < fim && guard++ < 20000){
    var dow = cur.getDay();
    if(j.dias.indexOf(String(dow)) === -1 || ehFeriado(cur)){
      cur.setDate(cur.getDate()+1); cur.setHours(0,0,0,0); continue;
    }
    var ab = new Date(cur); ab.setHours(j.ini.h, j.ini.m, 0, 0);
    var fe = new Date(cur); fe.setHours(j.fim.h, j.fim.m, 0, 0);
    var a = cur > ab ? cur : ab;
    var b = fim < fe ? fim : fe;
    if(b > a){
      var t = (b - a) / 3600000;
      /* desconta o intervalo só na parte que realmente cai dentro dele:
         chamado aberto às 14h não perde a hora do almoço */
      if(j.almoco){
        var li = new Date(cur); li.setHours(j.almoco.ini.h, j.almoco.ini.m, 0, 0);
        var lf = new Date(cur); lf.setHours(j.almoco.fim.h, j.almoco.fim.m, 0, 0);
        var sa = a > li ? a : li;
        var sb = b < lf ? b : lf;
        if(sb > sa) t -= (sb - sa) / 3600000;
      }
      total += t;
    }
    cur.setDate(cur.getDate()+1); cur.setHours(0,0,0,0);
  }
  return total;
}
/* ---------------- feriados ----------------
   Dia de feriado não conta hora útil. Os grupos ligados e as datas a mais ficam
   em ctip.feriados (a tela é o cartão "Feriados" do Painel, em mais.js). Os
   móveis saem da Páscoa; os fixos são os de lei:
     nacionais  1/1, Sexta-feira Santa, 21/4, 1/5, 7/9, 12/10, 2/11, 15/11,
                20/11 (Lei 14.759/2023), 25/12
     sp         9/7 (Revolução Constitucionalista, estado de SP)
     embu       18/2 (aniversário de Embu das Artes) e Corpus Christi
     spcap      25/1 (aniversário de São Paulo) e Corpus Christi
     carnaval   segunda e terça de Carnaval (ponto facultativo; desligado)
   Embu e São Paulo conferidos na lista de feriados municipais do TJSP. */
K.feriados = "ctip.feriados";
var FERIADOS_PADRAO = {grupos: {nac: true, sp: true, embu: true, spcap: false, carnaval: false}, extras: []};
var feriadosCache = {};
function feriadosConfig(){
  var c = load(K.feriados, null);
  if(!c || typeof c !== "object") return FERIADOS_PADRAO;
  var g = {};
  Object.keys(FERIADOS_PADRAO.grupos).forEach(function(k){
    g[k] = (c.grupos && typeof c.grupos[k] === "boolean") ? c.grupos[k] : FERIADOS_PADRAO.grupos[k];
  });
  return {grupos: g, extras: Array.isArray(c.extras) ? c.extras.filter(function(x){ return /^\d{4}-\d{2}-\d{2}$/.test(x); }) : []};
}
function feriadosLimparCache(){ feriadosCache = {}; }
/* domingo de Páscoa (algoritmo de Meeus/Jones/Butcher) */
function pascoa(ano){
  var a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  var f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  var h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  var l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  var mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}
function diaChave(d){
  return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
}
/* {"2026-04-03": "Sexta-feira Santa", ...} do ano, só com os grupos ligados */
function feriadosDoAno(ano){
  if(feriadosCache[ano]) return feriadosCache[ano];
  var cfg = feriadosConfig(), g = cfg.grupos, r = {};
  var fixo = function(mm, dd, nome){ r[ano + "-" + mm + "-" + dd] = nome; };
  var movel = function(desloc, nome){ var p = pascoa(ano); p.setDate(p.getDate() + desloc); r[diaChave(p)] = nome; };
  if(g.nac){
    fixo("01", "01", "Confraternização Universal"); movel(-2, "Sexta-feira Santa");
    fixo("04", "21", "Tiradentes"); fixo("05", "01", "Dia do Trabalho");
    fixo("09", "07", "Independência"); fixo("10", "12", "Nossa Senhora Aparecida");
    fixo("11", "02", "Finados"); fixo("11", "15", "Proclamação da República");
    fixo("11", "20", "Dia da Consciência Negra"); fixo("12", "25", "Natal");
  }
  if(g.sp) fixo("07", "09", "Revolução Constitucionalista (SP)");
  if(g.embu){ fixo("02", "18", "Aniversário de Embu das Artes"); movel(60, "Corpus Christi"); }
  if(g.spcap){ fixo("01", "25", "Aniversário de São Paulo"); movel(60, "Corpus Christi"); }
  if(g.carnaval){ movel(-48, "Carnaval (segunda)"); movel(-47, "Carnaval (terça)"); }
  cfg.extras.forEach(function(x){ if(x.slice(0, 4) === String(ano)) r[x] = r[x] || "Folga da empresa"; });
  feriadosCache[ano] = r;
  return r;
}
function ehFeriado(d){ return !!feriadosDoAno(d.getFullYear())[diaChave(d)]; }

/* o instante em que se completam "horas" úteis a partir de ini: é o prazo do
   SLA no relógio, com jornada, intervalo, fins de semana e feriados */
function fimUteis(ini, horas){
  var j = jornada();
  var cur = new Date(ini.getTime()), resta = horas, guard = 0;
  while(resta > 1e-9 && guard++ < 4000){
    if(j.dias.indexOf(String(cur.getDay())) === -1 || ehFeriado(cur)){
      cur.setDate(cur.getDate() + 1); cur.setHours(0, 0, 0, 0); continue;
    }
    var ab = new Date(cur); ab.setHours(j.ini.h, j.ini.m, 0, 0);
    var fe = new Date(cur); fe.setHours(j.fim.h, j.fim.m, 0, 0);
    if(cur < ab) cur = ab;
    if(cur >= fe){ cur.setDate(cur.getDate() + 1); cur.setHours(0, 0, 0, 0); continue; }
    var trechos = [[cur, fe]];
    if(j.almoco){
      var li = new Date(cur); li.setHours(j.almoco.ini.h, j.almoco.ini.m, 0, 0);
      var lf = new Date(cur); lf.setHours(j.almoco.fim.h, j.almoco.fim.m, 0, 0);
      if(cur < li && fe > lf) trechos = [[cur, li], [lf, fe]];
      else if(cur >= li && cur < lf) trechos = [[lf, fe]];
    }
    for(var t = 0; t < trechos.length; t++){
      var dur = (trechos[t][1] - trechos[t][0]) / 3600000;
      if(dur <= 0) continue;
      if(resta <= dur + 1e-9) return new Date(trechos[t][0].getTime() + resta * 3600000);
      resta -= dur;
    }
    cur = new Date(fe); cur.setDate(cur.getDate() + 1); cur.setHours(0, 0, 0, 0);
  }
  return cur;
}
function jornada(){
  var saved = load(K.jornada, null);
  var ini = hhmm(saved ? saved.ini : $("jorIni").value);
  var fim = hhmm(saved ? saved.fim : $("jorFim").value);
  var dias = (saved ? saved.dias : $("jorDias").value) || "12345";
  var alm = saved && saved.almoco !== undefined ? saved.almoco : ALMOCO_PADRAO;
  return {ini:ini, fim:fim, dias:String(dias), almoco:alm};
}
function slaDe(nome){ for(var i=0;i<SLA.length;i++){ if(SLA[i].n===nome) return SLA[i]; } return null; }

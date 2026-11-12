"use strict";
/* ---------------- storage ---------------- */
var K = {fila:"ctip.fila", chamados:"ctip.chamados", wh:"ctip.wh", tema:"ctip.tema",
         jornada:"ctip.jornada", enums:"ctip.enums", usuarios:"ctip.usuarios"};
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
  var us = load(K.usuarios, null);
  if(us && typeof us === "object"){
    for(var u in us) usuarios[u] = us[u];
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
    if(j.dias.indexOf(String(dow)) === -1){
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
function jornada(){
  var saved = load(K.jornada, null);
  var ini = hhmm(saved ? saved.ini : $("jorIni").value);
  var fim = hhmm(saved ? saved.fim : $("jorFim").value);
  var dias = (saved ? saved.dias : $("jorDias").value) || "12345";
  var alm = saved && saved.almoco !== undefined ? saved.almoco : ALMOCO_PADRAO;
  return {ini:ini, fim:fim, dias:String(dias), almoco:alm};
}
function slaDe(nome){ for(var i=0;i<SLA.length;i++){ if(SLA[i].n===nome) return SLA[i]; } return null; }

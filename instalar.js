"use strict";
/* ---------------- instalar como aplicativo ----------------
   Instalada, a página abre em janela própria, com ícone na barra de tarefas e
   no menu Iniciar. É a mesma página e o mesmo navegador por baixo: o webhook, a
   fila e tudo o que está guardado continuam valendo, sem configurar de novo —
   desde que seja instalada no mesmo perfil do navegador em que já é usada.

   O navegador é quem decide quando a instalação pode ser oferecida, e avisa por
   um evento. O botão só aparece depois desse aviso; antes disso, clicar não
   faria nada. */

var instOferta = null;   /* o evento guardado: é ele que abre a janela de instalar */

function instNoApp(){
  return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
         window.navigator.standalone === true;
}
function pintarInstalar(){
  var pode = !!instOferta && !instNoApp();
  if($("btnInstalar")) $("btnInstalar").hidden = !pode;
  if($("btnInstalar2")) $("btnInstalar2").hidden = !pode;
  var st = $("instEstado");
  if(!st) return;
  if(instNoApp())
    st.textContent = "Você já está usando o aplicativo instalado.";
  else if(pode)
    st.textContent = "Pronto para instalar: clique em Instalar. Abre em janela própria, com ícone na barra de " +
      "tarefas, e continua usando o mesmo webhook e a mesma fila deste navegador.";
  else if(location.protocol === "file:")
    st.textContent = "Aberta como arquivo, a página não pode ser instalada. Use o endereço publicado.";
  else
    st.textContent = "O navegador não ofereceu a instalação por aqui. Isso acontece quando o aplicativo já está " +
      "instalado, ou em navegador que não instala páginas. No Chrome: menu ⋮ → Transmitir, salvar e compartilhar → " +
      "Instalar página como app. No Edge: menu ⋯ → Aplicativos → Instalar este site como um aplicativo.";
}
function instalar(){
  if(!instOferta) return;
  var oferta = instOferta;
  oferta.prompt();
  /* a oferta vale uma vez: aceita ou recusada, o navegador manda outra depois */
  instOferta = null;
  pintarInstalar();
  if(oferta.userChoice && oferta.userChoice.then){
    oferta.userChoice.then(function(r){
      if(r && r.outcome === "dismissed") toast("Instalação cancelada. Dá para instalar depois pela aba Bitrix.");
    });
  }
}

window.addEventListener("beforeinstallprompt", function(e){
  e.preventDefault();          /* sem isso o navegador mostra a oferta dele, na hora dele */
  instOferta = e;
  pintarInstalar();
});
window.addEventListener("appinstalled", function(){
  instOferta = null;
  pintarInstalar();
  toast("Instalado. Procure por Chamados TI no menu Iniciar.");
});
if($("btnInstalar")) $("btnInstalar").addEventListener("click", instalar);
if($("btnInstalar2")) $("btnInstalar2").addEventListener("click", instalar);

/* atalhos do ícone (botão direito no ícone do aplicativo) chegam como #aba.
   Com o aplicativo já aberto o atalho só troca o #, sem recarregar a página,
   por isso vale também na mudança do endereço. */
function instAbaDoEndereco(){
  var aba = (location.hash || "").slice(1);
  if(!/^[a-z]+$/.test(aba)) return;
  var b = document.querySelector('nav.tabs button[data-tab="' + aba + '"]');
  if(b) b.click();
}
window.addEventListener("hashchange", instAbaDoEndereco);
instAbaDoEndereco();

/* o service worker é o que faz a versão nova chegar sozinha e a página abrir
   sem rede. Aberta como arquivo não há como registrar, e não faz falta. */
if("serviceWorker" in navigator && location.protocol !== "file:"){
  window.addEventListener("load", function(){
    navigator.serviceWorker.register("sw.js").catch(function(){ /* segue sem ele */ });
  });
}
pintarInstalar();
